import { createServerFn } from "@tanstack/react-start";
import type { Block, BlockDetail, RiskMapSnapshot } from "@/lib/types";

/** All monitored blocks with their live disease metrics. */
export const getBlocks = createServerFn({ method: "GET" }).handler(async (): Promise<Block[]> => {
  const { getStore } = await import("@/server/store");
  const { computeBlockMetrics } = await import("@/server/aggregate");
  const [blocks, inspections] = await Promise.all([
    getStore().listBlocks(),
    getStore().listInspections(),
  ]);
  return computeBlockMetrics(blocks, inspections);
});

/**
 * Risk map payload: blocks filtered by crop, disease and window, together with
 * the weather-driven infection forecast and the agronomic insights.
 */
export const getRiskMap = createServerFn({ method: "GET" })
  .inputValidator((data: { crop?: string; disease?: string; rangeDays?: number }) => {
    if (!data || typeof data !== "object") {
      throw new Error("Risk map filters are required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<RiskMapSnapshot> => {
    const { buildRiskMap } = await import("@/server/aggregate");
    return buildRiskMap({
      crop: data.crop,
      disease: data.disease,
      rangeDays: data.rangeDays,
    });
  });

/** Full detail for a single block: detections, notes, alerts, models. */
export const getBlockDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { blockId: string }) => {
    if (!data || typeof data.blockId !== "string" || data.blockId.length === 0) {
      throw new Error("blockId is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<BlockDetail | null> => {
    const { buildBlockDetail } = await import("@/server/aggregate");
    return buildBlockDetail(data.blockId);
  });
