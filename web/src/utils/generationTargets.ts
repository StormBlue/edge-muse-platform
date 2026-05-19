import type { GenerationTarget, ProviderCapabilities } from "@/stores/auth";

export function generationTargetsWithFallback(
  targets: GenerationTarget[],
  providerCapabilities: ProviderCapabilities | null
): GenerationTarget[] {
  if (targets.length) return targets;
  if (!providerCapabilities) return [];
  return [
    {
      id: "default",
      label: "默认生成",
      experimental: false,
      providerCapabilities
    }
  ];
}

export function activeGenerationTarget(
  targets: GenerationTarget[],
  generationTargetId: string
): GenerationTarget | null {
  return (
    targets.find((target) => target.id === generationTargetId) ??
    targets.find((target) => target.id === "default") ??
    targets[0] ??
    null
  );
}

export function generationTargetDisplayLabel(
  target: Pick<GenerationTarget, "id" | "label">,
  t: (key: string) => string
) {
  if (target.id === "default") return t("workspace.defaultGenerationTarget");
  if (target.id === "micu_grok") return t("workspace.micuGrokGenerationTarget");
  return target.label;
}
