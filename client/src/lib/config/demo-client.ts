export function isDemoUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
}
