import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  CloudSun,
  Droplets,
  FileText,
  Map as MapIcon,
  ScanSearch,
  Sparkles,
  TrendingUp,
  Wind,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { getDashboard } from "@/api/dashboard";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RiskLevel } from "@/lib/types";

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
  urgent: "var(--risk-urgent)",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AgriVision" },
      {
        name: "description",
        content: "Real-time overview of olive and citrus farm health, detections, and risk.",
      },
    ],
  }),
  loader: () => getDashboard(),
  component: Dashboard,
});

function KpiCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
        {hint && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {label === "Yield at risk" && <TrendingUp className="h-3 w-3 text-primary" />}
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const data = Route.useLoaderData();
  const {
    farm,
    kpis,
    blocks,
    recentDetections,
    trend,
    weather,
    infectionRisk,
    yieldRisk,
    digestPreview,
  } = data;

  const lossByBlock = new Map<string, (typeof yieldRisk)[number]>(
    yieldRisk.map((risk) => [risk.blockId, risk] as const),
  );
  const topPressure = infectionRisk[0];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title={farm.name}
        description={`${farm.region} · Last updated ${farm.lastUpdated}`}
        actions={
          <>
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/30 bg-primary/10 text-primary"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Live
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link to="/risk-map">
                <MapIcon className="mr-1.5 h-4 w-4" />
                Risk Map
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/detection">
                <ScanSearch className="mr-1.5 h-4 w-4" />
                Upload leaf image
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Monitored area"
          value={kpis.monitoredArea}
          suffix="ha"
          hint={`Across ${blocks.length} active blocks`}
        />
        <KpiCard
          label="Yield at risk"
          value={`${kpis.yieldAtRiskPct}%`}
          hint={`${kpis.valueAtRiskMad.toLocaleString("en-US")} MAD exposed`}
        />
        <KpiCard
          label="Active alerts"
          value={kpis.activeAlerts}
          hint={`${kpis.blocksAtRisk} blocks above medium risk`}
        />
        <KpiCard label="AI confidence" value={`${kpis.avgConfidence}%`} hint="30-day average" />
        <KpiCard
          label="Healthy crop rate"
          value={`${kpis.healthyRate}%`}
          hint="Share of scans classified healthy"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Detection trend</CardTitle>
              <CardDescription>Daily detections vs healthy scans across all blocks</CardDescription>
            </div>
            <Badge variant="outline">Last 14 days</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#g1)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="healthy"
                  stroke="var(--chart-2)"
                  fill="url(#g2)"
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
              {weather.location} · {weather.source === "open-meteo" ? "live" : "offline fallback"}
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

            {topPressure ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">
                    {topPressure.disease} pressure
                  </span>
                  <span className="font-medium" style={{ color: RISK_COLOR[topPressure.level] }}>
                    {topPressure.score}/100 · {topPressure.level}
                  </span>
                </div>
                <Progress value={topPressure.score} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">{topPressure.drivers[0]}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No tracked disease pressure in the current forecast window.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Crop blocks</CardTitle>
              <CardDescription>Health and yield risk by monitored block</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/field">
                View all <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {blocks.map((block) => {
              const risk = lossByBlock.get(block.id);
              return (
                <Link
                  key={block.id}
                  to="/blocks/$blockId"
                  params={{ blockId: block.id }}
                  className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{block.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {block.crop} · {block.area} ha
                      </div>
                    </div>
                    <SeverityBadge level={block.risk} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Detections</div>
                      <div className="font-medium text-foreground">{block.detections}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Urgent</div>
                      <div className="font-medium text-[color:var(--risk-urgent)]">
                        {block.urgent}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Yield loss</div>
                      <div className="font-medium text-foreground">
                        {((risk?.expectedLossPct ?? 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Health score</span>
                      <span className="font-medium">{block.health}</span>
                    </div>
                    <Progress value={block.health} className="h-1.5" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Recent detections
              </CardTitle>
              <CardDescription>AI-flagged scans across blocks</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentDetections.slice(0, 6).map((detection) => (
              <div
                key={detection.id}
                className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{detection.disease}</div>
                  <div className="text-xs text-muted-foreground">
                    {detection.crop} · {detection.block} · {detection.recordedAt.slice(0, 10)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SeverityBadge level={detection.severity} />
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {detection.confidence}%
                  </span>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/field">Open field monitoring</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI agronomy briefing</div>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{digestPreview}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports">
                <FileText className="mr-1.5 h-4 w-4" />
                Generate report
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/alerts">Review alerts</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
