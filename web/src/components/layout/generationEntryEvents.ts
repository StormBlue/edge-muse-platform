import type { ClientGenerationEventName, GenerationEntry, GenerationRoute } from "@/api/generation";

export type GenerationNavEntry = {
  to: string;
  label: string;
};

export type GenerationEventDraft = {
  eventName: ClientGenerationEventName;
  route: GenerationRoute;
  metadata?: Record<string, unknown>;
};

export function generationTargetForPath(path: string): GenerationRoute | null {
  if (path.startsWith("/ai-image")) return "/ai-image";
  if (path.startsWith("/workspace")) return "/workspace";
  return null;
}

export function buildGenerationEntryExposureEvents(items: GenerationNavEntry[]) {
  const events: GenerationEventDraft[] = [];
  for (const item of items) {
    const route = generationTargetForPath(item.to);
    if (!route) continue;
    events.push({
      eventName: "entry_exposed",
      route,
      metadata: { navLabel: item.label }
    });
  }
  return events;
}

export function buildGenerationRouteOpenEvents(
  path: string,
  fullPath: string,
  generationEntry: GenerationEntry | null,
  openedKeys: Set<string>
) {
  const route = generationTargetForPath(path);
  if (!route) return [];
  const key = `${fullPath}:${generationEntry?.showWorkspace}:${generationEntry?.showAiImage}`;
  if (openedKeys.has(key)) return [];
  openedKeys.add(key);
  return [
    {
      eventName: "page_opened" as const,
      route,
      metadata: { navTarget: generationEntry?.navTarget ?? "/workspace" }
    }
  ];
}

export function buildGenerationHistoryReturnEvents(
  fromPath: string,
  fromFullPath: string,
  toPath: string,
  toFullPath: string,
  returnedKeys: Set<string>
) {
  if (!toPath.startsWith("/history")) return [];
  const fromRoute = generationTargetForPath(fromPath);
  if (!fromRoute) return [];

  const key = `${fromFullPath}->${toFullPath}`;
  if (returnedKeys.has(key)) return [];
  returnedKeys.add(key);

  return [
    {
      eventName: "history_returned" as const,
      route: fromRoute,
      metadata: {
        fromRoute,
        historyRoute: "/history"
      }
    }
  ];
}
