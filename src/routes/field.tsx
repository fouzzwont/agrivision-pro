import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, NotebookPen, Search } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge } from "@/components/severity-badge";
import { addFieldNote, getFieldOverview } from "@/api/inspections";
import type { Severity } from "@/lib/types";

export const Route = createFileRoute("/field")({
  head: () => ({
    meta: [
      { title: "Field Monitoring — AgriVision" },
      {
        name: "description",
        content: "Field-level inspections, scan history and crop trends.",
      },
    ],
  }),
  loader: () => getFieldOverview(),
  component: Field,
});

const SEVERITY_COLOR: Record<Severity, string> = {
  Low: "var(--risk-low)",
  Medium: "var(--risk-medium)",
  High: "var(--risk-high)",
  Critical: "var(--risk-urgent)",
};

function Field() {
  const { inspections, notes, blocks, trend, severityDistribution } = Route.useLoaderData();
  const router = useRouter();

  const [q, setQ] = useState("");
  const [crop, setCrop] = useState("all");
  const [block, setBlock] = useState("all");
  const [note, setNote] = useState("");
  const [noteBlock, setNoteBlock] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const rows = inspections
    .filter((row) => {
      if (crop !== "all" && row.crop.toLowerCase() !== crop) return false;
      if (block !== "all" && row.blockId !== block) return false;
      if (q && !`${row.disease} ${row.block} ${row.source}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const submitNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    setNoteError(null);
    try {
      await addFieldNote({
        data: {
          note: note.trim(),
          blockId: noteBlock === "all" ? undefined : noteBlock,
        },
      });
      setNote("");
      await router.invalidate();
    } catch (caught) {
      console.error(caught);
      setNoteError(caught instanceof Error ? caught.message : "The note could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Field Monitoring"
        description="Inspections, scan timeline and crop health trends across all blocks."
        actions={
          <Badge variant="outline">
            {inspections.length} inspections · {notes.length} notes
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detections over time</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="detections"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Healthy scans</CardTitle>
            <CardDescription>Healthy samples per session</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="healthy" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Severity distribution</CardTitle>
            <CardDescription>This week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={severityDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {severityDistribution.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLOR[entry.name] ?? "var(--muted)"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {severityDistribution.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: SEVERITY_COLOR[entry.name] }}
                  />
                  {entry.name} · {entry.value}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Inspections</CardTitle>
            <CardDescription>{rows.length} records</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search disease, block..."
                aria-label="Search inspections"
                className="h-9 w-[220px] pl-8"
              />
            </div>
            <Select value={crop} onValueChange={setCrop}>
              <SelectTrigger className="h-9 w-[120px]" aria-label="Filter by crop">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All crops</SelectItem>
                <SelectItem value="citrus">Citrus</SelectItem>
                <SelectItem value="olive">Olive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={block} onValueChange={setBlock}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by block">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All blocks</SelectItem>
                {blocks.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Crop</TableHead>
                <TableHead>Disease</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground">{row.date.slice(0, 10)}</TableCell>
                  <TableCell className="font-medium">{row.block}</TableCell>
                  <TableCell>{row.crop}</TableCell>
                  <TableCell>{row.disease}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.confidence}%</TableCell>
                  <TableCell>
                    <SeverityBadge level={row.severity} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.source}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No inspection matches the current filters.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <NotebookPen className="h-4 w-4" /> Field notes
            </CardTitle>
            <CardDescription>Agronomy observations from scouts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {notes.map((entry) => (
              <div key={entry.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.author}</span>
                  <span>{entry.date}</span>
                </div>
                <p className="mt-1 text-sm">{entry.note}</p>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="text-sm text-muted-foreground">No field notes recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a scouting note</CardTitle>
            <CardDescription>Notes are appended to the block&apos;s audit trail</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="note-block" className="text-xs font-medium text-muted-foreground">
                Block (optional)
              </Label>
              <Select value={noteBlock} onValueChange={setNoteBlock}>
                <SelectTrigger id="note-block" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Estate-wide</SelectItem>
                  {blocks.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Observed canopy density blocking airflow after irrigation…"
              aria-label="New field note"
            />
            <Button className="w-full" disabled={busy || !note.trim()} onClick={submitNote}>
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save note"
              )}
            </Button>
            {noteError && <p className="text-xs text-destructive">{noteError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
