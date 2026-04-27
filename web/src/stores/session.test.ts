import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore, type Message } from "./session";

describe("session store task events", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
});
