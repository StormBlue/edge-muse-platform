/**
 * 生成体验实验的常用灰度预设。
 *
 * sysadmin 页面只负责展示与点击；预设本身保持纯函数，便于测试回滚和 25% 灰度等关键配置。
 */
import type { GenerationExperiment } from "@/api/experiments";

export type GenerationExperimentForm = Pick<
  GenerationExperiment,
  "status" | "strategy" | "trafficPercent" | "scope"
>;

export type GenerationExperimentPresetKey =
  | "rollback_legacy"
  | "parallel"
  | "force_ai_scope"
  | "ab_25";

export type GenerationExperimentPreset = {
  key: GenerationExperimentPresetKey;
  labelKey: string;
  descriptionKey: string;
  requiresTargetScope: boolean;
  patch: Pick<GenerationExperimentForm, "status" | "strategy" | "trafficPercent">;
};

export const GENERATION_EXPERIMENT_PRESETS: GenerationExperimentPreset[] = [
  {
    key: "rollback_legacy",
    labelKey: "experiments.presetRollback",
    descriptionKey: "experiments.presetRollbackHint",
    requiresTargetScope: false,
    patch: { status: "running", strategy: "force_legacy", trafficPercent: 0 }
  },
  {
    key: "parallel",
    labelKey: "experiments.presetParallel",
    descriptionKey: "experiments.presetParallelHint",
    requiresTargetScope: false,
    patch: { status: "running", strategy: "parallel", trafficPercent: 50 }
  },
  {
    key: "force_ai_scope",
    labelKey: "experiments.presetInternalAi",
    descriptionKey: "experiments.presetInternalAiHint",
    requiresTargetScope: true,
    patch: { status: "running", strategy: "force_ai", trafficPercent: 100 }
  },
  {
    key: "ab_25",
    labelKey: "experiments.presetAb25",
    descriptionKey: "experiments.presetAb25Hint",
    requiresTargetScope: false,
    patch: { status: "running", strategy: "ab_test", trafficPercent: 25 }
  }
];

export function applyGenerationExperimentPreset(
  form: GenerationExperimentForm,
  key: GenerationExperimentPresetKey
): GenerationExperimentForm {
  const preset = GENERATION_EXPERIMENT_PRESETS.find((item) => item.key === key);
  if (!preset) return form;
  return { ...form, ...preset.patch };
}

export function generationExperimentScopeHasTargetRule(scopeText: string) {
  try {
    const scope = JSON.parse(scopeText || "{}") as Record<string, unknown>;
    return ["userIds", "includeUserIds", "adminIds", "ownerAdminIds"].some((key) => {
      const value = scope[key];
      return Array.isArray(value) && value.length > 0;
    });
  } catch {
    return false;
  }
}
