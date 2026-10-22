import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Block } from "@/lib/types";
import { BASEMAPS, BASEMAP_ATTRIBUTION, ESTATE_CENTER, buildBlockGeoJson } from "@/lib/geo";
import { resolveThemeColors } from "@/lib/color";
import { useTheme } from "@/lib/theme";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Estate map.
 *
 * Renders the monitored blocks as real GeoJSON polygons over an OpenStreetMap
 * raster basemap served by CARTO (no API key required). MapLibre is imported
 * dynamically because it needs WebGL, which the server renderer does not have.
 *
 * The colour of every block comes from the live design tokens, so the map
 * follows the application theme.
 */

const RISK_TOKENS = {
  low: "--risk-low",
  medium: "--risk-medium",
  high: "--risk-high",
  urgent: "--risk-urgent",
} as const;

const RISK_FALLBACKS = {
  low: "#3fb56b",
  medium: "#e8c54f",
  high: "#f08c3c",
  urgent: "#dc3a3f",
} as const;

type MapLibreModule = typeof import("maplibre-gl");
type MapInstance = import("maplibre-gl").Map;

function buildStyle(theme: "light" | "dark") {
  return {
    version: 8 as const,
    sources: {
      basemap: {
        type: "raster" as const,
        tiles: [theme === "dark" ? BASEMAPS.dark : BASEMAPS.light],
        tileSize: 256,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "background",
        type: "background" as const,
        paint: { "background-color": theme === "dark" ? "#151a21" : "#eef1e7" },
      },
      { id: "basemap", type: "raster" as const, source: "basemap" },
    ],
  };
}

export type EstateMapProps = {
  blocks: Block[];
  selectedId?: string;
  onSelect?: (blockId: string) => void;
  className?: string;
};

export function EstateMap({ blocks, selectedId, onSelect, className }: EstateMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markersRef = useRef<Map<string, import("maplibre-gl").Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { theme } = useTheme();
  const navigate = useNavigate();

  const colors = useMemo(
    () => resolveThemeColors(RISK_TOKENS, RISK_FALLBACKS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let loadTimeout: number | undefined;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      let maplibre: MapLibreModule;
      try {
        maplibre = await import("maplibre-gl");
      } catch (error) {
        if (!cancelled) {
          setFailure(
            "The map engine could not be loaded. Check your network connection and reload.",
          );
        }
        return;
      }
      if (cancelled) return;

      // MapLibre normally derives its worker URL from `import.meta.url`, which
      // resolves to the wrong directory once the module is bundled. The worker
      // URL is resolved by the bundler instead and handed to MapLibre.
      maplibre.setWorkerUrl(maplibreWorkerUrl);

      let map: MapInstance;
      try {
        map = new maplibre.Map({
          container,
          style: buildStyle(theme),
          center: ESTATE_CENTER,
          zoom: 12.3,
          minZoom: 9,
          maxZoom: 18,
          attributionControl: false,
        });
      } catch (error) {
        console.error("[estate-map] failed to start", error);
        if (!cancelled) {
          setFailure("The map engine could not start on this device. WebGL 2 is required.");
        }
        return;
      }

      mapRef.current = map;
      map.addControl(
        new maplibre.NavigationControl({ showCompass: false, visualizePitch: false }),
        "top-right",
      );
      map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");

      // MapLibre reports non-fatal problems (a single missing tile, a 404) on
      // the same `error` channel as fatal ones, so log rather than tear the
      // map down here. A real failure is caught by the timeout below.
      map.on("error", (event) => {
        const error = event.error as Error | undefined;
        console.warn("[estate-map]", error?.message ?? error);
      });

      map.on("load", () => {
        if (cancelled) return;
        if (loadTimeout !== undefined) window.clearTimeout(loadTimeout);
        setReady(true);
      });

      // MapLibre defers style loading to requestAnimationFrame, which browsers
      // pause in background tabs. Re-arm while the tab is hidden rather than
      // reporting a failure the user cannot see or act on.
      const armLoadTimeout = () => {
        loadTimeout = window.setTimeout(() => {
          if (cancelled || map.isStyleLoaded()) return;
          if (document.hidden) {
            armLoadTimeout();
            return;
          }
          setFailure("The basemap could not be loaded. Check your connection and reload.");
        }, 20000);
      };
      armLoadTimeout();
    })();

    return () => {
      cancelled = true;
      if (loadTimeout !== undefined) window.clearTimeout(loadTimeout);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add the block source and layers once the style is loaded.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const data = buildBlockGeoJson(blocks, colors);

    if (!map.getSource("blocks")) {
      map.addSource("blocks", { type: "geojson", data });
      map.addLayer({
        id: "blocks-fill",
        type: "fill",
        source: "blocks",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.42,
        },
      });
      map.addLayer({
        id: "blocks-outline",
        type: "line",
        source: "blocks",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: "blocks-selected",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "id"], ""],
        paint: {
          "line-color": "#ffffff",
          "line-width": 4,
          "line-blur": 0.5,
        },
      });
    } else {
      const source = map.getSource("blocks") as import("maplibre-gl").GeoJSONSource;
      source.setData(data);
    }

    if (!selectedId && blocks.length > 1) {
      const lngs = blocks.map((b) => b.centroid[0]);
      const lats = blocks.map((b) => b.centroid[1]);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ];
      map.fitBounds(bounds, { padding: 72, duration: 0, maxZoom: 13.2 });
    }
  }, [blocks, colors, ready, selectedId]);

  // Keep the selected block highlighted.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("blocks-selected", ["==", ["get", "id"], selectedId ?? ""]);
  }, [selectedId, ready]);

  // Swap the basemap and the risk colours when the theme changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const basemap = map.getSource("basemap") as import("maplibre-gl").RasterTileSource | undefined;
    if (basemap) {
      basemap.setTiles([theme === "dark" ? BASEMAPS.dark : BASEMAPS.light]);
    }
    if (map.getLayer("background")) {
      map.setPaintProperty(
        "background",
        "background-color",
        theme === "dark" ? "#151a21" : "#eef1e7",
      );
    }
  }, [theme, ready]);

  // Labels are DOM markers so they inherit the theme's CSS variables.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled) return;

      for (const block of blocks) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "estate-map-label";
        element.style.setProperty("--marker-color", `var(--risk-${block.risk})`);

        const dot = document.createElement("span");
        dot.className = "estate-map-label-dot";
        const label = document.createElement("span");
        label.className = "estate-map-label-text";
        label.textContent = block.name;

        element.append(dot, label);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          if (onSelect) onSelect(block.id);
          else navigate({ to: "/blocks/$blockId", params: { blockId: block.id } });
        });

        const marker = new maplibre.Marker({ element, anchor: "center" })
          .setLngLat(block.centroid)
          .addTo(map);

        markersRef.current.set(block.id, marker);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border">
      <div ref={containerRef} className={className ?? "h-[520px] w-full"} />
      {failure && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 p-6 text-center text-sm text-muted-foreground">
          {failure}
        </div>
      )}
      {!failure && !ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 text-sm text-muted-foreground">
          Loading estate map…
        </div>
      )}
    </div>
  );
}
