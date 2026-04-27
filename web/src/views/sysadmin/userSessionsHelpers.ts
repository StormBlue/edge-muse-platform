import type { ImageAttachment } from "@/stores/session";
import type { AuditMessage, AuditSession, FailureGroup, UserOption } from "./userSessionsTypes";

/** 系统会话审核页的纯展示 helper：只处理只读数据整形，不触发接口和状态变更。 */
export function normalizeAuditMessageAttachments(message: AuditMessage): AuditMessage {
  return {
    ...message,
    // 后端历史数据不一定带完整图片外键，这里补齐给 ImageViewer/审计追踪统一使用。
    referenceImages: (message.referenceImages ?? []).map((image) => ({
      ...image,
      taskId: image.taskId ?? message.taskId ?? null,
      sessionId: image.sessionId ?? message.sessionId,
      messageId: image.messageId ?? message.id,
      prompt: image.prompt ?? message.prompt ?? null
    })),
    attachments: message.attachments.map((image) => ({
      ...image,
      taskId: image.taskId ?? message.taskId ?? null,
      sessionId: image.sessionId ?? message.sessionId,
      messageId: image.messageId ?? message.id,
      prompt: image.prompt ?? message.prompt ?? null
    }))
  };
}

/** 审核页图片进入预览器时不绑定聊天消息，避免复用前台消息导航状态。 */
export function toAuditViewerImage(image: ImageAttachment): ImageAttachment {
  return { ...image, messageId: null };
}

export function formatAuditDateTime(locale: string, value?: number | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function auditUserLabel(user?: AuditSession["user"] | UserOption | null) {
  if (!user) return "-";
  const name = user.nickname || user.username || user.email || user.id;
  return user.role ? `${name} · ${user.role}` : name;
}

export function auditUserSubLabel(user?: AuditSession["user"] | UserOption | null) {
  if (!user) return "";
  return [user.username, user.email].filter(Boolean).join(" · ") || user.id;
}

export function auditStatusTone(status?: string | null) {
  if (status === "succeeded") return "bg-primary/15 text-primary";
  if (status === "failed" || status === "cancelled") return "bg-destructive/10 text-destructive";
  if (status === "running" || status === "queued") return "bg-accent/10 text-accent";
  return "bg-muted text-muted-foreground";
}

/**
 * 展示「本任务期望张数」：取 task.params.n 或会话 settings.n 与已出图数的较大者。
 * 部分成功时，实际附件数可能高于配置快照，必须以图片为准。
 */
export function requestedAuditImageCount(
  message: AuditMessage,
  selectedSession?: AuditSession | null
) {
  const configured = message.task?.params?.n ?? selectedSession?.settings?.n;
  const count = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
  return Math.max(Math.floor(count), message.attachments.length);
}

/** 汇总单条生成消息的展示参数，优先取任务快照，缺失时再回退到会话设置。 */
export function auditTaskParameters(message: AuditMessage, selectedSession?: AuditSession | null) {
  const params = message.task?.params ?? {};
  return {
    mode: message.task?.mode ?? params.mode ?? selectedSession?.mode ?? null,
    size: params.size ?? selectedSession?.settings?.size ?? "-",
    count: requestedAuditImageCount(message, selectedSession),
    model: params.model ?? selectedSession?.settings?.model ?? "",
    referenceCount:
      message.referenceImages?.length ??
      params.referenceImageIds?.length ??
      message.referenceImageIds.length,
    durationMs: message.task?.durationMs ?? null
  };
}

export function auditMessagePromptText(message: AuditMessage) {
  return message.prompt || message.task?.params?.prompt || "";
}

export function isAuditLongPrompt(message: AuditMessage) {
  const prompt = auditMessagePromptText(message);
  return prompt.length > 260 || prompt.split("\n").length > 5;
}

export function auditGenerationFailures(message: AuditMessage) {
  return message.task?.generationFailures ?? [];
}

export function auditTaskFailureMessage(message: AuditMessage) {
  return message.task?.errorMsg || message.error?.message || "";
}

export function hasAuditFailureDetails(message: AuditMessage) {
  return auditGenerationFailures(message).length > 0 || Boolean(auditTaskFailureMessage(message));
}

/** 多图按 code+phase+message 分桶，折叠重复失败项。 */
export function groupAuditGenerationFailures(message: AuditMessage) {
  const groups = new Map<string, FailureGroup>();
  for (const failure of auditGenerationFailures(message)) {
    const code = failure.code || "UNKNOWN_ERROR";
    const failureMessage = failure.message || "-";
    const phase = failure.phase ?? null;
    const key = [code, phase ?? "", failureMessage].join("\u0000");
    const group = groups.get(key) ?? {
      key,
      code,
      message: failureMessage,
      phase,
      count: 0,
      indexes: []
    };
    group.count += 1;
    if (typeof failure.index === "number" && Number.isFinite(failure.index)) {
      group.indexes.push(failure.index);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

/** 将失败图片下标压缩成 `#1-#3, #8` 这类短标签，方便排查部分失败。 */
export function auditFailureImageRangeLabel(group: FailureGroup) {
  const sorted = [...new Set(group.indexes)]
    .filter((index) => Number.isFinite(index))
    .sort((left, right) => left - right);
  if (!sorted.length) return "-";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (const index of sorted.slice(1)) {
    if (index === end + 1) {
      end = index;
      continue;
    }
    ranges.push(formatAuditFailureIndexRange(start, end));
    start = index;
    end = index;
  }
  ranges.push(formatAuditFailureIndexRange(start, end));
  return ranges.join(", ");
}

function formatAuditFailureIndexRange(start: number, end: number) {
  const displayStart = start + 1;
  const displayEnd = end + 1;
  return displayStart === displayEnd ? `#${displayStart}` : `#${displayStart}-#${displayEnd}`;
}

export function auditImageIndexLabel(index?: number | null) {
  return typeof index === "number" ? `#${index + 1}` : "#?";
}

export function formatAuditDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.max(Math.round(value), 0)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
