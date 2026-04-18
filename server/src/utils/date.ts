/**
 * Normalize client-provided datetime to UTC ISO8601 (with Z)
 * so it can be safely stored in timestamptz.
 */
export function toUtcIsoString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_datetime");
  }
  return date.toISOString();
}
