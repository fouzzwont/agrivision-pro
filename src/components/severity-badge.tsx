import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  Critical: "bg-[color:var(--risk-urgent)]/15 text-[color:var(--risk-urgent)] border-[color:var(--risk-urgent)]/30",
  High: "bg-[color:var(--risk-high)]/15 text-[color:var(--risk-high)] border-[color:var(--risk-high)]/30",
  Medium: "bg-[color:var(--risk-medium)]/20 text-[color:var(--risk-medium)] border-[color:var(--risk-medium)]/40",
  Low: "bg-[color:var(--risk-low)]/15 text-[color:var(--risk-low)] border-[color:var(--risk-low)]/30",
  urgent: "bg-[color:var(--risk-urgent)]/15 text-[color:var(--risk-urgent)] border-[color:var(--risk-urgent)]/30",
  high: "bg-[color:var(--risk-high)]/15 text-[color:var(--risk-high)] border-[color:var(--risk-high)]/30",
  medium: "bg-[color:var(--risk-medium)]/20 text-[color:var(--risk-medium)] border-[color:var(--risk-medium)]/40",
  low: "bg-[color:var(--risk-low)]/15 text-[color:var(--risk-low)] border-[color:var(--risk-low)]/30",
};

export function SeverityBadge({ level, className }: { level: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border font-medium capitalize", map[level] ?? "", className)}>
      {level}
    </Badge>
  );
}
