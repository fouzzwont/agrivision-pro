import type { Crop, Detection, Severity } from "@/lib/types";

/**
 * Model contract for the leaf scanner.
 *
 * Inference itself runs in the browser (`src/lib/classifier.ts`) on the ONNX
 * model in `public/models/`. This module owns the part the client must not be
 * trusted with: turning a model label into a stored detection, including the
 * disease name and the severity that drives escalation, alerts and risk.
 *
 * The previous implementation was a deterministic stub (`stub-v0`) that hashed
 * the file name. It has been removed: if the model cannot run, the scan fails
 * with a visible error instead of returning an invented result.
 */

export const SCAN_MODEL_ID = "citrus-leaf-v1";

type ClassMapping = {
  crop: Crop;
  severity: Severity;
};

/**
 * Labels the shipped model can emit, mapped to the app's severity ladder.
 *
 * Only classes the model was actually trained on are listed. Adding a class
 * means retraining (`training/README.md`) and adding a row here.
 */
export const MODEL_CLASSES: Record<string, ClassMapping> = {
  "Citrus Greening (HLB)": { crop: "Citrus", severity: "Critical" },
  "Bacterial Canker": { crop: "Citrus", severity: "High" },
  "Healthy Citrus": { crop: "Citrus", severity: "Low" },
};

export const UNCOVERED_CROPS: Crop[] = ["Olive"];

export function modelCoversCrop(crop: Crop): boolean {
  return !UNCOVERED_CROPS.includes(crop);
}

export function modelCoversDisease(disease: string): boolean {
  return disease in MODEL_CLASSES;
}

export type ScanInput = {
  fileName: string;
  crop: Crop;
  blockId: string;
  blockName: string;
  prediction: { label: string; confidence: number };
};

export function buildDetection(input: ScanInput): Detection {
  const mapping = MODEL_CLASSES[input.prediction.label];
  if (!mapping) {
    throw new Error(`The model cannot report "${input.prediction.label}"`);
  }
  if (mapping.crop !== input.crop) {
    throw new Error(`"${input.prediction.label}" is a ${mapping.crop} class, not ${input.crop}`);
  }

  const confidence = Math.round(input.prediction.confidence);
  if (!Number.isFinite(input.prediction.confidence) || confidence < 0 || confidence > 100) {
    throw new Error("confidence must be a number between 0 and 100");
  }

  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    disease: input.prediction.label,
    crop: input.crop,
    blockId: input.blockId,
    block: input.blockName,
    confidence,
    severity: mapping.severity,
    recordedAt: new Date().toISOString(),
    source: "Scout upload",
    fileName: input.fileName,
    model: SCAN_MODEL_ID,
  };
}
