// @vitest-environment happy-dom
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import { useWorkspaceActions } from "./useWorkspaceActions";
import type { Message } from "@/stores/session";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn()
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("useWorkspaceActions", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("passes workspace experiment metadata when submitting a generation task", async () => {
    const { actions, sessions, router, connect } = createActions();

    await actions.submit({
      prompt: "生成一张产品广告图",
      mode: "text2image",
      size: "1024x1024",
      n: 2,
      files: []
    });

    expect(sessions.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "生成一张产品广告图",
        mode: "text2image",
        size: "1024x1024",
        n: 2,
        experimentEvent: {
          route: "/workspace",
          metadata: {
            mode: "text2image",
            size: "1024x1024",
            n: 2,
            referenceImageCount: 0,
            promptSource: "user",
            directAccess: false
          }
        }
      })
    );
    expect(connect).toHaveBeenCalledWith("ws://localhost/ws/task/tsk_1");
    expect(router.replace).toHaveBeenCalledWith("/workspace/s/ses_1");
  });

  it("does not send generation experiment metadata for continuous chat mode", async () => {
    const { actions, sessions } = createActions();

    await actions.submit({
      prompt: "继续优化上一轮结果",
      mode: "chat",
      size: "1024x1024",
      n: 1,
      files: []
    });

    expect(sessions.generate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        experimentEvent: expect.anything()
      })
    );
  });

  it("sends retry experiment context when retrying a failed task", async () => {
    const { actions, sessions, connect } = createActions();
    const failedMessage = message({
      id: "msg_failed",
      role: "assistant",
      taskId: "tsk_failed",
      status: "failed"
    });
    sessions.messages = [
      message({
        id: "msg_user",
        role: "user",
        referenceImageIds: ["img_ref"],
        referenceImages: [
          {
            id: "img_ref",
            url: "/api/images/img_ref",
            mime: "image/png",
            byteSize: 100
          }
        ]
      }),
      failedMessage
    ];
    mockedApiFetch.mockResolvedValueOnce({
      taskId: "tsk_retry",
      sessionId: "ses_1",
      messageId: "msg_retry"
    });

    await actions.retry(failedMessage);

    expect(mockedApiFetch).toHaveBeenCalledWith("/tasks/tsk_failed/retry", {
      method: "POST",
      body: JSON.stringify({
        experimentEvent: {
          route: "/workspace",
          metadata: { isRetry: true, retryTrigger: "workspace", directAccess: false }
        }
      })
    });
    expect(connect).toHaveBeenCalledWith("/ws/task/tsk_retry");
    expect(sessions.messages.at(-1)).toMatchObject({
      id: "msg_retry",
      taskId: "tsk_retry",
      status: "queued"
    });
  });

  it("marks workspace submissions as direct access for users assigned to the AI image entry", async () => {
    const { actions, sessions } = createActions({
      auth: {
        isSysadmin: false,
        generationExperience: {
          experimentKey: "generation_experience",
          status: "running",
          strategy: "ab_test",
          variant: "B",
          navTarget: "/ai-image",
          showLegacy: false,
          showAi: true
        }
      }
    });

    await actions.submit({
      prompt: "仍然使用专业工作台",
      mode: "text2image",
      size: "1024x1024",
      n: 1,
      files: []
    });

    expect(sessions.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentEvent: expect.objectContaining({
          metadata: expect.objectContaining({ directAccess: true })
        })
      })
    );
  });
});

function createActions(overrides: { auth?: unknown } = {}) {
  const sessions = {
    messages: [] as Message[],
    generate: vi.fn().mockResolvedValue({
      taskId: "tsk_1",
      sessionId: "ses_1",
      messageId: "msg_1",
      wsUrl: "ws://localhost/ws/task/tsk_1",
      title: "图像生成"
    }),
    upsertSession: vi.fn()
  };
  const router = { replace: vi.fn() };
  const connect = vi.fn();
  const actions = useWorkspaceActions({
    t: (key) => key,
    router: router as never,
    sessions: sessions as never,
    auth: (overrides.auth ?? { isSysadmin: false, generationExperience: null }) as never,
    connect,
    draftTitle: ref(""),
    submitting: ref(false),
    selectedImage: ref(null),
    hasRunningTask: computed(() => false),
    oneShotTaskLocked: computed(() => false),
    maxReferenceFiles: computed(() => 5),
    activeFailedMessage: computed(() => null),
    activePreviewImage: computed(() => null),
    supportsMode: () => true,
    supportsSize: () => true,
    openActiveGeneration: vi.fn()
  });
  return { actions, sessions, router, connect };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    sessionId: "ses_1",
    role: "assistant",
    prompt: "prompt",
    attachments: [],
    referenceImageIds: [],
    referenceImages: [],
    status: "succeeded",
    createdAt: 1,
    ...overrides
  };
}
