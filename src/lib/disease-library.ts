import type { Crop } from "@/lib/types";

/**
 * Agronomy reference library.
 *
 * Static, human-written content: what a disease looks like, what to do about
 * it, and whether it warrants escalation. It contains no model output — live
 * scan results come from the ONNX classifier and are shown separately.
 */
export type DiseaseSample = {
  name: string;
  crop: Crop;
  description: string;
  recommendation: string;
  escalate: boolean;
  indicators: string[];
  /** Label the shipped model uses for this disease, when it was trained on it. */
  modelLabel?: string;
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
    indicators: ["Raised corky lesions", "Yellow halos", "Leaf abscission"],
    modelLabel: "Bacterial Canker",
  },
  greasy: {
    name: "Citrus Greasy Spot",
    crop: "Citrus",
    description:
      "Fungal disease causing greasy yellow-brown blisters on leaf undersides, leading to defoliation.",
    recommendation: "Apply copper or oil spray pre-summer. Manage leaf litter to reduce inoculum.",
    escalate: false,
    indicators: ["Yellow-brown blisters", "Greasy underside", "Premature defoliation"],
  },
  healthy_citrus: {
    name: "Healthy Citrus",
    crop: "Citrus",
    description:
      "No disease indicators detected. Foliage shows uniform color and structure consistent with healthy growth.",
    recommendation: "Continue routine monitoring. No intervention required.",
    escalate: false,
    indicators: ["Uniform leaf color", "No visible lesions", "Normal vein structure"],
  },
  peacock: {
    name: "Olive Peacock Spot",
    crop: "Olive",
    description:
      "Fungal disease (Spilocaea oleagina) creating dark circular spots resembling peacock-eye markings, causing defoliation.",
    recommendation: "Apply copper-based fungicide. Improve canopy aeration through pruning.",
    escalate: true,
    indicators: ["Dark circular spots", "Yellow halos", "Premature leaf drop"],
  },
  healthy_olive: {
    name: "Healthy Olive",
    crop: "Olive",
    description:
      "Foliage shows healthy chlorophyll distribution with no fungal or bacterial indicators.",
    recommendation: "Maintain routine scouting and irrigation schedule.",
    escalate: false,
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

