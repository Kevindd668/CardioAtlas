#!/usr/bin/env python3
"""Build the normalized, named heart GLB from downloaded BodyParts3D meshes.

Input : public/models/raw/heart_obj/*.obj + heart_selection.csv
Output: public/models/processed/heart-anatomy-master.glb
        public/models/processed/heart-structure-map.json

Coordinate contract:
  body (mm, +X patient left, +Y posterior, +Z superior)
  -> Three.js (1 unit = 10 mm, +X left, +Y up, +Z anterior)
  x' = (x - cx) / 10
  y' = (z - cz) / 10
  z' = -(y - cy) / 10
where c is the center of the ventricular myocardium bounding box.

No surface is filled, smoothed or replaced. Tiny disconnected debris is kept
unless it has zero-area faces, so the audit stays honest.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "public" / "models" / "raw"
OUT = ROOT / "public" / "models" / "processed"

# sRGB display colors from the phase-1 material brief
COLORS = {
    "myocardium": ("#9B4350", 0.68),
    "chamber": ("#9B4350", 0.72),
    "endocardium": ("#BC7376", 0.47),
    "valve": ("#DFB2AB", 0.46),
    "papillary": ("#A34D57", 0.71),
    "coronary": ("#C57566", 0.50),
    "aorta": ("#C65C62", 0.53),
    "pulmonary_vein": ("#C65C62", 0.53),
    "vena_cava": ("#668AA8", 0.53),
    "pulmonary_artery": ("#668AA8", 0.53),
}

# anatomy_id -> (parent path, node name, material key)
MAPPING = {
    "ventricular_myocardium": ("HeartRoot", "Myocardium", "myocardium"),
    "wall_of_left_atrium": ("Chambers", "LeftAtriumWall", "chamber"),
    "wall_of_right_atrium": ("Chambers", "RightAtriumWall", "chamber"),
    "cavity_of_left_ventricle": ("Chambers", "LeftVentricleCavity", "endocardium"),
    "cavity_of_right_ventricle": ("Chambers", "RightVentricleCavity", "endocardium"),
}

VALVE_PARENT = {
    "anterior_leaflet_of_mitral_valve": "MitralValve",
    "posterior_leaflet_of_mitral_valve": "MitralValve",
    "anterior_leaflet_of_tricuspid_valve": "TricuspidValve",
    "posterior_leaflet_of_tricuspid_valve": "TricuspidValve",
    "septal_leaflet_of_tricuspid_valve": "TricuspidValve",
    "left_posterior_cusp_of_aortic_valve": "AorticValve",
    "right_posterior_cusp_of_aortic_valve": "AorticValve",
    "anterior_cusp_of_aortic_valve": "AorticValve",
    "left_anterior_cusp_of_pulmonary_valve": "PulmonaryValve",
    "posterior_cusp_of_pulmonary_valve": "PulmonaryValve",
    "right_anterior_cusp_of_pulmonary_valve": "PulmonaryValve",
}

PAPILLARY = {
    "anterolateral_papillary_muscle_of_left_ventricle",
    "posterior_papillary_muscle_of_left_ventricle",
    "anterior_papillary_muscle_of_right_ventricle",
    "posterior_papillary_muscle_of_right_ventricle",
    "septal_papillary_muscle_of_right_ventricle",
}

VESSEL_PARENT = {
    "ascending_aorta": ("Aorta", "aorta"),
    "arch_of_aorta": ("Aorta", "aorta"),
    "pulmonary_trunk": ("PulmonaryArtery", "pulmonary_artery"),
    "left_pulmonary_artery": ("PulmonaryArtery", "pulmonary_artery"),
    "right_pulmonary_artery": ("PulmonaryArtery", "pulmonary_artery"),
    "superior_vena_cava": ("VenaeCavae", "vena_cava"),
    "inferior_vena_cava": ("VenaeCavae", "vena_cava"),
    "left_superior_pulmonary_vein": ("PulmonaryVeins", "pulmonary_vein"),
    "left_inferior_pulmonary_vein": ("PulmonaryVeins", "pulmonary_vein"),
    "right_superior_pulmonary_vein": ("PulmonaryVeins", "pulmonary_vein"),
    "right_inferior_pulmonary_vein": ("PulmonaryVeins", "pulmonary_vein"),
}


def srgb_to_linear(hex_color: str) -> list[float]:
    h = hex_color.lstrip("#")
    vals = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    out = []
    for c in vals:
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out + [1.0]


def mat_for(key: str) -> PBRMaterial:
    color, roughness = COLORS[key]
    return PBRMaterial(
        name=f"MAT_{key}",
        baseColorFactor=srgb_to_linear(color),
        metallicFactor=0.0,
        roughnessFactor=roughness,
        doubleSided=key == "valve",
    )


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader((RAW / "heart_selection.csv").open(encoding="utf-8")))
    by_id = {r["anatomy_id"]: r for r in rows}

    # center on the ventricular myocardium, not on the whole vessel cloud
    myo = trimesh.load(RAW / "heart_obj" / by_id["ventricular_myocardium"]["obj_file"],
                       process=True, force="mesh")
    c = np.array(myo.bounding_box.centroid)
    M = np.array([
        [0.1, 0, 0, -0.1 * c[0]],
        [0, 0, 0.1, -0.1 * c[2]],
        [0, -0.1, 0, 0.1 * c[1]],
        [0, 0, 0, 1],
    ])

    scene = trimesh.Scene()
    scene.graph.update(frame_to="HeartRoot", frame_from="world", matrix=np.eye(4))
    for parent in ["Myocardium", "Chambers", "Valves", "PapillaryMuscles", "GreatVessels", "CoronaryArteries"]:
        if parent == "Myocardium":
            scene.graph.update(frame_to=parent, frame_from="HeartRoot", matrix=np.eye(4))
        else:
            scene.graph.update(frame_to=parent, frame_from="HeartRoot", matrix=np.eye(4))
    for g in ["MitralValve", "TricuspidValve", "AorticValve", "PulmonaryValve"]:
        scene.graph.update(frame_to=g, frame_from="Valves", matrix=np.eye(4))
    for g in ["Aorta", "PulmonaryArtery", "VenaeCavae", "PulmonaryVeins"]:
        scene.graph.update(frame_to=g, frame_from="GreatVessels", matrix=np.eye(4))

    node_paths = {}
    total_v = total_f = 0
    for r in rows:
        aid = r["anatomy_id"]
        path = RAW / "heart_obj" / r["obj_file"]
        m = trimesh.load(path, process=True, force="mesh")
        m.merge_vertices()
        m.update_faces(m.nondegenerate_faces())
        m.remove_unreferenced_vertices()
        m.apply_transform(M)

        if aid in MAPPING:
            parent, node, key = MAPPING[aid]
        elif aid in VALVE_PARENT:
            parent, node, key = f"Valves/{VALVE_PARENT[aid]}", aid, "valve"
        elif aid in PAPILLARY:
            parent, node, key = "PapillaryMuscles", aid, "papillary"
        elif aid in VESSEL_PARENT:
            sub, key = VESSEL_PARENT[aid]
            parent, node = f"GreatVessels/{sub}", aid
        elif aid.startswith(("left_coronary", "anterior_interventricular", "circumflex", "right_coronary", "posterior_interventricular", "marginal", "diagonal", "first_anterior")):
            parent, node, key = "CoronaryArteries", aid, "coronary"
        else:
            raise ValueError(f"unmapped anatomy id: {aid}")

        m.visual = trimesh.visual.TextureVisuals(material=mat_for(key))
        scene.add_geometry(
            m,
            geom_name=aid,
            node_name=node,
            parent_node_name=parent.split("/")[-1],
        )
        node_paths[aid] = {
            "path": parent + "/" + node,
            "node": node,
            "parent": parent,
            "material": key,
            "faces": int(len(m.faces)),
            "verts": int(len(m.vertices)),
            "components": int(len(m.split(only_watertight=False))),
            "watertight": bool(m.is_watertight),
            "bounds_scene": [[round(float(x), 4) for x in m.bounds[0]], [round(float(x), 4) for x in m.bounds[1]]],
        }
        total_v += len(m.vertices)
        total_f += len(m.faces)

    out = OUT / "heart-anatomy-master.glb"
    scene.export(out)
    (OUT / "heart-structure-map.json").write_text(
        json.dumps({
            "source": "BodyParts3D / Anatomography 4.3",
            "license": "CC BY-SA 2.1 Japan, (c) DBCLS",
            "units": "1 scene unit = 10 mm",
            "axes": {"x": "patient left", "y": "superior", "z": "anterior"},
            "center_mm": [round(float(x), 4) for x in c],
            "total_vertices": total_v,
            "total_triangles": total_f,
            "objects": node_paths,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"wrote {out} ({out.stat().st_size} bytes), V={total_v}, F={total_f}, nodes={len(node_paths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
