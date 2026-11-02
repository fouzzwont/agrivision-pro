"""
Export the trained checkpoint to ONNX and measure what actually ships.

Two variants are produced:
    artifacts/model-fp32.onnx   float32 export
    artifacts/model-int8.onnx   dynamic int8 quantisation (~3x smaller)

Both are scored on the held-out test split with ONNX Runtime, and the variant
that keeps accuracy within 2 points of float32 is copied to
`public/models/citrus-leaf-v1.onnx` together with a metadata JSON the app reads.

Usage:
    python training/export_onnx.py
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets

from train import ARTIFACTS, DATA, build_transforms, build_model, display_classes

PUBLIC = Path(__file__).resolve().parent.parent / "public" / "models"
MODEL_NAME = "citrus-leaf-v1"


class WithSoftmax(nn.Module):
    """Probability output, so the browser only has to pick an argmax."""

    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.softmax(self.model(x), dim=1)


def onnx_accuracy(path: Path, loader: DataLoader, classes: list[str]) -> dict:
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    correct = 0
    total = 0
    per_class_correct = {name: 0 for name in classes}
    per_class_total = {name: 0 for name in classes}

    for images, targets in loader:
        probabilities = session.run(None, {input_name: images.numpy()})[0]
        predictions = probabilities.argmax(axis=1)
        truth = targets.numpy()
        correct += int((predictions == truth).sum())
        total += len(truth)
        for expected, predicted in zip(truth, predictions):
            name = classes[int(expected)]
            per_class_total[name] += 1
            if expected == predicted:
                per_class_correct[name] += 1

    return {
        "accuracy": correct / max(total, 1),
        "test_images": total,
        "per_class_recall": {
            name: per_class_correct[name] / per_class_total[name] if per_class_total[name] else 0.0
            for name in classes
        },
    }


def main() -> None:
    checkpoint = torch.load(ARTIFACTS / "model.pt", map_location="cpu", weights_only=False)
    classes: list[str] = checkpoint["classes"]

    model = build_model(len(classes), freeze_backbone=False)
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    wrapped = WithSoftmax(model)
    wrapped.eval()

    _, eval_tf = build_transforms()
    test_set = datasets.ImageFolder(DATA / "test", transform=eval_tf)
    loader = DataLoader(test_set, batch_size=16, shuffle=False, num_workers=0)

    if display_classes(test_set.classes) != classes:
        raise SystemExit(
            f"test classes {display_classes(test_set.classes)} != checkpoint classes {classes}"
        )

    fp32_path = ARTIFACTS / "model-fp32.onnx"
    int8_path = ARTIFACTS / "model-int8.onnx"
    dummy = torch.randn(1, 3, 224, 224)

    print("exporting float32 ONNX …")
    torch.onnx.export(
        wrapped,
        dummy,
        fp32_path,
        input_names=["input"],
        output_names=["probabilities"],
        dynamic_axes={"input": {0: "batch"}, "probabilities": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    # Sanity check: ONNX Runtime must agree with PyTorch on the same input.
    session = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
    reference = wrapped(dummy).detach().numpy()
    exported = session.run(None, {"input": dummy.numpy()})[0]
    max_diff = float(np.abs(reference - exported).max())
    print(f"max |torch - onnx| on random input: {max_diff:.2e}")
    if max_diff > 1e-4:
        raise SystemExit("ONNX export diverges from PyTorch; refusing to ship it")

    print("quantising to int8 …")
    quantize_dynamic(str(fp32_path), str(int8_path), weight_type=QuantType.QInt8)

    fp32_stats = onnx_accuracy(fp32_path, loader, classes)
    int8_stats = onnx_accuracy(int8_path, loader, classes)
    print(f"fp32 onnx: accuracy {fp32_stats['accuracy']:.3f}")
    print(f"int8 onnx: accuracy {int8_stats['accuracy']:.3f}")

    chosen = int8_stats["accuracy"] >= fp32_stats["accuracy"] - 0.02
    source = int8_path if chosen else fp32_path
    stats = int8_stats if chosen else fp32_stats

    PUBLIC.mkdir(parents=True, exist_ok=True)
    target = PUBLIC / f"{MODEL_NAME}.onnx"
    shutil.copyfile(source, target)

    metadata = {
        "id": MODEL_NAME,
        "arch": checkpoint["arch"],
        "crop": "Citrus",
        "inputSize": checkpoint["input_size"],
        "normalize": checkpoint["normalize"],
        "classes": classes,
        "variant": "int8" if chosen else "fp32",
        "sizeBytes": target.stat().st_size,
        "metrics": {
            "testAccuracy": round(stats["accuracy"], 4),
            "perClassRecall": {k: round(v, 4) for k, v in stats["per_class_recall"].items()},
            "testImages": stats["test_images"],
            "valMacroF1": round(checkpoint["best_val_macro_f1"], 4),
            "checkpointEpoch": checkpoint["epoch"],
        },
        "training": {
            "dataset": "Project-AgML/citrus_fruit_leaf_disease_classification (CC-BY-4.0)",
            "license": "CC-BY-4.0",
            "citation": "Rauf et al. 2019, Data in Brief 26:104340",
            "split": "70/15/15 stratified, seed 42",
        },
    }
    (PUBLIC / f"{MODEL_NAME}.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"\nsaved {target} ({target.stat().st_size / 1e6:.2f} MB, {metadata['variant']})")
    print(f"saved {PUBLIC / (MODEL_NAME + '.json')}")


if __name__ == "__main__":
    main()
