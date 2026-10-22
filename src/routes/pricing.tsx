import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { plans } from "@/lib/plans";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — AgriVision" },
      {
        name: "description",
        content: "Plans for pilot farms, cooperatives and large multi-estate operations.",
      },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Plans & Pricing"
        description="Built for pilot farms, cooperatives and multi-estate operations focused on olive and citrus."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card
            key={p.name}
            className={p.highlight ? "border-primary shadow-md ring-1 ring-primary/20" : ""}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                {p.highlight && <Badge>Most popular</Badge>}
              </div>
              <CardDescription>{p.description}</CardDescription>
              <div className="pt-3">
                {p.price !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">${p.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                ) : (
                  <div className="text-3xl font-semibold">Custom</div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" variant={p.highlight ? "default" : "outline"}>
                {p.cta}
              </Button>
              <ul className="space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-semibold">Running a research or cooperative pilot?</div>
            <p className="text-sm text-muted-foreground">
              We offer subsidized onboarding for verified agronomy programs in olive and citrus
              regions.
            </p>
          </div>
          <Button variant="outline">Talk to our team</Button>
        </CardContent>
      </Card>
    </div>
  );
}
