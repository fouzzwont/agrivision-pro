/**
 * Shared domain types. Safe to import from both client and server code.
 */

export type Crop = "Olive" | "Citrus";
export type RiskLevel = "low" | "medium" | "high" | "urgent";
export type Severity = "Low" | "Medium" | "High" | "Critical";
export type AlertStatus = "open" | "actioned" | "dismissed";

export const SEVERITY_ORDER: Record<Severity, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export type Block = {
  id: string;
  name: string;
  crop: Crop;
  area: number;
  /** [longitude, latitude] — GeoJSON order. */
  centroid: [number, number];
  detections: number;
  urgent: number;
  health: number;
  risk: RiskLevel;
  variety: string;
  plantedYear: number;
};

export type Detection = {
  id: string;
  disease: string;
  crop: Crop;
  blockId: string;
  block: string;
  confidence: number;
  severity: Severity;
  recordedAt: string;
  source: string;
  /** Set when the detection came from an uploaded image rather than a field scan. */
  fileName?: string;
  /** Model identifier that produced the result. */
  model?: string;
};

export type Inspection = {
  id: string;
  date: string;
  blockId: string;
  block: string;
  crop: Crop;
  disease: string;
  confidence: number;
  severity: Severity;
  source: string;
};

export type FieldNote = {
  id: string;
  date: string;
  author: string;
  note: string;
  blockId?: string;
};

export type Alert = {
  id: string;
  title: string;
  crop: Crop;
  blockId: string;
  block: string;
  disease: string;
  severity: Severity;
  recommendation: string;
  recordedAt: string;
  status: AlertStatus;
  /** Populated once an operator acts on the alert. */
  action?: string;
  actionedAt?: string;
};

export type ActionLog = {
  id: string;
  at: string;
  actor: string;
  kind: "alert-action" | "alert-dismiss" | "field-note" | "scan" | "settings";
  summary: string;
  blockId?: string;
};

export type NotificationChannel = "email" | "sms" | "in-app";

export type Settings = {
  profile: {
    fullName: string;
    role: string;
    email: string;
  };
  farm: {
    name: string;
    region: string;
    totalArea: number;
    latitude: number;
    longitude: number;
  };
  modules: {
    citrus: boolean;
    olive: boolean;
  };
  notifications: {
    emailDigest: boolean;
    smsCritical: boolean;
    weeklyReport: boolean;
    /** Only alerts at or above this severity get delivered. */
    threshold: Severity;
    channels: NotificationChannel[];
    digestHourUtc: number;
  };
  preferences: {
    language: "en" | "fr" | "ar" | "es";
    theme: "light" | "dark";
  };
};

export type WeatherCurrent = {
  temperatureC: number;
  humidityPct: number;
  windKmh: number;
  precipitationMm: number;
};

export type WeatherHour = {
  time: string;
  temperatureC: number;
  humidityPct: number;
  precipitationMm: number;
};

export type WeatherSnapshot = {
  observedAt: string;
  location: string;
  current: WeatherCurrent;
  hourly: WeatherHour[];
  source: "open-meteo" | "fallback";
  fetchedAt: string;
};

export type InfectionRiskBreakdown = {
  disease: string;
  crop: Crop;
  score: number;
  level: RiskLevel;
  /** Human-readable drivers behind the score. */
  drivers: string[];
  /** Hours of leaf wetness used by the model. */
  wetnessHours: number;
  rainfallMm: number;
};

export type YieldRiskContribution = {
  disease: string;
  crop: Crop;
  /** Share of the block expected to be lost if the disease is uncontrolled. */
  lossCoefficient: number;
  /** Share of the block currently showing the disease. */
  affectedShare: number;
  contribution: number;
};

export type YieldRisk = {
  blockId: string;
  block: string;
  crop: Crop;
  area: number;
  /** Estimated share of production lost, 0..1. */
  expectedLossPct: number;
  /** Hectares at risk. */
  areaAtRisk: number;
  /** Production value at risk in MAD. */
  valueAtRiskMad: number;
  /** Total production value of the block in MAD. */
  blockValueMad: number;
  contributions: YieldRiskContribution[];
  /** Modifier applied by current weather pressure. */
  weatherModifier: number;
};

export type DeliveryStatus = "sent" | "logged" | "failed";

export type NotificationDelivery = {
  id: string;
  at: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  status: DeliveryStatus;
  detail: string;
  alertIds: string[];
};

export type DashboardSnapshot = {
  farm: { name: string; region: string; totalArea: number; lastUpdated: string };
  kpis: {
    monitoredArea: number;
    yieldAtRiskPct: number;
    activeAlerts: number;
    avgConfidence: number;
    healthyRate: number;
    valueAtRiskMad: number;
    blocksAtRisk: number;
  };
  blocks: Block[];
  recentDetections: Detection[];
  trend: { date: string; detections: number; healthy: number; severity: number }[];
  severityDistribution: { name: Severity; value: number }[];
  weather: WeatherSnapshot;
  infectionRisk: InfectionRiskBreakdown[];
  yieldRisk: YieldRisk[];
  alerts: Alert[];
  digestPreview: string;
};

export type BlockDetail = {
  block: Block;
  detections: Detection[];
  inspections: Inspection[];
  notes: FieldNote[];
  alerts: Alert[];
  yieldRisk: YieldRisk;
  infectionRisk: InfectionRiskBreakdown[];
  weather: WeatherSnapshot;
  trend: { date: string; detections: number; healthy: number; severity: number }[];
  actionLog: ActionLog[];
};

export type ReportType = "disease" | "risk" | "field" | "yield";

export type RiskMapSnapshot = {
  blocks: Block[];
  allBlocks: Block[];
  infectionRisk: InfectionRiskBreakdown[];
  weather: WeatherSnapshot;
  yieldRisk: YieldRisk[];
  alerts: Alert[];
  insights: {
    mostAffected: {
      name: string;
      detections: number;
      urgent: number;
      risk: RiskLevel;
    } | null;
    fastestGrowing: {
      name: string;
      growthPct: number;
      detections: number;
    } | null;
    priorities: { name: string; action: string; risk: RiskLevel }[];
    filteredOut: number;
  };
};

export type ReportPayload = {
  generatedAt: string;
  type: ReportType;
  title: string;
  scope: { crop: string; block: string; rangeDays: number };
  farm: { name: string; region: string; totalArea: number };
  summary: string;
  metrics: { label: string; value: string }[];
  risks: string[];
  nextSteps: string[];
  blockTable: {
    head: string[];
    rows: string[][];
  };
  detectionsTable: {
    head: string[];
    rows: string[][];
  };
};
