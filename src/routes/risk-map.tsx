import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Info, Layers, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { EstateMap } from "@/components/estate-map";
import { getRiskMap } from "@/api/blocks";
import type { RiskLevel } from "@/lib/types";

type RiskSearch = {
  crop: string;
  disease: string;
  range: number;
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "var(--risk-low)",
  medium: "var(--risk-medium)",
  high: "var(--risk-high)",
  urgent: "var(--risk-urgent)",
};

const DISEASE_OPTIONS = [
  "Citrus Greening (HLB)",
  "Bacterial Canker",
  "Citrus Greasy Spot",
  "Olive Peacock Spot",
  "Olive Leaf Spot",
  "Nutrient deficiency",
  "Leaf Miner stress",
];

export const Route = createFileRoute("/risk-map")({
  head: () => ({
    meta: [
      { title: "Risk Map — AgriVision" },
      {
        name: "description",
        content: "Block-level disease spread risk for olive and citrus estates.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): RiskSearch => {
    const range = Number(search.range);
    return {
      crop: typeof search.crop === "string" ? search.crop : "all",
      disease: typeof search.disease === "string" ? search.disease : "all",
      range: Number.isFinite(range) && range > 0 ? range : 30,
    };
  },
  loaderDeps: ({ search }) => ({
    crop: search.crop,
    disease: search.disease,
    rangeDays: search.range,
  }),
  loader: ({ deps }) => getRiskMap({ data: deps }),
  component: RiskMap,
});

function RiskMap() {
  const { blocks, allBlocks, infectionRisk, insights, alerts, weather } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const setFilter = (key: keyof RiskSearch, value: string | number) => {
    navigate({
      search: (prev) => ({ ...prev, [key]: value }) as RiskSearch,
      replace: true,
    });
  };

  const totalArea = blocks.reduce((sum, b) => sum + b.area, 0);
  const topPressure = infectionRisk[0];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Risk Map"
        description="Visual estate map of disease pressure across olive and citrus blocks."
        actions={
          <>
            <Select value={search.crop} onValueChange={(value) => setFilter("crop", value)}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by crop">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All crops</SelectItem>
                <SelectItem value="citrus">Citrus</SelectItem>
                <SelectItem value="olive">Olive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={search.disease} onValueChange={(value) => setFilter("disease", value)}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Filter by disease">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All diseases</SelectItem>
                {DISEASE_OPTIONS.map((disease) => (
                  <SelectItem key={disease} value={disease}>
                    {disease}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(search.range)}
              onValueChange={(value) => setFilter("range", Number(value))}
            >
              <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by time window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4" /> Estate map
              </CardTitle>
              <CardDescription>
                {blocks.length} of {allBlocks.length} blocks · {totalArea} ha · last {search.range}{" "}
                days
              </CardDescription>
            </div>
            {insights.filteredOut > 0 && (
              <Badge variant="outline">{insights.filteredOut} hidden by filters</Badge>
            )}
          </CardHeader>
          <CardContent>
            {blocks.length === 0 ? (
              <div className="flex h-[520px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                No block matches the selected filters.
              </div>
            ) : (
              <EstateMap blocks={blocks} />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground">Legend:</span>
              {(
                [
                  ["Low", "low"],
                  ["Medium", "medium"],
                  ["Elevated", "high"],
                  ["Urgent", "urgent"],
                ] as const
              ).map(([label, key]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: RISK_COLOR[key] }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Risk insights</CardTitle>
              <CardDescription>
                Derived from the last {search.range} days of inspections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Most affected block
                </div>
                {insights.mostAffected ? (
                  <>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold">{insights.mostAffected.name}</span>
                      <SeverityBadge level={insights.mostAffected.risk} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {insights.mostAffected.detections} detections, {insights.mostAffected.urgent}{" "}
                      urgent in the window.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No blocks match the current filters.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Fastest growing risk
                </div>
                {insights.fastestGrowing ? (
                  <>
                    <div className="mt-1 font-semibold">
                      {insights.fastestGrowing.name} —{" "}
                      {insights.fastestGrowing.growthPct > 0 ? "+" : ""}
                      {insights.fastestGrowing.growthPct}% week over week
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {insights.fastestGrowing.detections} new detections in the last 7 days.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not enough recent data to compute growth.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Suggested intervention priority
                </div>
                <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-sm">
                  {insights.priorities.map((priority) => (
                    <li key={priority.name}>
                      <span className="font-medium">{priority.name}</span> —{" "}
                      <span className="text-muted-foreground">{priority.action}</span>
                    </li>
                  ))}
                  {insights.priorities.length === 0 && (
                    <li className="text-muted-foreground">No action required.</li>
                  )}
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" /> Weather-driven pressure
              </CardTitle>
              <CardDescription>
                {weather.source === "open-meteo"
                  ? "Live forecast · Open-Meteo"
                  : "Offline fallback forecast"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {infectionRisk.slice(0, 4).map((risk) => (
                <div key={risk.disease}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{risk.disease}</span>
                    <span className="tabular-nums text-muted-foreground">{risk.score}/100</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${risk.score}%`,
                        background: RISK_COLOR[risk.level],
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{risk.drivers[0]}</p>
                </div>
              ))}
              {infectionRisk.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No tracked disease matches the current crop filter.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[color:var(--risk-urgent)]" /> Block summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center justify-between border-b py-1.5 last:border-0"
                >
                  <span className="font-medium">{block.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{block.detections} det.</span>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: RISK_COLOR[block.risk] }}
                    />
                  </span>
                </div>
              ))}
              {blocks.length === 0 && <p className="text-muted-foreground">No blocks to show.</p>}
              <Label className="sr-only" htmlFor="block-summary">
                Block summary
              </Label>
            </CardContent>
          </Card>

          {alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Open alerts in view</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {alerts
                  .filter((alert) => alert.status === "open")
                  .slice(0, 5)
                  .map((alert) => (
                    <div key={alert.id} className="flex items-start justify-between gap-2">
                      <span className="truncate">{alert.title}</span>
                      <SeverityBadge level={alert.severity} />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
