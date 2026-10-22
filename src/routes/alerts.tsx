import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Check, ChevronRight, Clock, Settings, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { actionAlert, dismissAlert, getAlerts } from "@/api/alerts";
import { formatDateTime } from "@/lib/format";
import type { Severity } from "@/lib/types";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — AgriVision" },
      {
        name: "description",
        content: "Real-time disease alerts and recommended actions.",
      },
    ],
  }),
  loader: async () => ({ alerts: await getAlerts() }),
  component: Alerts,
});

const SEVERITY_BAR: Record<Severity, string> = {
  Critical: "var(--risk-urgent)",
  High: "var(--risk-high)",
  Medium: "var(--risk-medium)",
  Low: "var(--risk-low)",
};

function Alerts() {
  const { alerts } = Route.useLoaderData();
  const router = useRouter();
  const [tab, setTab] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const open = alerts.filter((alert) => alert.status === "open");
  const resolved = alerts.filter((alert) => alert.status !== "open");

  const counts = {
    Critical: open.filter((a) => a.severity === "Critical").length,
    High: open.filter((a) => a.severity === "High").length,
    Medium: open.filter((a) => a.severity === "Medium").length,
    Low: open.filter((a) => a.severity === "Low").length,
  };

  const filtered =
    tab === "resolved"
      ? resolved
      : tab === "all"
        ? open
        : open.filter((a) => a.severity.toLowerCase() === tab);

  const takeAction = async (alertId: string) => {
    setBusy(alertId);
    try {
      await actionAlert({ data: { alertId, action: "Treatment applied" } });
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (alertId: string) => {
    setBusy(alertId);
    try {
      await dismissAlert({ data: { alertId } });
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Alerts"
        description="Prioritized actions based on disease pressure, weather and detection clusters."
        actions={
          <>
            <Badge variant="outline">{open.length} open</Badge>
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings">
                <Settings className="mr-1.5 h-4 w-4" />
                Notification settings
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({open.length})</TabsTrigger>
          <TabsTrigger value="critical">Critical ({counts.Critical})</TabsTrigger>
          <TabsTrigger value="high">High ({counts.High})</TabsTrigger>
          <TabsTrigger value="medium">Medium ({counts.Medium})</TabsTrigger>
          <TabsTrigger value="low">Low ({counts.Low})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {filtered.map((alert) => (
          <Card key={alert.id} className="overflow-hidden transition hover:border-primary/40">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
              <div
                className="hidden h-full w-1 self-stretch rounded-full md:block"
                style={{ background: SEVERITY_BAR[alert.severity] }}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge level={alert.severity} />
                  <span className="text-xs text-muted-foreground">
                    {alert.crop} · {alert.block} · {alert.disease}
                  </span>
                </div>
                <div className="mt-1.5 text-base font-semibold">{alert.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.recommendation}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(alert.recordedAt)}
                  </span>
                  <Link
                    to="/blocks/$blockId"
                    params={{ blockId: alert.blockId }}
                    className="underline-offset-2 hover:underline"
                  >
                    Open {alert.block}
                  </Link>
                  {alert.status !== "open" && (
                    <Badge variant="outline" className="gap-1">
                      {alert.status === "actioned" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {alert.status === "actioned"
                        ? `Treated${alert.action ? ` — ${alert.action}` : ""}`
                        : "Dismissed"}
                    </Badge>
                  )}
                </div>
              </div>
              {alert.status === "open" && (
                <div className="flex gap-2 md:flex-col">
                  <Button
                    size="sm"
                    disabled={busy === alert.id}
                    onClick={() => takeAction(alert.id)}
                  >
                    Take action <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === alert.id}
                    onClick={() => dismiss(alert.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Bell className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No {tab === "all" ? "open " : ""}
                {tab === "resolved" ? "resolved" : tab} alerts right now.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
