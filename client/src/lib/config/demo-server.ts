export function isDemoRouteEnabled(): boolean {
  return process.env.ENABLE_DEMO === "true";
}
