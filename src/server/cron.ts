import type { NotificationDelivery } from "@/lib/types";
import { buildDigestText, deliverDigest } from "./notifications";
import { getStore } from "./store";

/**
 * Scheduled alert digest.
 *
 * Invoked by the Workers Cron trigger declared in `wrangler.jsonc` and, on
 * demand, by the settings page. It selects every open alert at or above the
 * configured severity threshold, renders a plain-text digest and hands it to
 * each configured delivery channel.
 */
export async function runAlertDigest(): Promise<{
  subject: string;
  body: string;
  deliveries: NotificationDelivery[];
}> {
  const store = getStore();
  const [settings, alerts, blocks] = await Promise.all([
    store.getSettings(),
    store.listAlerts(),
    store.listBlocks(),
  ]);

  const { subject, body, ids } = buildDigestText(alerts, blocks, settings.notifications.threshold);

  const channels = settings.notifications.channels.length
    ? settings.notifications.channels
    : (["in-app"] as const);

  const deliveries = await deliverDigest({
    to: settings.profile.email,
    subject,
    body,
    channels: [...channels],
    alertIds: ids,
  });

  return { subject, body, deliveries };
}
