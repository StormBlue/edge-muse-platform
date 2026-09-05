import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { apiFetch } from "@/api/client";
import { useSessionStore, type Message } from "./session";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("session store task events", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedApiFetch.mockReset();
  });

  it("returns accepted task identity without mutating a departed view", async () => {
    const sessions = useSessionStore();
    const result = {
      taskId: "accepted",
      sessionId: "old-session",
      messageId: "old-message",
      wsUrl: "/ws/accepted",
      title: "task"
    };
    mockedApiFetch.mockResolvedValueOnce(result);
    const accepted = await sessions.generate(
      { prompt: "prompt", mode: "text2image", size: "auto", n: 1 },
      { canApply: () => false }
    );
    expect(accepted).toEqual(result);
    expect(sessions.sessions).toHaveLength(0);
    expect(sessions.messages).toHaveLength(0);
    expect(sessions.currentSessionId).toBeNull();
    expect(sessions.loading).toBe(false);
  });

  it("keeps new generation loading owned by the newest request", async () => {
    const sessions = useSessionStore();
    const resolvers: Array<(value: unknown) => void> = [];
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const input = { prompt: "prompt", mode: "text2image" as const, size: "auto", n: 1 };
    const first = sessions.generate(input);
    sessions.invalidateMessageLoads();
    const second = sessions.generate(input);
    resolvers[0]!({
      taskId: "old",
      sessionId: "old-session",
      messageId: "old-message",
      title: "old",
      wsUrl: "/ws/old"
    });
    await first;
    expect(sessions.loading).toBe(true);
    expect(sessions.messages).toHaveLength(0);
    resolvers[1]!({
      taskId: "new",
      sessionId: "new-session",
      messageId: "new-message",
      title: "new",
      wsUrl: "/ws/new"
    });
    await second;
    expect(sessions.loading).toBe(false);
    expect(sessions.currentSessionId).toBe("new-session");
    expect(sessions.messages.at(-1)?.taskId).toBe("new");
  });

  it("creates sessions in image to image mode by default", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      session: {
        id: "ses_1",
        title: "New session",
        mode: "image2image",
        settings: { size: "1024x1024", n: 1 },
        lastMessageAt: 1
      }
    });
    const sessions = useSessionStore();

    await sessions.createSession();

    const request = mockedApiFetch.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({ mode: "image2image" });
  });

  it("keeps partial images from failed task events", () => {
    const sessions = useSessionStore();
    sessions.messages = [
      {
        id: "msg_1",
        sessionId: "ses_1",
        role: "assistant",
        prompt: "prompt",
        attachments: [],
        referenceImageIds: [],
        taskId: "tsk_1",
        status: "running",
        progress: 0.5,
        createdAt: 1
      } satisfies Message
    ];

    const event = {
      type: "task.failed",
      task: { id: "tsk_1", status: "failed" },
      error: { code: "GENERATION_TIMEOUT", message: "Timed out" },
      images: [
        {
          id: "img_1",
          url: "/api/i/img_1",
          mime: "image/png",
          byteSize: 123,
          taskId: "tsk_1",
          sessionId: "ses_1"
        }
      ]
    };

    sessions.applyTaskEvent(event);
    sessions.applyTaskEvent(event);

    expect(sessions.messages[0]?.status).toBe("failed");
    expect(sessions.messages[0]?.attachments).toHaveLength(1);
    expect(sessions.messages[0]?.attachments[0]).toMatchObject({
      id: "img_1",
      taskId: "tsk_1",
      sessionId: "ses_1",
      messageId: "msg_1"
    });
  });

  it("sends AI image generation submission metadata with generate requests", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      taskId: "tsk_1",
      sessionId: "ses_1",
      messageId: "msg_1",
      wsUrl: "ws://localhost/ws/task/tsk_1",
      title: "AI image"
    });
    const sessions = useSessionStore();

    await sessions.generate({
      title: "AI image",
      prompt: "生成一张产品图",
      generationTargetId: "micu_grok",
      mode: "text2image",
      size: "1024x1024",
      n: 1,
      generationEvent: {
        route: "/ai-image",
        caseId: "case_1",
        metadata: { mode: "text2image" }
      }
    });

    const request = mockedApiFetch.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toMatchObject({
      generationTargetId: "micu_grok",
      generationEvent: {
        route: "/ai-image",
        caseId: "case_1",
        metadata: { mode: "text2image" }
      }
    });
  });
});
