import { createServerFn } from "@tanstack/react-start";
import type { ReportPayload, ReportType } from "@/lib/types";

const REPORT_TYPES: ReportType[] = ["disease", "risk", "field", "yield"];

/**
 * Builds a report on the server so the PDF and the CSV always contain the
 * same numbers, and so the agronomy models never have to run in the browser.
 */
export const getReport = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { type: ReportType; crop?: string; blockId?: string; rangeDays?: number }) => {
      if (!data || !REPORT_TYPES.includes(data.type)) {
        throw new Error("Unsupported report type");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<ReportPayload> => {
    const { buildReport } = await import("@/server/aggregate");
    return buildReport({
      type: data.type,
      crop: data.crop,
      blockId: data.blockId,
      rangeDays: data.rangeDays,
    });
  });
