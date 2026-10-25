#!/usr/bin/env node
/**
 * Triggers the alert digest on a Node deployment (Render Cron Job).
 *
 * The Cloudflare build uses the Workers `scheduled` handler instead; this
 * script is only needed where the platform has no cron trigger.
 *
 * Environment:
 *   APP_URL      public URL of the web service, e.g. https://agrivision.onrender.com
 *   CRON_SECRET  must match the CRON_SECRET of the web service
 */

const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!appUrl) {
  console.error("[cron] APP_URL is required");
  process.exit(1);
}

if (!secret) {
  console.error("[cron] CRON_SECRET is required");
  process.exit(1);
}

try {
  const response = await fetch(`${appUrl}/api/cron/digest`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });

  const body = await response.text();
  console.log(`[cron] ${response.status} ${body}`);
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error("[cron] request failed", error);
  process.exit(1);
}
