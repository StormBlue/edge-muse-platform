/**
 * 生成入口 A/B 实验聚合出口。
 *
 * 路由和业务代码继续从本文件导入；具体实现按配置、分配、事件记录和指标拆分。
 */
export {
  experimentToDto,
  getGenerationExperiment,
  saveGenerationExperiment
} from "./experimentCore";
export {
  clearGenerationExperimentAssignmentOverride,
  getGenerationExperienceForUser,
  listGenerationExperimentAssignmentOverrides,
  setGenerationExperimentAssignmentOverride
} from "./experimentAssignments";
export {
  recordExperimentEvent,
  recordRetrySubmittedExperimentEvent,
  recordTaskResultExperimentEvent
} from "./experimentEventRecorder";
export { sanitizeExperimentEventMetadata } from "./experimentEventMetadata";
export {
  clientExperimentEventSchema,
  experimentEventSchema,
  experimentPatchSchema,
  type ExperimentEventInput,
  type ExperimentPatchInput
} from "./experimentSchemas";
export {
  getGenerationExperimentMetrics,
  getGenerationExperimentMetricsWindow,
  type GenerationExperimentMetric,
  type GenerationExperimentMetricsWindow
} from "./experimentMetrics";
export { GENERATION_EXPERIENCE_KEY } from "./generationExperimentConstants";
export type {
  ExperimentStatus,
  ExperimentStrategy,
  ExperimentVariant,
  GenerationExperience,
  GenerationExperimentAssignmentOverride
} from "./experimentTypes";
