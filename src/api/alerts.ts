import { createServerFn } from "@tanstack/react-start";
import type { Alert, NotificationDelivery } from "@/lib/types";

/** All alerts, newest first. */
export const getAlerts = createServerFn({ method: "GET" }).handler(async (): Promise<Alert[]> => {
  const { getStore } = await import("@/server/store");
  return getStore().listAlerts();
});

/** Marks an alert as dismissed. */
export const dismissAlert = createServerFn({ method: "POST" })
  .inputValidator((data: { alertId: string }) => {
    if (!data || typeof data.alertId !== "string" || data.alertId.length === 0) {
      throw new Error("alertId is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<Alert | null> => {
    const { getStore } = await import("@/server/store");
    return (await getStore().dismissAlert(data.alertId)) ?? null;
  });

/** Records a curative action against an alert. */
export const actionAlert = createServerFn({ method: "POST" })
  .inputValidator((data: { alertId: string; action: string }) => {
    if (!data || typeof data.alertId !== "string" || data.alertId.length === 0) {
      throw new Error("alertId is required");
    }
    if (typeof data.action !== "string" || data.action.trim().length === 0) {
      throw new Error("action is required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<Alert | null> => {
    const { getStore } = await import("@/server/store");
    return (await getStore().takeAlertAction(data.alertId, data.action.trim())) ?? null;
  });

/**
 * Counts of the alerts that still need attention.
 *
 * Used by the top bar badge, which sits outside every route loader and
 * therefore cannot read the alerts another screen already fetched.
 */
export const getAlertSummary = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ open: number; critical: number; high: number }> => {
    const { getStore } = await import("@/server/store");
    const alerts = await getStore().listAlerts();
    const open = alerts.filter((alert) => alert.status === "open");
    return {
      open: open.length,
      critical: open.filter((alert) => alert.severity === "Critical").length,
      high: open.filter((alert) => alert.severity === "High").length,
    };
  },
);

/** Delivery log for every digest the cron or the settings page produced. */
export const getDeliveries = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationDelivery[]> => {
    const { getStore } = await import("@/server/store");
    return getStore().listDeliveries();
  },
);

/**
 * Runs the alert digest immediately, exactly the way the scheduled cron does.
 * Used by the settings page so an operator can verify delivery end to end.
 */
export const sendTestDigest = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ subject: string; body: string; deliveries: NotificationDelivery[] }> => {
    const { runAlertDigest } = await import("@/server/cron");
    return runAlertDigest();
  },
);
