import { describe, expect, it } from "vitest";
import { imagesForAiImageActiveResult } from "./aiImageResultScope";
import type { ImageAttachment, Message } from "@/stores/session";

describe("imagesForAiImageActiveResult", () => {
  it("does not show old images before the current page has an active task", () => {
    const oldImage = image("old");

    expect(
      imagesForAiImageActiveResult([message({ taskId: "task_old", attachments: [oldImage] })], {
        taskId: null,
        sessionId: null
      })
    ).toEqual([]);
  });

  it("only returns images belonging to the active task", () => {
    const oldImage = image("old");
    const currentImage = image("current");

    expect(
      imagesForAiImageActiveResult(
        [
          message({ taskId: "task_old", sessionId: "session_old", attachments: [oldImage] }),
          message({
            taskId: "task_current",
            sessionId: "session_current",
            attachments: [currentImage]
          })
        ],
        { taskId: "task_current", sessionId: "session_current" }
      )
    ).toEqual([currentImage]);
  });
});

function image(id: string): ImageAttachment {
  return {
    id,
    url: `/api/i/${id}`,
    mime: "image/png",
    byteSize: 10
  };
}

function message(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? "msg",
    sessionId: overrides.sessionId ?? "session",
    role: overrides.role ?? "assistant",
    prompt: "prompt",
    attachments: overrides.attachments ?? [],
    referenceImageIds: [],
    taskId: overrides.taskId ?? null,
    status: "succeeded",
    createdAt: 1,
    ...overrides
  };
}
