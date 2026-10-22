import type { Crop } from "@/lib/types";

/**
 * Reference library of the diseases the scanner can recognise.
 *
 * These entries describe the *model's* behaviour for a canonical sample — the
 * probabilities, the visual indicators and the agronomic recommendation. Live
 * scans produced by the detection service are stored separately and shown
 * alongside these reference cases.
 */
export type DiseaseSample = {
  name: string;
  crop: Crop;
  description: string;
  recommendation: string;
  escalate: boolean;
  probabilities: { label: string; value: number }[];
  indicators: string[];
};

export const DISEASE_LIBRARY: Record<string, DiseaseSample> = {
  hlb: {
    name: "Citrus Greening (HLB)",
    crop: "Citrus",
    description:
      "Bacterial disease causing yellow shoots, asymmetric mottling, and lopsided fruit. Highly destructive and incurable once established.",
    recommendation:
      "Isolate affected trees, remove and destroy symptomatic material, control psyllid vectors, and notify agronomist immediately.",
    escalate: true,
    probabilities: [
      { label: "Citrus Greening (HLB)", value: 94 },
      { label: "Bacterial Canker", value: 3 },
      { label: "Nutrient deficiency", value: 2 },
      { label: "Healthy Citrus", value: 1 },
    ],
    indicators: ["Asymmetric leaf mottling", "Yellow shoot pattern", "Vein corking"],
  },
  canker: {
    name: "Citrus Bacterial Canker",
    crop: "Citrus",
    description:
      "Raised corky lesions on leaves and fruit caused by Xanthomonas citri. Spreads via wind-driven rain.",
    recommendation:
      "Sanitize pruning tools, schedule copper-based treatment, restrict block access during wet periods.",
    escalate: true,
    probabilities: [
      { label: "Bacterial Canker", value: 88 },
      { label: "Greasy Spot", value: 7 },
      { label: "Healthy Citrus", value: 5 },
    ],
    indicators: ["Raised corky lesions", "Yellow halos", "Leaf abscission"],
  },
  greasy: {
    name: "Citrus Greasy Spot",
    crop: "Citrus",
    description:
      "Fungal disease causing greasy yellow-brown blisters on leaf undersides, leading to defoliation.",
    recommendation: "Apply copper or oil spray pre-summer. Manage leaf litter to reduce inoculum.",
    escalate: false,
    probabilities: [
      { label: "Greasy Spot", value: 82 },
      { label: "Leaf Miner stress", value: 11 },
      { label: "Healthy Citrus", value: 7 },
    ],
    indicators: ["Yellow-brown blisters", "Greasy underside", "Premature defoliation"],
  },
  healthy_citrus: {
    name: "Healthy Citrus",
    crop: "Citrus",
    description:
      "No disease indicators detected. Foliage shows uniform color and structure consistent with healthy growth.",
    recommendation: "Continue routine monitoring. No intervention required.",
    escalate: false,
    probabilities: [
      { label: "Healthy Citrus", value: 96 },
      { label: "Leaf Miner stress", value: 3 },
      { label: "Greasy Spot", value: 1 },
    ],
    indicators: ["Uniform leaf color", "No visible lesions", "Normal vein structure"],
  },
  peacock: {
    name: "Olive Peacock Spot",
    crop: "Olive",
    description:
      "Fungal disease (Spilocaea oleagina) creating dark circular spots resembling peacock-eye markings, causing defoliation.",
    recommendation: "Apply copper-based fungicide. Improve canopy aeration through pruning.",
    escalate: true,
    probabilities: [
      { label: "Olive Peacock Spot", value: 91 },
      { label: "Olive Leaf Spot", value: 6 },
      { label: "Healthy Olive", value: 3 },
    ],
    indicators: ["Dark circular spots", "Yellow halos", "Premature leaf drop"],
  },
  healthy_olive: {
    name: "Healthy Olive",
    crop: "Olive",
    description:
      "Foliage shows healthy chlorophyll distribution with no fungal or bacterial indicators.",
    recommendation: "Maintain routine scouting and irrigation schedule.",
    escalate: false,
    probabilities: [
      { label: "Healthy Olive", value: 97 },
      { label: "Olive Leaf Spot", value: 2 },
      { label: "Nutrient deficiency", value: 1 },
    ],
    indicators: ["Uniform green color", "No spotting", "Healthy bud structure"],
  },
};

/** The reference samples grouped by crop, in display order. */
export const DISEASE_SAMPLES = [
  { key: "hlb", label: "Citrus HLB", crop: "Citrus" as Crop },
  { key: "canker", label: "Bacterial Canker", crop: "Citrus" as Crop },
  { key: "greasy", label: "Greasy Spot", crop: "Citrus" as Crop },
  { key: "healthy_citrus", label: "Healthy Citrus", crop: "Citrus" as Crop },
  { key: "peacock", label: "Olive Peacock Spot", crop: "Olive" as Crop },
  { key: "healthy_olive", label: "Healthy Olive", crop: "Olive" as Crop },
];

/**
 * Derives the health verdict from a probability breakdown.
 *
 * The healthy class always wins ties: a scan is only called diseased when the
 * top disease class is both the most likely *and* above 50% confidence.
 */
export function classifySample(sample: DiseaseSample): {
  verdict: "Healthy" | "Diseased";
  severity: "Low" | "Medium" | "High" | "Critical";
  confidence: number;
} {
  const top = sample.probabilities[0];
  const confidence = top?.value ?? 0;
  const isHealthy = /healthy/i.test(top?.label ?? "");
  const diseased = !isHealthy && confidence > 50;

  let severity: "Low" | "Medium" | "High" | "Critical" = "Low";
  if (diseased) {
    if (confidence >= 90) severity = "Critical";
    else if (confidence >= 75) severity = "High";
    else severity = "Medium";
  }

  return {
    verdict: diseased ? "Diseased" : "Healthy",
    severity,
    confidence,
  };
}
