import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Citrus, History, Leaf, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { useTheme } from "@/lib/theme";
import { getDeliveries, sendTestDigest } from "@/api/alerts";
import { getSettings, saveSettings } from "@/api/settings";
import { formatDateTime } from "@/lib/format";
import type { NotificationChannel, Severity, Settings } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — AgriVision" },
      {
        name: "description",
        content: "Manage profile, farm, crop focus and notification preferences.",
      },
    ],
  }),
  loader: async () => {
    const [settings, deliveries] = await Promise.all([getSettings(), getDeliveries()]);
    return { settings, deliveries };
  },
  component: SettingsPage,
});

const SEVERITIES: Severity[] = ["Low", "Medium", "High", "Critical"];

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  "in-app": "In-app",
};

const CHANNEL_HINT: Record<NotificationChannel, string> = {
  email: "Delivered through the Resend API when a key is configured.",
  sms: "Recorded in the delivery log; a gateway is not wired up yet.",
  "in-app": "Always available — shown in the alerts inbox.",
};

function SettingsPage() {
  const { settings: initial, deliveries } = Route.useLoaderData();
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const [settings, setSettings] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestResult, setDigestResult] = useState<string | null>(null);

  useEffect(() => {
    setSettings(initial);
  }, [initial]);

  const patch = <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) => {
    setSaved(false);
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], ...value },
    }));
  };

  const toggleChannel = (channel: NotificationChannel, enabled: boolean) => {
    const current = settings.notifications.channels;
    const next = enabled
      ? [...new Set([...current, channel])]
      : current.filter((entry) => entry !== channel);
    patch("notifications", { channels: next });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await saveSettings({
        data: {
          profile: settings.profile,
          farm: settings.farm,
          modules: settings.modules,
          notifications: settings.notifications,
          preferences: settings.preferences,
        },
      });
      setSettings(next);
      setSaved(true);
      await router.invalidate();
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "The settings could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const sendDigest = async () => {
    setDigestBusy(true);
    setDigestResult(null);
    try {
      const result = await sendTestDigest();
      const sent = result.deliveries.filter((d) => d.status === "sent").length;
      const logged = result.deliveries.filter((d) => d.status === "logged").length;
      setDigestResult(
        `Digest built: ${result.deliveries.length} channel(s) — ${sent} sent, ${logged} logged.`,
      );
      await router.invalidate();
    } catch (caught) {
      console.error(caught);
      setDigestResult(caught instanceof Error ? caught.message : "The digest could not be sent.");
    } finally {
      setDigestBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, farm, crop modules and alerting."
        actions={
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : saved ? (
              "Saved"
            ) : (
              "Save changes"
            )}
          </Button>
        }
      />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>
              Account information — the name is used as the author on field notes and audit entries
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  value={settings.profile.fullName}
                  onChange={(event) => patch("profile", { fullName: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="profile-role">Role</Label>
                <Input
                  id="profile-role"
                  value={settings.profile.role}
                  onChange={(event) => patch("profile", { role: event.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={settings.profile.email}
                onChange={(event) => patch("profile", { email: event.target.value })}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Alert digests are delivered to this address.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Farm profile</CardTitle>
            <CardDescription>
              Estate identity — the coordinates drive the weather forecast
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="farm-name">Farm name</Label>
              <Input
                id="farm-name"
                value={settings.farm.name}
                onChange={(event) => patch("farm", { name: event.target.value })}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="farm-region">Region</Label>
                <Input
                  id="farm-region"
                  value={settings.farm.region}
                  onChange={(event) => patch("farm", { region: event.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="farm-area">Total area (ha)</Label>
                <Input
                  id="farm-area"
                  type="number"
                  min={0}
                  value={settings.farm.totalArea}
                  onChange={(event) =>
                    patch("farm", { totalArea: Number(event.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="farm-lat">Latitude</Label>
                <Input
                  id="farm-lat"
                  type="number"
                  step="0.0001"
                  value={settings.farm.latitude}
                  onChange={(event) => patch("farm", { latitude: Number(event.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="farm-lng">Longitude</Label>
                <Input
                  id="farm-lng"
                  type="number"
                  step="0.0001"
                  value={settings.farm.longitude}
                  onChange={(event) =>
                    patch("farm", { longitude: Number(event.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crop focus</CardTitle>
            <CardDescription>Enable disease modules for your crops</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                key: "citrus" as const,
                icon: Citrus,
                name: "Citrus disease module",
                desc: "HLB, canker, greasy spot, leaf miner stress",
              },
              {
                key: "olive" as const,
                icon: Leaf,
                name: "Olive disease module",
                desc: "Peacock spot, leaf spot, nutrient deficiency",
              },
            ].map((module) => (
              <div
                key={module.key}
                className="flex items-center justify-between rounded-lg border bg-muted/20 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <module.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{module.name}</div>
                    <div className="text-xs text-muted-foreground">{module.desc}</div>
                  </div>
                </div>
                <Switch
                  checked={settings.modules[module.key]}
                  onCheckedChange={(checked) => patch("modules", { [module.key]: checked })}
                  aria-label={`Toggle ${module.name}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications & alerts</CardTitle>
            <CardDescription>How and when AgriVision alerts you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                key: "emailDigest" as const,
                name: "Email digest",
                desc: "Summary of detections and alerts at the configured hour",
              },
              {
                key: "smsCritical" as const,
                name: "SMS for critical alerts",
                desc: "Sent for urgent disease events",
              },
              {
                key: "weeklyReport" as const,
                name: "Weekly report",
                desc: "Auto-generate the weekly summary report",
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <Switch
                  checked={settings.notifications[item.key]}
                  onCheckedChange={(checked) => patch("notifications", { [item.key]: checked })}
                  aria-label={`Toggle ${item.name}`}
                />
              </div>
            ))}

            <div className="border-t pt-4">
              <Label>Delivery channels</Label>
              <div className="mt-2 space-y-2">
                {(["email", "sms", "in-app"] as NotificationChannel[]).map((channel) => (
                  <div
                    key={channel}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{CHANNEL_LABEL[channel]}</div>
                      <div className="text-xs text-muted-foreground">{CHANNEL_HINT[channel]}</div>
                    </div>
                    <Switch
                      checked={settings.notifications.channels.includes(channel)}
                      onCheckedChange={(checked) => toggleChannel(channel, checked)}
                      aria-label={`Toggle ${CHANNEL_LABEL[channel]} channel`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="threshold">Alert threshold</Label>
                <Select
                  value={settings.notifications.threshold}
                  onValueChange={(value) =>
                    patch("notifications", { threshold: value as Severity })
                  }
                >
                  <SelectTrigger id="threshold" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {severity} and above
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="digest-hour">Digest hour (UTC)</Label>
                <Select
                  value={String(settings.notifications.digestHourUtc)}
                  onValueChange={(value) =>
                    patch("notifications", { digestHourUtc: Number(value) })
                  }
                >
                  <SelectTrigger id="digest-hour" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
                      <SelectItem key={hour} value={String(hour)}>
                        {String(hour).padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
            <CardDescription>Language and appearance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="language">Language</Label>
              <Select
                value={settings.preferences.language}
                onValueChange={(value) =>
                  patch("preferences", {
                    language: value as Settings["preferences"]["language"],
                  })
                }
              >
                <SelectTrigger id="language" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground capitalize">{theme} mode</div>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={toggle}
                aria-label="Toggle dark mode"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Test digest
            </CardTitle>
            <CardDescription>
              Runs the same code path as the scheduled cron so you can verify delivery end to end
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={sendDigest} disabled={digestBusy} className="w-full">
              {digestBusy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Building digest…
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" />
                  Send test digest
                </>
              )}
            </Button>
            {digestResult && <p className="text-xs text-muted-foreground">{digestResult}</p>}
            <p className="text-xs text-muted-foreground">
              The scheduled digest runs twice a day (06:00 and 18:00 UTC) via the Workers Cron
              trigger.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" /> Delivery log
            </CardTitle>
            <CardDescription>Every digest produced by the cron or the test button</CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No digests have been delivered yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">When</th>
                      <th className="py-2 pr-4 font-medium">Channel</th>
                      <th className="py-2 pr-4 font-medium">Recipient</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((delivery) => (
                      <tr key={delivery.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(delivery.at)}
                        </td>
                        <td className="py-2 pr-4">{CHANNEL_LABEL[delivery.channel]}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{delivery.recipient}</td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant="outline"
                            className={
                              delivery.status === "sent"
                                ? "border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low)]/10 text-[color:var(--risk-low)]"
                                : delivery.status === "failed"
                                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                                  : ""
                            }
                          >
                            {delivery.status}
                          </Badge>
                        </td>
                        <td className="py-2 text-muted-foreground">{delivery.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
