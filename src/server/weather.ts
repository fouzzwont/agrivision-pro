import type { WeatherHour, WeatherSnapshot } from "@/lib/types";

/**
 * Weather provider.
 *
 * Uses the Open-Meteo forecast API (no API key required). Results are cached
 * per location for 30 minutes so a dashboard render does not hammer the
 * upstream service. If the network is unavailable the app falls back to a
 * deterministic synthetic forecast so the agronomy models still have input
 * rather than the page breaking.
 */

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; snapshot: WeatherSnapshot }>();

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    precipitation?: number[];
  };
};

function fallbackSnapshot(latitude: number, longitude: number): WeatherSnapshot {
  const now = new Date();
  const hourly: WeatherHour[] = [];
  for (let i = 0; i < 72; i++) {
    const d = new Date(now.getTime() + i * 3600_000);
    const hour = d.getHours();
    // Diurnal temperature curve peaking around 15:00, humidity inverse to it.
    const diurnal = Math.sin(((hour - 9) / 24) * Math.PI * 2);
    const temperatureC = Number((24 + 5 * diurnal).toFixed(1));
    const humidityPct = Math.round(68 - 18 * diurnal);
    hourly.push({
      time: d.toISOString().slice(0, 16),
      temperatureC,
      humidityPct,
      precipitationMm: humidityPct > 80 ? 0.6 : 0,
    });
  }

  const current = hourly[0];
  return {
    observedAt: now.toISOString(),
    location: `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    current: {
      temperatureC: current.temperatureC,
      humidityPct: current.humidityPct,
      windKmh: 12,
      precipitationMm: current.precipitationMm,
    },
    hourly,
    source: "fallback",
    fetchedAt: now.toISOString(),
  };
}

export async function getWeather(
  latitude: number,
  longitude: number,
  location: string,
): Promise<WeatherSnapshot> {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
  );
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,precipitation");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`open-meteo responded ${response.status}`);

    const payload = (await response.json()) as OpenMeteoResponse;
    const times = payload.hourly?.time ?? [];
    const temps = payload.hourly?.temperature_2m ?? [];
    const humidity = payload.hourly?.relative_humidity_2m ?? [];
    const precipitation = payload.hourly?.precipitation ?? [];

    const hourly: WeatherHour[] = times.map((time, index) => ({
      time,
      temperatureC: temps[index] ?? 0,
      humidityPct: humidity[index] ?? 0,
      precipitationMm: precipitation[index] ?? 0,
    }));

    if (hourly.length === 0) throw new Error("open-meteo returned no hourly data");

    const snapshot: WeatherSnapshot = {
      observedAt: payload.current?.time ?? new Date().toISOString(),
      location,
      current: {
        temperatureC: payload.current?.temperature_2m ?? hourly[0].temperatureC,
        humidityPct: payload.current?.relative_humidity_2m ?? hourly[0].humidityPct,
        windKmh: payload.current?.wind_speed_10m ?? 0,
        precipitationMm: payload.current?.precipitation ?? 0,
      },
      hourly,
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
    };

    cache.set(key, { at: Date.now(), snapshot });
    return snapshot;
  } catch (error) {
    console.error("[weather] fetch failed, using fallback", error);
    const fallback = fallbackSnapshot(latitude, longitude);
    cache.set(key, { at: Date.now() - CACHE_TTL_MS + 60_000, snapshot: fallback });
    return fallback;
  }
}

/** Cache-busting helper used by the scheduled digest so it sees fresh data. */
export function invalidateWeatherCache() {
  cache.clear();
}
