import type {
  Crop,
  Detection,
  InfectionRiskBreakdown,
  YieldRisk,
  YieldRiskContribution,
} from "@/lib/types";
import { DISEASE_LOSS_COEFFICIENTS } from "@/server/seed";

/**
 * Yield-at-risk model.
 *
 * The model answers one question: how much production is exposed if the
 * current disease pressure is not brought under control within the season?
 *
 * For every disease detected on a block we estimate the share of the block
 * that is affected, multiply it by a disease-specific loss coefficient, and
 * apply a weather modifier derived from the live infection-pressure forecast.
 * Every term is surfaced in the UI so the number can be audited.
 */

/** Farm-gate economics used to convert area at risk into production value. */
export const CROP_ECONOMICS: Record<
  Crop,
  { yieldTPerHa: number; pricePerTonMad: number; label: string }
> = {
  Citrus: { yieldTPerHa: 22, pricePerTonMad: 4500, label: "Orange / lemon, packed" },
  Olive: { yieldTPerHa: 3.2, pricePerTonMad: 9000, label: "Oil olive, farm gate" },
};

/**
 * How much block area a single detection implies. Diseases with a fast,
 * systemic spread (HLB) carry a much higher value than a localised foliar
 * symptom.
 */
export const SPREAD_FACTOR: Record<string, number> = {
  "Citrus Greening (HLB)": 4.5,
  "Bacterial Canker": 3.2,
  "Citrus Greasy Spot": 3,
  "Olive Peacock Spot": 3,
  "Olive Leaf Spot": 3,
  "Nutrient deficiency": 2.5,
  "Leaf Miner stress": 2.2,
  "Healthy Citrus": 0,
  "Healthy Olive": 0,
};

export const MAX_LOSS = 0.65;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function blockValueMad(crop: Crop, area: number): number {
  const econ = CROP_ECONOMICS[crop];
  return Math.round(area * econ.yieldTPerHa * econ.pricePerTonMad);
}

export function computeYieldRisk(
  block: { id: string; name: string; crop: Crop; area: number },
  detections: Detection[],
  infectionRisk: InfectionRiskBreakdown[],
): YieldRisk {
  const counts = new Map<string, number>();
  for (const detection of detections) {
    counts.set(detection.disease, (counts.get(detection.disease) ?? 0) + 1);
  }

  const contributions: YieldRiskContribution[] = [];
  let rawLoss = 0;

  for (const [disease, count] of counts) {
    const lossCoefficient = DISEASE_LOSS_COEFFICIENTS[disease] ?? 0;
    if (lossCoefficient === 0) continue;

    const incidence = count / block.area;
    const affectedShare = clamp(incidence * (SPREAD_FACTOR[disease] ?? 3), 0, 1);
    const contribution = affectedShare * lossCoefficient;
    rawLoss += contribution;

    contributions.push({
      disease,
      crop: block.crop,
      lossCoefficient,
      affectedShare: Number(affectedShare.toFixed(4)),
      contribution: Number(contribution.toFixed(4)),
    });
  }

  contributions.sort((a, b) => b.contribution - a.contribution);

  // Weather modifier: severe forward-looking infection pressure erodes the
  // margin for control, so the same disease load costs more.
  const relevant = infectionRisk.filter((r) => r.crop === block.crop);
  const weatherScore = relevant.length ? Math.max(...relevant.map((r) => r.score)) : 0;
  const weatherModifier = Number((1 + (weatherScore / 100) * 0.35).toFixed(3));

  const expectedLossPct = Number(clamp(rawLoss * weatherModifier, 0, MAX_LOSS).toFixed(4));
  const areaAtRisk = Number((block.area * expectedLossPct).toFixed(2));
  const value = blockValueMad(block.crop, block.area);

  return {
    blockId: block.id,
    block: block.name,
    crop: block.crop,
    area: block.area,
    expectedLossPct,
    areaAtRisk,
    valueAtRiskMad: Math.round(areaAtRisk * (value / block.area)),
    blockValueMad: value,
    contributions,
    weatherModifier,
  };
}

/** Rolls block-level yield risk up into estate totals. */
export function summariseYieldRisk(risk: YieldRisk[]) {
  const totalValue = risk.reduce((sum, r) => sum + r.blockValueMad, 0);
  const valueAtRisk = risk.reduce((sum, r) => sum + r.valueAtRiskMad, 0);
  const areaAtRisk = risk.reduce((sum, r) => sum + r.areaAtRisk, 0);

  return {
    totalValueMad: totalValue,
    valueAtRiskMad: valueAtRisk,
    areaAtRiskHa: Number(areaAtRisk.toFixed(1)),
    yieldAtRiskPct: totalValue > 0 ? Number(((valueAtRisk / totalValue) * 100).toFixed(1)) : 0,
  };
}
