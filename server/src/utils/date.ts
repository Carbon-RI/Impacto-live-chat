/**
 * クライアントから受け取った日時を UTC の ISO8601（Z）へ正規化し、timestamptz に安全に渡す。
 */
export function toUtcIsoString(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_datetime");
  }
  return date.toISOString();
}
