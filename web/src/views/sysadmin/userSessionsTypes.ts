import type { ImageAttachment, Message, Session, SessionMode } from "@/stores/session";

/** 系统管理拉取的会话行：在 Session 上扩展属主、归档、任务数等只读维表字段。 */
export type AuditSession = Session & {
  userId?: string;
  user?: {
    id: string;
    email?: string | null;
    username?: string | null;
    nickname?: string | null;
    role?: string | null;
  };
  providerKeyId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  deletedAt?: number | null;
  taskCount?: number;
};

/** 审计页图片：附加生成时刻、第几张、单张耗时等排障信息。 */
export type AuditImageAttachment = ImageAttachment & {
  createdAt?: number | null;
  generationDurationMs?: number | null;
  generationIndex?: number | null;
};

/** 任务落库时序列化的生成参数子集，用于只读展示。 */
export type TaskParams = {
  prompt?: string;
  mode?: SessionMode;
  size?: string;
  n?: number;
  model?: string;
  referenceImageIds?: string[];
};

/** 单条消息 + 嵌套 task/失败列表，供运维查看单次生成全链路。 */
export type AuditMessage = Omit<Message, "attachments"> & {
  attachments: AuditImageAttachment[];
  referenceImages?: AuditImageAttachment[];
  task?: {
    id?: string;
    mode?: SessionMode | null;
    params?: TaskParams;
    status?: string | null;
    errorCode?: string | null;
    errorMsg?: string | null;
    queuedAt?: number | null;
    startedAt?: number | null;
    finishedAt?: number | null;
    durationMs?: number | null;
    generationFailures?: Array<{
      index: number;
      code: string;
      message: string;
      phase?: string | null;
      createdAt?: number | null;
    }>;
  } | null;
};

/** 多图部分失败时按 code/phase 聚合，用于折叠展示。 */
export type FailureGroup = {
  key: string;
  code: string;
  message: string;
  phase?: string | null;
  count: number;
  indexes: number[];
};

/** 顶栏按邮箱搜索时的用户候选项。 */
export type UserOption = {
  id: string;
  email: string | null;
  username: string | null;
  nickname: string | null;
  role: string;
  status: string;
};
