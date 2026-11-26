#!/usr/bin/env python3
"""Download the curated normal-heart subset from BodyParts3D 4.3.

Source: BodyParts3D / Anatomography, (c) DBCLS, CC BY-SA 2.1 Japan.
The repository toolkit's MANIFEST.csv supplies FJ/BP ids; the actual geometry
is fetched from the documented downloader endpoint used by Anatomography.

This script is intentionally narrow: it downloads only the 40 curated elements
needed for CardioTwin V3 phase 1, then writes a selection manifest. It does not
claim that the subset is a complete heart.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import zipfile
from pathlib import Path

import requests
import urllib3

urllib3.disable_warnings()

BASE = "https://lifesciencedb.jp/bp3d"
VIEWER = BASE + "/?lng=en"
DOWNLOAD = BASE + "/download.cgi"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# id, group, zh, en, source_name fragment
# FJ ids are the authoritative 4.3 model components.
SELECTION = [
    # myocardium / chamber boundary
    ("FJ2428", "myocardium", "心室肌壁", "Ventricular myocardium", "Wall of ventricle"),
    ("FJ2438", "chambers", "左心房壁", "Wall of left atrium", "Wall of left atrium"),
    ("FJ2439", "chambers", "右心房壁", "Wall of right atrium", "Wall of right atrium"),
    ("FJ2422", "chambers", "左心室腔", "Cavity of left ventricle", "Cavity of left ventricle"),
    ("FJ2423", "chambers", "右心室腔", "Cavity of right ventricle", "Cavity of right ventricle"),
    # mitral valve: 2 main leaflets
    ("FJ2420", "valves", "二尖瓣前叶", "Anterior leaflet of mitral valve", "Anterior leaflet of mitral valve"),
    ("FJ2432", "valves", "二尖瓣后叶", "Posterior leaflet of mitral valve", "Posterior leaflet of mitral valve"),
    # tricuspid valve: 3 main leaflets
    ("FJ2421", "valves", "三尖瓣前叶", "Anterior leaflet of tricuspid valve", "Anterior leaflet of tricuspid valve"),
    ("FJ2433", "valves", "三尖瓣后叶", "Posterior leaflet of tricuspid valve", "Posterior leaflet of tricuspid valve"),
    ("FJ2436", "valves", "三尖瓣隔叶", "Septal leaflet of tricuspid valve", "Septal leaflet of tricuspid valve"),
    # aortic valve: 3 cusps
    ("FJ2426", "valves", "主动脉瓣左后瓣", "Left posterior cusp of aortic valve", "Left posterior cusp of aortic valve"),
    ("FJ2431", "valves", "主动脉瓣右后瓣", "Right posterior cusp of aortic valve", "Right posterior cusp of aortic valve"),
    ("FJ2435", "valves", "主动脉瓣前瓣", "Anterior cusp of aortic valve", "Anterior cusp of aortic valve"),
    # pulmonary valve: 3 cusps
    ("FJ2417", "valves", "肺动脉瓣左前瓣", "Left anterior cusp of pulmonary valve", "Left anterior cusp of pulmonary valve"),
    ("FJ2427", "valves", "肺动脉瓣后瓣", "Posterior cusp of pulmonary valve", "Posterior cusp of pulmonary valve"),
    ("FJ2434", "valves", "肺动脉瓣右前瓣", "Right anterior cusp of pulmonary valve", "Right anterior cusp of pulmonary valve"),
    # papillary muscles
    ("FJ2418", "papillary", "左心室前外侧乳头肌", "Anterolateral papillary muscle of left ventricle", "Anterolateral head of lateral papillary muscle of left ventricle"),
    ("FJ2429", "papillary", "左心室后乳头肌", "Posterior papillary muscle of left ventricle", "Posterior papillary muscle of left ventricle"),
    ("FJ2419", "papillary", "右心室前乳头肌", "Anterior papillary muscle of right ventricle", "Anterior papillary muscle of right ventricle"),
    ("FJ2430", "papillary", "右心室后乳头肌", "Posterior papillary muscle of right ventricle", "Posterior papillary muscle of right ventricle"),
    ("FJ2437", "papillary", "右心室隔乳头肌", "Septal papillary muscle of right ventricle", "Septal papillary muscle of right ventricle"),
    # great vessels
    ("FJ3413", "vessels", "升主动脉", "Ascending aorta", "Ascending aorta"),
    ("FJ3411", "vessels", "主动脉弓", "Arch of aorta", "Arch of aorta"),
    ("FJ2966", "vessels", "肺动脉干", "Pulmonary trunk", "Pulmonary trunk"),
    ("FJ2924", "vessels", "左肺动脉", "Left pulmonary artery", "Trunk of left pulmonary artery"),
    ("FJ3019", "vessels", "右肺动脉", "Right pulmonary artery", "Trunk of right pulmonary artery"),
    ("FJ3645", "vessels", "上腔静脉", "Superior vena cava", "Superior vena cava"),
    ("FJ3441", "vessels", "下腔静脉", "Inferior vena cava", "Inferior vena cava"),
    ("FJ2925", "vessels", "左上肺静脉", "Left superior pulmonary vein", "Trunk of left superior pulmonary vein"),
    ("FJ2944", "vessels", "左下肺静脉", "Left inferior pulmonary vein", "Trunk of left inferior pulmonary vein"),
    ("FJ3020", "vessels", "右上肺静脉", "Right superior pulmonary vein", "Trunk of right superior pulmonary vein"),
    ("FJ3040", "vessels", "右下肺静脉", "Right inferior pulmonary vein", "Trunk of right inferior pulmonary vein"),
    # coronary arteries
    ("FJ2737", "coronary", "左冠状动脉主干", "Left coronary artery trunk", "Trunk of left coronary artery"),
    ("FJ2631", "coronary", "前室间支（LAD）", "Anterior interventricular branch (LAD)", "Trunk of anterior interventricular branch of left coronary artery"),
    ("FJ2649", "coronary", "左回旋支（LCX）", "Circumflex branch (LCX)", "Circumflex branch of left coronary artery"),
    ("FJ2723", "coronary", "右冠状动脉主干", "Right coronary artery trunk", "Trunk of right coronary artery"),
    ("FJ2692", "coronary", "右冠状动脉后室间支", "Posterior interventricular branch of RCA", "Posterior interventricular branch of right coronary artery"),
    ("FJ2667", "coronary", "右冠状动脉边缘支", "Marginal branch of RCA", "Marginal branch of right coronary artery"),
    ("FJ2633", "coronary", "LAD 对角支", "Diagonal branch of LAD", "Diagonal branch of anterior descending branch of left coronary artery"),
    ("FJ2671", "coronary", "RCA 前心室支", "First anterior ventricular branch of RCA", "First anterior ventricular branch of right coronary artery"),
]


def read_manifest(zip_path: Path) -> dict[str, dict]:
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.endswith("/MANIFEST.csv"))
        text = z.read(name).decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    return {r["fj_id"]: r for r in rows}


def fetch(session: requests.Session, ids: list[str], bps: list[str], out: Path) -> None:
    data = {
        "ids": json.dumps(ids),
        "rep_id": json.dumps(bps),
        "filename": out.stem,
        "type": "art_file",
        "all_downloads": "1",
    }
    r = session.post(DOWNLOAD, data=data, timeout=600, verify=False)
    r.raise_for_status()
    if not r.content.startswith(b"PK"):
        raise RuntimeError(f"not a zip: {r.status_code} {r.text[:200]}")
    out.write_bytes(r.content)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", type=Path, default=Path("public/models/raw/bodyparts3d_api.zip"))
    ap.add_argument("--out", type=Path, default=Path("public/models/raw/heart_obj"))
    ap.add_argument("--batch", type=int, default=20)
    ap.add_argument("--log", type=Path, default=Path("public/models/raw/download.log"))
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    manifest = read_manifest(args.zip)
    args.out.mkdir(parents=True, exist_ok=True)
    args.log.parent.mkdir(parents=True, exist_ok=True)

    selected = []
    for fj, group, zh, en, fragment in SELECTION:
        row = manifest.get(fj)
        if not row:
            raise SystemExit(f"missing {fj} in MANIFEST")
        if fragment.lower() not in row["name"].lower():
            raise SystemExit(f"name mismatch {fj}: {row['name']} != {fragment}")
        selected.append({**row, "group": group, "zh": zh, "en": en})

    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Referer": VIEWER})
    s.get(VIEWER, timeout=60, verify=False)

    downloaded = []
    for i in range(0, len(selected), args.batch):
        batch = selected[i : i + args.batch]
        ids = [r["fj_id"] for r in batch]
        bps = [r["bp_id"] for r in batch]
        zpath = args.out / f"heart_batch_{i // args.batch:02d}.zip"
        logging.info("downloading %d..%d: %s", i, i + len(batch), ",".join(ids))
        fetch(s, ids, bps, zpath)
        with zipfile.ZipFile(zpath) as z:
            for member in z.namelist():
                if not member.lower().endswith(".obj"):
                    continue
                name = Path(member).name
                fj = name.split("_", 1)[0]
                if fj not in ids:
                    continue
                target = args.out / name
                if not target.exists():
                    target.write_bytes(z.read(member))
                downloaded.append(name)
        logging.info("  -> %s", zpath.name)

    # write a selection manifest with what actually landed on disk
    rows = []
    for r in selected:
        candidates = sorted(args.out.glob(f"{r['fj_id']}_*.obj"))
        p = candidates[0] if candidates else None
        rows.append(
            {
                "anatomy_id": r["en"].lower().replace(" ", "_").replace("-", "_").replace("(", "").replace(")", ""),
                "group": r["group"],
                "zh": r["zh"],
                "en": r["en"],
                "source_fj": r["fj_id"],
                "source_bp_manifest": r["bp_id"],
                "source_fma_manifest": r["fma_id"],
                "source_name_manifest": r["name"],
                "obj_file": p.name if p else "",
                "bytes": p.stat().st_size if p else 0,
            }
        )
    sel_csv = args.out.parent / "heart_selection.csv"
    with sel_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    logging.info("wrote %s (%d rows); %d objs present", sel_csv, len(rows), len(downloaded))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
