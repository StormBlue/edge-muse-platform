// @vitest-environment happy-dom
import { computed, effectScope, reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import { useWorkspaceActions } from "./useWorkspaceActions";
import type { Message } from "@/stores/session";
const activity = vi.hoisted(() => ({ observeTask: vi.fn() }));
vi.mock("@/stores/taskActivity", () => ({ useTaskActivityStore: () => activity }));

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
    activity.observeTask.mockReset();
  });

  it("serializes retries and exposes their pending state", async () => {
    let resolve!: (value: unknown) => void;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { actions, submitting } = createActions();
    const failed = message({ taskId: "failed", status: "failed" });
    const first = actions.retry(failed);
    expect(submitting.value).toBe(true);
    await actions.retry(failed);
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    resolve({ taskId: "accepted", sessionId: "ses_1", messageId: "accepted-message" });
    await first;
    expect(submitting.value).toBe(false);
  });

  it.each(["route", "unmount", "account"])(
    "does not apply a late retry after %s changes",
    async (change) => {
      let resolve!: (value: unknown) => void;
      mockedApiFetch.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      const { actions, sessions, router, scope, auth, connect } = createActions();
      const pending = actions.retry(message({ taskId: "failed", status: "failed" }));
      if (change === "route") {
        router.currentRoute.value = { fullPath: "/history" };
        router.currentRoute.value = { fullPath: "/workspace" };
      } else if (change === "unmount") scope.stop();
      else auth.user.id = "user-b";
      resolve({ taskId: "accepted", sessionId: "ses_1", messageId: "accepted-message" });
      await pending;
      expect(sessions.messages).toHaveLength(0);
      expect(connect).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      if (change === "account") expect(activity.observeTask).not.toHaveBeenCalled();
      else expect(activity.observeTask).toHaveBeenCalledWith("accepted");
      scope.stop();
    }
  );

  it.each(["route", "unmount", "account"])(
    "guards accepted submit store writes and navigation after %s changes",
    async (change) => {
      const { actions, sessions, router, scope, auth, connect } = createActions();
      let resolve!: (value: unknown) => void;
      sessions.generate.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      const pending = actions.submit({
        prompt: "prompt",
        mode: "text2image",
        generationTargetId: "default",
        size: "auto",
        n: 1,
        files: []
      });
      if (change === "route") router.currentRoute.value = { fullPath: "/history" };
      else if (change === "unmount") scope.stop();
      else auth.user.id = "user-b";
      const guard = sessions.generate.mock.calls[0]?.[1] as { canApply: () => boolean };
      expect(guard.canApply()).toBe(false);
      resolve({
        taskId: "accepted",
        sessionId: "ses_1",
        wsUrl: "/ws/task/accepted",
        title: "task"
      });
      await pending;
      expect(connect).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
      if (change === "account") expect(activity.observeTask).not.toHaveBeenCalled();
      else expect(activity.observeTask).toHaveBeenCalledWith("accepted");
      scope.stop();
    }
  );

  it("does not create a task after reference upload finishes on a departed page", async () => {
    let resolve!: (value: unknown) => void;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { actions, sessions, router } = createActions();
    const pending = actions.submit({
      prompt: "prompt",
      mode: "image2image",
      generationTargetId: "default",
      size: "auto",
      n: 1,
      files: [new File(["image"], "reference.png", { type: "image/png" })]
    });
    router.currentRoute.value = { fullPath: "/history" };
    resolve({ images: [{ id: "uploaded" }] });
    await pending;
    expect(sessions.generate).not.toHaveBeenCalled();
    expect(activity.observeTask).not.toHaveBeenCalled();
  });

  it("reuses existing image IDs and source lineage without uploading or auto-generating", async () => {
    const { actions, sessions } = createActions({
      reuseSource: { sourceTaskId: "source-task", sourceImageId: "source-image" }
    });
    expect(sessions.generate).not.toHaveBeenCalled();
    const reference = {
      id: "source-image",
      url: "/images/source-image",
      mime: "image/png",
      byteSize: 100
    };
    await actions.submit({
      prompt: "更换背景",
      mode: "image2image",
      generationTargetId: "default",
      size: "auto",
      n: 1,
      files: [],
      referenceImages: [reference]
    });
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(sessions.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTaskId: "source-task",
        sourceImageId: "source-image",
        referenceImageIds: ["source-image"],
        referenceImages: [reference]
      }),
      { canApply: expect.any(Function) }
    );
    expect(activity.observeTask).toHaveBeenCalledWith("tsk_1");
  });

  it("passes workspace generation metadata when submitting a generation task", async () => {
    const { actions, sessions, router, connect } = createActions();

    await actions.submit({
      prompt: "生成一张产品广告图",
      generationTargetId: "micu_grok",
      mode: "text2image",
      size: "1024x1024",
      n: 2,
      files: []
    });

    expect(sessions.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "生成一张产品广告图",
        generationTargetId: "micu_grok",
        mode: "text2image",
        size: "1024x1024",
        n: 2,
        generationEvent: {
          route: "/workspace",
          metadata: {
            mode: "text2image",
            size: "1024x1024",
            n: 2,
            generationTargetId: "micu_grok",
            referenceImageCount: 0,
            promptSource: "user"
          }
        }
      }),
      { canApply: expect.any(Function) }
    );
    expect(connect).toHaveBeenCalledWith("ws://localhost/ws/task/tsk_1");
    expect(router.replace).toHaveBeenCalledWith("/workspace/s/ses_1");
  });

  it("does not submit again after a one-shot task already exists in the session", async () => {
    const { actions, sessions, connect } = createActions({ oneShotLocked: true });

    await actions.submit({
      prompt: "继续优化上一轮结果",
      generationTargetId: "default",
      mode: "text2image",
      size: "1024x1024",
      n: 1,
      files: []
    });

    expect(sessions.generate).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("sends retry generation context when retrying a failed task", async () => {
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
        generationEvent: {
          route: "/workspace",
          metadata: { isRetry: true, retryTrigger: "workspace" }
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
});

function createActions(
  overrides: {
    auth?: unknown;
    oneShotLocked?: boolean;
    reuseSource?: { sourceTaskId: string; sourceImageId?: string };
  } = {}
) {
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
  const router = { replace: vi.fn(), currentRoute: ref({ fullPath: "/workspace" }) };
  const connect = vi.fn();
  const auth = reactive(
    overrides.auth ?? { isSysadmin: false, generationEntry: null, user: { id: "user-a" } }
  ) as never;
  const submitting = ref(false);
  const scope = effectScope();
  const actions = scope.run(() =>
    useWorkspaceActions({
      t: (key) => key,
      router: router as never,
      sessions: sessions as never,
      auth,
      connect,
      draftTitle: ref(""),
      submitting,
      selectedImage: ref(null),
      hasRunningTask: computed(() => false),
      oneShotTaskLocked: computed(() => Boolean(overrides.oneShotLocked)),
      maxReferenceFiles: computed(() => 5),
      activeFailedMessage: computed(() => null),
      activePreviewImage: computed(() => null),
      supportsMode: () => true,
      supportsSize: () => true,
      openActiveGeneration: vi.fn(),
      reuseSource: ref(overrides.reuseSource ?? null)
    })
  )!;
  return {
    actions,
    sessions,
    router,
    connect,
    submitting,
    scope,
    auth: auth as { user: { id: string } }
  };
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
