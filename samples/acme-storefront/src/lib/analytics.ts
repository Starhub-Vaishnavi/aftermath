export function track(event: string, props: Record<string, unknown> = {}): void {
  if (typeof window !== "undefined") console.debug("[analytics]", event, props);
}
