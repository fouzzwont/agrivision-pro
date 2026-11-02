"""
Train the AgriVision citrus leaf classifier.

Transfer learning on MobileNetV3-Small (ImageNet weights). The backbone is
frozen for the head phase, which is what makes CPU training practical here;
`--fine-tune` then unfreezes the last blocks at a much lower learning rate.

Outputs (training/artifacts/):
    model.pt        best checkpoint by validation macro-F1
    metrics.json    per-epoch history, class names, best epoch

Usage:
    python training/train.py
    python training/train.py --epochs 30 --fine-tune 4
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, transforms
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "processed"
ARTIFACTS = ROOT / "artifacts"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def slugify(label: str) -> str:
    return label.lower().replace(" ", "-").replace("(", "").replace(")", "")


def display_classes(folder_classes: list[str]) -> list[str]:
    """
    ImageFolder names classes after their folder, which prepare.py slugs.
    Map those back to the labels the app stores, preserving index order.
    """
    manifest_path = DATA / "manifest.json"
    if not manifest_path.exists():
        return list(folder_classes)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    lookup = {slugify(label): label for label in manifest.get("label_map", {}).values()}
    return [lookup.get(name, name) for name in folder_classes]


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def build_transforms() -> tuple[transforms.Compose, transforms.Compose]:
    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(224, scale=(0.65, 1.0), ratio=(0.85, 1.18)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(p=0.2),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.2, hue=0.03),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    eval_tf = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
        ]
    )
    return train_tf, eval_tf


def build_model(num_classes: int, freeze_backbone: bool) -> nn.Module:
    model = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    if freeze_backbone:
        for parameter in model.features.parameters():
            parameter.requires_grad = False
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model


def macro_f1(y_true: np.ndarray, y_pred: np.ndarray, num_classes: int) -> float:
    scores = []
    for cls in range(num_classes):
        tp = int(((y_pred == cls) & (y_true == cls)).sum())
        fp = int(((y_pred == cls) & (y_true != cls)).sum())
        fn = int(((y_pred != cls) & (y_true == cls)).sum())
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return float(np.mean(scores))


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, criterion: nn.Module, num_classes: int):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    y_true: list[int] = []
    y_pred: list[int] = []

    for images, targets in loader:
        logits = model(images)
        total_loss += criterion(logits, targets).item() * images.size(0)
        predictions = logits.argmax(dim=1)
        correct += int((predictions == targets).sum())
        total += images.size(0)
        y_true.extend(targets.tolist())
        y_pred.extend(predictions.tolist())

    true = np.array(y_true)
    pred = np.array(y_pred)
    return {
        "loss": total_loss / max(total, 1),
        "accuracy": correct / max(total, 1),
        "macro_f1": macro_f1(true, pred, num_classes),
        "n": total,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--fine-tune", type=int, default=0, help="extra epochs with unfrozen blocks")
    parser.add_argument("--fine-tune-lr", type=float, default=1e-4)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    seed_everything(args.seed)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    train_tf, eval_tf = build_transforms()
    train_set = datasets.ImageFolder(DATA / "train", transform=train_tf)
    val_set = datasets.ImageFolder(DATA / "val", transform=eval_tf)
    classes = display_classes(train_set.classes)
    num_classes = len(classes)

    if num_classes < 2:
        raise SystemExit("need at least two classes under training/data/processed/train")

    # Inverse-frequency sampling: "Healthy Citrus" is the smallest class here.
    counts = np.bincount([label for _, label in train_set.samples], minlength=num_classes)
    weights_per_class = 1.0 / np.maximum(counts, 1)
    sample_weights = [weights_per_class[label] for _, label in train_set.samples]
    sampler = WeightedRandomSampler(sample_weights, num_samples=len(sample_weights), replacement=True)

    train_loader = DataLoader(train_set, batch_size=args.batch_size, sampler=sampler, num_workers=0)
    val_loader = DataLoader(val_set, batch_size=args.batch_size, shuffle=False, num_workers=0)

    print(f"classes: {classes}")
    print(f"train: {len(train_set)}  val: {len(val_set)}  counts: {counts.tolist()}")

    model = build_model(num_classes, freeze_backbone=True)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=args.lr, weight_decay=1e-4
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    history: list[dict] = []
    best_f1 = -1.0
    best_epoch = -1
    stale = 0
    started = time.time()

    total_epochs = args.epochs + args.fine_tune
    for epoch in range(1, total_epochs + 1):
        if epoch == args.epochs + 1 and args.fine_tune > 0:
            print("--- unfreezing last feature blocks for fine-tuning ---")
            for parameter in model.features[-3:].parameters():
                parameter.requires_grad = True
            optimizer = torch.optim.AdamW(
                [p for p in model.parameters() if p.requires_grad],
                lr=args.fine_tune_lr,
                weight_decay=1e-4,
            )
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.fine_tune)
            stale = 0

        model.train()
        epoch_loss = 0.0
        correct = 0
        total = 0
        epoch_started = time.time()

        for images, targets in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, targets)
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item() * images.size(0)
            correct += int((logits.argmax(dim=1) == targets).sum())
            total += images.size(0)

        scheduler.step()
        metrics = evaluate(model, val_loader, criterion, num_classes)
        record = {
            "epoch": epoch,
            "train_loss": epoch_loss / max(total, 1),
            "train_accuracy": correct / max(total, 1),
            "val_loss": metrics["loss"],
            "val_accuracy": metrics["accuracy"],
            "val_macro_f1": metrics["macro_f1"],
            "lr": optimizer.param_groups[0]["lr"],
            "seconds": round(time.time() - epoch_started, 1),
        }
        history.append(record)
        print(
            f"epoch {epoch:02d}/{total_epochs}  "
            f"train {record['train_accuracy']:.3f}  "
            f"val {record['val_accuracy']:.3f}  f1 {record['val_macro_f1']:.3f}  "
            f"{record['seconds']}s"
        )

        if metrics["macro_f1"] > best_f1:
            best_f1 = metrics["macro_f1"]
            best_epoch = epoch
            stale = 0
            torch.save(
                {
                    "state_dict": model.state_dict(),
                    "classes": classes,
                    "arch": "mobilenet_v3_small",
                    "input_size": 224,
                    "normalize": {"mean": IMAGENET_MEAN, "std": IMAGENET_STD},
                    "best_val_macro_f1": best_f1,
                    "epoch": epoch,
                },
                ARTIFACTS / "model.pt",
            )
        else:
            stale += 1
            if stale >= args.patience:
                print(f"early stopping after {stale} epochs without improvement")
                break

    report = {
        "classes": classes,
        "arch": "mobilenet_v3_small",
        "input_size": 224,
        "seed": args.seed,
        "train_images": len(train_set),
        "val_images": len(val_set),
        "class_counts_train": counts.tolist(),
        "best_epoch": best_epoch,
        "best_val_macro_f1": best_f1,
        "total_seconds": round(time.time() - started, 1),
        "history": history,
    }
    (ARTIFACTS / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nbest epoch {best_epoch}  val macro-F1 {best_f1:.3f}")
    print(f"saved {ARTIFACTS / 'model.pt'}")


if __name__ == "__main__":
    main()
