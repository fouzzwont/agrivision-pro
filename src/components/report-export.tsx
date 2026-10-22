import { useState } from "react";
import { Download, FileDown, Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { ReportPayload } from "@/lib/types";

/**
 * Report export.
 *
 * The report *content* is produced on the server by the agronomy models; this
 * component only renders it. The PDF engine is imported dynamically so the
 * ~350 kB library is only downloaded when a user actually exports.
 */

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function csvRows(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function buildCsv(report: ReportPayload): string {
  const sections: string[] = [];

  sections.push(
    csvRows([
      ["AgriVision report", report.title],
      ["Farm", report.farm.name],
      ["Region", report.farm.region],
      [
        "Scope",
        `${report.scope.crop} / ${report.scope.block} / last ${report.scope.rangeDays} days`,
      ],
      ["Generated at", report.generatedAt],
    ]),
  );

  sections.push(csvRows([["Summary"], [report.summary]]));

  sections.push(
    csvRows([["Metric", "Value"], ...report.metrics.map((metric) => [metric.label, metric.value])]),
  );

  if (report.risks.length) {
    sections.push(csvRows([["Risk"], ...report.risks.map((risk) => [risk])]));
  }

  if (report.nextSteps.length) {
    sections.push(csvRows([["Next step"], ...report.nextSteps.map((step) => [step])]));
  }

  sections.push(csvRows([["Block report"], report.blockTable.head, ...report.blockTable.rows]));

  sections.push(
    csvRows([["Detection log"], report.detectionsTable.head, ...report.detectionsTable.rows]),
  );

  return sections.join("\r\n\r\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ReportExport({ report, className }: { report: ReportPayload; className?: string }) {
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseName = `agrivision-${report.type}-${report.generatedAt.slice(0, 10)}`;

  const exportPdf = async () => {
    setBusy("pdf");
    setError(null);
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 40;
      const pageWidth = doc.internal.pageSize.getWidth();
      let cursor = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(`AgriVision — ${report.title}`, margin, cursor);

      cursor += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(
        `${report.farm.name} · ${report.farm.region} · ${report.farm.totalArea} ha`,
        margin,
        cursor,
      );

      cursor += 14;
      doc.text(
        `Scope: ${report.scope.crop} / ${report.scope.block} / last ${report.scope.rangeDays} days`,
        margin,
        cursor,
      );

      cursor += 14;
      doc.text(`Generated: ${formatDateTime(report.generatedAt)}`, margin, cursor);

      cursor += 24;
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Summary", margin, cursor);

      cursor += 15;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(report.summary, pageWidth - margin * 2) as string[];
      doc.text(summaryLines, margin, cursor);
      cursor += summaryLines.length * 13 + 12;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Key metrics", margin, cursor);
      cursor += 6;

      autoTable(doc, {
        startY: cursor,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [236, 238, 232], textColor: [30, 34, 40] },
        body: report.metrics.map((metric) => [metric.label, metric.value]),
      });

      // @ts-expect-error autoTable augments the doc object at runtime
      cursor = doc.lastAutoTable.finalY + 18;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Risk assessment", margin, cursor);
      cursor += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const risk of report.risks) {
        const lines = doc.splitTextToSize(`• ${risk}`, pageWidth - margin * 2) as string[];
        doc.text(lines, margin, cursor);
        cursor += lines.length * 12 + 4;
      }

      cursor += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Recommended next steps", margin, cursor);
      cursor += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      report.nextSteps.forEach((step, index) => {
        const lines = doc.splitTextToSize(
          `${index + 1}. ${step}`,
          pageWidth - margin * 2,
        ) as string[];
        doc.text(lines, margin, cursor);
        cursor += lines.length * 12 + 4;
      });

      cursor += 14;
      autoTable(doc, {
        startY: cursor,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [236, 238, 232], textColor: [30, 34, 40] },
        head: [report.blockTable.head],
        body: report.blockTable.rows,
      });

      if (report.detectionsTable.rows.length) {
        // @ts-expect-error autoTable augments the doc object at runtime
        cursor = doc.lastAutoTable.finalY + 18;
        autoTable(doc, {
          startY: cursor,
          margin: { left: margin, right: margin },
          styles: { fontSize: 7.5, cellPadding: 4 },
          headStyles: { fillColor: [236, 238, 232], textColor: [30, 34, 40] },
          head: [report.detectionsTable.head],
          body: report.detectionsTable.rows,
        });
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `AgriVision · ${report.farm.name} · page ${page} of ${pages}`,
          margin,
          doc.internal.pageSize.getHeight() - 20,
        );
      }

      doc.save(`${baseName}.pdf`);
    } catch (caught) {
      console.error(caught);
      setError("The PDF could not be generated. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    setBusy("csv");
    setError(null);
    try {
      const csv = buildCsv(report);
      // The BOM keeps Excel from mangling the accented block names.
      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });
      downloadBlob(blob, `${baseName}.csv`);
    } catch (caught) {
      console.error(caught);
      setError("The CSV could not be generated. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={exportPdf} disabled={busy !== null}>
          <FileDown className="mr-1.5 h-4 w-4" />
          {busy === "pdf" ? "Preparing PDF…" : "Export PDF"}
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={busy !== null}>
          <TableIcon className="mr-1.5 h-4 w-4" />
          {busy === "csv" ? "Preparing CSV…" : "Export CSV"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Download className="h-3 w-3" />
        {slugify(report.title)} · generated {formatDateTime(report.generatedAt)}
      </p>
    </div>
  );
}
