import type {
  Alert,
  Block,
  NotificationChannel,
  NotificationDelivery,
  Severity,
} from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { getStore } from "./store";

/**
 * Notification delivery.
 *
 * Email goes through the Resend REST API when `RESEND_API_KEY` is configured.
 * SMS is recorded but not sent — it needs a provider account, so the delivery
 * log marks it as `logged` and the UI shows the pending state rather than
 * pretending a message went out.
 */

function readSecret(name: string): string | undefined {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  const bindings = (globalThis as { __cfEnv?: Record<string, unknown> }).__cfEnv;
  const value = bindings?.[name];
  return typeof value === "string" ? value : undefined;
}

export type DigestInput = {
  to: string;
  subject: string;
  body: string;
  channels: NotificationChannel[];
  alertIds: string[];
};

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<{
  status: NotificationDelivery["status"];
  detail: string;
}> {
  const apiKey = readSecret("RESEND_API_KEY");
  const from = readSecret("NOTIFICATION_FROM") ?? "AgriVision <alerts@agrivision.ma>";

  if (!apiKey) {
    return {
      status: "logged",
      detail: "RESEND_API_KEY is not configured — digest recorded but not sent.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { status: "failed", detail: `Resend responded ${response.status}: ${detail}` };
    }

    const payload = (await response.json()) as { id?: string };
    return { status: "sent", detail: `Accepted by Resend (${payload.id ?? "no id"}).` };
  } catch (error) {
    return {
      status: "failed",
      detail: `Resend request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function deliverDigest(input: DigestInput): Promise<NotificationDelivery[]> {
  const store = getStore();
  const deliveries: NotificationDelivery[] = [];

  for (const channel of input.channels) {
    let status: NotificationDelivery["status"] = "logged";
    let detail = "";

    if (channel === "email") {
      const result = await sendEmail(input.to, input.subject, input.body);
      status = result.status;
      detail = result.detail;
    } else if (channel === "sms") {
      detail =
        "SMS provider is not configured — the digest was recorded and is ready to send once a provider is set up.";
    } else {
      detail = "Delivered to the in-app notification centre.";
    }

    const delivery: NotificationDelivery = {
      id: `dlv-${Date.now()}-${channel}`,
      at: new Date().toISOString(),
      channel,
      recipient: input.to,
      subject: input.subject,
      status,
      detail,
      alertIds: input.alertIds,
    };

    await store.recordDelivery(delivery);
    deliveries.push(delivery);
  }

  return deliveries;
}

export function buildDigestText(
  alerts: Alert[],
  blocks: Block[],
  threshold: Severity,
): { subject: string; body: string; ids: string[] } {
  const relevant = alerts
    .filter((a) => a.status === "open")
    .filter((a) => SEVERITY_ORDER[a.severity] >= SEVERITY_ORDER[threshold])
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);

  const ids = relevant.map((a) => a.id);
  const blockName = new Map(blocks.map((b) => [b.id, b.name]));

  const subject =
    relevant.length > 0
      ? `AgriVision: ${relevant.length} alert${relevant.length === 1 ? "" : "s"} at or above ${threshold}`
      : `AgriVision: no alerts at or above ${threshold}`;

  const lines = [
    `Estate: FOMACOP Estate — Marrakech-Safi, Morocco`,
    `Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    `Threshold: ${threshold}`,
    "",
    relevant.length ? "Open alerts:" : "No open alerts match the configured threshold.",
    ...relevant.map(
      (a) =>
        `- [${a.severity}] ${a.title} — ${blockName.get(a.blockId) ?? a.block}\n    ${a.recommendation}`,
    ),
    "",
    "Review and action the alerts in the AgriVision dashboard.",
  ];

  return { subject, body: lines.join("\n"), ids };
}
