# AgriVision

Crop disease intelligence for commercial olive and citrus estates.

AgriVision turns field observations, weather and lab-style detections into an
operational picture of a farm: which blocks are at risk, why, what it is worth,
and what to do next. It runs entirely on your own machine — no external
services are required to start.

<!-- prettier-ignore -->
| Screen | Route | What it does |
| --- | --- | --- |
| Dashboard | `/` | Estate KPIs, live weather, riskiest blocks, recent detections |
| Risk map | `/risk-map` | MapLibre map of every block with crop / disease / risk filters |
| Block detail | `/blocks/$blockId` | Per-block health, detections, yield loss, alerts, audit trail |
| Alerts | `/alerts` | Triage alerts, mark treated, dismiss, filter by severity |
| Field | `/field` | Inspection history, severity trends, field notes |
| Detection | `/detection` | Upload a leaf image and get a disease classification |
| Reports | `/reports` | Real PDF and CSV export of the estate report |
| Settings | `/settings` | Notification channels, thresholds, digest hour, delivery log |
| Pricing | `/pricing` | Plan comparison (static) |

---

## Quick start

```bash
bun install
bun run dev
```

The dev server listens on **http://localhost:8080**.

```bash
bun run build     # production build (client + SSR + Cloudflare worker)
bun run preview   # preview the production build
```

### Requirements

- [Bun](https://bun.sh) (or Node 20+ with a compatible package manager)
- No API keys are needed. Weather comes from Open-Meteo (keyless) and map tiles
  come from CARTO's public raster basemap (keyless).

---

## Architecture

```
src/
  api/          TanStack Start server functions (client-importable)
  server/       Server-only code: store, aggregation, models, weather, cron
    models/     infection-risk + yield-risk models
  components/   App components (topbar, estate map, report export, shadcn UI)
  lib/          Shared types, geo math, colour tokens, date formatting
  routes/       File-based routes (TanStack Router)
```

**Two rules keep the server boundary clean:**

1. Anything under `src/server/**` is server-only. The Vite config protects it
   with `importProtection` (`client.files: ["**/server/**"]`), so importing it
   from a component fails at build time instead of leaking secrets to the
   browser.
2. `src/api/*.ts` is the public seam. Each module exports `createServerFn`
   handlers that route components call. Server-only modules are pulled in with a
   dynamic `await import(...)` **inside** the `.handler()` body, so the
   server bundle never leaks into the client chunk.

Shared types live in `src/lib/types.ts`. Client code must never import types
from `@/server/**`.

---

## Data & persistence

The estate dataset is generated deterministically by `src/server/seed.ts`
(fixed PRNG seed) relative to today, so every run looks the same but the dates
stay current. Block metrics — detections, urgent cases, health score, risk
level — are **derived from inspections**, not hard-coded.

State lives in memory in `src/server/store.ts` and is written through to
Cloudflare D1 when the `DB` binding is present. Without the binding the app
runs fine; mutable state simply resets on a cold start.

```bash
npx wrangler d1 create agrivision          # create the database
# paste the returned id into wrangler.jsonc -> d1_databases[0].database_id
npx wrangler d1 migrations apply DB --local   # apply locally
npx wrangler d1 migrations apply DB           # apply to production
```

The migration (`migrations/0001_app_state.sql`) creates a single key/value
table:

```sql
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Weather-driven infection risk

`src/server/weather.ts` fetches a 7-day hourly forecast from Open-Meteo for
the estate centroid, cached for 30 minutes in memory. If the network is
unavailable it falls back to a deterministic synthetic forecast so the app
never breaks — the UI labels the source as `offline fallback` when that
happens.

`src/server/models/infection-risk.ts` turns that forecast into a per-disease
pressure score (0–100) plus human-readable drivers, e.g.

```
Citrus Greening (HLB) — pressure 50/100 (medium). 18 h in the 25-34 °C
psyllid flight window. 21 h above 70% humidity (vector activity).
```

Olive Peacock Spot scores on leaf-wetness hours, the 12–28 °C temperature
band and qualifying rainfall.

## Yield risk

`src/server/models/yield-risk.ts` converts detection counts, severity and
affected area into expected yield loss (%), tonnage and MAD value at risk per
block and for the estate as a whole.

---

## Alerts & notification delivery

`src/server/notifications.ts` renders the digest and delivers it over the
channels enabled in Settings (email, SMS). Delivery is honest:

- With `RESEND_API_KEY` set, email is sent through the Resend REST API.
- Without it, the delivery is recorded with status `logged` — the app never
  claims an email was sent when it was not.
- SMS is recorded but not sent (no provider is wired up).

### Scheduled digests

A Cloudflare Cron trigger runs the digest twice a day:

```jsonc
// wrangler.jsonc
"triggers": { "crons": ["0 6,18 * * *"] }
```

The handler lives in `src/server.ts` (`export default { fetch, scheduled }`).
Locally you can trigger the same path from **Settings → Send test digest**.

---

## Configuration

Copy `.env.example` to `.env`:

| Variable | Required | Effect |
| --- | --- | --- |
| `RESEND_API_KEY` | no | Enables real email delivery. Without it, digests are logged instead of sent. |
| `NOTIFICATION_FROM` | no | Verified sender address for outgoing email. |
| `DIGEST_RECIPIENTS` | no | Comma-separated override for the digest recipient list. |

Everything is optional. The app degrades gracefully and stays usable.

---

## Reports

`src/components/report-export.tsx` produces real files, not placeholders:

- **PDF** — generated with `jspdf` + `jspdf-autotable`, with a summary page,
  per-block tables, an alert table and a risk narrative.
- **CSV** — a multi-section UTF-8 CSV with a BOM, so Excel opens accented
  characters (and `°C`) correctly.

Both are downloaded as `agrivision-disease-<date>.pdf` / `.csv`.

---

## Notes on the frontend

- **Design system**: the original oklch-based shadcn theme is unchanged.
  MapLibre cannot parse `oklch()`, so `src/lib/color.ts` converts the design
  tokens to sRGB at runtime.
- **Dates**: all rendering goes through `src/lib/format.ts`, which pins the
  locale (`en-US`) and time zone (UTC). Without this the server and the
  browser disagree on formatting and React reports a hydration mismatch.
- **Map**: `maplibre-gl` is dynamically imported (client-only — SSR has no
  WebGL) and the basemap swaps between light and dark tiles with the theme.
- **Bundle**: `jspdf`, `jspdf-autotable` and `maplibre-gl` are dynamically
  imported so they stay in their own chunks.

---

## Auto-commit watcher

`scripts/autocommit.mjs` polls `git status` and, once the working tree has
been quiet for a few seconds, stages everything, commits with a generated
message and pushes to the current branch.

```bash
bun run autocommit              # watch until Ctrl+C
bun run autocommit -- --once    # one cycle, then exit
bun run autocommit -- --no-push # commit only
```

It refuses to run while a merge, rebase, revert or index lock is present,
skips unresolved conflicts, and rejects files above 25 MB. Ignored paths
(`node_modules`, `dist`, `.env`, `.wrangler`, `.tanstack`) are never
committed because the script relies on `git status`. Activity is logged to
`.git/autocommit.log`.

Because it commits whatever is on disk, run it only when you are happy for
in-progress edits to land on `main`.

---

## Deployment

`wrangler.jsonc` is ready for Cloudflare Workers:

```bash
bun run build
npx wrangler deploy
```

The build produces both the client assets and the worker entry point. The
`scheduled` handler is included in the worker bundle.
