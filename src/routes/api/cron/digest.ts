import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron endpoint for hosts without a Workers `scheduled` handler (Render,
 * Docker). Cloudflare ignores this route and uses `src/server.ts` instead.
 *
 * Disabled unless `CRON_SECRET` is set, so it can never be triggered by an
 * anonymous visitor.
 */
async function handle(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET is not configured on this deployment" },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
  if (provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { runAlertDigest } = await import("@/server/cron");
    const result = await runAlertDigest();
    return Response.json({
      ok: true,
      subject: result.subject,
      deliveries: result.deliveries.length,
      channels: result.deliveries.map((delivery) => delivery.channel),
    });
  } catch (error) {
    console.error("[cron] digest failed", error);
    return Response.json({ error: "Digest failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/cron/digest")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
