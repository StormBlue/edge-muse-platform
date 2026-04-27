/**
 * 生图任务域对外入口。
 *
 * 具体实现按职责拆到 `lib/tasks/`：
 * - create：任务创建、会话复用、活跃任务查询
 * - dispatch/recovery：任务点火、Workflow fallback、超时与中断恢复
 * - run：provider 调用、并发生成、结果归并
 * - failure：失败终态、配额退还、部分图片保留
 * - references/providerImages：参考图与 provider 图片持久化
 *
 * 保持本文件作为稳定导入面，避免路由、Workflow、DO 关心内部拆分。
 */
export {
  assertNoActiveGenerationTask,
  assertReusableGenerateSession,
  createGenerateTask,
  findActiveGenerationTaskForUser
} from "./tasks/create";
export { startGenerateTask } from "./tasks/dispatch";
export { broadcastTaskEvent } from "./tasks/events";
export { failGenerateTask } from "./tasks/failure";
export { assertProviderSupportsGenerateParams } from "./tasks/providerParams";
export { orderRowsByImageIds } from "./tasks/references";
export {
  failTimedOutGenerateTaskIfNeeded,
  recoverInterruptedGenerateTasks,
  scheduleInterruptedTaskRecovery
} from "./tasks/recovery";
export { runGenerateTask } from "./tasks/run";
export type { ActiveGenerationTask, TaskEvent, TaskRecoveryResult } from "./tasks/types";
