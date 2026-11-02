"""
Build a train/val/test split for the AgriVision leaf classifier.

Source: `Project-AgML/citrus_fruit_leaf_disease_classification` on Hugging Face
(CC-BY-4.0, Rauf et al. 2019, Data in Brief 26:104340). The parquet file stores
the images inline, so this script is the only download you need.

What it does:

  1. reads the parquet
  2. keeps leaf images only (the dataset also contains fruit photos)
  3. maps dataset labels onto the label names the app knows
  4. drops exact duplicates by content hash
  5. writes a stratified 70/15/15 split as JPEG folders plus manifest.json

Usage:
    python training/prepare.py --stats      # print counts, write nothing
    python training/prepare.py              # write training/data/processed
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw" / "citrus.parquet"
OUT = ROOT / "data" / "processed"

# Parquet class indices -> names, per the dataset card.
CLASS_NAMES = ["black_spot", "canker", "greening", "healthy", "melanose", "scab"]
PLANT_PARTS = ["fruit", "leaf"]

# Dataset label -> app label. Only diseases the app's library already documents
# are kept by default; the rest are reported and skipped rather than silently
# folded into the wrong class.
LABEL_MAP = {
    "greening": "Citrus Greening (HLB)",
    "canker": "Bacterial Canker",
    "healthy": "Healthy Citrus",
}

# Classes present in the source but not in the app's disease library. They are
# counted and reported so the gap is visible.
UNMAPPED = {"black_spot", "melanose", "scab"}

MIN_PER_CLASS = 30

SEED = 42
TRAIN_RATIO, VAL_RATIO = 0.70, 0.15


def read_rows():
    table = pq.read_table(RAW)
    columns = table.to_pydict()
    images = columns["image"]
    labels = columns["label"]
    parts = columns["plant_part"]

    for image, label, part in zip(images, labels, parts):
        yield image["bytes"], CLASS_NAMES[int(label)], PLANT_PARTS[int(part)]


def collect(stats_only: bool) -> dict:
    counts: Counter = Counter()
    part_counts: dict[str, Counter] = defaultdict(Counter)
    skipped: Counter = Counter()
    seen: set[str] = set()
    kept: list[dict] = []
    duplicates = 0

    for raw, name, part in read_rows():
        part_counts[name][part] += 1
        if part != "leaf":
            continue
        counts[name] += 1
        if name in UNMAPPED:
            skipped[name] += 1
            continue
        if name not in LABEL_MAP:
            skipped[name] += 1
            continue

        digest = hashlib.sha1(raw).hexdigest()
        if digest in seen:
            duplicates += 1
            continue
        seen.add(digest)

        kept.append({"raw": raw, "label": LABEL_MAP[name], "digest": digest})

    summary = {
        "source_rows": sum(part_counts[c].total() for c in part_counts),
        "leaf_rows": sum(counts.values()),
        "kept": len(kept),
        "duplicates_removed": duplicates,
        "skipped_unmapped": dict(skipped),
        "label_counts": dict(Counter(item["label"] for item in kept)),
        "source_by_class_and_part": {c: dict(part_counts[c]) for c in sorted(part_counts)},
    }
    return {"summary": summary, "kept": kept}


def split(kept: list[dict]) -> dict[str, list[dict]]:
    rng = random.Random(SEED)
    by_label: dict[str, list[dict]] = defaultdict(list)
    for item in kept:
        by_label[item["label"]].append(item)

    out = {"train": [], "val": [], "test": []}
    for label, items in sorted(by_label.items()):
        items = sorted(items, key=lambda item: item["digest"])
        rng.shuffle(items)
        n = len(items)
        n_val = max(1, round(n * VAL_RATIO))
        n_test = max(1, round(n * VAL_RATIO))
        n_train = n - n_val - n_test
        out["train"] += items[:n_train]
        out["val"] += items[n_train : n_train + n_val]
        out["test"] += items[n_train + n_val :]
    return out


def write(splits: dict[str, list[dict]], summary: dict) -> None:
    for split_name, items in splits.items():
        for index, item in enumerate(items):
            slug = item["label"].lower().replace(" ", "-").replace("(", "").replace(")", "")
            folder = OUT / split_name / slug
            folder.mkdir(parents=True, exist_ok=True)
            image = Image.open(io.BytesIO(item["raw"])).convert("RGB")
            image.save(folder / f"{item['digest'][:16]}-{index:04d}.jpg", "JPEG", quality=92)

    manifest = {
        "seed": SEED,
        "source": "Project-AgML/citrus_fruit_leaf_disease_classification (CC-BY-4.0)",
        "label_map": LABEL_MAP,
        "summary": summary,
        "splits": {
            name: dict(Counter(item["label"] for item in items)) for name, items in splits.items()
        },
        "labels": {name: sorted({slugify(item["label"]) for item in items}) for name, items in splits.items()},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT}")
    for name, items in splits.items():
        print(f"  {name:5s} {len(items):4d} images")


def slugify(label: str) -> str:
    return label.lower().replace(" ", "-").replace("(", "").replace(")", "")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stats", action="store_true", help="print counts and exit")
    args = parser.parse_args()

    if not RAW.exists():
        raise SystemExit(f"missing {RAW} — download the dataset parquet first (see README)")

    result = collect(args.stats)
    summary = result["summary"]
    print(json.dumps(summary, indent=2))

    too_small = {k: v for k, v in summary["label_counts"].items() if v < MIN_PER_CLASS}
    if too_small:
        print(f"\nWARNING: classes below {MIN_PER_CLASS} images after filtering: {too_small}")

    if args.stats:
        return

    splits = split(result["kept"])
    write(splits, summary)


if __name__ == "__main__":
    main()
