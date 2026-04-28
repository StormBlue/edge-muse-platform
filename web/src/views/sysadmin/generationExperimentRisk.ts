/**
 * 生成实验保存前风险摘要。
 *
 * 页面用它把“空 scope 代表全量”“强制新版”等隐含风险显式展示，降低灰度误操作概率。
 */
import type { GenerationExperimentForm } from "./generationExperimentPresets";

export type GenerationExperimentRiskLevel = "safe" | "caution" | "danger";

export type GenerationExperimentRisk = {
  level: GenerationExperimentRiskLevel;
  titleKey: string;
  bodyKey: string;
};

type ScopeRiskState = "all" | "targeted" | "off" | "invalid";

const POSITIVE_SCOPE_KEYS = ["userIds", "includeUserIds", "adminIds", "ownerAdminIds"] as const;

export function generationExperimentRiskSummary(
  form: GenerationExperimentForm,
  scopeText: string
): GenerationExperimentRisk {
  const scope = parseScopeState(scopeText);
  if (scope === "invalid") {
    return {
      level: "danger",
      titleKey: "experiments.riskInvalidScopeTitle",
      bodyKey: "experiments.riskInvalidScopeBody"
    };
  }
  if (form.status !== "running") {
    return {
      level: "safe",
      titleKey: "experiments.riskInactiveTitle",
      bodyKey: "experiments.riskInactiveBody"
    };
  }
  if (scope === "off") {
    return {
      level: "safe",
      titleKey: "experiments.riskScopeOffTitle",
      bodyKey: "experiments.riskScopeOffBody"
    };
  }
  if (form.strategy === "force_ai" && scope === "all") {
    return {
      level: "danger",
      titleKey: "experiments.riskForceAiAllTitle",
      bodyKey: "experiments.riskForceAiAllBody"
    };
  }
  if (form.strategy === "ab_test" && scope === "all" && form.trafficPercent > 25) {
    return {
      level: "caution",
      titleKey: "experiments.riskHighTrafficTitle",
      bodyKey: "experiments.riskHighTrafficBody"
    };
  }
  if (form.strategy === "force_legacy") {
    return {
      level: "safe",
      titleKey: "experiments.riskRollbackTitle",
      bodyKey: "experiments.riskRollbackBody"
    };
  }
  return {
    level: "safe",
    titleKey: scope === "targeted" ? "experiments.riskTargetedTitle" : "experiments.riskAllTitle",
    bodyKey: scope === "targeted" ? "experiments.riskTargetedBody" : "experiments.riskAllBody"
  };
}

function parseScopeState(scopeText: string): ScopeRiskState {
  try {
    const scope = JSON.parse(scopeText || "{}") as unknown;
    if (!isScopeRecord(scope)) return "invalid";
    // 与后端 experimentScope.ts 保持一致：仅排除名单不会缩小基础范围，仍然是全量范围。
    if (scope.mode === "off") return "off";
    if (scope.mode === "all") return "all";
    if (scope.mode === "user_whitelist" || scope.mode === "admin_users") return "targeted";
    if (POSITIVE_SCOPE_KEYS.some((key) => hasNonBlankString(scope[key]))) return "targeted";
    return "all";
  } catch {
    return "invalid";
  }
}

function isScopeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonBlankString(value: unknown) {
  return (
    Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim().length > 0)
  );
}
