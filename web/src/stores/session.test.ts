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
