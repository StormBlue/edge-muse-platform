// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskCenter from "./TaskCenter.vue";
import { useAuthStore } from "@/stores/auth";
import { useTaskActivityStore } from "@/stores/taskActivity";
import { useUiStore } from "@/stores/ui";
import type { GenerationTask } from "@/api/tasks";

vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));

let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  setActivePinia(createPinia());
  useUiStore().locale = "zh-CN";
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function render() {
  const auth = useAuthStore();
  auth.user = {
    id: "user-1",
    username: "user",
    email: "user@example.com",
    nickname: "User",
    role: "user",
    status: "active"
  };
  auth.generationEntry = { navTarget: "/ai-image", showWorkspace: true, showAiImage: true };
  const tasks = useTaskActivityStore();
  vi.spyOn(tasks, "refresh").mockResolvedValue();
  tasks.items = [
    {
      id: "task-1",
      sessionId: "session-1",
      title: "海边的建筑",
      status: "queued",
      phase: "queued",
      prompt: "建筑",
      messageId: "message-1",
      params: { mode: "text2image", size: "1024x1024", n: 2 },
      queuedAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      canCancel: true,
      images: [],
      referenceImages: [],
      quota: { precharged: 2, refunded: 0, consumed: 2 },
      errorCode: null,
      errorMessage: null,
      retryOf: null
    }
  ] satisfies GenerationTask[];
  tasks.activeCount = 1;
  tasks.open = true;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }]
  });
  await router.push("/history");
  wrapper = mount(TaskCenter, { attachTo: document.body, global: { plugins: [router] } });
  await flushPromises();
  return { auth, tasks, router };
}

describe("TaskCenter", () => {
  it("renders a labelled dialog with real status, reserved quota, and queue cancellation", async () => {
    const { tasks } = await render();
    const cancel = vi.spyOn(tasks, "cancel").mockResolvedValue(true);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.textContent).toContain("排队中");
    expect(dialog?.textContent).toContain("预扣 2");
    expect(dialog?.textContent).not.toContain("消耗 2");
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("取消排队")
    );
    button?.click();
    await flushPromises();
    expect(cancel).toHaveBeenCalledWith("task-1");
  });

  it("links to the task in AI image mode and falls back to the workspace when disabled", async () => {
    const { auth, tasks } = await render();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector("a")?.getAttribute("href")).toBe("/ai-image?task=task-1");
    auth.generationEntry!.showAiImage = false;
    await flushPromises();
    expect(dialog?.querySelector("a")?.getAttribute("href")).toBe("/workspace/s/session-1");
    dialog?.querySelector("a")?.click();
    await flushPromises();
    expect(tasks.open).toBe(false);
  });
});
