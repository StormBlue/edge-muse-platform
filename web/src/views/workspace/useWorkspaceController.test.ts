// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import { useSessionStore } from "@/stores/session";
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
  const component = defineComponent({
    setup() {
      useWorkspaceController();
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
  return { wrapper, router, sessions: useSessionStore(pinia) };
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
