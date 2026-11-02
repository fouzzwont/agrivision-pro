import type { InferenceSession } from "onnxruntime-web";

/**
 * Client-side leaf classifier.
 *
 * Inference runs in the browser with ONNX Runtime Web (WASM): the image never
 * leaves the device, and the server only stores the result. The model and its
 * metadata live in `public/models/` and are produced by `training/export_onnx.py`.
 *
 * Nothing here runs during SSR — call these functions from effects or handlers.
 */

export type ModelMetrics = {
  testAccuracy: number;
  perClassRecall: Record<string, number>;
  testImages: number;
  valMacroF1: number;
  checkpointEpoch: number;
};

export type ModelMetadata = {
  id: string;
  arch: string;
  /** Crop the weights were trained on; scanning other crops is refused. */
  crop: string;
  inputSize: number;
  normalize: { mean: number[]; std: number[] };
  classes: string[];
  variant: string;
  sizeBytes: number;
  metrics: ModelMetrics;
  training: { dataset: string; license: string; citation: string; split: string };
};

export type Prediction = {
  label: string;
  confidence: number;
  top: { label: string; probability: number }[];
};

const MODEL_BASE = "/models/citrus-leaf-v1";

type Loaded = { session: InferenceSession; metadata: ModelMetadata };

let loaded: Promise<Loaded> | null = null;

export function isModelLoaded(): boolean {
  return loaded !== null;
}

/** Fetches metadata alone, so the UI can show coverage before loading weights. */
export async function fetchModelMetadata(): Promise<ModelMetadata> {
  const response = await fetch(`${MODEL_BASE}.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Model metadata unavailable (${response.status})`);
  return (await response.json()) as ModelMetadata;
}

async function load(): Promise<Loaded> {
  if (!loaded) {
    loaded = (async () => {
      const [ort, wasmModule, glueModule, metadata] = await Promise.all([
        import("onnxruntime-web/wasm"),
        import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url"),
        import("onnxruntime-web/ort-wasm-simd-threaded.mjs?url"),
        fetchModelMetadata(),
      ]);

      // Single-threaded WASM: no SharedArrayBuffer, so no COOP/COEP headers.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = {
        wasm: wasmModule.default,
        mjs: glueModule.default,
      };

      const session = await ort.InferenceSession.create(`${MODEL_BASE}.onnx`, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      return { session, metadata };
    })();
  }
  return loaded;
}

/** Resets the cached session — used by the "reload model" affordance. */
export function unloadModel(): void {
  loaded = null;
}

/**
 * Mirrors the eval transform used in training: shorter side to 256 px, then a
 * centred 224 px crop, ImageNet normalisation, NCHW float32.
 */
async function toInputTensor(
  file: File,
  ort: typeof import("onnxruntime-web/wasm"),
  metadata: ModelMetadata,
) {
  const bitmap = await createImageBitmap(file);
  try {
    const size = metadata.inputSize;
    const scale = (size * (256 / 224)) / Math.min(bitmap.width, bitmap.height);
    const width = Math.max(size, Math.round(bitmap.width * scale));
    const height = Math.max(size, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable in this browser");

    const offsetX = (width - size) / 2;
    const offsetY = (height - size) / 2;
    context.drawImage(bitmap, -offsetX, -offsetY, width, height);

    const { data } = context.getImageData(0, 0, size, size);
    const pixels = size * size;
    const input = new Float32Array(3 * pixels);
    const { mean, std } = metadata.normalize;

    for (let i = 0; i < pixels; i++) {
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      input[i] = (r - mean[0]) / std[0];
      input[pixels + i] = (g - mean[1]) / std[1];
      input[2 * pixels + i] = (b - mean[2]) / std[2];
    }

    return new ort.Tensor("float32", input, [1, 3, size, size]);
  } finally {
    bitmap.close();
  }
}

export async function classifyLeaf(file: File): Promise<Prediction> {
  const { session, metadata } = await load();
  const ort = await import("onnxruntime-web/wasm");
  const tensor = await toInputTensor(file, ort, metadata);

  const output = await session.run({ [session.inputNames[0]]: tensor });
  const raw = output[session.outputNames[0]];
  const probabilities = Array.from(raw.data as Float32Array);

  const ranked = probabilities
    .map((probability, index) => ({
      label: metadata.classes[index] ?? `class-${index}`,
      probability,
    }))
    .sort((a, b) => b.probability - a.probability);

  const best = ranked[0];
  if (!best) throw new Error("The model returned no predictions");

  return {
    label: best.label,
    confidence: Math.round(best.probability * 100),
    top: ranked.slice(0, 3).map((entry) => ({
      label: entry.label,
      probability: Math.round(entry.probability * 1000) / 10,
    })),
  };
}
