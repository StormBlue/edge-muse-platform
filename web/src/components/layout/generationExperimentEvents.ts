/**
 * 生成入口实验事件的纯函数。
 *
 * AppShell 负责读取路由和导航，具体判断放在这里，便于单测覆盖 A/B 漏斗边界。
 */
import type { GenerationExperience } from "@/stores/auth";
import type { ClientExperimentEventName } from "@/api/experiments";

export type GenerationNavEntry = {
  to: string;
  label: string;
};

export type GenerationExperimentEventDraft = {
  eventName: ClientExperimentEventName;
  route?: string;
  metadata?: Record<string, unknown>;
};

export function generationTargetForPath(path: string) {
  if (path.startsWith("/ai-image")) return "/ai-image" as const;
  if (path.startsWith("/workspace")) return "/workspace" as const;
  return null;
}

export function generationVariantForPath(path: string) {
  const target = generationTargetForPath(path);
  if (target === "/workspace") return "A" as const;
  if (target === "/ai-image") return "B" as const;
  return null;
}

export function buildGenerationEntryExposureEvents(items: GenerationNavEntry[]) {
  const events: GenerationExperimentEventDraft[] = [];
  for (const item of items) {
    const variant = generationVariantForPath(item.to);
    if (!variant) continue;
    events.push({
      eventName: "generation_entry_exposed",
      route: generationTargetForPath(item.to) ?? item.to,
      metadata: { variant, navLabel: item.label }
    });
  }
  return events;
}

export function buildGenerationRouteOpenEvents(
  path: string,
  fullPath: string,
  experience: GenerationExperience | null,
  isSysadmin: boolean,
  openedKeys: Set<string>,
  directKeys: Set<string>
) {
  const targetRoute = generationTargetForPath(path);
  const variant = targetRoute ? generationVariantForPath(targetRoute) : null;
  if (!targetRoute || !variant) return [];

  const events: GenerationExperimentEventDraft[] = [];
  const assignedTarget = experience?.navTarget;
  const directTrackingEnabled =
    !isSysadmin &&
    experience?.status === "running" &&
    experience.variant !== "parallel" &&
    ["ab_test", "force_ai", "force_legacy"].includes(experience.strategy);
  const directAccess = Boolean(
    directTrackingEnabled && assignedTarget && assignedTarget !== targetRoute
  );
  const openedKey = `${fullPath}:${experience?.variant ?? "unknown"}`;
  if (!openedKeys.has(openedKey)) {
    openedKeys.add(openedKey);
    events.push({
      eventName: "generation_page_opened",
      route: targetRoute,
      metadata: { variant, directAccess }
    });
  }

  const directKey = `${fullPath}:${experience?.variant ?? "unknown"}`;
  if (directAccess && !directKeys.has(directKey)) {
    directKeys.add(directKey);
    events.push({
      eventName: "variant_switched_directly",
      route: targetRoute,
      metadata: {
        fromVariant: experience?.variant ?? "parallel",
        toVariant: variant
      }
    });
  }

  return events;
}
