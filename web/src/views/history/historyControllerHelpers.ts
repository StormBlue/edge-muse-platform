import type { ImageAttachment, SessionMode } from "@/stores/session";
import type { GenerationStats, HistoryMessage, HistorySession } from "./historyTypes";

export function toViewerImage(image: ImageAttachment): ImageAttachment {
  return { ...image, messageId: null };
}

export function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    error.error &&
    typeof error.error === "object" &&
    "message" in error.error
  ) {
    const message = error.error.message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function formatDateTime(value: number | null | undefined, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function taskStatusValue(message: HistoryMessage) {
  return message.task?.status ?? (message.taskId ? message.status : null);
}

export function taskStatusTone(status?: string | null) {
  if (status === "succeeded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "failed" || status === "cancelled") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "running") return "border-accent/30 bg-accent/10 text-accent";
  if (status === "queued") return "border-primary/25 bg-primary/10 text-primary";
  return "border-border bg-muted/35 text-muted-foreground";
}

export function taskFailureMessage(message: HistoryMessage) {
  return message.task?.errorMsg || message.error?.message || "";
}

export function messagePromptText(
  message: HistoryMessage,
  selectedSession?: HistorySession | null
) {
  return message.prompt || message.task?.params?.prompt || selectedSession?.title || "-";
}

export function isLongPrompt(message: HistoryMessage, selectedSession?: HistorySession | null) {
  const prompt = messagePromptText(message, selectedSession);
  return prompt.length > 260 || prompt.split("\n").length > 5;
}

export function taskGenerationStats(
  message: HistoryMessage,
  selectedSession?: HistorySession | null
): GenerationStats {
  const totalImages = requestedImageCount(message, selectedSession);
  const success = message.attachments.length;
  const status = taskStatusValue(message);
  const failed =
    status === "failed" || status === "cancelled" ? Math.max(totalImages - success, 0) : 0;
  const completed = Math.min(totalImages, success + failed);
  return {
    total: totalImages,
    success,
    failed,
    completed,
    percent: totalImages > 0 ? Math.round((completed / totalImages) * 100) : 0
  };
}

export function requestedImageCount(
  message: HistoryMessage,
  selectedSession?: HistorySession | null
) {
  const configured = message.task?.params?.n ?? selectedSession?.settings?.n;
  const count = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
  return Math.max(Math.floor(count), message.attachments.length);
}

export function sanitizePage(value: number) {
  return Number.isFinite(value) ? Math.max(Math.floor(value), 1) : 1;
}

export function taskParameters(message: HistoryMessage, selectedSession?: HistorySession | null) {
  const params = message.task?.params ?? {};
  return {
    mode: (message.task?.mode ??
      params.mode ??
      selectedSession?.mode ??
      null) as SessionMode | null,
    size: params.size ?? selectedSession?.settings?.size ?? "-",
    model: params.model ?? selectedSession?.settings?.model ?? "",
    referenceCount:
      message.referenceImages?.length ??
      params.referenceImageIds?.length ??
      message.referenceImageIds.length
  };
}
