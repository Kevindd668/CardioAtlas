import * as THREE from "three";

export type ExplodeLevel = 1 | 2 | 3;

export interface ExplodeState {
  entered: boolean;
  level: ExplodeLevel;
  progress: number;
  animating: boolean;
  paused: boolean;
  speed: number;
}

export interface ExplodeUnitInfo {
  id: string;
  depth: number;
  base: [number, number, number];
  position: [number, number, number];
  group: string;
}

interface Unit {
  node: THREE.Object3D;
  id: string;
  group: string;
  depth: number;
  base: THREE.Vector3;
  target: THREE.Vector3;
}

const TOP = ["Myocardium", "Chambers", "Valves", "PapillaryMuscles", "GreatVessels", "CoronaryArteries"] as const;

/**
 * Explicit spatial explosion.
 *
 * L1: six system zones, children remain compact inside their system.
 * L2: children are laid out on a per-system grid.
 * L3: the same grid with larger spacing.
 *
 * The six top groups are 6 real units; the 58 meshes are 58 real units.
 * No empty units are created.
 */
export class LayoutExplodedController {
  private readonly root: THREE.Object3D;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly onChange?: (s: ExplodeState) => void;
  private readonly units: Unit[] = [];
  private entered = false;
  private level: ExplodeLevel = 1;
  private progress = 0;
  private speed = 1;
  private paused = false;
  private animation: { from: number; to: number; elapsed: number; duration: number } | null = null;
  private readonly clock = new THREE.Clock(false);
  private readonly scratchBox = new THREE.Box3();
  private readonly scratchCenter = new THREE.Vector3();
  private readonly scratchSize = new THREE.Vector3();
  private groupZones: Record<string, THREE.Vector3> = {};

  constructor(root: THREE.Object3D, camera: THREE.PerspectiveCamera, _scene: THREE.Scene, onChange?: (s: ExplodeState) => void) {
    this.root = root;
    this.camera = camera;
    this.onChange = onChange;
  }

  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    box.getCenter(this.scratchCenter);
    this.build();
    this.level = 1;
    this.progress = 0;
    this.paused = false;
    this.animation = null;
    this.apply();
    this.emit();
  }

  dispose(): void {
    if (!this.entered) return;
    this.animation = null;
    this.clock.stop();
    this.restore(false);
    this.entered = false;
    this.progress = 0;
    this.emit();
  }

  getUnits(): ExplodeUnitInfo[] {
    return this.units.map((u) => ({
      id: u.id,
      depth: u.depth,
      base: u.base.toArray() as [number, number, number],
      position: u.node.position.toArray() as [number, number, number],
      group: u.group,
    }));
  }

  getState(): ExplodeState {
    return {
      entered: this.entered,
      level: this.level,
      progress: this.progress,
      animating: !!this.animation,
      paused: this.paused,
      speed: this.speed,
    };
  }

  setLevel(level: ExplodeLevel): void {
    this.level = level;
    this.computeTargets();
    this.apply();
    this.emit();
  }

  setProgress(p: number): void {
    this.progress = Math.max(0, Math.min(1, p));
    this.animation = null;
    this.clock.stop();
    this.paused = false;
    this.apply();
    this.emit();
  }

  explode(target = 1, animate = true): void {
    if (!animate) {
      this.setProgress(target);
      return;
    }
    this.animation = { from: this.progress, to: Math.max(0, Math.min(1, target)), elapsed: 0, duration: 0.9 / this.speed };
    this.clock.start();
    this.paused = false;
  }

  restore(animate = false): void {
    if (!animate) {
      this.progress = 0;
      this.animation = null;
      this.clock.stop();
      this.paused = false;
      this.apply();
      this.emit();
      return;
    }
    this.animation = { from: this.progress, to: 0, elapsed: 0, duration: 0.8 / this.speed };
    this.clock.start();
    this.paused = false;
  }

  pause(): void {
    if (!this.animation || this.paused) return;
    this.paused = true;
    this.clock.stop();
    this.emit();
  }

  resume(): void {
    if (!this.animation || !this.paused) return;
    this.paused = false;
    this.clock.start();
    this.emit();
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.5, Math.min(2, speed));
    this.emit();
  }

  update(dt: number): void {
    if (!this.animation || this.paused) return;
    this.animation.elapsed += dt * this.speed;
    const t = Math.min(1, this.animation.elapsed / this.animation.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this.progress = this.animation.from + (this.animation.to - this.animation.from) * e;
    this.apply();
    if (t >= 1) {
      this.animation = null;
      this.clock.stop();
    }
    this.emit();
  }

  focusMesh(id: string): void {
    if (!this.entered) this.enter();
    const unit = this.units.find((u) => u.id === id && u.depth === 2);
    const g = unit?.group;
    for (const u of this.units) {
      if (u.depth === 1) u.target.copy(u.group === g ? (this.groupZones[u.group] ?? u.base) : u.base);
      else u.target.copy(u.base);
    }
    if (unit) unit.target.copy(unit.base).add(new THREE.Vector3(0, 0, 36));
    this.progress = 1;
    this.animation = null;
    this.apply();
    this.emit();
  }

  focusGroup(group: string): void {
    if (!this.entered) this.enter();
    this.level = 3;
    this.computeTargets();
    for (const u of this.units) {
      if (u.group !== group) {
        u.target.copy(u.base);
      }
    }
    this.progress = 1;
    this.animation = null;
    this.apply();
    this.emit();
  }

  getAABBOverlaps(): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    const boxes = this.units.filter((u) => u.depth === 2).map((u) => {
      const b = new THREE.Box3().setFromObject(u.node);
      return { id: u.id, b };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].b.intersectsBox(boxes[j].b)) out.push([boxes[i].id, boxes[j].id]);
      }
    }
    return out;
  }

  frameAll(): void {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const d = sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    this.camera.position.copy(c).add(new THREE.Vector3(0.25, 0.15, 1).normalize().multiplyScalar(d));
    this.camera.lookAt(c);
    this.camera.updateMatrixWorld(true);
  }

  private emit(): void {
    this.onChange?.(this.getState());
  }

  private build(): void {
    this.units.length = 0;
    for (const name of TOP) {
      const node = this.root.getObjectByName(name);
      if (!node) continue;
      const u: Unit = { node, id: name, group: name, depth: 1, base: node.position.clone(), target: node.position.clone() };
      this.units.push(u);
      for (const child of node.children) {
        if (!(child as THREE.Mesh).isMesh) continue;
        const cu: Unit = { node: child, id: child.name, group: name, depth: 2, base: child.position.clone(), target: child.position.clone() };
        this.units.push(cu);
      }
    }
    this.computeTargets();
  }

  private groupInfo(name: string): { center: THREE.Vector3; maxDim: number; children: THREE.Object3D[] } {
    const node = this.root.getObjectByName(name)!;
    const box = new THREE.Box3().setFromObject(node);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(this.scratchSize.clone());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const children = node.children.filter((c) => (c as THREE.Mesh).isMesh);
    return { center, maxDim, children };
  }

  private computeTargets(): void {
    if (!this.units.length) return;
    const infos = TOP.map((n) => ({ name: n, ...this.groupInfo(n) }));
    const maxZone = Math.max(...infos.map((i) => i.maxDim)) * 1.8;
    const centers: Record<string, THREE.Vector3> = this.groupZones;
    // 3 x 2 zone grid in the XY plane
    infos.forEach((info, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      centers[info.name] = new THREE.Vector3((col - 1) * maxZone, (0.5 - row) * maxZone, (i - 2.5) * maxZone * 0.28);
    });

    for (const u of this.units) {
      if (u.depth === 1) {
        u.target.copy(centers[u.group] ?? new THREE.Vector3());
        continue;
      }
      if (this.level === 1) {
        u.target.copy(u.base);
        continue;
      }
      const info = infos.find((x) => x.name === u.group)!;
      const children = info.children;
      const idx = Math.max(0, children.indexOf(u.node));
      const n = Math.max(1, children.length);
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const maxChild = Math.max(...children.map((c) => {
        const b = new THREE.Box3().setFromObject(c);
        const s = b.getSize(new THREE.Vector3());
        return Math.max(s.x, s.y, s.z, 0.2);
      }));
      const spacing = maxChild * (this.level === 2 ? 1.6 : 1.8);
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const ox = (col - (cols - 1) / 2) * spacing;
      const oy = ((rows - 1) / 2 - row) * spacing;
      u.target.set(ox, oy, 0);
    }
  }

  private apply(): void {
    const p = this.progress;
    for (const u of this.units) {
      u.node.position.copy(u.base).lerp(u.target, p);
    }
    this.root.updateMatrixWorld(true);
  }
}
