import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";

import { serve } from "srvx";

import "./lib/error-capture";
import workerEntry from "./server";

/**
 * Node server entry point.
 *
 * The Cloudflare build ships `src/server.ts` as a Workers module with a
 * `fetch` export and relies on the platform's assets binding for static
 * files. Render (and Docker) need a long-running HTTP listener, so this entry
 * reuses the same request handler, serves `dist/client` itself and wraps the
 * pair with srvx.
 *
 * Scheduled digests have no scheduler here — point a Render Cron Job at
 * `/api/cron/digest` instead.
 */

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";
const clientRoot = resolve(process.cwd(), process.env.CLIENT_DIR ?? "dist/client");

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Serves a file from `dist/client`, or returns null to fall through to SSR. */
function serveStaticFile(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const filePath = resolve(join(clientRoot, normalize(pathname)));

  // Refuse anything that escapes the client directory.
  if (filePath !== clientRoot && !filePath.startsWith(clientRoot + sep)) return null;

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return null;

    const extension = extname(filePath).toLowerCase();
    const immutable = pathname.startsWith("/assets/");

    return new Response(request.method === "HEAD" ? null : readFileSync(filePath), {
      headers: {
        "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
        "content-length": String(stats.size),
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      },
    });
  } catch {
    return null;
  }
}

const server = serve({
  port,
  hostname,
  fetch: (request: Request) => {
    const asset = serveStaticFile(request);
    if (asset) return asset;
    return workerEntry.fetch(request, process.env, {});
  },
});

server.ready().then(
  () => {
    console.log(`[server] listening on http://${hostname}:${port}`);
    console.log(`[server] serving static assets from ${clientRoot}`);
  },
  (error: unknown) => {
    console.error("[server] failed to start", error);
    process.exit(1);
  },
);

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, closing listener`);
  Promise.resolve(server.close?.()).finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
