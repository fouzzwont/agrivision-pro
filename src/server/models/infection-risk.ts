import type {
  Crop,
  InfectionRiskBreakdown,
  RiskLevel,
  Severity,
  WeatherSnapshot,
} from "@/lib/types";

/**
 * Forward-looking infection pressure.
 *
 * This is a transparent, rule-based agronomy model rather than a black box:
 * every score decomposes into hours of leaf wetness, rainfall and temperature
 * windows that an agronomist can audit and argue with.
 *
 *  - Fungal leaf diseases (peacock spot, greasy spot, canker, leaf spot)
 *    need sustained leaf wetness inside a temperature window. The closer the
 *    temperature is to the optimum and the longer the wetness lasts, the
 *    higher the infection pressure.
 *
 *  - Citrus greening (HLB) is vector-borne by the Asian citrus psyllid, so
 *    its pressure is driven by warm hours (psyllid flight activity) plus
 *    humidity, not by leaf wetness.
 */

export type DiseaseWindow = {
  disease: string;
  crop: Crop;
  /** Optimum temperature band for infection, in °C. */
  tempRange: [number, number];
  /** Relative humidity (%) above which leaf wetness is assumed. */
  humidityThreshold: number;
  /** Rainfall (mm) in an hour that counts as a wetting event. */
  rainThreshold: number;
  /** Mechanism: wetness-driven fungal disease vs vector-borne. */
  mechanism: "wetness" | "vector";
  /** Relative weight when ranking several diseases for the same crop. */
  weight: number;
};

export const DISEASE_WINDOWS: DiseaseWindow[] = [
  {
    disease: "Olive Peacock Spot",
    crop: "Olive",
    tempRange: [12, 28],
    humidityThreshold: 88,
    rainThreshold: 1,
    mechanism: "wetness",
    weight: 1,
  },
  {
    disease: "Olive Leaf Spot",
    crop: "Olive",
    tempRange: [15, 30],
    humidityThreshold: 85,
    rainThreshold: 1,
    mechanism: "wetness",
    weight: 0.7,
  },
  {
    disease: "Citrus Greening (HLB)",
    crop: "Citrus",
    tempRange: [25, 34],
    humidityThreshold: 70,
    rainThreshold: 0,
    mechanism: "vector",
    weight: 1,
  },
  {
    disease: "Bacterial Canker",
    crop: "Citrus",
    tempRange: [16, 32],
    humidityThreshold: 92,
    rainThreshold: 2.5,
    mechanism: "wetness",
    weight: 0.85,
  },
  {
    disease: "Citrus Greasy Spot",
    crop: "Citrus",
    tempRange: [22, 33],
    humidityThreshold: 90,
    rainThreshold: 1,
    mechanism: "wetness",
    weight: 0.9,
  },
];

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "urgent";
  if (score >= 50) return "high";
  if (score >= 28) return "medium";
  return "low";
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function longestStreak(flags: boolean[]): number {
  let best = 0;
  let current = 0;
  for (const flag of flags) {
    current = flag ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

/**
 * Scores every tracked disease against the current forecast window.
 */
export function computeInfectionRisk(
  weather: WeatherSnapshot,
  crops: Crop[] = ["Olive", "Citrus"],
): InfectionRiskBreakdown[] {
  const hours = weather.hourly;

  const results = DISEASE_WINDOWS.filter((w) => crops.includes(w.crop)).map((window) => {
    const drivers: string[] = [];

    const wetFlags = hours.map(
      (h) =>
        h.humidityPct >= window.humidityThreshold &&
        h.temperatureC >= window.tempRange[0] &&
        h.temperatureC <= window.tempRange[1],
    );
    const wetnessHours = wetFlags.filter(Boolean).length;
    const streak = longestStreak(wetFlags);

    const rainfallMm = hours.reduce(
      (sum, h) => sum + (h.precipitationMm >= window.rainThreshold ? h.precipitationMm : 0),
      0,
    );

    const warmHours = hours.filter(
      (h) => h.temperatureC >= window.tempRange[0] && h.temperatureC <= window.tempRange[1],
    ).length;

    let score: number;
    if (window.mechanism === "wetness") {
      score = clamp(wetnessHours * 2.4 + streak * 6.5 + rainfallMm * 3.2);
      drivers.push(
        `${wetnessHours} h leaf wetness (RH ≥ ${window.humidityThreshold}% within ${window.tempRange[0]}–${window.tempRange[1]}°C)`,
      );
      if (streak > 0) drivers.push(`Longest continuous wet window: ${streak} h`);
      drivers.push(`${rainfallMm.toFixed(1)} mm qualifying rainfall in the forecast window`);
    } else {
      const humidHours = hours.filter((h) => h.humidityPct >= window.humidityThreshold).length;
      score = clamp(warmHours * 1.9 + humidHours * 0.75);
      drivers.push(
        `${warmHours} h in the ${window.tempRange[0]}–${window.tempRange[1]}°C psyllid flight window`,
      );
      drivers.push(`${humidHours} h above ${window.humidityThreshold}% humidity (vector activity)`);
    }

    const weighted = score * window.weight;

    return {
      disease: window.disease,
      crop: window.crop,
      score: Math.round(clamp(weighted)),
      level: scoreToLevel(weighted),
      drivers,
      wetnessHours,
      rainfallMm: Number(rainfallMm.toFixed(1)),
    } satisfies InfectionRiskBreakdown;
  });

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Blends observed disease pressure with forward-looking weather pressure into
 * a single estate-wide pressure score (0..100).
 */
export function estatePressure(
  infectionRisk: InfectionRiskBreakdown[],
  observedSeverity: number,
): number {
  const weatherScore = infectionRisk.length ? Math.max(...infectionRisk.map((r) => r.score)) : 0;
  return Math.round(clamp(weatherScore * 0.6 + observedSeverity * 0.4));
}

/** Severity weighting used when collapsing inspections into a single number. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  Critical: 6,
  High: 3,
  Medium: 1.5,
  Low: 0,
};
