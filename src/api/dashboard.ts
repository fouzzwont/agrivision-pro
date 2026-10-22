import { createServerFn } from "@tanstack/react-start";
import type { DashboardSnapshot } from "@/lib/types";

/**
 * Full dashboard snapshot.
 *
 * Every number shown on the dashboard comes from this single server call so
 * the KPI tiles, the charts and the risk map can never disagree.
 */
export const getDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardSnapshot> => {
    const { buildDashboard } = await import("@/server/aggregate");
    return buildDashboard();
  },
);
