import type { ImageAttachment, Message, Session, SessionMode } from "@/stores/session";

/** 列表页扩展 Session：统计字段 + 封面图。 */
export type HistorySession = Session & {
  createdAt?: number;
  updatedAt?: number;
  status?: string | null;
  taskCount?: number;
  imageCount?: number;
  requestedImageCount?: number;
  coverImage?: ImageAttachment | null;
};

export type TaskParams = {
  prompt?: string;
  mode?: SessionMode;
  size?: string;
  n?: number;
  model?: string;
  referenceImageIds?: string[];
};

export type HistoryTask = {
  id: string;
  mode: SessionMode | null;
  params: TaskParams;
  status: string | null;
  errorCode?: string | null;
  errorMsg?: string | null;
  queuedAt?: number | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};

export type HistoryMessage = Message & {
  referenceImages?: ImageAttachment[];
  task?: HistoryTask | null;
};

export type GenerationStats = {
  total: number;
  success: number;
  failed: number;
  completed: number;
  percent: number;
};
