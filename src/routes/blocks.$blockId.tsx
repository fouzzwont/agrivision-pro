import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CloudSun,
  Droplets,
  MapPin,
  ShieldAlert,
  Sprout,
  TrendingUp,
  Wind,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { EstateMap } from "@/components/estate-map";
import { getBlockDetail } from "@/api/blocks";
import { actionAlert, dismissAlert } from "@/api/alerts";
import { addFieldNote } from "@/api/inspections";
import { formatDate, formatDateTime } from "@/lib/format";
import type { RiskLevel } from "@/lib/types";

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
  urgent: "var(--risk-urgent)",
};

export const Route = createFileRoute("/blocks/$blockId")({
  head: ({ params, loaderData }) => {
    // The generated route tree does not carry this loader's return type, so
    // read the block name defensively and fall back to the URL slug.
    const name =
      (loaderData as { block?: { name?: string } } | undefined)?.block?.name ?? params.blockId;
    return {
      meta: [
        { title: `${name} — AgriVision` },
        {
          name: "description",
          content: "Disease pressure, yield risk and field history for a monitored block.",
        },
      ],
    };
  },
  loader: async ({ params }) => {
    const detail = await getBlockDetail({ data: { blockId: params.blockId } });
    if (!detail) throw notFound();
    return detail;
  },
  component: BlockDetail,
});

function BlockDetail() {
  const {
    block,
    detections,
    inspections,
    notes,
    alerts,
    yieldRisk,
    infectionRisk,
    weather,
    trend,
    actionLog,
  } = Route.useLoaderData();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => router.invalidate();

  const runAction = async (alertId: string, action: string) => {
    setBusy(alertId);
    try {
      await actionAlert({ data: { alertId, action } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const runDismiss = async (alertId: string) => {
    setBusy(alertId);
    try {
      await dismissAlert({ data: { alertId } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const submitNote = async () => {
    if (!note.trim()) return;
    setBusy("note");
    try {
      await addFieldNote({ data: { note: note.trim(), blockId: block.id } });
      setNote("");
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const openAlerts = alerts.filter((alert) => alert.status === "open");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={block.name}
        description={`${block.crop} · ${block.variety} · planted ${block.plantedYear} · ${block.area} ha`}
        actions={
          <>
            <SeverityBadge level={block.risk} />
            <Button variant="outline" size="sm" asChild>
              <Link to="/risk-map">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to map
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Health score
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{block.health}%</div>
            <Progress value={block.health} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Detections (30d)
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{block.detections}</div>
            <div className="mt-2 text-xs text-muted-foreground">{block.urgent} urgent</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Expected yield loss
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {(yieldRisk.expectedLossPct * 100).toFixed(1)}%
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {yieldRisk.areaAtRisk} ha at risk
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Value at risk
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {yieldRisk.valueAtRiskMad.toLocaleString("en-US")}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">MAD</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Block value
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {yieldRisk.blockValueMad.toLocaleString("en-US")}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">MAD / season</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Detection trend
              </CardTitle>
              <CardDescription>Diseased vs healthy scans in this block</CardDescription>
            </div>
            <Badge variant="outline">Last 14 days</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="bd1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bd2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="detections"
                  stroke="var(--chart-1)"
                  fill="url(#bd1)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="healthy"
                  stroke="var(--chart-2)"
                  fill="url(#bd2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CloudSun className="h-4 w-4 text-accent" /> Field conditions
            </CardTitle>
            <CardDescription>
              {weather.source === "open-meteo" ? "Live · Open-Meteo" : "Offline fallback"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Temp</div>
                <div className="mt-1 text-lg font-semibold">
                  {Math.round(weather.current.temperatureC)}°C
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  Humidity
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {Math.round(weather.current.humidityPct)}%
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wind className="h-3 w-3" />
                  Wind
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {Math.round(weather.current.windKmh)}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {infectionRisk.map((risk) => (
                <div key={risk.disease}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{risk.disease}</span>
                    <span className="tabular-nums text-muted-foreground">{risk.score}/100</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${risk.score}%`, background: RISK_COLOR[risk.level] }}
                    />
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {risk.drivers.map((driver) => (
                      <li key={driver}>· {driver}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sprout className="h-4 w-4 text-primary" /> Yield risk breakdown
            </CardTitle>
            <CardDescription>
              How the {(yieldRisk.expectedLossPct * 100).toFixed(1)}% expected loss is composed.
              Weather modifier ×{yieldRisk.weatherModifier}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {yieldRisk.contributions.map((contribution) => (
              <div key={contribution.disease}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{contribution.disease}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {(contribution.contribution * 100).toFixed(2)}% of block
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (contribution.contribution / Math.max(0.0001, yieldRisk.expectedLossPct)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {(contribution.affectedShare * 100).toFixed(1)}% of the block shows symptoms ·{" "}
                  {(contribution.lossCoefficient * 100).toFixed(0)}% loss coefficient if
                  uncontrolled
                </p>
              </div>
            ))}
            {yieldRisk.contributions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No disease pressure recorded for this block.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[color:var(--risk-high)]" /> Alerts
            </CardTitle>
            <CardDescription>{openAlerts.length} open on this block</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{alert.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {alert.disease} · {alert.recommendation}
                    </div>
                  </div>
                  <SeverityBadge level={alert.severity} />
                </div>
                {alert.status === "open" ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy === alert.id}
                      onClick={() => runAction(alert.id, "Treatment applied")}
                    >
                      Mark treated
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === alert.id}
                      onClick={() => runDismiss(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {alert.status === "actioned" ? "Treated" : "Dismissed"}
                    {alert.action ? ` — ${alert.action}` : ""}
                    {alert.actionedAt ? ` · ${formatDate(alert.actionedAt)}` : ""}
                  </div>
                )}
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">No alerts on this block.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent detections</CardTitle>
            <CardDescription>Latest inference results for this block</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Disease</th>
                    <th className="py-2 pr-4 font-medium">Severity</th>
                    <th className="py-2 pr-4 font-medium">Confidence</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {detections.slice(0, 12).map((detection) => (
                    <tr key={detection.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">
                        {detection.recordedAt.slice(0, 10)}
                      </td>
                      <td className="py-2 pr-4 font-medium">{detection.disease}</td>
                      <td className="py-2 pr-4">
                        <SeverityBadge level={detection.severity} />
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{detection.confidence}%</td>
                      <td className="py-2 text-muted-foreground">{detection.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detections.length === 0 && (
              <p className="text-sm text-muted-foreground">No detections recorded.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Location
              </CardTitle>
              <CardDescription>
                {block.centroid[1].toFixed(4)}, {block.centroid[0].toFixed(4)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EstateMap blocks={[block]} className="h-[240px] w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Field notes
              </CardTitle>
              <CardDescription>{notes.length} recorded</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a scouting note…"
                aria-label="New field note"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={busy === "note" || !note.trim()}
                onClick={submitNote}
              >
                Save note
              </Button>
              {notes.map((fieldNote) => (
                <div key={fieldNote.id} className="border-b pb-3 last:border-0 last:pb-0">
                  <div className="text-xs text-muted-foreground">
                    {fieldNote.date} · {fieldNote.author}
                  </div>
                  <p className="mt-1 text-sm">{fieldNote.note}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
          <CardDescription>Operator actions recorded on this block</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {actionLog.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
            >
              <span>{entry.summary}</span>
              <span className="text-xs text-muted-foreground">
                {entry.actor} · {formatDateTime(entry.at)}
              </span>
            </div>
          ))}
          {actionLog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No operator actions have been recorded on this block yet.
            </p>
          )}
        </CardContent>
      </Card>

      {inspections.length === 0 && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            No inspections have been recorded for this block yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
