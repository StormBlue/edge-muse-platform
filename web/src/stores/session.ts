/**
 * 会话与消息 Pinia Store（工作台核心状态）
 *
 * 与 docs/archive/开发需求.md、根目录 ARCHITECTURE.md 对应：
 * - 「会话」sessions：文生图 / 图生图 的容器，含默认 size、张数 n 等 settings。
 * - 「消息」messages：用户气泡 + 助手气泡；助手消息可挂 taskId，状态由后端持久化 + WebSocket 推送增量更新。
 *
 * 与后端的对应关系（简化）：
 * - GET/POST /api/sessions、GET /sessions/:id/messages → loadSessions / loadMessages / loadOlderMessages
 * - POST /api/generate → generate()：立刻在本地插入「用户消息 + 助手占位（queued）」，再连 ws 收事件
 *
 * 本地乐观更新（generate）时序（符号）：
 *   用户点发送
 *     → Pinia.push(用户消息, id=local-*)
 *     → Pinia.push(助手消息, status=queued, taskId=真实)
 *     → 前端连 wsUrl，onMessage → applyTaskEvent 合并进度/图/终态
 *   刷新页面后
 *     → loadMessages 从 D1 拉权威数据，id 与 taskId 与线上一致
 */
import { defineStore } from "pinia";
import { apiFetch } from "@/api/client";

/** 生图模式：与 server GenerateParams.mode 一致 */
export type SessionMode = "text2image" | "image2image";
/** 单张图片在消息中的展示元数据（来自 API 或 WS 推送） */
export type ImageAttachment = {
  id: string;
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  taskId?: string | null;
  sessionId?: string | null;
  messageId?: string | null;
  displayName?: string | null;
  prompt?: string | null;
};
/**
 * 一条会话消息：用户/助手气泡共用结构。
 * - 助手消息：`taskId` 有值时表示对应异步任务；`status`/`progress`/`error` 与任务同步。
 */
export type Message = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  prompt?: string | null;
  attachments: ImageAttachment[];
  referenceImages?: ImageAttachment[];
  referenceImageIds: string[];
  taskId?: string | null;
  status: string;
  progress?: number | null;
  error?: { code: string; message: string } | null;
  createdAt: number;
};
/** 侧栏展示的会话摘要，与 GET /api/sessions 项一致 */
export type Session = {
  id: string;
  title: string;
  mode: SessionMode;
  settings: { size: string; n: number; model?: string };
  lastMessageAt: number;
};
/**
 * 当前用户进行中的生图（用于刷新页面后恢复 WS 或展示「进行中」）。
 * 来自 GET /api/sessions/active-generation。
 */
export type ActiveGeneration = {
  taskId: string;
  sessionId: string;
  messageId: string;
  status: "queued" | "running";
  queuedAt: number;
  startedAt?: number | null;
  session: Session;
};

export const useSessionStore = defineStore("sessions", {
  state: () => ({
    /** 当前用户会话列表（侧栏），分页用 nextSessionCursor */
    sessions: [] as Session[],
    /** 当前选中的会话 id；为 null 时表示未选中或需引导新建 */
    currentSessionId: null as string | null,
    /** 当前会话下的消息流（新消息在列表尾部 = 时间正序展示） */
    messages: [] as Message[],
    /** POST /generate 进行中，用于禁用发送按钮等 */
    loading: false,
    /** GET /api/sessions 列表加载中（首屏与分页） */
    sessionsLoading: false,
    /** 向上滚动加载更早消息时的 loading */
    olderMessagesLoading: false,
    /** 会话列表分页游标（毫秒时间戳，由后端定义） */
    nextSessionCursor: null as number | null,
    /** 消息分页：更早一屏的游标 */
    nextMessageCursor: null as number | null
  }),
  getters: {
    /** 当前路由/选中会话 id 在 sessions 列表中的对象，无则 null（仅侧栏有缓存时有效） */
    currentSession: (state) =>
      state.sessions.find((session) => session.id === state.currentSessionId) ?? null
  },
  actions: {
    /** 新建或更新侧栏中的会话卡片（active-generation 返回时也会调用） */
    upsertSession(session: Session) {
      const index = this.sessions.findIndex((item) => item.id === session.id);
      if (index >= 0) {
        this.sessions[index] = { ...this.sessions[index], ...session };
      } else {
        this.sessions.unshift(session);
      }
    },
    /** 首屏拉取会话列表；若尚未选中会话则默认选第一条 */
    async loadSessions() {
      this.sessionsLoading = true;
      try {
        const body = await apiFetch<{ items: Session[]; nextCursor: number | null }>("/sessions");
        this.sessions = body.items.map(normalizeSession);
        this.nextSessionCursor = body.nextCursor;
      } finally {
        this.sessionsLoading = false;
      }
      if (!this.currentSessionId && this.sessions[0]) this.currentSessionId = this.sessions[0].id;
    },
    /** 查询是否有排队/运行中的任务，并合并涉及的会话信息（用于重连 WebSocket） */
    async loadActiveGeneration() {
      const body = await apiFetch<{ active: ActiveGeneration | null }>(
        "/sessions/active-generation"
      );
      if (body.active?.session) {
        body.active.session = normalizeSession(body.active.session);
        this.upsertSession(body.active.session);
      }
      return body.active;
    },
    /** 会话列表向下滚动分页，游标为 `nextSessionCursor` */
    async loadMoreSessions() {
      if (!this.nextSessionCursor || this.sessionsLoading) return;
      this.sessionsLoading = true;
      try {
        const body = await apiFetch<{ items: Session[]; nextCursor: number | null }>(
          `/sessions?cursor=${this.nextSessionCursor}`
        );
        const existingIds = new Set(this.sessions.map((session) => session.id));
        const items = body.items.map(normalizeSession);
        this.sessions = [
          ...this.sessions,
          ...items.filter((session) => !existingIds.has(session.id))
        ];
        this.nextSessionCursor = body.nextCursor;
      } finally {
        this.sessionsLoading = false;
      }
    },
    /** 创建新会话并切到该会话，清空当前消息流与消息游标 */
    async createSession(mode: SessionMode = "image2image") {
      const body = await apiFetch<{ session: Session }>("/sessions", {
        method: "POST",
        body: JSON.stringify({ mode, settings: { size: "1024x1024", n: 1 } })
      });
      this.sessions.unshift(body.session);
      this.currentSessionId = body.session.id;
      this.messages = [];
      this.nextMessageCursor = null;
      return body.session;
    },
    /** 切换会话时拉取该会话最新一页消息（时间倒序接口返回后转为正序展示） */
    async loadMessages(sessionId: string) {
      const body = await apiFetch<{ items: Message[]; nextCursor: number | null }>(
        `/sessions/${sessionId}/messages`
      );
      this.currentSessionId = sessionId;
      this.messages = body.items.map(normalizeMessageAttachments);
      this.nextMessageCursor = body.nextCursor;
    },
    /** 向上无限滚动：在头部拼接更早的消息，`nextMessageCursor` 递减 */
    async loadOlderMessages() {
      if (!this.currentSessionId || !this.nextMessageCursor || this.olderMessagesLoading) return;
      this.olderMessagesLoading = true;
      try {
        const body = await apiFetch<{ items: Message[]; nextCursor: number | null }>(
          `/sessions/${this.currentSessionId}/messages?cursor=${this.nextMessageCursor}`
        );
        const existingIds = new Set(this.messages.map((message) => message.id));
        const older = body.items
          .map(normalizeMessageAttachments)
          .filter((message) => !existingIds.has(message.id));
        this.messages = [...older, ...this.messages];
        this.nextMessageCursor = body.nextCursor;
      } finally {
        this.olderMessagesLoading = false;
      }
    },
    /**
     * 提交生图：调用 POST /api/generate，在本地**同步**插入两条消息，不等待生图完成。
     *
     * 为何要有 local-* 用户消息 id？
     * - 减少一次往返即可滚动到底部；与后端落库的 user 消息可能重复展示策略由视图层处理（通常首次用本地，刷新后以服务端为准）。
     *
     * 时序（符号）：
     *   UI → store.generate
     *     → fetch POST /api/generate ──202──► { taskId, messageId, sessionId, wsUrl }
     *     → messages += [user@local, assistant@messageId&taskId:queued]
     *   并行：useTaskWebSocket(wsUrl) 收 task.update / task.image / task.done|failed
     *     → applyTaskEvent 更新同一条 assistant 消息
     */
    async generate(input: {
      title?: string;
      prompt: string;
      mode: SessionMode;
      size: string;
      n: number;
      referenceImageIds?: string[];
      referenceImages?: ImageAttachment[];
      /** AI 图像生成页的用量提交事件。随 /generate 同步写入，避免结果事件先到。 */
      generationEvent?: {
        route?: string;
        caseId?: string;
        metadata?: Record<string, unknown>;
      };
    }) {
      this.loading = true;
      try {
        const body = await apiFetch<{
          taskId: string;
          sessionId: string;
          messageId: string;
          wsUrl: string;
          title: string;
        }>("/generate", {
          method: "POST",
          body: JSON.stringify({ ...input, sessionId: this.currentSessionId ?? undefined })
        });
        const createdAt = Date.now();
        const currentSession = this.sessions.find((session) => session.id === body.sessionId);
        if (currentSession) {
          currentSession.title = body.title ?? input.title ?? currentSession.title;
          currentSession.mode = input.mode;
          currentSession.settings = {
            ...currentSession.settings,
            size: input.size,
            n: input.n
          };
          currentSession.lastMessageAt = createdAt;
        } else {
          // 侧栏尚无该会话（如首次从空白页生图）：补一条摘要以避免列表空窗
          this.sessions.unshift({
            id: body.sessionId,
            title: body.title ?? input.title ?? input.prompt.trim().slice(0, 20),
            mode: input.mode,
            settings: { size: input.size, n: input.n },
            lastMessageAt: createdAt
          });
        }
        this.currentSessionId = body.sessionId;
        // 用户消息：仅前端展示的乐观记录（id 以 local- 前缀区分）
        this.messages.push({
          id: `local-${createdAt}`,
          sessionId: body.sessionId,
          role: "user",
          prompt: input.prompt,
          attachments: [],
          referenceImages: input.referenceImages ?? [],
          referenceImageIds: input.referenceImageIds ?? [],
          status: "succeeded",
          createdAt
        });
        // 助手消息：id/messageId 与 D1 一致，后续 WS 用 taskId 关联更新
        this.messages.push({
          id: body.messageId,
          sessionId: body.sessionId,
          role: "assistant",
          prompt: input.prompt,
          attachments: [],
          referenceImageIds: [],
          taskId: body.taskId,
          status: "queued",
          progress: 0,
          createdAt: createdAt + 1
        });
        return body;
      } finally {
        this.loading = false;
      }
    },
    /**
     * 将 Durable Object 经 WebSocket 广播的任务事件合并进当前 messages。
     * 事件形态见 docs/archive/开发需求.md §6.7（task.update / task.image / task.done / task.failed）。
     *
     * 注意：部分推送里 payload.task 可能未带全字段，故 task.image 分支用 find(taskId) 不依赖 payload.task.id。
     */
    applyTaskEvent(event: unknown) {
      if (!event || typeof event !== "object") return;
      // --- 各分支均以 `payload.task.id` 与本地 `message.taskId` 对齐，只改**助手**气泡 ---
      // 与 TaskEvent 对齐的宽松结构（服务端/DO 可能少传 task 内层字段）
      const payload = event as {
        type?: string;
        task?: { id: string; status: string; progress?: number };
        image?: ImageAttachment;
        images?: ImageAttachment[];
        error?: { code?: string; message: string };
      };
      // task.update：合并队列/运行态与 0~1 进度（与后端 task.status 字符串一致）
      const message = this.messages.find((item) => item.taskId === payload.task?.id);
      if (payload.type === "task.update" && message && payload.task) {
        message.status = payload.task.status;
        if (typeof payload.task.progress === "number") message.progress = payload.task.progress;
      }
      // task.image：边生成边追加附件；同 id 不重复 push（断线重连可能重放）
      if (payload.type === "task.image" && payload.image) {
        const target = this.messages.find((item) => item.taskId === payload.task?.id);
        if (target && !target.attachments.some((image) => image.id === payload.image?.id)) {
          target.attachments.push({
            ...payload.image,
            taskId: target.taskId,
            sessionId: target.sessionId,
            messageId: target.id
          });
        }
      }
      // task.done：一次给全量图，覆盖增量，避免漏推与顺序争议
      if (payload.type === "task.done" && payload.images) {
        const target = this.messages.find((item) => item.taskId === payload.task?.id);
        if (target) {
          target.status = "succeeded";
          target.progress = 1;
          target.attachments = payload.images.map((image) => ({
            ...image,
            taskId: target.taskId,
            sessionId: target.sessionId,
            messageId: target.id
          }));
        }
      }
      if (payload.type === "task.failed") {
        // task.failed：终态失败，附件可保留已推的图，由视图决定是否提供重试入口
        const target = this.messages.find((item) => item.taskId === payload.task?.id);
        if (target) {
          target.status = "failed";
          target.progress = null;
          if (payload.images?.length) {
            const existingIds = new Set(target.attachments.map((image) => image.id));
            for (const image of payload.images) {
              if (existingIds.has(image.id)) continue;
              target.attachments.push({
                ...image,
                taskId: target.taskId,
                sessionId: target.sessionId,
                messageId: target.id
              });
              existingIds.add(image.id);
            }
          }
          target.error = payload.error
            ? {
                code: payload.error.code ?? "PROVIDER_ERROR",
                message: payload.error.message
              }
            : null;
        }
      }
    }
  }
});

/**
 * 为历史/分页接口返回的附件、参考图补齐 `taskId` / `sessionId` / `messageId`。
 * 老数据或并集接口可能只带 `id`+`url`，展示与鉴权需统一外键供 `ImageMessage` 等使用。
 */
function normalizeMessageAttachments(message: Message): Message {
  return {
    ...message,
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

function normalizeSession(session: Session): Session {
  return {
    ...session,
    mode: normalizeSessionMode(session.mode)
  };
}

function normalizeSessionMode(mode: unknown): SessionMode {
  return mode === "text2image" ? "text2image" : "image2image";
}
