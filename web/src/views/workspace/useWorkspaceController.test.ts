// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import { useSessionStore } from "@/stores/session";
import { useTaskActivityStore } from "@/stores/taskActivity";
import type { GenerationTask } from "@/api/tasks";
import { useWorkspaceController } from "./useWorkspaceController";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({
    isSysadmin: false,
    user: {},
    generationTargets: [],
    providerCapabilities: null,
    bootstrap: vi.fn()
  })
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("vue-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/composables/useTaskWebSocket", () => ({
  useTaskWebSocket: () => ({ status: ref("closed"), ...mocks })
}));
const api = vi.mocked(apiFetch);
const active = {
  taskId: "task-active",
  sessionId: "active",
  session: { id: "active", mode: "image2image", settings: { n: 1, size: "auto" } }
};
const page = (sessionId: string, running = false) => ({
  items: [
    {
      id: sessionId,
      sessionId,
      role: "assistant",
      status: running ? "running" : "succeeded",
      taskId: `task-${sessionId}`,
      attachments: [],
      referenceImageIds: [],
      createdAt: 1
    }
  ],
  nextCursor: null
});

async function render(path: string) {
  let controller!: ReturnType<typeof useWorkspaceController>;
  const component = defineComponent({
    setup() {
      controller = useWorkspaceController();
      return () => h("div");
    }
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/workspace/:rest(.*)*", component },
      { path: "/workspace/s/:sessionId", component }
    ]
  });
  await router.push(path);
  const pinia = createPinia();
  const wrapper = mount(component, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return {
    wrapper,
    router,
    sessions: useSessionStore(pinia),
    controller,
    activity: useTaskActivityStore(pinia)
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.mockImplementation(async (path) => {
    if (path === "/sessions") return { items: [], nextCursor: null };
    if (path === "/sessions/active-generation") return { active };
    return page(path.split("/")[2]!, path.includes("/active/"));
  });
});

describe("workspace route ownership", () => {
  it("keeps the original reference requirement when only some image IDs are recoverable", async () => {
    const implementation = api.getMockImplementation()!;
    const available = { id: "available", url: "/images/available", mime: "image/png", byteSize: 1 };
    api.mockImplementation((path, ...args) =>
      path === "/tasks/source"
        ? Promise.resolve({
            summary: {
              id: "source",
              prompt: "必须保留两个主体",
              params: {
                mode: "image2image",
                size: "auto",
                n: 1,
                referenceImageIds: ["available", "missing"]
              },
              images: [],
              referenceImages: [available, { ...available, id: "unrelated" }]
            }
          })
        : implementation(path, ...args)
    );
    const { wrapper, controller } = await render("/workspace?sourceTask=source&reuse=params");
    expect(controller.reuseReferences.value).toEqual([available]);
    expect(controller.reuseReferenceCount.value).toBe(2);
    expect(api.mock.calls.some(([path]) => path === "/generate")).toBe(false);
    wrapper.unmount();
  });
  it("loads recreation parameters without submission or active-task recovery", async () => {
    const implementation = api.getMockImplementation()!;
    const sourceImage = { id: "image-1", url: "/images/image-1", mime: "image/png", byteSize: 100 };
    api.mockImplementation((path, ...args) =>
      path === "/tasks/source"
        ? Promise.resolve({
            summary: {
              id: "source",
              prompt: "保留包装文字",
              params: { mode: "text2image", size: "1024x1024", n: 3 },
              images: [sourceImage],
              referenceImages: []
            }
          })
        : implementation(path, ...args)
    );
    const { wrapper, controller } = await render(
      "/workspace?mode=blank&sourceTask=source&reuse=reference&image=image-1"
    );
    expect(controller.reusePrompt.value).toBe("保留包装文字");
    expect(controller.reuseReferences.value).toEqual([sourceImage]);
    expect(controller.taskInputMode.value).toBe("image2image");
    expect(controller.currentGenerationSettings.value).toMatchObject({ size: "1024x1024", n: 1 });
    expect(controller.reuseNotice.value).toBe("recreate.adjusted");
    expect(
      api.mock.calls.some(
        ([path]) => path === "/generate" || path === "/sessions/active-generation"
      )
    ).toBe(false);
    wrapper.unmount();
  });

  it("discards delayed recreation data after opening an explicit session", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const implementation = api.getMockImplementation()!;
    api.mockImplementation((path, ...args) =>
      path === "/tasks/source" ? pending : implementation(path, ...args)
    );
    const { wrapper, controller, router, sessions } = await render(
      "/workspace?sourceTask=source&reuse=params"
    );
    await router.push("/workspace/s/history");
    await flushPromises();
    resolve({
      summary: {
        id: "source",
        prompt: "过时提示词",
        params: { mode: "text2image", size: "auto", n: 1 },
        images: [],
        referenceImages: []
      }
    });
    await flushPromises();
    expect(controller.reusePrompt.value).toBe("");
    expect(sessions.currentSessionId).toBe("history");
    wrapper.unmount();
  });

  it("merges cancellation only into its matching current-session task", async () => {
    const { wrapper, controller, router, sessions, activity } = await render("/workspace/s/active");
    expect(controller.generationProgress.value).toBeNull();
    activity.items = [
      { id: "task-other", sessionId: "other", status: "cancelled", images: [] },
      { id: "task-active", sessionId: "active", status: "cancelled", images: [], errorCode: null }
    ].map((task): GenerationTask => ({
      messageId: task.sessionId,
      title: "task",
      phase: "cancelled",
      prompt: "prompt",
      params: { mode: "text2image", size: "auto", n: 1 },
      queuedAt: 1,
      startedAt: null,
      finishedAt: 2,
      canCancel: false,
      referenceImages: [],
      quota: { precharged: 1, refunded: 1, consumed: 0 },
      errorCode: null,
      errorMessage: null,
      retryOf: null,
      ...task,
      status: "cancelled"
    }));
    await flushPromises();
    expect(sessions.currentSessionId).toBe("active");
    expect(router.currentRoute.value.path).toBe("/workspace/s/active");
    expect(sessions.messages[0]?.status).toBe("cancelled");
    expect(controller.hasRunningTask.value).toBe(false);
    expect(controller.failedTitle.value).toBe("recreate.cancelled");
    wrapper.unmount();
  });
  it("keeps an explicit historical session instead of replacing it with another active task", async () => {
    const { wrapper, router, sessions } = await render("/workspace/s/history");
    expect(router.currentRoute.value.path).toBe("/workspace/s/history");
    expect(sessions.currentSessionId).toBe("history");
    expect(api).not.toHaveBeenCalledWith("/sessions/active-generation");
    expect(mocks.connect).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("connects the explicitly selected running session", async () => {
    const { wrapper } = await render("/workspace/s/active");
    expect(mocks.connect).toHaveBeenCalledWith("/ws/task/task-active");
    wrapper.unmount();
  });

  it("restores an active task from the unspecified workspace entry", async () => {
    const { wrapper, router } = await render("/workspace");
    expect(router.currentRoute.value.path).toBe("/workspace/s/active");
    expect(mocks.connect).toHaveBeenCalledWith("/ws/task/task-active");
    wrapper.unmount();
  });

  it.each(["navigate", "unmount"])(
    "does not let delayed recovery navigate after %s",
    async (action) => {
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const implementation = api.getMockImplementation()!;
      api.mockImplementation((path, ...args) =>
        path === "/sessions/active-generation" ? pending : implementation(path, ...args)
      );
      const { wrapper, router, sessions } = await render("/workspace");
      if (action === "navigate") {
        await router.push("/workspace/s/history");
        await flushPromises();
      } else wrapper.unmount();
      const pathAfterLeaving = router.currentRoute.value.path;
      resolve({ active });
      await flushPromises();
      expect(router.currentRoute.value.path).toBe(pathAfterLeaving);
      expect(mocks.connect).not.toHaveBeenCalled();
      if (action === "navigate") {
        expect(sessions.currentSessionId).toBe("history");
        wrapper.unmount();
      }
    }
  );
});
