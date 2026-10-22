/**
 * Subscription plans shown on the pricing page.
 *
 * Kept in its own module so the page can import it without pulling in any of
 * the operational mock data that used to live in a single file.
 */
export type Plan = {
  name: string;
  price: number | null;
  description: string;
  features: string[];
  cta: string;
  highlight: boolean;
};

export const plans: Plan[] = [
  {
    name: "Starter",
    price: 149,
    description: "For small pilot farms validating disease intelligence on a single estate.",
    features: [
      "Up to 4 monitored blocks",
      "500 AI scans / month",
      "Citrus + olive disease detection",
      "Basic risk alerts",
      "Weekly summary reports",
      "Email support",
    ],
    cta: "Start pilot",
    highlight: false,
  },
  {
    name: "Professional",
    price: 489,
    description: "For cooperatives and medium estates running active field programs.",
    features: [
      "Up to 25 monitored blocks",
      "5,000 AI scans / month",
      "Block-level risk mapping",
      "Real-time alerts + recommendations",
      "Custom report builder",
      "Drone & mobile capture integration",
      "Priority support",
    ],
    cta: "Choose Professional",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: null,
    description: "For large multi-estate operations and regional cooperatives.",
    features: [
      "Unlimited blocks & estates",
      "Unlimited AI scans",
      "Multi-tenant cooperative dashboard",
      "Custom AI model fine-tuning",
      "GIS & weather API integrations",
      "Dedicated agronomy success team",
      "SLA + on-site onboarding",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];
