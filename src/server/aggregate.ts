import type {
  Alert,
  Block,
  BlockDetail,
  DashboardSnapshot,
  Detection,
  FieldNote,
  Inspection,
  ReportPayload,
  ReportType,
  RiskMapSnapshot,
  Severity,
  WeatherSnapshot,
} from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { getStore } from "./store";
import { getWeather } from "./weather";
import { computeInfectionRisk, estatePressure, SEVERITY_WEIGHT } from "./models/infection-risk";
import { computeYieldRisk, summariseYieldRisk } from "./models/yield-risk";

/**
 * Aggregation layer.
 *
 * Turns raw store rows into the view models the pages render. Every derived
 * number in the UI is produced here, so the dashboard, the risk map, the block
 * page and the exported reports can never disagree with each other.
 */

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Recomputes the observed disease metrics of each block from the raw rows. */
export function computeBlockMetrics(
  blocks: Block[],
  inspections: Inspection[],
  windowDays = 30,
): Block[] {
  const cutoff = Date.now() - windowDays * 86_400_000;

  return blocks.map((block) => {
    const window = inspections.filter(
      (i) => i.blockId === block.id && new Date(i.date).getTime() >= cutoff,
    );

    const detections = window.filter((i) => i.severity !== "Low").length;
    const critical = window.filter((i) => i.severity === "Critical").length;
    const high = window.filter((i) => i.severity === "High").length;
    const medium = window.filter((i) => i.severity === "Medium").length;

    const severityPoints = window.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0);
    const density = severityPoints / block.area;
    const health = Math.round(clamp(100 - density * 18, 30, 99));

    let risk: Block["risk"] = "low";
    if (critical >= 2 || health < 76) risk = "urgent";
    else if (high >= 3 || health < 87) risk = "high";
    else if (medium >= 3 || health < 94) risk = "medium";

    return { ...block, detections, urgent: critical + high, health, risk };
  });
}

/** Daily detection / healthy / severity series for the trend charts. */
export function computeTrend(inspections: Inspection[], days = 14) {
  const series: DashboardSnapshot["trend"] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    const key = day.toISOString().slice(0, 10);

    const rows = inspections.filter((i) => i.date === key);
    const diseased = rows.filter((i) => i.severity !== "Low");
    const severity =
      rows.length === 0
        ? 0
        : Number(
            (rows.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0) / rows.length).toFixed(
              2,
            ),
          );

    series.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      detections: diseased.length,
      healthy: rows.length - diseased.length,
      severity,
    });
  }

  return series;
}

export function computeSeverityDistribution(inspections: Inspection[], days = 7) {
  const cutoff = Date.now() - days * 86_400_000;
  const order: Severity[] = ["Critical", "High", "Medium", "Low"];
  const window = inspections.filter((i) => new Date(i.date).getTime() >= cutoff);

  return order.map((name) => ({
    name,
    value: window.filter((i) => i.severity === name).length,
  }));
}

function hoursAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
}

function relativeTime(iso: string): string {
  const hours = hoursAgo(iso);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} d ago`;
}

function makeBriefing(
  blocks: Block[],
  infectionRisk: DashboardSnapshot["infectionRisk"],
  alerts: Alert[],
): string {
  const parts: string[] = [];

  const worst = blocks.find((b) => b.risk === "urgent") ?? blocks[0];
  if (worst) {
    const blockAlerts = alerts.filter((a) => a.blockId === worst.id);
    parts.push(
      `${worst.name} is under the highest pressure with ${worst.detections} detections and ${worst.urgent} urgent cases in the last 30 days${
        blockAlerts.length ? ` across ${blockAlerts.length} open alerts` : ""
      }.`,
    );
  }

  const top = infectionRisk[0];
  if (top) {
    parts.push(
      `${top.disease} pressure scores ${top.score}/100 — ${top.drivers[0]?.toLowerCase() ?? "conditions are favourable for infection"}.`,
    );
  }

  const critical = alerts.filter((a) => a.severity === "Critical" && a.status === "open");
  if (critical.length) {
    parts.push(
      `${critical.length} critical alert${critical.length === 1 ? "" : "s"} need action within 24 hours.`,
    );
  }

  return parts.join(" ");
}

export async function buildDashboard(): Promise<DashboardSnapshot> {
  const store = getStore();
  const [rawBlocks, inspections, alerts, settings, detections] = await Promise.all([
    store.listBlocks(),
    store.listInspections(),
    store.listAlerts(),
    store.getSettings(),
    store.listDetections(),
  ]);

  const blocks = computeBlockMetrics(rawBlocks, inspections);
  const weather = await getWeather(
    settings.farm.latitude,
    settings.farm.longitude,
    settings.farm.region,
  );

  const infectionRisk = computeInfectionRisk(weather);
  const yieldRisk = blocks.map((block) =>
    computeYieldRisk(
      block,
      detections.filter((d) => d.blockId === block.id),
      infectionRisk,
    ),
  );
  const yieldSummary = summariseYieldRisk(yieldRisk);

  const windowDetections = detections.filter(
    (d) => Date.now() - new Date(d.recordedAt).getTime() <= 30 * 86_400_000,
  );
  const avgConfidence =
    windowDetections.length > 0
      ? Number(
          (
            windowDetections.reduce((sum, d) => sum + d.confidence, 0) / windowDetections.length
          ).toFixed(1),
        )
      : 0;

  const healthyScans = windowDetections.filter((d) => d.severity === "Low").length;
  const healthyRate =
    windowDetections.length > 0
      ? Number(((healthyScans / windowDetections.length) * 100).toFixed(1))
      : 0;

  const openAlerts = alerts.filter((a) => a.status === "open");

  return {
    farm: {
      name: settings.farm.name,
      region: settings.farm.region,
      totalArea: settings.farm.totalArea,
      lastUpdated: relativeTime(new Date().toISOString()),
    },
    kpis: {
      monitoredArea: blocks.reduce((sum, b) => sum + b.area, 0),
      yieldAtRiskPct: yieldSummary.yieldAtRiskPct,
      activeAlerts: openAlerts.length,
      avgConfidence,
      healthyRate,
      valueAtRiskMad: yieldSummary.valueAtRiskMad,
      blocksAtRisk: blocks.filter((b) => b.risk === "high" || b.risk === "urgent").length,
    },
    blocks,
    recentDetections: detections.slice(0, 12),
    trend: computeTrend(inspections, 14),
    severityDistribution: computeSeverityDistribution(inspections, 7),
    weather,
    infectionRisk,
    yieldRisk,
    alerts: openAlerts,
    digestPreview: makeBriefing(blocks, infectionRisk, alerts),
  };
}

export async function buildBlockDetail(blockId: string): Promise<BlockDetail | null> {
  const store = getStore();
  const [rawBlocks, inspections, detections, notes, alerts, settings, actionLog] =
    await Promise.all([
      store.listBlocks(),
      store.listInspections(),
      store.listDetections(),
      store.listFieldNotes(),
      store.listAlerts(),
      store.getSettings(),
      store.listActionLog(),
    ]);

  const block = computeBlockMetrics(rawBlocks, inspections).find((b) => b.id === blockId);
  if (!block) return null;

  const weather = await getWeather(
    settings.farm.latitude,
    settings.farm.longitude,
    settings.farm.region,
  );
  const infectionRisk = computeInfectionRisk(weather, [block.crop]);
  const blockDetections = detections.filter((d) => d.blockId === block.id);
  const yieldRisk = computeYieldRisk(block, blockDetections, infectionRisk);

  return {
    block,
    detections: blockDetections.slice(0, 40),
    inspections: inspections.filter((i) => i.blockId === block.id).slice(0, 40),
    notes: notes.filter((n) => n.blockId === block.id),
    alerts: alerts.filter((a) => a.blockId === block.id),
    yieldRisk,
    infectionRisk,
    weather,
    trend: computeTrend(
      inspections.filter((i) => i.blockId === block.id),
      14,
    ),
    actionLog: actionLog.filter((a) => a.blockId === block.id).slice(0, 20),
  };
}

const REPORT_META: Record<ReportType, { title: string; summary: (ctx: Ctx) => string }> = {
  disease: {
    title: "Disease summary",
    summary: ({ blocks, alerts, yieldSummary }) => {
      const affected = blocks.filter((b) => b.detections > 0).length;
      return `${affected} of ${blocks.length} monitored blocks recorded disease pressure in the selected window. ${alerts.filter((a) => a.status === "open").length} alerts remain open and ${yieldSummary.yieldAtRiskPct}% of production value is currently exposed to yield loss.`;
    },
  },
  risk: {
    title: "Risk summary",
    summary: ({ blocks, infectionRisk, yieldSummary }) => {
      const hottest = infectionRisk[0];
      const critical = blocks.filter((b) => b.risk === "urgent" || b.risk === "high");
      return `${critical.length} blocks carry elevated observed risk. Forward-looking pressure is highest for ${hottest?.disease ?? "n/a"} at ${hottest?.score ?? 0}/100, driven by ${hottest?.drivers[0] ?? "current conditions"}. Estate value currently exposed: ${yieldSummary.valueAtRiskMad.toLocaleString("en-US")} MAD.`;
    },
  },
  field: {
    title: "Field operations summary",
    summary: ({ inspections, blocks }) => {
      const sources = new Map<string, number>();
      for (const i of inspections) sources.set(i.source, (sources.get(i.source) ?? 0) + 1);
      const top = [...sources.entries()].sort((a, b) => b[1] - a[1])[0];
      return `${inspections.length} inspections were logged across ${blocks.length} blocks. ${top ? `${top[0]} was the most frequent capture channel (${top[1]} scans).` : ""} Scouting cadence remains the binding constraint for early detection.`;
    },
  },
  yield: {
    title: "Yield risk summary",
    summary: ({ yieldSummary, yieldRisk }) => {
      const worst = [...yieldRisk].sort((a, b) => b.valueAtRiskMad - a.valueAtRiskMad)[0];
      return `${yieldSummary.yieldAtRiskPct}% of estate production value is exposed, amounting to ${yieldSummary.valueAtRiskMad.toLocaleString("en-US")} MAD across ${yieldSummary.areaAtRiskHa} ha. ${worst ? `${worst.block} carries the largest share at ${worst.valueAtRiskMad.toLocaleString("en-US")} MAD.` : ""}`;
    },
  },
};

type Ctx = {
  blocks: Block[];
  alerts: Alert[];
  inspections: Inspection[];
  detections: Detection[];
  infectionRisk: DashboardSnapshot["infectionRisk"];
  yieldRisk: DashboardSnapshot["yieldRisk"];
  yieldSummary: ReturnType<typeof summariseYieldRisk>;
};

export type RiskMapFilters = {
  crop?: string;
  disease?: string;
  rangeDays?: number;
};

/**
 * Week-over-week growth of detections per block.
 * Compares the last 7 days against the 7 days before that.
 */
function computeGrowth(
  inspections: Inspection[],
): Map<string, { current: number; previous: number }> {
  const now = Date.now();
  const day = 86_400_000;
  const growth = new Map<string, { current: number; previous: number }>();

  for (const inspection of inspections) {
    const age = now - new Date(inspection.date).getTime();
    if (age > 14 * day) continue;
    const bucket = age <= 7 * day ? "current" : "previous";
    const entry = growth.get(inspection.blockId) ?? { current: 0, previous: 0 };
    if (inspection.severity !== "Low") entry[bucket] += 1;
    growth.set(inspection.blockId, entry);
  }

  return growth;
}

/**
 * Builds the risk map view: blocks filtered by crop, disease and time window,
 * plus the agronomic insights shown alongside the map.
 */
export async function buildRiskMap(filters: RiskMapFilters): Promise<RiskMapSnapshot> {
  const store = getStore();
  const [rawBlocks, inspections, detections, settings, alerts] = await Promise.all([
    store.listBlocks(),
    store.listInspections(),
    store.listDetections(),
    store.getSettings(),
    store.listAlerts(),
  ]);

  const rangeDays = filters.rangeDays ?? 30;
  const cutoff = Date.now() - rangeDays * 86_400_000;

  const windowInspections = inspections.filter((i) => new Date(i.date).getTime() >= cutoff);
  const allBlocks = computeBlockMetrics(rawBlocks, windowInspections, rangeDays);

  const crop = filters.crop && filters.crop !== "all" ? filters.crop.toLowerCase() : null;
  const disease = filters.disease && filters.disease !== "all" ? filters.disease : null;

  const blocks = allBlocks.filter((block) => {
    if (crop && block.crop.toLowerCase() !== crop) return false;
    if (disease) {
      const present = windowInspections.some(
        (i) => i.blockId === block.id && i.disease === disease,
      );
      if (!present) return false;
    }
    return true;
  });

  const weather = await getWeather(
    settings.farm.latitude,
    settings.farm.longitude,
    settings.farm.region,
  );

  const crops = [...new Set(blocks.map((b) => b.crop))];
  const infectionRisk = computeInfectionRisk(weather, crops.length ? crops : ["Olive", "Citrus"]);

  const yieldRisk = blocks.map((block) =>
    computeYieldRisk(
      block,
      detections.filter((d) => d.blockId === block.id),
      infectionRisk,
    ),
  );

  const growth = computeGrowth(inspections);
  let fastestGrowing: RiskMapSnapshot["insights"]["fastestGrowing"] = null;
  for (const block of blocks) {
    const entry = growth.get(block.id);
    if (!entry) continue;
    const growthPct =
      entry.previous === 0
        ? entry.current > 0
          ? 100
          : 0
        : Math.round(((entry.current - entry.previous) / entry.previous) * 100);
    if (!fastestGrowing || growthPct > fastestGrowing.growthPct) {
      fastestGrowing = {
        name: block.name,
        growthPct,
        detections: entry.current,
      };
    }
  }

  const mostAffected = blocks.length
    ? [...blocks].sort((a, b) => b.detections - a.detections || a.health - b.health)[0]
    : null;

  const RECOMMENDATION: Record<string, string> = {
    urgent: "Isolate affected rows and apply curative treatment now",
    high: "Schedule a curative spray inside the next maintenance window",
    medium: "Increase scouting cadence and prepare a preventive cover spray",
    low: "Keep routine monitoring; no intervention required",
  };

  const priorities = [...blocks]
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3 };
      return order[a.risk] - order[b.risk] || b.detections - a.detections;
    })
    .slice(0, 4)
    .map((block) => ({
      name: block.name,
      action: RECOMMENDATION[block.risk],
      risk: block.risk,
    }));

  return {
    blocks,
    allBlocks,
    infectionRisk,
    weather,
    yieldRisk,
    alerts: alerts.filter((a) => blocks.some((b) => b.id === a.blockId)),
    insights: {
      mostAffected: mostAffected
        ? {
            name: mostAffected.name,
            detections: mostAffected.detections,
            urgent: mostAffected.urgent,
            risk: mostAffected.risk,
          }
        : null,
      fastestGrowing,
      priorities,
      filteredOut: allBlocks.length - blocks.length,
    },
  };
}

export async function buildReport(input: {
  type: ReportType;
  crop?: string;
  blockId?: string;
  rangeDays?: number;
}): Promise<ReportPayload> {
  const store = getStore();
  const [rawBlocks, inspections, alerts, settings, detections] = await Promise.all([
    store.listBlocks(),
    store.listInspections(),
    store.listAlerts(),
    store.getSettings(),
    store.listDetections(),
  ]);

  const rangeDays = input.rangeDays ?? 14;
  const cutoff = Date.now() - rangeDays * 86_400_000;

  const crop = input.crop && input.crop !== "all" ? input.crop : undefined;
  const blockFilter = input.blockId && input.blockId !== "all" ? input.blockId : undefined;

  const allBlocks = computeBlockMetrics(rawBlocks, inspections);
  const blocks = allBlocks.filter(
    (b) =>
      (!crop || b.crop.toLowerCase() === crop.toLowerCase()) &&
      (!blockFilter || b.id === blockFilter),
  );
  const blockIds = new Set(blocks.map((b) => b.id));

  const scopedInspections = inspections.filter(
    (i) => new Date(i.date).getTime() >= cutoff && blockIds.has(i.blockId),
  );
  const scopedDetections = detections.filter(
    (d) => new Date(d.recordedAt).getTime() >= cutoff && blockIds.has(d.blockId),
  );
  const scopedAlerts = alerts.filter((a) => blockIds.has(a.blockId));

  const weather = await getWeather(
    settings.farm.latitude,
    settings.farm.longitude,
    settings.farm.region,
  );
  const infectionRisk = computeInfectionRisk(
    weather,
    blocks.some((b) => b.crop === "Citrus")
      ? blocks.some((b) => b.crop === "Olive")
        ? ["Olive", "Citrus"]
        : ["Citrus"]
      : ["Olive"],
  );
  const yieldRisk = blocks.map((block) =>
    computeYieldRisk(
      block,
      scopedDetections.filter((d) => d.blockId === block.id),
      infectionRisk,
    ),
  );
  const yieldSummary = summariseYieldRisk(yieldRisk);

  const ctx: Ctx = {
    blocks,
    alerts: scopedAlerts,
    inspections: scopedInspections,
    detections: scopedDetections,
    infectionRisk,
    yieldRisk,
    yieldSummary,
  };

  const meta = REPORT_META[input.type];

  const risks = infectionRisk
    .filter((r) => r.score > 0)
    .slice(0, 4)
    .map((r) => `${r.disease} — pressure ${r.score}/100 (${r.level}). ${r.drivers.join(". ")}.`);

  const nextSteps: string[] = [];
  const urgentBlock = blocks.find((b) => b.risk === "urgent");
  if (urgentBlock) {
    nextSteps.push(
      `Isolate and treat ${urgentBlock.name} first — ${urgentBlock.urgent} urgent cases in the last 30 days.`,
    );
  }
  const fastestGrowing = [...yieldRisk].sort((a, b) => b.valueAtRiskMad - a.valueAtRiskMad)[0];
  if (fastestGrowing) {
    nextSteps.push(
      `Allocate curative treatment to ${fastestGrowing.block}: ${fastestGrowing.valueAtRiskMad.toLocaleString("en-US")} MAD exposed.`,
    );
  }
  if (infectionRisk[0]) {
    nextSteps.push(
      `Apply a preventive cover spray ahead of the ${infectionRisk[0].disease.toLowerCase()} window (${infectionRisk[0].wetnessHours} h leaf wetness forecast).`,
    );
  }
  nextSteps.push("Raise scouting cadence to twice weekly on every block above medium risk.");
  nextSteps.push("Record every curative action in the audit trail to close the compliance loop.");

  const blockRows = blocks.map((b) => {
    const risk = yieldRisk.find((r) => r.blockId === b.id);
    return [
      b.name,
      b.crop,
      `${b.area} ha`,
      String(b.detections),
      String(b.urgent),
      `${b.health}%`,
      b.risk,
      `${((risk?.expectedLossPct ?? 0) * 100).toFixed(1)}%`,
      `${(risk?.valueAtRiskMad ?? 0).toLocaleString("en-US")} MAD`,
    ];
  });

  const detectionRows = scopedDetections
    .slice(0, 40)
    .map((d) => [
      d.recordedAt.slice(0, 10),
      d.block,
      d.disease,
      `${d.confidence}%`,
      d.severity,
      d.source,
    ]);

  return {
    generatedAt: new Date().toISOString(),
    type: input.type,
    title: meta.title,
    scope: {
      crop: crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : "All crops",
      block: blockFilter
        ? (blocks.find((b) => b.id === blockFilter)?.name ?? "All blocks")
        : "All blocks",
      rangeDays,
    },
    farm: {
      name: settings.farm.name,
      region: settings.farm.region,
      totalArea: settings.farm.totalArea,
    },
    summary: meta.summary(ctx),
    metrics: [
      { label: "Monitored area", value: `${blocks.reduce((s, b) => s + b.area, 0)} ha` },
      { label: "Detections", value: String(scopedDetections.length) },
      {
        label: "Open alerts",
        value: String(scopedAlerts.filter((a) => a.status === "open").length),
      },
      { label: "Yield at risk", value: `${yieldSummary.yieldAtRiskPct}%` },
      {
        label: "Value at risk",
        value: `${yieldSummary.valueAtRiskMad.toLocaleString("en-US")} MAD`,
      },
      {
        label: "Estate value",
        value: `${yieldSummary.totalValueMad.toLocaleString("en-US")} MAD`,
      },
    ],
    risks,
    nextSteps,
    blockTable: {
      head: [
        "Block",
        "Crop",
        "Area",
        "Detections",
        "Urgent",
        "Health",
        "Risk",
        "Yield loss",
        "Value at risk",
      ],
      rows: blockRows,
    },
    detectionsTable: {
      head: ["Date", "Block", "Disease", "Confidence", "Severity", "Source"],
      rows: detectionRows,
    },
  };
}
