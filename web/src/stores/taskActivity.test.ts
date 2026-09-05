// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { cancelTask, getTask, listTasks, type GenerationTask, type TaskPage } from "@/api/tasks";
import { useAuthStore, type User } from "./auth";
import { useTaskActivityStore } from "./taskActivity";

vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/api/tasks", () => ({ cancelTask: vi.fn(), getTask: vi.fn(), listTasks: vi.fn() }));
vi.mock("vue-sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

function user(id = "user-1"): User {
  return {
    id,
    email: "user@example.com",
    username: id,
    nickname: id,
    role: "user",
    status: "active"
  };
}

function task(id: string, status: GenerationTask["status"] = "queued"): GenerationTask {
  return {
    id,
    sessionId: "session-1",
    messageId: "message-1",
    title: "Test image",
    status,
    phase: status === "running" ? "generating" : status,
    prompt: "Landscape",
    params: { mode: "text2image", size: "1024x1024", n: 1 },
    queuedAt: 1000,
    startedAt: null,
    finishedAt: null,
    canCancel: status === "queued",
    images: [],
    referenceImages: [],
    quota: { precharged: 1, refunded: 0, consumed: 1 },
    errorCode: null,
    errorMessage: null,
    retryOf: null
  };
}

function page(items: GenerationTask[], nextCursor: string | null = null): TaskPage {
  return {
    items,
    nextCursor,
    activeCount: items.filter((item) => ["queued", "running"].includes(item.status)).length
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("global task activity lifecycle", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(getTask).mockReset();
    vi.mocked(cancelTask).mockReset();
    vi.mocked(listTasks).mockResolvedValue(page([]));
    vi.mocked(apiFetch).mockResolvedValue({
      user: user(),
      quota: { allocatedQuota: 20, remainingQuota: 19, usedQuota: 1 }
    });
    useAuthStore().user = user();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    useTaskActivityStore().stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent refreshes and discards responses after account switches", async () => {
    const pending = deferred<TaskPage>();
    vi.mocked(listTasks).mockReturnValue(pending.promise);
    const store = useTaskActivityStore();
    const first = store.refresh();
    void store.refresh();
    expect(listTasks).toHaveBeenCalledTimes(2);
    useAuthStore().user = user("user-2");
    pending.resolve(page([task("private-user-1-task")]));
    await first;
    expect(store.items).toEqual([]);
    expect(store.activeCount).toBe(0);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("suppresses initial historical notifications, then notifies exactly once per observed terminal transition", async () => {
    const store = useTaskActivityStore();
    vi.mocked(listTasks).mockResolvedValue(page([task("historical", "succeeded"), task("live")]));
    await store.refresh();
    expect(toast.success).not.toHaveBeenCalled();
    vi.mocked(listTasks).mockResolvedValue(
      page([task("historical", "succeeded"), task("live", "succeeded")])
    );
    await store.refresh();
    await store.refresh();
    expect(toast.success).toHaveBeenCalledTimes(1);
    useAuthStore().user = null;
    expect(toast.dismiss).toHaveBeenCalledWith("generation-task-live");
    expect(store.items).toEqual([]);
  });

  it("recovers completion for a long-running task that falls outside the recent page", async () => {
    const store = useTaskActivityStore();
    vi.mocked(listTasks).mockResolvedValue(page([task("long")]));
    await store.refresh();
    vi.mocked(listTasks).mockResolvedValue(page([]));
    vi.mocked(getTask).mockResolvedValue(task("long", "failed"));
    await store.refresh();
    expect(getTask).toHaveBeenCalledWith("long");
    expect(store.items[0]?.status).toBe("failed");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does not log the user out when a quota refresh fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network unavailable"));
    const auth = useAuthStore();
    auth.quota = { allocatedQuota: 20, remainingQuota: 17, usedQuota: 3 };
    await useTaskActivityStore().refresh();
    expect(auth.user?.id).toBe("user-1");
    expect(auth.quota.remainingQuota).toBe(17);
  });

  it("keeps observing a long task when its detail refresh temporarily fails", async () => {
    const store = useTaskActivityStore();
    vi.mocked(listTasks).mockResolvedValue(page([task("long")]));
    await store.refresh();
    vi.mocked(listTasks).mockResolvedValue(page([]));
    vi.mocked(getTask).mockRejectedValueOnce(new Error("Offline"));
    await store.refresh();
    expect(store.items[0]?.id).toBe("long");
    vi.mocked(getTask).mockResolvedValueOnce(task("long", "succeeded"));
    await store.refresh();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("preserves explicitly loaded older pages during polling", async () => {
    const store = useTaskActivityStore();
    vi.mocked(listTasks).mockImplementation(async (options) =>
      options.scope === "active"
        ? page([])
        : options.cursor
          ? page([task("older", "succeeded")], "cursor-2")
          : page([task("recent", "succeeded")], "cursor-1")
    );
    await store.refresh();
    await store.loadMore();
    await store.refresh();
    expect(store.items.map((item) => item.id)).toContain("older");
    expect(store.nextCursor).toBe("cursor-2");
  });

  it("removes deleted tasks from expanded pages on the next refresh", async () => {
    const store = useTaskActivityStore();
    let deleted = false;
    vi.mocked(listTasks).mockImplementation(async (options) =>
      options.scope === "active"
        ? page([])
        : options.cursor
          ? page(deleted ? [] : [task("older", "succeeded")])
          : page([task("recent", "succeeded")], "cursor-1")
    );
    await store.refresh();
    await store.loadMore();
    expect(store.items.map((item) => item.id)).toContain("older");
    deleted = true;
    await store.refresh();
    expect(store.items.map((item) => item.id)).not.toContain("older");
    expect(store.nextCursor).toBeNull();
  });

  it("notifies a submitted task that is already terminal before the first poll", async () => {
    const store = useTaskActivityStore();
    vi.mocked(getTask).mockResolvedValue(task("fast", "succeeded"));
    vi.mocked(listTasks).mockResolvedValue(page([task("fast", "succeeded")]));
    const request = store.observeTask("fast");
    expect(store.activeCount).toBe(1);
    await request;
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(store.activeCount).toBe(0);
    await store.refresh();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("re-reads submitted tasks after a coalesced pre-submit poll and deduplicates registration", async () => {
    const store = useTaskActivityStore();
    const oldPoll = deferred<TaskPage>();
    vi.mocked(listTasks).mockReturnValueOnce(oldPoll.promise).mockReturnValueOnce(oldPoll.promise);
    const pending = store.refresh();
    vi.mocked(getTask).mockResolvedValue(task("fast", "failed"));
    const observe = store.observeTask("fast");
    const duplicate = store.observeTask("fast");
    expect(store.activeCount).toBe(1);
    expect(getTask).not.toHaveBeenCalled();
    vi.mocked(listTasks).mockResolvedValue(page([task("fast", "failed")]));
    oldPoll.resolve(page([]));
    await Promise.all([pending, observe, duplicate]);
    expect(store.items[0]?.status).toBe("failed");
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(store.activeCount).toBe(0);
  });

  it("switches from idle polling to active cadence after task submission", async () => {
    vi.useFakeTimers();
    const store = useTaskActivityStore();
    store.start();
    await flushPromises();
    vi.mocked(getTask).mockResolvedValue(task("new"));
    vi.mocked(listTasks).mockResolvedValue(page([task("new")]));
    await store.observeTask("new");
    const calls = vi.mocked(listTasks).mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.mocked(listTasks).mock.calls.length).toBe(calls + 2);
  });

  it("does not apply a stale quota response or detail to a different account", async () => {
    const quota = deferred<unknown>();
    const detail = deferred<GenerationTask>();
    vi.mocked(apiFetch).mockReturnValue(quota.promise);
    vi.mocked(getTask).mockReturnValue(detail.promise);
    const store = useTaskActivityStore();
    const quotaRequest = store.refreshQuota();
    const detailRequest = store.getTask("private");
    const auth = useAuthStore();
    auth.user = user("user-2");
    auth.quota = { allocatedQuota: 5, remainingQuota: 5, usedQuota: 0 };
    quota.resolve({
      user: user(),
      quota: { allocatedQuota: 20, remainingQuota: 1, usedQuota: 19 }
    });
    detail.resolve(task("private"));
    await quotaRequest;
    expect(await detailRequest).toBeNull();
    expect(auth.quota.remainingQuota).toBe(5);
  });

  it("waits for a cancellation and refreshes authoritative state; duplicate cancellation is ignored", async () => {
    const cancellation = deferred<unknown>();
    vi.mocked(cancelTask).mockReturnValue(cancellation.promise);
    const store = useTaskActivityStore();
    const first = store.cancel("queued-1");
    expect(await store.cancel("queued-1")).toBe(false);
    expect(store.cancellingIds).toEqual(["queued-1"]);
    const cancelled = task("queued-1", "cancelled");
    cancelled.quota = { precharged: 1, refunded: 1, consumed: 0 };
    vi.mocked(listTasks).mockResolvedValue(page([cancelled]));
    cancellation.resolve({ ok: true });
    expect(await first).toBe(true);
    expect(cancelTask).toHaveBeenCalledTimes(1);
    expect(store.items[0]?.quota.refunded).toBe(1);
    expect(store.cancellingIds).toEqual([]);
  });

  it("reconciles cancellation races without falsely reporting a refund", async () => {
    vi.mocked(cancelTask).mockRejectedValue({ error: { code: "TASK_ALREADY_STARTED" } });
    vi.mocked(listTasks).mockResolvedValue(page([task("racing", "running")]));
    const store = useTaskActivityStore();
    expect(await store.cancel("racing")).toBe(false);
    expect(store.items[0]?.status).toBe("running");
    expect(store.items[0]?.quota.refunded).toBe(0);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("polls only while logged in and visible, and stops scheduling when stopped", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    const store = useTaskActivityStore();
    store.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(listTasks).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(listTasks).toHaveBeenCalledTimes(2);
    store.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(listTasks).toHaveBeenCalledTimes(2);
    useAuthStore().user = null;
    store.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(listTasks).toHaveBeenCalledTimes(2);
  });
});
