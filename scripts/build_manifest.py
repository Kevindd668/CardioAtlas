#!/usr/bin/env python3
"""Assemble the root anatomy_manifest.json from the audited registry and GLB."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
registry = json.loads((ROOT / "src/data/anatomy-registry.json").read_text(encoding="utf-8"))
audit = json.loads((ROOT / "data/audit/geometry-audit.json").read_text(encoding="utf-8"))
structure_map = json.loads((ROOT / "public/models/processed/heart-structure-map.json").read_text(encoding="utf-8"))
glb = ROOT / "public/models/processed/heart-anatomy-master.glb"

fj_stats = {}
for item in audit["items"]:
    fj = item["obj"].split("_", 1)[0]
    fj_stats[fj] = item

structures = []
for row in registry["audit"]:
    fjs = (row.get("source_fj") or "").split("/") if row.get("source_fj") else []
    fjs = [x for x in fjs if x]
    faces = sum(fj_stats[x]["f"] for x in fjs if x in fj_stats)
    verts = sum(fj_stats[x]["v"] for x in fjs if x in fj_stats)
    structures.append({
        **row,
        "present": bool(fjs),
        "faces": faces,
        "vertices": verts,
        "mesh_objects": [x for x in fjs if x in fj_stats],
    })

summary = Counter(s["status"] for s in structures)
glb_bytes = glb.read_bytes()
manifest = {
    "schema": "cardiotwin.anatomy-manifest/v1",
    "phase": "P1/P2 partial — source-backed static heart, no physiological validation",
    "model": registry["model"] | {
        "glb": "public/models/processed/heart-anatomy-master.glb",
        "glb_bytes": len(glb_bytes),
        "glb_sha256": hashlib.sha256(glb_bytes).hexdigest(),
        "mesh_objects": len(structure_map["objects"]),
        "total_vertices": structure_map["total_vertices"],
        "total_triangles": structure_map["total_triangles"],
        "scene_units": "1 unit = 10 mm",
        "source_space": "BodyParts3D body-centred mm; +X patient left, +Y posterior, +Z superior",
        "scene_space": "+X patient left, +Y superior, +Z anterior",
    },
    "summary": {
        "total": len(structures),
        "by_status": dict(summary),
        "complete": summary["COMPLETE"],
        "partial": summary["PARTIAL"],
        "merged": summary["MERGED"],
        "missing": summary["MISSING"],
        "uncertain": summary["UNCERTAIN"],
    },
    "structures": structures,
    "known_gaps": [
        "Atrial septum has no independent mesh.",
        "Interventricular septum is merged into the ventricular wall mesh.",
        "Atria have wall meshes but no independent cavity meshes.",
        "Chordae tendineae are not independently named; leaflet meshes contain thin strand-like components that require anatomical review.",
        "Trabeculae carneae and auricles are not independent meshes in this subset.",
        "Aortic arch branches are not fully included; coronary tree is partial.",
        "Ventricular wall is not watertight (5 boundary edges, 7 non-manifold edges) and is not a validated thick-wall solid.",
        "No LOD0/LOD2 files were generated; master mesh is 128,325 triangles."
    ],
}
(ROOT / "anatomy_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(manifest["summary"], ensure_ascii=False), "-> anatomy_manifest.json")
print("glb", len(glb_bytes), manifest["model"]["glb_sha256"])
