import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getStore, type D1Like } from "./server/store";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type Bindings = Record<string, unknown>;

/**
 * Workers runtime bindings.
 *
 * The Worker entry point receives the environment bindings as the second
 * argument of `fetch` / `scheduled`. They are published on `globalThis` so
 * the server functions can reach them without threading a context through
 * every call, and the D1 binding is attached to the store for write-through
 * persistence.
 */
function applyBindings(env: unknown): Bindings {
  if (!env || typeof env !== "object") return {};
  const bindings = env as Bindings;
  (globalThis as { __cfEnv?: Bindings }).__cfEnv = bindings;

  const db = bindings.DB as D1Like | undefined;
  if (db && typeof db.prepare === "function") {
    getStore().attachDatabase(db);
  }

  return bindings;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    applyBindings(env);
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  /**
   * Cron trigger. Runs the alert digest on the schedule declared in
   * `wrangler.jsonc` (`triggers.crons`).
   */
  async scheduled(_controller: unknown, env: unknown, _ctx: unknown) {
    applyBindings(env);
    try {
      const { runAlertDigest } = await import("./server/cron");
      const result = await runAlertDigest();
      console.log(
        `[cron] digest "${result.subject}" delivered to ${result.deliveries.length} channel(s)`,
      );
      return result;
    } catch (error) {
      console.error("[cron] digest failed", error);
      throw error;
    }
  },
};
