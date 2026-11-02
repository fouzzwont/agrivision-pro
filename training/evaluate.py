"""
Evaluate the best checkpoint on the held-out test split.

The split was fixed in prepare.py and never seen during training, so the
numbers here are the ones worth quoting. Saves artifacts/eval.json plus a
human-readable artifacts/eval.txt.

Usage:
    python training/evaluate.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader
from torchvision import datasets

from train import ARTIFACTS, DATA, build_transforms, build_model, display_classes, evaluate

TEST = DATA / "test"


def main() -> None:
    checkpoint = torch.load(ARTIFACTS / "model.pt", map_location="cpu", weights_only=False)
    classes = checkpoint["classes"]

    _, eval_tf = build_transforms()
    test_set = datasets.ImageFolder(TEST, transform=eval_tf)
    loader = DataLoader(test_set, batch_size=32, shuffle=False, num_workers=0)

    if display_classes(test_set.classes) != classes:
        raise SystemExit(
            f"test folder classes {display_classes(test_set.classes)} != checkpoint classes {classes}"
        )

    model = build_model(len(classes), freeze_backbone=False)
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()

    criterion = torch.nn.CrossEntropyLoss()
    metrics = evaluate(model, loader, criterion, len(classes))

    y_true: list[int] = []
    y_pred: list[int] = []
    with torch.no_grad():
        for images, targets in loader:
            logits = model(images)
            y_pred.extend(logits.argmax(dim=1).tolist())
            y_true.extend(targets.tolist())

    true = np.array(y_true)
    pred = np.array(y_pred)
    matrix = confusion_matrix(true, pred, labels=list(range(len(classes))))
    report = classification_report(
        true, pred, labels=list(range(len(classes))), target_names=classes, digits=3, zero_division=0
    )
    per_class = classification_report(
        true,
        pred,
        labels=list(range(len(classes))),
        target_names=classes,
        digits=3,
        output_dict=True,
        zero_division=0,
    )

    header = (
        f"checkpoint: epoch {checkpoint['epoch']} (val macro-F1 "
        f"{checkpoint['best_val_macro_f1']:.3f})\n"
        f"test images: {len(test_set)}\n"
        f"accuracy: {metrics['accuracy']:.3f}\n"
        f"macro-F1: {metrics['macro_f1']:.3f}\n"
    )
    print(header)
    print("confusion matrix (rows = truth, cols = prediction), order: " + ", ".join(classes))
    print(matrix)
    print(report)

    payload = {
        "checkpoint_epoch": checkpoint["epoch"],
        "classes": classes,
        "test_images": len(test_set),
        "accuracy": round(metrics["accuracy"], 4),
        "macro_f1": round(metrics["macro_f1"], 4),
        "confusion_matrix": matrix.tolist(),
        "per_class": {
            name: {
                "precision": round(per_class[name]["precision"], 4),
                "recall": round(per_class[name]["recall"], 4),
                "f1": round(per_class[name]["f1-score"], 4),
                "support": int(per_class[name]["support"]),
            }
            for name in classes
        },
    }
    (ARTIFACTS / "eval.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (ARTIFACTS / "eval.txt").write_text(
        header + "\n".join(classes) + "\n" + str(matrix) + "\n\n" + report, encoding="utf-8"
    )
    print(f"\nsaved {ARTIFACTS / 'eval.json'}")


if __name__ == "__main__":
    main()
