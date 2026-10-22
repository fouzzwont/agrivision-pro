import { createServerFn } from "@tanstack/react-start";
import type { Alert, Block, Detection } from "@/lib/types";

export type SearchResults = {
  query: string;
  blocks: Block[];
  alerts: Alert[];
  detections: Detection[];
};

/**
 * Global estate search.
 *
 * Matches the query against block names, crops, diseases, alert titles and
 * detection history. Everything the search can reach is already in the store,
 * so this stays a single in-memory pass with no extra I/O.
 */
export const searchEstate = createServerFn({ method: "GET" })
  .inputValidator((data: { query: string }) => {
    if (!data || typeof data.query !== "string") {
      throw new Error("query is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<SearchResults> => {
    const { getStore } = await import("@/server/store");

    const query = data.query.trim();
    if (query.length < 2) {
      return { query, blocks: [], alerts: [], detections: [] };
    }

    const needle = query.toLowerCase();
    const store = getStore();
    const [blocks, alerts, detections] = await Promise.all([
      store.listBlocks(),
      store.listAlerts(),
      store.listDetections(),
    ]);

    const matches = (values: string[]) =>
      values.some((value) => value.toLowerCase().includes(needle));

    return {
      query,
      blocks: blocks
        .filter((block) => matches([block.name, block.crop, block.variety]))
        .slice(0, 5),
      alerts: alerts
        .filter((alert) => matches([alert.title, alert.disease, alert.block, alert.crop]))
        .slice(0, 5),
      detections: detections
        .filter((detection) => matches([detection.disease, detection.block, detection.crop]))
        .slice(0, 5),
    };
  });
