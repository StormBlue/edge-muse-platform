import type { ProviderCapabilities, User } from "@/stores/auth";
import { maxEdgeForSize, sizeOptionsForProvider } from "@/views/workspace/workspaceOptions";
import type { PromptCaseMode } from "@/types/promptCases";
import type { GenerationTask } from "@/api/tasks";

export type CreativeBrief = {
  subject: string;
  purpose: string;
  style: string;
  preserve: string;
  changes: string;
};
export const emptyCreativeBrief = (): CreativeBrief => ({
  subject: "",
  purpose: "",
  style: "",
  preserve: "",
  changes: ""
});

/** 同一需求同时供人工整理和助手使用，避免参考图的保留条件只存在于临时聊天中。 */
export function formatCreativeBrief(brief: CreativeBrief, label: (key: string) => string): string {
  return (Object.keys(brief) as Array<keyof CreativeBrief>)
    .filter((key) => brief[key].trim())
    .map((key) => `${label(key)}: ${brief[key].trim()}`)
    .join("\n");
}

export function studioSizeOptions(provider: ProviderCapabilities | null, mode: PromptCaseMode) {
  const options = sizeOptionsForProvider(provider);
  return provider?.requestFormat === "micu_images" && mode === "image2image"
    ? options.filter((option) => (maxEdgeForSize(option.value) ?? 0) < 3000)
    : options;
}

export function studioImageLimit(user: User | null) {
  return user?.role === "sysadmin"
    ? 200
    : Math.min(20, Math.max(1, user?.maxImagesPerGeneration ?? 1));
}

export function studioConcurrentLimit(user: User | null) {
  if (user?.role === "sysadmin") return null;
  return user?.maxConcurrentTasks ?? (user?.role === "admin" ? 10 : 5);
}

/** 图片列表只返回附件字段；对比时从所属任务补充真实提示词和模型，不伪造上传参考图参数。 */
export function studioTaskImages(task: GenerationTask | null) {
  return (task?.images ?? []).map((image, index) => ({
    ...image,
    taskId: task!.id,
    sessionId: task!.sessionId,
    messageId: task!.messageId,
    prompt: task!.prompt,
    displayName: `${task!.title} · ${index + 1}`,
    model: task!.params.model ?? task!.params.generationTargetId ?? "",
    size: task!.params.size
  }));
}

/** 详情与全局轮询可能交错返回；任务终态不可被更早的排队/运行快照倒退覆盖。 */
export function mergeStudioTask(
  previous: GenerationTask | null,
  next: GenerationTask
): GenerationTask {
  if (!previous || previous.id !== next.id) return next;
  const rank = (status: GenerationTask["status"]) =>
    status === "queued" ? 0 : status === "running" ? 1 : 2;
  if (rank(previous.status) > rank(next.status)) return previous;
  if (rank(previous.status) === 2 && previous.status !== next.status) return previous;
  return {
    ...next,
    quota: {
      ...next.quota,
      refunded: Math.max(previous.quota.refunded, next.quota.refunded),
      consumed: Math.min(previous.quota.consumed, next.quota.consumed)
    }
  };
}

/** 服务端仍做最终校验；前端先给出具体阻断原因，避免静默禁用生成按钮。 */
export function studioSubmitIssue(input: {
  prompt: string;
  mode: PromptCaseMode;
  supportedModes: PromptCaseMode[];
  size: string;
  sizes: Array<{ value: string }>;
  count: number;
  countLimit: number;
  referenceCount: number;
  referenceLimit: number;
  remaining: number | null;
  activeCount: number;
  concurrentLimit: number | null;
}) {
  if (!input.supportedModes.includes(input.mode)) return "noCapabilities";
  if (!input.prompt.trim()) return "empty_prompt";
  if (input.prompt.length > 4000) return "promptTooLong";
  if (!input.sizes.some((item) => item.value === input.size)) return "size_unsupported";
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > input.countLimit)
    return "generationBlocked";
  if (input.mode === "image2image" && !input.referenceCount) return "reference_required";
  if (input.mode === "image2image" && input.referenceCount > input.referenceLimit)
    return "referencesExceeded";
  if (input.remaining !== null && input.count > input.remaining) return "quotaInsufficient";
  if (input.concurrentLimit !== null && input.activeCount >= input.concurrentLimit)
    return "concurrentLimit";
  return null;
}
