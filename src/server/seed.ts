import type {
  ActionLog,
  Alert,
  Block,
  Detection,
  FieldNote,
  Inspection,
  Settings,
} from "@/lib/types";

/**
 * Deterministic seed data.
 *
 * The estate timeline is generated relative to the current date so "last 14
 * days" charts, report ranges and alert timestamps always line up with what a
 * user sees today. A fixed PRNG seed keeps the dataset stable for the lifetime
 * of the isolate, so repeated requests do not reshuffle the numbers.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260507);

function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function between(min: number, max: number): number {
  return min + rand() * (max - min);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(daysAgo: number): string {
  const d = startOfToday();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoTime(daysAgo: number, hour: number, minute: number): string {
  const d = startOfToday();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const SEED_BLOCKS: Block[] = [
  {
    id: "ce",
    name: "Citrus East",
    crop: "Citrus",
    area: 84,
    centroid: [-7.9105, 31.6705],
    detections: 23,
    urgent: 4,
    health: 78,
    risk: "high",
    variety: "Navel orange (Valencia)",
    plantedYear: 2014,
  },
  {
    id: "cn",
    name: "Citrus North",
    crop: "Citrus",
    area: 96,
    centroid: [-7.9625, 31.6745],
    detections: 9,
    urgent: 0,
    health: 92,
    risk: "low",
    variety: "Eureka lemon",
    plantedYear: 2018,
  },
  {
    id: "os",
    name: "Olive South",
    crop: "Olive",
    area: 132,
    centroid: [-7.9665, 31.6135],
    detections: 17,
    urgent: 2,
    health: 85,
    risk: "medium",
    variety: "Chétoui olive",
    plantedYear: 2009,
  },
  {
    id: "ow",
    name: "Olive West",
    crop: "Olive",
    area: 100,
    centroid: [-7.9065, 31.6095],
    detections: 31,
    urgent: 7,
    health: 71,
    risk: "urgent",
    variety: "Chétoui olive",
    plantedYear: 2006,
  },
];

/**
 * Weighted disease catalogue.
 *
 * The weights encode the estate's actual situation: Olive West and Citrus
 * East carry the disease load, Citrus North is largely clean, and healthy
 * samples are over-represented so the healthy rate stays believable.
 */
const DISEASES = [
  {
    name: "Citrus Greening (HLB)",
    crop: "Citrus" as const,
    blockId: "ce",
    severity: "Critical" as const,
    conf: [88, 96],
    weight: 3,
  },
  {
    name: "Bacterial Canker",
    crop: "Citrus" as const,
    blockId: "ce",
    severity: "High" as const,
    conf: [82, 91],
    weight: 4,
  },
  {
    name: "Greasy Spot",
    crop: "Citrus" as const,
    blockId: "ce",
    severity: "Medium" as const,
    conf: [76, 88],
    weight: 4,
  },
  {
    name: "Greasy Spot",
    crop: "Citrus" as const,
    blockId: "cn",
    severity: "Medium" as const,
    conf: [74, 85],
    weight: 2,
  },
  {
    name: "Leaf Miner stress",
    crop: "Citrus" as const,
    blockId: "cn",
    severity: "Low" as const,
    conf: [70, 82],
    weight: 2,
  },
  {
    name: "Healthy Citrus",
    crop: "Citrus" as const,
    blockId: "cn",
    severity: "Low" as const,
    conf: [93, 98],
    weight: 4,
  },
  {
    name: "Olive Peacock Spot",
    crop: "Olive" as const,
    blockId: "ow",
    severity: "High" as const,
    conf: [84, 94],
    weight: 5,
  },
  {
    name: "Olive Peacock Spot",
    crop: "Olive" as const,
    blockId: "os",
    severity: "Medium" as const,
    conf: [78, 90],
    weight: 2,
  },
  {
    name: "Olive Leaf Spot",
    crop: "Olive" as const,
    blockId: "os",
    severity: "Medium" as const,
    conf: [76, 88],
    weight: 6,
  },
  {
    name: "Nutrient deficiency",
    crop: "Olive" as const,
    blockId: "ow",
    severity: "Medium" as const,
    conf: [68, 81],
    weight: 2,
  },
  {
    name: "Healthy Olive",
    crop: "Olive" as const,
    blockId: "os",
    severity: "Low" as const,
    conf: [92, 99],
    weight: 5,
  },
] as const;

/** Weighted pick — each entry is chosen proportionally to its weight. */
function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

const SOURCES = ["Drone scan", "Scout upload", "Mobile capture", "Manual review"];

/** Disease-level severity mix used by the yield model. */
export const DISEASE_LOSS_COEFFICIENTS: Record<string, number> = {
  "Citrus Greening (HLB)": 0.35,
  "Bacterial Canker": 0.12,
  "Greasy Spot": 0.1,
  "Leaf Miner stress": 0.03,
  "Olive Peacock Spot": 0.15,
  "Olive Leaf Spot": 0.06,
  "Nutrient deficiency": 0.04,
  "Healthy Citrus": 0,
  "Healthy Olive": 0,
};

function buildInspections(): Inspection[] {
  const rows: Inspection[] = [];
  const perDay = { "0": 3, "1": 2, "2": 4, "3": 2, "4": 3, "5": 1, "6": 2 };

  for (let daysAgo = 44; daysAgo >= 0; daysAgo--) {
    const count = perDay[String(daysAgo % 7)] ?? 2;
    for (let i = 0; i < count; i++) {
      const disease = pickWeighted(DISEASES);
      const block = SEED_BLOCKS.find((b) => b.id === disease.blockId)!;
      rows.push({
        id: `insp-${daysAgo}-${i}`,
        date: isoDate(daysAgo),
        blockId: block.id,
        block: block.name,
        crop: block.crop,
        disease: disease.name,
        confidence: Math.round(between(disease.conf[0], disease.conf[1])),
        severity: disease.severity,
        source: pick(SOURCES),
      });
    }
  }

  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function buildAlerts(inspections: Inspection[]): Alert[] {
  const critical = inspections.filter((i) => i.severity === "Critical")[0];
  const high = inspections.filter((i) => i.severity === "High");

  const drafts: Array<Omit<Alert, "recordedAt" | "status">> = [
    {
      id: "a1",
      title: "Possible citrus greening spread in Citrus East",
      crop: "Citrus",
      blockId: "ce",
      block: "Citrus East",
      disease: "Citrus Greening (HLB)",
      severity: "Critical",
      recommendation: "Isolate affected zone, remove infected trees, notify agronomist within 24h.",
    },
    {
      id: "a2",
      title: "Peacock spot risk rising after humidity spike",
      crop: "Olive",
      blockId: "ow",
      block: "Olive West",
      disease: "Olive Peacock Spot",
      severity: "High",
      recommendation:
        "Apply copper-based treatment within 48h. Increase scouting frequency to twice weekly.",
    },
    {
      id: "a3",
      title: "Repeated canker detections need sanitation protocol",
      crop: "Citrus",
      blockId: "ce",
      block: "Citrus East",
      disease: "Bacterial Canker",
      severity: "High",
      recommendation:
        "Sanitize pruning tools, restrict block access, schedule copper spray before the next humid window.",
    },
    {
      id: "a4",
      title: "Follow-up scouting required in Olive South",
      crop: "Olive",
      blockId: "os",
      block: "Olive South",
      disease: "Olive Leaf Spot",
      severity: "Medium",
      recommendation: "Increase scouting frequency to twice weekly and monitor humidity.",
    },
    {
      id: "a5",
      title: "Greasy spot pressure trending upward",
      crop: "Citrus",
      blockId: "ce",
      block: "Citrus East",
      disease: "Greasy Spot",
      severity: "Medium",
      recommendation: "Schedule preventive spray within the next maintenance window.",
    },
    {
      id: "a6",
      title: "Leaf miner stress detected near Citrus North",
      crop: "Citrus",
      blockId: "cn",
      block: "Citrus North",
      disease: "Leaf Miner stress",
      severity: "Low",
      recommendation: "Continue routine monitoring. No immediate action required.",
    },
    {
      id: "a7",
      title: "Nutrient deficiency pattern in Olive West",
      crop: "Olive",
      blockId: "ow",
      block: "Olive West",
      disease: "Nutrient deficiency",
      severity: "Medium",
      recommendation: "Soil sampling recommended. Review the fertilization plan for the block.",
    },
    {
      id: "a8",
      title: "Weather-driven infection risk forecast",
      crop: "Olive",
      blockId: "ow",
      block: "Olive West",
      disease: "General risk",
      severity: "Low",
      recommendation:
        "Forecast shows sustained leaf wetness. Pre-treat with copper if the window holds.",
    },
  ];

  return drafts.map((draft, index) => ({
    ...draft,
    recordedAt: isoTime(index < 3 ? 0 : 1, 6 + index, 15 * index),
    status: "open",
  }));
}

function buildFieldNotes(): FieldNote[] {
  return [
    {
      id: "n1",
      date: isoDate(0),
      author: "K. Bensaid",
      note: "Olive West canopy density is blocking airflow — recommend selective pruning before the next humid window.",
      blockId: "ow",
    },
    {
      id: "n2",
      date: isoDate(1),
      author: "S. El Mansouri",
      note: "Citrus East shows a clustered HLB pattern near the irrigation line. Suspect a psyllid migration corridor.",
      blockId: "ce",
    },
    {
      id: "n3",
      date: isoDate(3),
      author: "A. Tazi",
      note: "Olive South leaf litter accumulation is increasing inoculum pressure for peacock spot.",
      blockId: "os",
    },
    {
      id: "n4",
      date: isoDate(6),
      author: "S. El Mansouri",
      note: "Citrus North lemon rows are clean after last week's copper spray. No new canker lesions found.",
      blockId: "cn",
    },
  ];
}

export const SEED_INSPECTIONS = buildInspections();
export const SEED_ALERTS = buildAlerts(SEED_INSPECTIONS);
export const SEED_FIELD_NOTES = buildFieldNotes();

/**
 * Historical operator activity.
 *
 * Without this the audit trail would only ever contain what the current
 * session did, which makes the compliance story on the block page empty on a
 * cold start. These entries mirror the seeded field notes and the treatments
 * that were applied before the window opened.
 */
export const SEED_ACTION_LOG: ActionLog[] = [
  {
    id: "act-seed-1",
    at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    actor: "S. El Mansouri",
    kind: "field-note",
    summary: "Citrus North lemon rows are clean after last week's copper spray.",
    blockId: "cn",
  },
  {
    id: "act-seed-2",
    at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    actor: "A. Tazi",
    kind: "field-note",
    summary: "Olive South leaf litter accumulation is increasing inoculum pressure.",
    blockId: "os",
  },
  {
    id: "act-seed-3",
    at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    actor: "K. Bensaid",
    kind: "alert-action",
    summary: "Copper spray applied — Greasy spot pressure trending upward",
    blockId: "ce",
  },
  {
    id: "act-seed-4",
    at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    actor: "S. El Mansouri",
    kind: "field-note",
    summary: "Citrus East shows a clustered HLB pattern near the irrigation line.",
    blockId: "ce",
  },
  {
    id: "act-seed-5",
    at: new Date(Date.now() - 4 * 3600_000).toISOString(),
    actor: "K. Bensaid",
    kind: "field-note",
    summary: "Olive West canopy density is blocking airflow — selective pruning recommended.",
    blockId: "ow",
  },
  {
    id: "act-seed-6",
    at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    actor: "K. Bensaid",
    kind: "settings",
    summary: "Alert threshold raised to High for the humid season",
  },
];

export function seedDetections(inspections: Inspection[]): Detection[] {
  return inspections.slice(0, 40).map((inspection, index) => ({
    id: `det-${inspection.id}`,
    disease: inspection.disease,
    crop: inspection.crop,
    blockId: inspection.blockId,
    block: inspection.block,
    confidence: inspection.confidence,
    severity: inspection.severity,
    recordedAt: `${inspection.date}T09:00:00.000Z`,
    source: inspection.source,
  }));
}

export const SEED_SETTINGS: Settings = {
  profile: {
    fullName: "Karim Bensaid",
    role: "Estate Manager",
    email: "karim@fomacop.ma",
  },
  farm: {
    name: "FOMACOP Estate",
    region: "Marrakech-Safi, Morocco",
    totalArea: 412,
    latitude: 31.642,
    longitude: -7.9365,
  },
  modules: {
    citrus: true,
    olive: true,
  },
  notifications: {
    emailDigest: true,
    smsCritical: true,
    weeklyReport: true,
    threshold: "High",
    channels: ["email", "in-app"],
    digestHourUtc: 6,
  },
  preferences: {
    language: "en",
    theme: "light",
  },
};
