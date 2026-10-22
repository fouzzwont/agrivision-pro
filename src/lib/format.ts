/**
 * Deterministic date formatting.
 *
 * `toLocaleString()` without an explicit locale renders differently on the
 * server and in the browser — the Node process and the user's browser can have
 * different locales and time zones, which makes the server-rendered markup
 * disagree with the first client render and trips React's hydration check.
 *
 * These helpers pin the locale *and* the time zone so both sides always
 * produce byte-identical output.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

const DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/** `Oct 21, 2026, 6:36 PM` */
export function formatDateTime(value: string | number | Date): string {
  return DATE_TIME.format(new Date(value));
}

/** `Oct 21, 2026` */
export function formatDate(value: string | number | Date): string {
  return DATE.format(new Date(value));
}

/** `Oct 21, 6:36 PM` */
export function formatDateTimeShort(value: string | number | Date): string {
  return DATE_TIME_SHORT.format(new Date(value));
}
