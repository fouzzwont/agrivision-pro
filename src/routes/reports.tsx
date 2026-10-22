import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ReportExport } from "@/components/report-export";
import { getReport } from "@/api/reports";
import { formatDateTime } from "@/lib/format";
import type { ReportType } from "@/lib/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — AgriVision" },
      {
        name: "description",
        content: "Generate and review disease, risk and field operations reports.",
      },
    ],
  }),
  loader: () =>
    getReport({ data: { type: "disease", crop: "all", blockId: "all", rangeDays: 14 } }),
  component: Reports,
});

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "disease", label: "Disease summary" },
  { value: "risk", label: "Risk summary" },
  { value: "field", label: "Field operations summary" },
  { value: "yield", label: "Yield risk summary" },
];

const BLOCKS = [
  { value: "all", label: "All blocks" },
  { value: "cn", label: "Citrus North" },
  { value: "ce", label: "Citrus East" },
  { value: "os", label: "Olive South" },
  { value: "ow", label: "Olive West" },
];

export function Reports() {
  const initial = Route.useLoaderData();
  const navigate = useNavigate();
  const [report, setReport] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<ReportType>("disease");
  const [crop, setCrop] = useState("all");
  const [blockId, setBlockId] = useState("all");
  const [rangeDays, setRangeDays] = useState(14);

  const generate = async () => {
    setLoading(true);
    try {
      const next = await getReport({ data: { type, crop, blockId, rangeDays } });
      setReport(next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Reports"
        description="Generate executive-ready reports for farm managers and agronomy teams."
        actions={<ReportExport report={report} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Generate report</CardTitle>
            <CardDescription>Select scope and export format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="report-type" className="text-xs font-medium text-muted-foreground">
                Report type
              </Label>
              <Select value={type} onValueChange={(value) => setType(value as ReportType)}>
                <SelectTrigger id="report-type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-crop" className="text-xs font-medium text-muted-foreground">
                Crop
              </Label>
              <Select value={crop} onValueChange={setCrop}>
                <SelectTrigger id="report-crop" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All crops</SelectItem>
                  <SelectItem value="citrus">Citrus</SelectItem>
                  <SelectItem value="olive">Olive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-block" className="text-xs font-medium text-muted-foreground">
                Block
              </Label>
              <Select value={blockId} onValueChange={setBlockId}>
                <SelectTrigger id="report-block" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCKS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-range" className="text-xs font-medium text-muted-foreground">
                Date range
              </Label>
              <Select
                value={String(rangeDays)}
                onValueChange={(value) => setRangeDays(Number(value))}
              >
                <SelectTrigger id="report-range" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={generate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <FileText className="mr-1.5 h-4 w-4" />
                  Generate report
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Preview · {report.title}</CardTitle>
            <CardDescription>
              {report.farm.name} · {report.scope.crop} · {report.scope.block} · last{" "}
              {report.scope.rangeDays} days
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Executive overview
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {report.metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">{metric.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</div>
                </div>
              ))}
            </div>

            {report.risks.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Main risks
                </div>
                <ul className="mt-1 space-y-1.5 text-sm">
                  {report.risks.map((risk) => (
                    <li key={risk}>• {risk}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommended next steps
              </div>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/90">
                {report.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Block breakdown</CardTitle>
          <CardDescription>
            {report.blockTable.rows.length} blocks in the selected scope
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {report.blockTable.head.map((head) => (
                    <th key={head} className="py-2 pr-4 font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.blockTable.rows.map((row) => (
                  <tr key={row[0]} className="border-b last:border-0">
                    {row.map((cell, index) => (
                      <td key={`${row[0]}-${index}`} className="py-2 pr-4">
                        {index === 6 ? (
                          <SeverityBadge level={cell} />
                        ) : (
                          <span className={index === 0 ? "font-medium" : "text-muted-foreground"}>
                            {cell}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {report.detectionsTable.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detection log</CardTitle>
            <CardDescription>
              {report.detectionsTable.rows.length} detections in the selected window
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {report.detectionsTable.head.map((head) => (
                      <th key={head} className="py-2 pr-4 font-medium">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.detectionsTable.rows.map((row, index) => (
                    <tr key={`${row[0]}-${row[1]}-${index}`} className="border-b last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="py-2 pr-4 text-muted-foreground">
                          {cellIndex === 4 ? <SeverityBadge level={cell} /> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Generated {formatDateTime(report.generatedAt)}</Badge>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/reports" })}>
          Reset to default scope
        </Button>
      </div>
    </div>
  );
}
