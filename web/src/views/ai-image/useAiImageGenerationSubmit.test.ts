// @vitest-environment happy-dom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { apiFetch } from "@/api/client";
import { useSessionStore } from "@/stores/session";
import { useAiImageGenerationSubmit } from "./useAiImageGenerationSubmit";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  taskCallback: null as null | ((payload: unknown) => void)
}));

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

vi.mock("@/composables/useTaskWebSocket", () => ({
  useTaskWebSocket: (callback: (payload: unknown) => void) => {
    mocks.taskCallback = callback;
    return {
      status: ref("closed"),
      connect: mocks.connect,
      disconnect: mocks.disconnect
    };
  }
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("useAiImageGenerationSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    mockedApiFetch.mockImplementation(async (path) => {
      if (path === "/generate") {
        return {
          taskId: "tsk_1",
          sessionId: "ses_1",
          messageId: "msg_1",
          wsUrl: "/ws/task/tsk_1",
          title: "AI image"
        };
      }
      if (path === "/tasks/tsk_1/retry") {
        return {
          taskId: "tsk_retry",
          sessionId: "ses_1",
          messageId: "msg_retry"
        };
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
  });

  it("defaults new AI image submissions to image to image", () => {
    const generation = useAiImageGenerationSubmit();

    expect(generation.mode.value).toBe("image2image");
    expect(generation.size.value).toBe("auto");
    expect(generation.supportedModes.value).toEqual(["image2image", "text2image"]);
  });

  it("exposes failed task state and retries through the shared retry API", async () => {
    const generation = useAiImageGenerationSubmit();
    const sessions = useSessionStore();
    generation.mode.value = "text2image";

    await generation.submit("失败后重试的 prompt", undefined, {
      route: "/ai-image",
      metadata: { mode: "text2image", size: "1024x1024", n: 1 }
    });
    mocks.taskCallback?.({
      type: "task.failed",
      task: { id: "tsk_1", status: "failed" },
      error: { code: "PROVIDER_TIMEOUT", message: "上游超时" }
    });
    await nextTick();

    expect(generation.activeFailed.value).toBe(true);
    expect(generation.failedTitle.value).toBe("workspace.providerGenerationFailed");
    expect(generation.failedMessage.value).toBe("上游超时");

    await generation.retry({
      route: "/ai-image",
      metadata: { mode: "text2image", size: "1024x1024", n: 1 }
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/tasks/tsk_1/retry", {
      method: "POST",
      body: JSON.stringify({
        generationEvent: {
          route: "/ai-image",
          metadata: {
            mode: "text2image",
            size: "1024x1024",
            n: 1,
            isRetry: true,
            retryTrigger: "ai-image"
          }
        }
      })
    });
    expect(mocks.connect).toHaveBeenLastCalledWith("/ws/task/tsk_retry");
    expect(sessions.messages.at(-1)).toMatchObject({
      id: "msg_retry",
      taskId: "tsk_retry",
      status: "queued"
    });
  });

  it("clears only the current AI image result scope when starting a new flow", async () => {
    const generation = useAiImageGenerationSubmit();
    const sessions = useSessionStore();
    generation.mode.value = "text2image";

    await generation.submit("上一张图的 prompt");
    sessions.applyTaskEvent({
      type: "task.done",
      task: { id: "tsk_1", status: "succeeded" },
      images: [{ id: "img_old", url: "/api/images/img_old", mime: "image/png", byteSize: 10 }]
    });
    await nextTick();

    expect(generation.resultImages.value).toHaveLength(1);

    generation.clearActiveResult();
    await nextTick();

    expect(generation.resultImages.value).toEqual([]);
    expect(sessions.messages.some((message) => message.taskId === "tsk_1")).toBe(true);
  });
});
