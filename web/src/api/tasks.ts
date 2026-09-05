import { apiFetch } from "@/api/client";
import type { ImageAttachment, SessionMode } from "@/stores/session";

export type GenerationTaskParams = {
  mode: SessionMode;
  size: string;
  n: number;
  generationTargetId?: string;
  model?: string;
  referenceImageIds?: string[];
  sourceTaskId?: string;
  sourceImageId?: string;
};

export type GenerationTask = {
  id: string;
  sessionId: string;
  messageId: string;
  title: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  phase: "queued" | "starting" | "generating" | "succeeded" | "failed" | "cancelled";
  prompt: string;
  params: GenerationTaskParams;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  canCancel: boolean;
  images: ImageAttachment[];
  referenceImages: ImageAttachment[];
  quota: { precharged: number; refunded: number; consumed: number };
  errorCode: string | null;
  errorMessage: string | null;
  retryOf: string | null;
};

export type TaskPage = {
  items: GenerationTask[];
  nextCursor: string | null;
  activeCount: number;
};

export function listTasks(options: {
  scope: "active" | "recent";
  limit?: number;
  cursor?: string;
}) {
  const query = new URLSearchParams({ scope: options.scope, limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);
  return apiFetch<TaskPage>(`/tasks?${query}`);
}

export async function getTask(id: string) {
  const body = await apiFetch<{ summary: GenerationTask | null }>(
    `/tasks/${encodeURIComponent(id)}`
  );
  if (!body.summary) throw new Error("Task summary unavailable");
  return body.summary;
}

export function cancelTask(id: string) {
  return apiFetch(`/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
