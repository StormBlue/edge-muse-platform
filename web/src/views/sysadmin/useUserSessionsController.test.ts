// @vitest-environment happy-dom
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUserSessionsController } from "./useUserSessionsController";
import type { AuditSession } from "./userSessionsTypes";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), error: vi.fn() }));
vi.mock("@/api/client", () => ({ apiFetch: mocks.apiFetch }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "admin" } }) }));
vi.mock("vue-sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: "en-US" } })
}));

let wrapper: VueWrapper | undefined;
const base = "/sysadmin/users/_/sessions";
const session = (id: string): AuditSession => ({
  id,
  title: id,
  mode: "text2image",
  settings: { size: "auto", n: 1 },
  lastMessageAt: 1
});
const detail = (id: string) => ({ session: session(id), messages: [] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function setup(path = base) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/sysadmin/users/:userId/sessions", component: { render: () => null } },
      { path: "/workspace", component: { render: () => null } }
    ]
  });
  await router.push("/workspace");
  await router.push(path);
  let controller!: ReturnType<typeof useUserSessionsController>;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useUserSessionsController();
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
    if (path === "/sysadmin/users") return { items: [] };
    if (path.endsWith("/detail")) return detail(path.split("/").at(-2)!);
    const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
    return { items: [session(`page-${page}`)], page, total: 36 };
  });
});
afterEach(() => wrapper?.unmount());

describe("session audit navigation", () => {
  it("maps the all-users selection to the unfiltered route and API", async () => {
    const { router, controller } = await setup("/sysadmin/users/a/sessions");
    controller.userId.value = "__all_users__";
    await controller.submitFilters();
    expect(controller.userId.value).toBe("");
    expect(router.currentRoute.value.path).toBe(base);
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(`${base}?page=1&pageSize=12`);
  });

  it("hides stale user results on failure and retries the requested page", async () => {
    const { router, controller } = await setup("/sysadmin/users/a/sessions");
    mocks.apiFetch.mockRejectedValueOnce({ error: { message: "Unavailable" } });
    await router.push("/sysadmin/users/b/sessions?page=2");
    await flushPromises();
    expect(controller.sessions.value).toEqual([]);
    expect(controller.total.value).toBe(0);
    expect(controller.page.value).toBe(2);
    expect(controller.loadError.value).toBe("Unavailable");
    await controller.loadSessions();
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(
      "/sysadmin/users/b/sessions?page=2&pageSize=12"
    );
    expect(controller.loadError.value).toBe("");
    expect(controller.sessions.value[0]?.id).toBe("page-2");
  });

  it("returns to the previous filtered table without creating a history loop", async () => {
    const { router, controller } = await setup(`${base}?page=2&q=test`);
    await controller.openDetail(session("a"));
    await flushPromises();
    await controller.backToTable();
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`${base}?page=2&q=test`);
    router.forward();
    await flushPromises();
    expect(controller.selectedSession.value?.id).toBe("a");
    await controller.backToTable();
    await flushPromises();
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/workspace");
  });

  it("replaces direct detail navigation with its table", async () => {
    const { router, controller } = await setup(`${base}?page=2&session=a`);
    await controller.backToTable();
    expect(router.currentRoute.value.query).toEqual({ page: "2" });
    router.back();
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/workspace");
  });

  it("does not reopen a closed detail after a slow response", async () => {
    const { controller } = await setup();
    const pending = deferred<ReturnType<typeof detail>>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    await controller.openDetail(session("a"));
    await controller.backToTable();
    await flushPromises();
    pending.resolve(detail("a"));
    await flushPromises();
    expect(controller.selectedSession.value).toBeNull();
    expect(controller.detailLoading.value).toBe(false);
  });

  it("keeps the latest user filter response when older requests finish later", async () => {
    const { router, controller } = await setup();
    const pending = deferred<{ items: AuditSession[]; page: number; total: number }>();
    mocks.apiFetch.mockReturnValueOnce(pending.promise);
    await router.push("/sysadmin/users/a/sessions");
    await router.push("/sysadmin/users/b/sessions?page=2");
    await flushPromises();
    pending.resolve({ items: [session("old-user")], page: 1, total: 1 });
    await flushPromises();
    expect(controller.userId.value).toBe("b");
    expect(controller.sessions.value[0]?.id).toBe("page-2");
  });

  it("reports detail errors and returns to the table", async () => {
    const { router, controller } = await setup();
    mocks.apiFetch.mockRejectedValueOnce({ error: { message: "Unavailable" } });
    await controller.openDetail(session("a"));
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Unavailable");
    expect(router.currentRoute.value.query.session).toBeUndefined();
    expect(controller.detailLoading.value).toBe(false);
  });
});
