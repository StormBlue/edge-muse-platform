import { defineStore } from "pinia";
import { apiFetch } from "@/api/client";

export type SessionMode = "text2image" | "image2image" | "chat";
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
  prompt?: string | null;
};
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
export type Session = {
  id: string;
  title: string;
  mode: SessionMode;
  settings: { size: string; n: number; model?: string };
  lastMessageAt: number;
};
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
    sessions: [] as Session[],
    currentSessionId: null as string | null,
    messages: [] as Message[],
    loading: false,
    sessionsLoading: false,
    olderMessagesLoading: false,
    nextSessionCursor: null as number | null,
    nextMessageCursor: null as number | null
  }),
  getters: {
    currentSession: (state) =>
      state.sessions.find((session) => session.id === state.currentSessionId) ?? null
  },
  actions: {
    upsertSession(session: Session) {
      const index = this.sessions.findIndex((item) => item.id === session.id);
      if (index >= 0) {
        this.sessions[index] = { ...this.sessions[index], ...session };
      } else {
        this.sessions.unshift(session);
      }
    },
    async loadSessions() {
      this.sessionsLoading = true;
      try {
        const body = await apiFetch<{ items: Session[]; nextCursor: number | null }>("/sessions");
        this.sessions = body.items;
        this.nextSessionCursor = body.nextCursor;
      } finally {
        this.sessionsLoading = false;
      }
      if (!this.currentSessionId && this.sessions[0]) this.currentSessionId = this.sessions[0].id;
    },
    async loadActiveGeneration() {
      const body = await apiFetch<{ active: ActiveGeneration | null }>(
        "/sessions/active-generation"
      );
      if (body.active?.session) this.upsertSession(body.active.session);
      return body.active;
    },
    async loadMoreSessions() {
      if (!this.nextSessionCursor || this.sessionsLoading) return;
      this.sessionsLoading = true;
      try {
        const body = await apiFetch<{ items: Session[]; nextCursor: number | null }>(
          `/sessions?cursor=${this.nextSessionCursor}`
        );
        const existingIds = new Set(this.sessions.map((session) => session.id));
        this.sessions = [
          ...this.sessions,
          ...body.items.filter((session) => !existingIds.has(session.id))
        ];
        this.nextSessionCursor = body.nextCursor;
      } finally {
        this.sessionsLoading = false;
      }
    },
    async createSession(mode: SessionMode = "text2image") {
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
    async loadMessages(sessionId: string) {
      const body = await apiFetch<{ items: Message[]; nextCursor: number | null }>(
        `/sessions/${sessionId}/messages`
      );
      this.currentSessionId = sessionId;
      this.messages = body.items.map(normalizeMessageAttachments);
      this.nextMessageCursor = body.nextCursor;
    },
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
    async generate(input: {
      title?: string;
      prompt: string;
      mode: SessionMode;
      size: string;
      n: number;
      referenceImageIds?: string[];
      referenceImages?: ImageAttachment[];
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
          this.sessions.unshift({
            id: body.sessionId,
            title: body.title ?? input.title ?? input.prompt.trim().slice(0, 20),
            mode: input.mode,
            settings: { size: input.size, n: input.n },
            lastMessageAt: createdAt
          });
        }
        this.currentSessionId = body.sessionId;
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
    applyTaskEvent(event: unknown) {
      if (!event || typeof event !== "object") return;
      const payload = event as {
        type?: string;
        task?: { id: string; status: string; progress?: number };
        image?: ImageAttachment;
        images?: ImageAttachment[];
        error?: { code?: string; message: string };
      };
      const message = this.messages.find((item) => item.taskId === payload.task?.id);
      if (payload.type === "task.update" && message && payload.task) {
        message.status = payload.task.status;
        if (typeof payload.task.progress === "number") message.progress = payload.task.progress;
      }
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
        const target = this.messages.find((item) => item.taskId === payload.task?.id);
        if (target) {
          target.status = "failed";
          target.progress = null;
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
