import { createServerFn } from "@tanstack/react-start";
import type { Crop, Detection } from "@/lib/types";

/** All detections, newest first. */
export const getDetections = createServerFn({ method: "GET" }).handler(
  async (): Promise<Detection[]> => {
    const { getStore } = await import("@/server/store");
    return getStore().listDetections();
  },
);

/**
 * Runs a scan for an uploaded capture and stores the result.
 *
 * The image itself is not persisted — only the inference result and the file
 * metadata — which keeps the estate dataset small while the audit trail stays
 * complete.
 */
export const runDetection = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      fileName: string;
      crop: Crop;
      blockId: string;
      sizeBytes: number;
      prediction: { label: string; confidence: number };
    }) => {
      if (!data || typeof data.fileName !== "string" || data.fileName.length === 0) {
        throw new Error("fileName is required");
      }
      if (data.crop !== "Olive" && data.crop !== "Citrus") {
        throw new Error("crop must be Olive or Citrus");
      }
      if (typeof data.blockId !== "string" || data.blockId.length === 0) {
        throw new Error("blockId is required");
      }
      if (
        !data.prediction ||
        typeof data.prediction.label !== "string" ||
        typeof data.prediction.confidence !== "number"
      ) {
        throw new Error("prediction is required");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<Detection> => {
    const { getStore } = await import("@/server/store");
    const { buildDetection } = await import("@/server/detection");
    const store = getStore();
    const block = await store.getBlock(data.blockId);
    if (!block) throw new Error(`Unknown block: ${data.blockId}`);

    const detection = buildDetection({
      fileName: data.fileName,
      crop: data.crop,
      blockId: data.blockId,
      blockName: block.name,
      prediction: data.prediction,
    });

    return store.addScan(detection);
  });
