import type { Crop, Detection, Severity } from "@/lib/types";

/**
 * On-device inference stub.
 *
 * The production pipeline runs a TensorFlow.js model on the capture device.
 * Until a trained model is wired in, this module reproduces the inference
 * *contract* — the same labels, confidence ranges and severity mapping — from
 * a deterministic hash of the file signature, so the rest of the application
 * (block metrics, yield risk, alerts) behaves exactly as it will once real
 * weights are loaded.
 *
 * Every result it produces is tagged with `model: "stub-v0"` so the UI can
 * label it honestly.
 */

export const SCAN_MODEL_ID = "stub-v0";

type LibraryEntry = {
  disease: string;
  severity: Severity;
  confidence: [number, number];
};

const LIBRARY: Record<Crop, LibraryEntry[]> = {
  Citrus: [
    { disease: "Citrus Greening (HLB)", severity: "Critical", confidence: [86, 96] },
    { disease: "Bacterial Canker", severity: "High", confidence: [81, 92] },
    { disease: "Greasy Spot", severity: "Medium", confidence: [75, 88] },
    { disease: "Leaf Miner stress", severity: "Low", confidence: [70, 84] },
    { disease: "Healthy Citrus", severity: "Low", confidence: [92, 98] },
  ],
  Olive: [
    { disease: "Olive Peacock Spot", severity: "High", confidence: [83, 94] },
    { disease: "Olive Leaf Spot", severity: "Medium", confidence: [76, 89] },
    { disease: "Nutrient deficiency", severity: "Medium", confidence: [68, 82] },
    { disease: "Healthy Olive", severity: "Low", confidence: [91, 99] },
  ],
};

/** Small deterministic hash so the same file always yields the same result. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export type ScanInput = {
  fileName: string;
  crop: Crop;
  blockId: string;
  blockName: string;
  sizeBytes: number;
};

export function simulateInference(input: ScanInput): Detection {
  const library = LIBRARY[input.crop] ?? LIBRARY.Citrus;
  const roll = hash(`${input.fileName}:${input.sizeBytes}`);
  const entry = library[Math.floor(roll * library.length) % library.length];
  const confidence = Math.round(
    entry.confidence[0] + roll * (entry.confidence[1] - entry.confidence[0]),
  );

  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    disease: entry.disease,
    crop: input.crop,
    blockId: input.blockId,
    block: input.blockName,
    confidence,
    severity: entry.severity,
    recordedAt: new Date().toISOString(),
    source: "Scout upload",
    fileName: input.fileName,
    model: SCAN_MODEL_ID,
  };
}
