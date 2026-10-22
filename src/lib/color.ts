/**
 * Colour helpers for the map.
 *
 * The design system is built on `oklch()` custom properties, but MapLibre
 * parses colours with the mapbox style-spec parser, which only understands
 * RGB. These helpers read the live design token and convert it to sRGB so the
 * map always matches the theme, in light and dark mode.
 */

/** Converts an oklch colour to 8-bit sRGB. */
export function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const encode = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    const gamma =
      clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(gamma * 255);
  };

  return [encode(r), encode(g), encode(bl)];
}

/** Parses a CSS colour string into an sRGB hex triplet, when possible. */
export function parseCssColor(input: string): string | undefined {
  const value = input.trim();
  if (!value) return undefined;

  const oklch = value.match(
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i,
  );
  if (oklch) {
    const toUnit = (raw: string, scale: number) =>
      raw.endsWith("%") ? (parseFloat(raw) / 100) * scale : parseFloat(raw);
    const L = toUnit(oklch[1], 1);
    const C = toUnit(oklch[2], 0.4);
    const H = parseFloat(oklch[3]);
    const alpha = oklch[4] === undefined ? 1 : toUnit(oklch[4], 1);
    const [r, g, b] = oklchToRgb(L, C, H);
    return alpha >= 1
      ? `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`
      : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((c) => Math.round(parseFloat(c)).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    return value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value.toLowerCase();
  }

  return undefined;
}

/**
 * Reads a CSS custom property from the document root and converts it to a
 * colour MapLibre can use. Falls back to the supplied value when the token
 * cannot be resolved (for example during server rendering).
 */
export function resolveThemeColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return parseCssColor(raw) ?? fallback;
}

/** Resolves a whole set of design tokens at once. */
export function resolveThemeColors(
  tokens: Record<string, string>,
  fallbacks: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, variable] of Object.entries(tokens)) {
    resolved[key] = resolveThemeColor(variable, fallbacks[key] ?? "#64748b");
  }
  return resolved;
}
