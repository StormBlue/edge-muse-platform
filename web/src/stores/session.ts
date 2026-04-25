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
  referenceImageIds: string[];
  taskId?: string | null;
  status: string;
  createdAt: number;
};
export type Session = {
  id: string;
  title: string;
  mode: SessionMode;
  settings: { size: string; n: number; model?: string };
  lastMessageAt: number;
};

export const useSessionStore = defineStore("sessions", {
  state: () => ({
    sessions: [] as Session[],
    currentSessionId: null as string | null,
    messages: [] as Message[],
    loading: false
  }),
  getters: {
    currentSession: (state) =>
      state.sessions.find((session) => session.id === state.currentSessionId) ?? null
  },
  actions: {
    async loadSessions() {
      const body = await apiFetch<{ items: Session[] }>("/sessions");
      this.sessions = body.items;
      if (!this.currentSessionId && this.sessions[0]) this.currentSessionId = this.sessions[0].id;
    },
    async createSession(mode: SessionMode = "text2image") {
      const body = await apiFetch<{ session: Session }>("/sessions", {
        method: "POST",
        body: JSON.stringify({ mode, settings: { size: "1024x1024", n: 1 } })
      });
      this.sessions.unshift(body.session);
      this.currentSessionId = body.session.id;
      this.messages = [];
      return body.session;
    },
    async loadMessages(sessionId: string) {
      const body = await apiFetch<{ items: Message[] }>(`/sessions/${sessionId}/messages`);
      this.currentSessionId = sessionId;
      this.messages = body.items.map(normalizeMessageAttachments);
    },
    async generate(input: {
      prompt: string;
      mode: SessionMode;
      size: string;
      n: number;
      referenceImageIds?: string[];
    }) {
      this.loading = true;
      try {
        const body = await apiFetch<{
          taskId: string;
          sessionId: string;
          messageId: string;
          wsUrl: string;
        }>("/generate", {
          method: "POST",
          body: JSON.stringify({ ...input, sessionId: this.currentSessionId ?? undefined })
        });
        this.currentSessionId = body.sessionId;
        this.messages.push({
          id: `local-${Date.now()}`,
          sessionId: body.sessionId,
          role: "user",
          prompt: input.prompt,
          attachments: [],
          referenceImageIds: input.referenceImageIds ?? [],
          status: "succeeded",
          createdAt: Date.now()
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
          createdAt: Date.now() + 1
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
        task?: { id: string; status: string };
        image?: ImageAttachment;
        images?: ImageAttachment[];
        error?: { message: string };
      };
      const message = this.messages.find((item) => item.taskId === payload.task?.id);
      if (payload.type === "task.update" && message && payload.task)
        message.status = payload.task.status;
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
        if (target) target.status = "failed";
      }
    }
  }
});

function normalizeMessageAttachments(message: Message): Message {
  return {
    ...message,
    attachments: message.attachments.map((image) => ({
      ...image,
      taskId: image.taskId ?? message.taskId ?? null,
      sessionId: image.sessionId ?? message.sessionId,
      messageId: image.messageId ?? message.id,
      prompt: image.prompt ?? message.prompt ?? null
    }))
  };
}
