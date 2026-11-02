import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, Bell, ChevronDown, Leaf, Moon, Search, Sun } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import { searchEstate } from "@/api/search";
import { getAlertSummary } from "@/api/alerts";
import type { Alert, Block, Detection } from "@/lib/types";

type AlertSummary = { open: number; critical: number; high: number };

type Results = {
  blocks: Block[];
  alerts: Alert[];
  detections: Detection[];
};

const EMPTY: Results = { blocks: [], alerts: [], detections: [] };

export function Topbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [open, setOpen] = useState(false);
  const [fallback, setFallback] = useState<AlertSummary | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // The root route loader carries the estate-wide alert counters, so the badge
  // shows the same number on every screen and is server-rendered correctly.
  //
  // The router's `select` runs on every state update, so the value it returns
  // has to be a stable primitive: a new object here would re-render forever.
  const loaderSummary = useMatches({
    select: (matches) => {
      const root = matches.find((match) => match.id.startsWith("__root__"));
      const summary = (root?.loaderData as { alertSummary?: AlertSummary } | undefined)
        ?.alertSummary;
      if (!summary) return "";
      return `${summary.open}|${summary.critical}|${summary.high}`;
    },
  });

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Read straight from the loader during render so the server-rendered badge
  // already carries the right number.
  const summary = useMemo<AlertSummary | null>(() => {
    if (!loaderSummary) return fallback;
    const [openCount, criticalCount, highCount] = loaderSummary.split("|").map(Number);
    return { open: openCount, critical: criticalCount, high: highCount };
  }, [loaderSummary, fallback]);

  useEffect(() => {
    if (loaderSummary) return;

    // Screens rendered before the root loader resolved ask the server for the
    // counts instead.
    let cancelled = false;
    void getAlertSummary().then((next) => {
      if (!cancelled) setFallback(next);
    });

    return () => {
      cancelled = true;
    };
  }, [loaderSummary, pathname]);

  // Debounced global search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(EMPTY);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void searchEstate({ data: { query: trimmed } }).then((response) => {
        if (cancelled) return;
        setResults({
          blocks: response.blocks,
          alerts: response.alerts,
          detections: response.detections,
        });
      });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Close the result panel when the user clicks outside of it.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const total = results.blocks.length + results.alerts.length + results.detections.length;

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    void navigate({ to: path });
  };

  const badgeCount = summary?.open ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-sm">
      <SidebarTrigger />
      <div className="hidden items-center gap-2 md:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
              <span className="h-2 w-2 rounded-full bg-primary" />
              FOMACOP Estate
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Estate</DropdownMenuLabel>
            <DropdownMenuItem>FOMACOP Estate</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={containerRef} className="relative ml-auto flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search blocks, diseases, alerts..."
          aria-label="Search the estate"
          className="h-9 pl-9"
        />

        {open && query.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
            {total === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto py-1">
                {results.blocks.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Blocks
                    </p>
                    {results.blocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => go(`/blocks/${block.id}`)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <Leaf className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{block.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {block.crop} · {block.area} ha
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {results.alerts.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Alerts
                    </p>
                    {results.alerts.map((alert) => (
                      <button
                        key={alert.id}
                        type="button"
                        onClick={() => go(`/blocks/${alert.blockId}`)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{alert.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {alert.severity}
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {results.detections.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Detections
                    </p>
                    {results.detections.map((detection) => (
                      <button
                        key={detection.id}
                        type="button"
                        onClick={() => go(`/blocks/${detection.blockId}`)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="truncate">{detection.disease}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {detection.block}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Button
        asChild
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={summary ? `Notifications, ${summary.open} open` : "Notifications"}
      >
        <Link to="/alerts">
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-destructive p-0 text-[10px] text-destructive-foreground">
              {badgeCount}
            </Badge>
          )}
        </Link>
      </Button>

      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                KB
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium md:inline">K. Bensaid</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Karim Bensaid</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">Farm settings</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
