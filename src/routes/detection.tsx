import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  ImageIcon,
  Loader2,
  ShieldAlert,
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
import { DISEASE_LIBRARY, DISEASE_SAMPLES } from "@/lib/disease-library";
import {
  classifyLeaf,
  fetchModelMetadata,
  isModelLoaded,
  type ModelMetadata,
} from "@/lib/classifier";
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
  top?: { label: string; probability: number }[];
};

type Stage = "idle" | "loading" | "inferring" | "saving";

function Detection() {
  const { blocks, detections } = Route.useLoaderData() as {
    blocks: { id: string; name: string; crop: Crop }[];
    detections: {
      id: string;
      disease: string;
      crop: Crop;
      block: string;
      severity: "Low" | "Medium" | "High" | "Critical";
      recordedAt: string;
    }[];
  };
  const router = useRouter();

  const [crop, setCrop] = useState<Crop>("Citrus");
  const [selected, setSelected] = useState<string>("hlb");
  const [blockId, setBlockId] = useState<string>(blocks[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ModelMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const busy = stage !== "idle";
  const sample = DISEASE_LIBRARY[selected];
  const filtered = DISEASE_SAMPLES.filter((s) => s.crop === crop);
  const cropBlocks = blocks.filter((block) => block.crop === crop);

  const cropCovered = metadata ? metadata.crop === crop : false;
  const sampleLabel = sample ? (sample.modelLabel ?? sample.name) : "";
  const sampleCovered = metadata ? metadata.classes.includes(sampleLabel) : false;

  useEffect(() => {
    let cancelled = false;
    fetchModelMetadata()
      .then((value) => {
        if (!cancelled) setMetadata(value);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setMetadataError(caught instanceof Error ? caught.message : "Model metadata unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!metadata || !cropCovered) {
      setError(
        metadata
          ? `The current model was trained on ${metadata.crop.toLowerCase()} leaves only.`
          : "The model has not loaded yet.",
      );
      return;
    }

    setError(null);
    setStage(isModelLoaded() ? "inferring" : "loading");
    try {
      const prediction = await classifyLeaf(file);
      setStage("saving");
      const result = await runDetection({
        data: {
          fileName: file.name,
          crop,
          blockId,
          sizeBytes: file.size,
          prediction: { label: prediction.label, confidence: prediction.confidence },
        },
      });
      setScan({ ...result, top: prediction.top });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await router.invalidate();
    } catch (caught) {
      console.error(caught);
      setError(caught instanceof Error ? caught.message : "The scan could not be completed.");
    } finally {
      setStage("idle");
    }
  };

  const recent = detections.filter((detection) => detection.crop === crop).slice(0, 6);

  const stageLabel =
    stage === "loading"
      ? "Loading model…"
      : stage === "inferring"
        ? "Analysing…"
        : stage === "saving"
          ? "Saving…"
          : "Run scan";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Disease Detection"
        description="Upload a leaf image. Inference runs in your browser and the result is recorded against the block."
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

              <Button
                className="w-full"
                disabled={!file || busy || !cropCovered}
                onClick={upload}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {stageLabel}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Run scan
                  </>
                )}
              </Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {!cropCovered && metadata && (
                <p className="text-xs text-muted-foreground">
                  No {crop.toLowerCase()} weights are installed, so scanning is disabled for this
                  crop. The model was trained on {metadata.crop.toLowerCase()} leaves.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-primary" /> Model
              </CardTitle>
              <CardDescription>
                {metadata
                  ? `${metadata.id} · ${metadata.variant} · ${(metadata.sizeBytes / 1e6).toFixed(1)} MB`
                  : (metadataError ?? "Reading model metadata…")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {metadata ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {metadata.classes.map((label) => (
                      <Badge key={label} variant="outline" className="font-normal">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Held-out test accuracy</span>
                    <span className="font-medium tabular-nums">
                      {(metadata.metrics.testAccuracy * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {metadata.metrics.testImages} test images, never seen during training. Trained on{" "}
                    {metadata.training.dataset}.
                  </div>
                  <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Inference runs on this device; the image is not uploaded. Results are advisory
                      — confirm unusual cases with an agronomist.
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">
                  {metadataError
                    ? "The detection model could not be loaded. Scans are disabled until it is available."
                    : "Loading…"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reference cases</CardTitle>
              <CardDescription>
                Agronomy notes for known {crop.toLowerCase()} cases — not scan results
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
                  <div className="text-[11px] text-muted-foreground">{s.crop} reference</div>
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
                      {scan.model ? ` · ${scan.model}` : ""}
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
              <CardContent className="space-y-3">
                {scan.top && scan.top.length > 1 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Model output
                    </div>
                    {scan.top.map((entry, index) => (
                      <div key={entry.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={
                              index === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                            }
                          >
                            {entry.label}
                          </span>
                          <span className="tabular-nums">{entry.probability}%</span>
                        </div>
                        <Progress value={entry.probability} className="mt-1 h-1.5" />
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  The scan was recorded against {scan.block} and added to the block&apos;s detection
                  history and audit trail.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {sample ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{sample.name}</CardTitle>
                      {sample.escalate ? (
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
                  <Badge variant={sampleCovered ? "secondary" : "outline"} className="font-normal">
                    {sampleCovered ? "Covered by model" : "No model coverage"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{sample.description}</p>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Likely visual indicators
                  </div>
                  <ul className="space-y-1">
                    {sample.indicators.map((indicator) => (
                      <li key={indicator} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {indicator}
                      </li>
                    ))}
                  </ul>
                </div>
                {sampleCovered && metadata ? (
                  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">Recall on held-out test set</span>
                    <span className="font-medium tabular-nums">
                      {((metadata.metrics.perClassRecall[sampleLabel] ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                ) : null}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="h-4 w-4 text-accent" /> Recommended action
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{sample.recommendation}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

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
      </div>
    </div>
  );
}
