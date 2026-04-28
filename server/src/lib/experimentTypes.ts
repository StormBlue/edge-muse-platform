import type { GENERATION_EXPERIENCE_KEY } from "./generationExperimentConstants";

export type ExperimentStrategy = "parallel" | "force_legacy" | "force_ai" | "ab_test";
export type ExperimentStatus = "draft" | "running" | "paused" | "archived";
export type ExperimentVariant = "A" | "B" | "parallel" | "sysadmin";

export type GenerationExperimentAssignmentOverride = {
  userId: string;
  username: string;
  email: string;
  nickname: string;
  variant: "A" | "B";
  manualOverride: boolean;
  assignedAt: number;
  updatedAt: number;
};

export type GenerationExperience = {
  experimentKey: typeof GENERATION_EXPERIENCE_KEY;
  status: ExperimentStatus;
  strategy: ExperimentStrategy;
  variant: ExperimentVariant;
  navTarget: "/workspace" | "/ai-image";
  showLegacy: boolean;
  showAi: boolean;
};
