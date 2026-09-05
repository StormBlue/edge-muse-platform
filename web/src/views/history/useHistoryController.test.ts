// @vitest-environment happy-dom
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryController } from "./useHistoryController";
import type { HistorySession } from "./historyTypes";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/api/client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("vue-sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: "en-US" } })
}));

let wrapper: VueWrapper | undefined;
const session = (id: string): HistorySession => ({
  id,
  title: id,
  mode: "text2image",
  settings: { size: "auto", n: 1 },
  lastMessageAt: 1,
  taskCount: 1
});
const list = (page = 1) => ({ items: [session(`page-${page}`)], page, total: 36 });
const detail = (id: string) => ({
  session: session(id),
  messages: [
    {
      id: `message-${id}`,
      role: "assistant",
      attachments: [],
      status: "succeeded",
      task: { status: "succeeded" }
    }
  ]
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function setup(path = "/history") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { render: () => null } }]
  });
  await router.push("/workspace");
  await router.push(path);
  let controller!: ReturnType<typeof useHistoryController>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useHistoryController();
        return () => h("div");
      }
    }),
    { global: { plugins: [router] } }
  );
  await flushPromises();
  return { router, controller };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/history?"))
      return list(Number(new URLSearchParams(path.split("?")[1]).get("page")));
    return detail(path.split("/").at(-1)!);
  });
});
afterEach(() => wrapper?.unmount());

describe("history navigation", () => {
  it("closes an opened detail with back and allows forward without adding a loop", async () => {
    const { router, controller } = await setup("/history?page=2&q=test");
    await controller.openDetail(session("a"));
    await flushPromises();
    await controller.backToGrid();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/history?page=2&q=test");
    expect(controller.selectedSession.value).toBeNull();
    router.forward();
    await flushPromises();
    expect(controller.selectedSession.value?.id).toBe("a");
    await controller.backToGrid();
    await flushPromises();
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/workspace");
  });

  it("replaces a direct detail with its filtered list", async () => {
    const { router, controller } = await setup("/history?session=a&page=2&q=test");
    await controller.backToGrid();
    expect(router.currentRoute.value.query).toEqual({ page: "2", order: "recent", q: "test" });
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/workspace");
  });

  it("removes a deleted detail from the current browser history entry", async () => {
    const { router, controller } = await setup();
    await controller.openDetail(session("a"));
    await flushPromises();
    expect(controller.canDeleteSelectedSession.value).toBe(true);
    await controller.deleteSelectedSession();
    router.back();
    await flushPromises();
    router.forward();
    await flushPromises();
    expect(router.currentRoute.value.query.session).toBeUndefined();
    expect(controller.selectedSession.value).toBeNull();
  });
});

describe("history request ordering", () => {
  it("ignores detail responses arriving after the user closes the detail", async () => {
    const { controller } = await setup();
    const pending = deferred<ReturnType<typeof detail>>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    await controller.openDetail(session("a"));
    await controller.backToGrid();
    await flushPromises();
    pending.resolve(detail("a"));
    await flushPromises();
    expect(controller.selectedSession.value).toBeNull();
    expect(controller.detailLoading.value).toBe(false);
  });

  it("keeps the latest detail when requests resolve out of order", async () => {
    const { router, controller } = await setup();
    const first = deferred<ReturnType<typeof detail>>();
    mocks.apiFetch.mockReturnValueOnce(first.promise);
    await controller.openDetail(session("a"));
    await router.push("/history?session=b");
    await flushPromises();
    first.resolve(detail("a"));
    await flushPromises();
    expect(controller.selectedSession.value?.id).toBe("b");
  });

  it("keeps the latest list when pagination responses resolve out of order", async () => {
    const { controller } = await setup();
    const first = deferred<ReturnType<typeof list>>();
    mocks.apiFetch.mockReturnValueOnce(first.promise);
    const olderLoad = controller.load(2);
    await flushPromises();
    await controller.load(3);
    first.resolve(list(2));
    await olderLoad;
    expect(controller.page.value).toBe(3);
    expect(controller.items.value[0]?.id).toBe("page-3");
  });

  it("reports a detail error and restores a usable list", async () => {
    const { router, controller } = await setup();
    mocks.apiFetch.mockRejectedValueOnce({ error: { message: "Session unavailable" } });
    await controller.openDetail(session("missing"));
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Session unavailable");
    expect(router.currentRoute.value.query.session).toBeUndefined();
    expect(controller.selectedSession.value).toBeNull();
    expect(controller.detailLoading.value).toBe(false);
  });

  it("cancels a pending page when back returns to the already displayed page", async () => {
    const { router, controller } = await setup();
    const pending = deferred<ReturnType<typeof list>>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    await router.push("/history?page=2");
    router.back();
    await flushPromises();
    pending.resolve(list(2));
    await flushPromises();
    expect(controller.page.value).toBe(1);
    expect(controller.items.value[0]?.id).toBe("page-1");
  });

  it("reports list failures without leaving the loading state stuck", async () => {
    const { controller } = await setup();
    mocks.apiFetch.mockRejectedValueOnce({ error: { message: "Network unavailable" } });
    await controller.load(2);
    expect(mocks.error).toHaveBeenCalledWith("Network unavailable");
    expect(controller.loading.value).toBe(false);
    expect(controller.items.value).toEqual([]);
    expect(controller.total.value).toBe(0);
    expect(controller.page.value).toBe(2);
    expect(controller.loadError.value).toBe("Network unavailable");
    await controller.load();
    expect(controller.loadError.value).toBe("");
    expect(controller.items.value[0]?.id).toBe("page-2");
  });
});
