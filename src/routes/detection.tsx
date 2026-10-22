import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { DISEASE_LIBRARY, DISEASE_SAMPLES, classifySample } from "@/lib/disease-library";
import { getBlocks } from "@/api/blocks";
import { getDetections, runDetection } from "@/api/detections";
import { formatDateTime } from "@/lib/format";
import type { Crop } from "@/lib/types";

export const Route = createFileRoute("/detection")({
  head: () => ({
    meta: [
      { title: "Disease Detection — AgriVision" },
      {
        name: "description",
        content: "AI-assisted disease detection for olive and citrus leaf scans.",
      },
    ],
  }),
  loader: async () => {
    const [blocks, detections] = await Promise.all([getBlocks(), getDetections()]);
    return { blocks, detections };
  },
  component: Detection,
});

type ScanResult = {
  disease: string;
  crop: Crop;
  confidence: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  recordedAt: string;
  block: string;
  fileName?: string;
  model?: string;
};

function Detection() {
  const { blocks, detections } = Route.useLoaderData();
  const router = useRouter();

  const [crop, setCrop] = useState<Crop>("Citrus");
  const [selected, setSelected] = useState<string>("hlb");
  const [blockId, setBlockId] = useState<string>(blocks[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sample = DISEASE_LIBRARY[selected];
  const verdict = classifySample(sample);
  const filtered = DISEASE_SAMPLES.filter((s) => s.crop === crop);

  const cropBlocks = blocks.filter((block) => block.crop === crop);

  /**
   * Switching crops resets the reference sample, because the selected sample
   * belongs to the previous crop's disease set.
   */
  const changeCrop = (next: Crop) => {
    setCrop(next);
    const first = DISEASE_SAMPLES.find((s) => s.crop === next);
    if (first) setSelected(first.key);
    const firstBlock = blocks.find((block) => block.crop === next);
    if (firstBlock) setBlockId(firstBlock.id);
  };

  const pickFile = (next: File | undefined) => {
    if (!next) return;
    if (!/^image\/(jpeg|png|webp)$/.test(next.type)) {
      setError("Only JPG, PNG or WebP images are supported.");
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError("Images must be 10 MB or smaller.");
      return;
    }
    setError(null);
    setFile(next);
  };

  const upload = async () => {
    if (!file) return;
    if (!blockId) {
      setError("Choose the block the capture belongs to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await runDetection({
        data: {
          fileName: file.name,
          crop,
          blockId,
          sizeBytes: file.size,
        },
      });
      setScan(result);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await router.invalidate();
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "The scan could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const recent = detections.filter((detection) => detection.crop === crop).slice(0, 6);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Disease Detection"
        description="Upload a leaf image or run a reference scan. Results return in seconds."
        actions={
          <Tabs value={crop} onValueChange={(value) => changeCrop(value as Crop)}>
            <TabsList>
              <TabsTrigger value="Citrus">Citrus</TabsTrigger>
              <TabsTrigger value="Olive">Olive</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload leaf image</CardTitle>
              <CardDescription>Supported: JPG, PNG, WebP up to 10 MB</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 text-center transition hover:border-primary/40">
                <div className="rounded-full bg-primary/10 p-3 text-primary">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium">
                  {file ? file.name : "Drop image here, or browse"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Best results: single leaf, daylight, neutral background
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Leaf image"
                  onChange={(event) => pickFile(event.target.files?.[0])}
                />
                <Button size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
              </div>

              <div>
                <Label htmlFor="scan-block" className="text-xs font-medium text-muted-foreground">
                  Block
                </Label>
                <Select value={blockId} onValueChange={setBlockId}>
                  <SelectTrigger id="scan-block" className="mt-1">
                    <SelectValue placeholder="Select a block" />
                  </SelectTrigger>
                  <SelectContent>
                    {cropBlocks.map((block) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" disabled={!file || busy} onClick={upload}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Analysing…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Run scan
                  </>
                )}
              </Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reference samples</CardTitle>
              <CardDescription>
                Preview the model output for a known {crop.toLowerCase()} case
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {filtered.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSelected(s.key)}
                  aria-pressed={selected === s.key}
                  className={`group flex flex-col rounded-lg border p-3 text-left transition hover:border-primary/40 ${
                    selected === s.key ? "border-primary bg-primary/5" : "bg-card"
                  }`}
                >
                  <div className="flex h-20 items-center justify-center rounded-md bg-gradient-to-br from-primary/10 via-accent/10 to-muted">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-xs font-medium">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground">{s.crop} sample</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-3">
          {scan ? (
            <Card className="border-primary/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{scan.disease}</CardTitle>
                      <Badge
                        variant="outline"
                        className={
                          scan.severity === "Low"
                            ? "border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low)]/10 text-[color:var(--risk-low)]"
                            : "border-[color:var(--risk-urgent)]/40 bg-[color:var(--risk-urgent)]/10 text-[color:var(--risk-urgent)]"
                        }
                      >
                        {scan.severity === "Low" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        )}
                        {scan.severity === "Low" ? "No escalation" : "Escalate"}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1">
                      {scan.block} · {scan.fileName ?? "capture"} ·{" "}
                      {formatDateTime(scan.recordedAt)}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-semibold tabular-nums text-primary">
                      {scan.confidence}%
                    </div>
                    <div className="text-xs text-muted-foreground">Confidence</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  The scan was recorded against {scan.block} and added to the block&apos;s detection
                  history and audit trail.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{sample.name}</CardTitle>
                    {verdict.verdict === "Diseased" ? (
                      <Badge
                        variant="outline"
                        className="border-[color:var(--risk-urgent)]/40 bg-[color:var(--risk-urgent)]/10 text-[color:var(--risk-urgent)]"
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" /> Escalate
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-[color:var(--risk-low)]/40 bg-[color:var(--risk-low)]/10 text-[color:var(--risk-low)]"
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" /> No escalation
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">{sample.crop} · reference case</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-semibold tabular-nums text-primary">
                    {verdict.confidence}%
                  </div>
                  <div className="text-xs text-muted-foreground">Confidence</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{sample.description}</p>
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Probability breakdown
                </div>
                <div className="space-y-2">
                  {sample.probabilities.map((p, i) => (
                    <div key={p.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={
                            i === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                          }
                        >
                          {p.label}
                        </span>
                        <span className="tabular-nums">{p.value}%</span>
                      </div>
                      <Progress value={p.value} className="mt-1 h-1.5" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-accent" /> Recommended action
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{sample.recommendation}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI explanation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Likely visual indicators
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {sample.indicators.map((indicator) => (
                      <li key={indicator} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {indicator}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  Why this matters: early identification reduces yield loss and limits inoculum
                  spread to neighboring blocks.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent {crop.toLowerCase()} scans</CardTitle>
                <CardDescription>Latest detections on the estate</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {recent.map((detection) => (
                  <div
                    key={detection.id}
                    className="flex items-start justify-between gap-2 border-b pb-2 text-xs last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{detection.disease}</div>
                      <div className="text-muted-foreground">
                        {detection.block} · {detection.recordedAt.slice(0, 10)}
                      </div>
                    </div>
                    <SeverityBadge level={detection.severity} />
                  </div>
                ))}
                {recent.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No {crop.toLowerCase()} detections recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="text-sm">
              <div className="font-medium">{verdict.verdict} indicator</div>
              <div className="text-xs text-muted-foreground">
                Severity score: {verdict.severity}
              </div>
            </div>
            <SeverityBadge level={verdict.severity} />
          </div>
        </div>
      </div>
    </div>
  );
}
