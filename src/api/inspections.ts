import { createServerFn } from "@tanstack/react-start";
import type { Block, FieldNote, Inspection, Severity } from "@/lib/types";

/** All field inspections across the estate. */
export const getInspections = createServerFn({ method: "GET" }).handler(
  async (): Promise<Inspection[]> => {
    const { getStore } = await import("@/server/store");
    return getStore().listInspections();
  },
);

/** Field notes recorded by the scouting team. */
export const getFieldNotes = createServerFn({ method: "GET" }).handler(
  async (): Promise<FieldNote[]> => {
    const { getStore } = await import("@/server/store");
    return getStore().listFieldNotes();
  },
);

/** Adds a scouting note. Notes are appended to the block's audit trail. */
export const addFieldNote = createServerFn({ method: "POST" })
  .inputValidator((data: { note: string; author?: string; blockId?: string }) => {
    if (!data || typeof data.note !== "string" || data.note.trim().length === 0) {
      throw new Error("A note is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<FieldNote> => {
    const { getStore } = await import("@/server/store");
    const settings = await getStore().getSettings();
    return getStore().addFieldNote({
      note: data.note.trim(),
      author: data.author?.trim() || settings.profile.fullName,
      blockId: data.blockId,
    });
  });

/**
 * Everything the field monitoring screen needs in a single round trip:
 * the inspection log, the scouting notes, the block metrics and the two
 * aggregate series used by the charts.
 */
export const getFieldOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    inspections: Inspection[];
    notes: FieldNote[];
    blocks: Block[];
    trend: { date: string; detections: number; healthy: number; severity: number }[];
    severityDistribution: { name: Severity; value: number }[];
  }> => {
    const { getStore } = await import("@/server/store");
    const { computeBlockMetrics, computeTrend, computeSeverityDistribution } =
      await import("@/server/aggregate");

    const store = getStore();
    const [rawBlocks, inspections, notes] = await Promise.all([
      store.listBlocks(),
      store.listInspections(),
      store.listFieldNotes(),
    ]);

    return {
      inspections,
      notes,
      blocks: computeBlockMetrics(rawBlocks, inspections),
      trend: computeTrend(inspections, 14),
      severityDistribution: computeSeverityDistribution(inspections, 7),
    };
  },
);
