import type { Block } from "./types";

/**
 * Estate geometry.
 *
 * The estate sits in the Marrakech-Safi corridor of Morocco. Coordinates are
 * real WGS84 (lng, lat) so the polygons render correctly on any basemap.
 * Each block is a quad with a little rotation so the map reads as an orchard
 * layout rather than a spreadsheet of rectangles.
 */

export type Polygon = [number, number][];

export type BlockGeometry = {
  id: string;
  ring: Polygon;
  centroid: [number, number];
};

const DEG = 0.01;

function quad(
  center: [number, number],
  width: number,
  height: number,
  rotationDeg: number,
): Polygon {
  const rot = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const hw = width / 2;
  const hh = height / 2;

  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];

  return corners.map(([x, y]) => [
    Number((center[0] + x * cos - y * sin).toFixed(6)),
    Number((center[1] + x * sin + y * cos).toFixed(6)),
  ]);
}

/** Closed ring (first point repeated) as required by GeoJSON polygons. */
function close(ring: Polygon): Polygon {
  return [...ring, ring[0]];
}

export const BLOCK_GEOMETRY: Record<string, BlockGeometry> = {
  cn: {
    id: "cn",
    ring: close(quad([-7.9625, 31.6745], DEG * 3.1, DEG * 2.4, -6)),
    centroid: [-7.9625, 31.6745],
  },
  ce: {
    id: "ce",
    ring: close(quad([-7.9105, 31.6705], DEG * 3.0, DEG * 2.3, 5)),
    centroid: [-7.9105, 31.6705],
  },
  os: {
    id: "os",
    ring: close(quad([-7.9665, 31.6135], DEG * 3.2, DEG * 2.5, 4)),
    centroid: [-7.9665, 31.6135],
  },
  ow: {
    id: "ow",
    ring: close(quad([-7.9065, 31.6095], DEG * 3.0, DEG * 2.4, -5)),
    centroid: [-7.9065, 31.6095],
  },
};

export const ESTATE_CENTER: [number, number] = [-7.9365, 31.642];

/**
 * Builds a GeoJSON FeatureCollection of the estate blocks.
 * Kept dependency-free so both the server and the map component can use it.
 */
export function buildBlockGeoJson(
  blocks: Block[],
  riskColors: Record<string, string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: blocks.map((block) => {
      const geometry = BLOCK_GEOMETRY[block.id];
      const color = riskColors[block.risk] ?? "#64748b";
      return {
        type: "Feature",
        id: block.id,
        properties: {
          id: block.id,
          name: block.name,
          crop: block.crop,
          area: block.area,
          risk: block.risk,
          detections: block.detections,
          urgent: block.urgent,
          health: block.health,
          color,
        },
        geometry: {
          type: "Polygon",
          coordinates: [geometry ? geometry.ring : []],
        },
      } as GeoJSON.Feature;
    }),
  };
}

/** Basemap tiles. OpenStreetMap's standard tiles need no API key and work
 * everywhere. If you prefer CARTO and have an API key, override with the
 * VITE_MAP_LIGHT_TILES / VITE_MAP_DARK_TILES environment variables. */
export const BASEMAPS = {
  light: import.meta.env.VITE_MAP_LIGHT_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: import.meta.env.VITE_MAP_DARK_TILES ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
