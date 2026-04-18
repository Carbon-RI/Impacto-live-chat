export const VANCOUVER_TZ = "America/Vancouver";
export const LOCALE = "en-CA";

/**
 * Convert `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`, no TZ)
 * from the browser's local wall-clock interpretation to UTC ISO8601 (with Z).
 * Always run this before sending to DB timestamptz fields.
 */
export function datetimeLocalInputToUtcIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("empty_datetime");
  }
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  const date = new Date(withSeconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_datetime_local");
  }
  return date.toISOString();
}

export function formatDateTime(input: string | number | Date): string {
  const date = new Date(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: VANCOUVER_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Chat metadata line 1 — e.g. `Apr 17, 2026` (Vancouver wall time). */
export function formatChatMessageDateLine(input: string | number | Date): string {
  const date = new Date(input);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: VANCOUVER_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Chat metadata line 2 time portion — e.g. `11:00 p.m.` (lowercase a.m./p.m.). */
export function formatChatMessageTimeOnly(input: string | number | Date): string {
  const date = new Date(input);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: VANCOUVER_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return formatted.replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: VANCOUVER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** For manual verification/debugging only (not used in production logic). */
export function describeDateForDebug(value: string | number | Date) {
  const parsed = new Date(value);
  return {
    raw: value,
    parsed: Number.isNaN(parsed.getTime()) ? null : parsed.toString(),
    iso: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
  };
}
