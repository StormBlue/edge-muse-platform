import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { cancelTask, getTask as fetchTask, listTasks, type GenerationTask } from "@/api/tasks";
import { useAuthStore, type Quota, type User } from "./auth";
import { useTaskLocale } from "@/components/tasks/taskLocale";

export const useTaskActivityStore = defineStore("taskActivity", () => {
  // 任务中心仅展示近期记录，最多回读 5 页；完整会话仍通过历史记录访问。
  const maxRecentPages = 5;
  const auth = useAuthStore();
  const text = useTaskLocale();
  const items = ref<GenerationTask[]>([]);
  const activeCount = ref(0);
  const loading = ref(false);
  const error = ref("");
  const open = ref(false);
  const cancellingIds = ref<string[]>([]);
  const nextCursor = ref<string | null>(null);
  const loadingMore = ref(false);
  const activeItems = computed(() => items.value.filter(isActive));
  let epoch = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let baseline = false;
  let recentPageCount = 1;
  let serverActiveCount = 0;
  let pageFlight: Promise<void> | null = null;
  let tickVersion = 0;
  const notificationIds = new Set<string>();
  const submittedIds = new Set<string>();
  const observationFlights = new Map<string, Promise<void>>();

  // 账号切换立即失效旧请求；不复用会话 store，后台轮询不会改变用户当前选中的会话。
  watch(
    () => auth.user?.id,
    () => {
      epoch += 1;
      items.value = [];
      activeCount.value = 0;
      nextCursor.value = null;
      loading.value = false;
      loadingMore.value = false;
      error.value = "";
      cancellingIds.value = [];
      open.value = false;
      baseline = false;
      recentPageCount = 1;
      serverActiveCount = 0;
      pageFlight = null;
      submittedIds.clear();
      observationFlights.clear();
      inFlight = null;
      for (const id of notificationIds) toast.dismiss(id);
      notificationIds.clear();
      if (timer) clearTimeout(timer);
      if (started) void tick();
    },
    { flush: "sync" }
  );

  function valid(version: number, userId: string) {
    return version === epoch && auth.user?.id === userId;
  }

  async function refreshQuota() {
    const userId = auth.user?.id;
    if (!userId) return;
    const version = epoch;
    try {
      const body = await apiFetch<{ user: User; quota: Quota }>("/me");
      // 网络错误不应触发 bootstrap 的退出登录分支，且禁止把旧账号配额写到新账号。
      if (valid(version, userId) && body.user.id === userId) auth.quota = body.quota;
    } catch {
      /* 下次任务刷新时重新读取，不清空仍有效的登录状态。 */
    }
  }

  function notifyChanges(previous: GenerationTask[], current: GenerationTask[]) {
    const previousActive = new Set([
      ...(baseline ? previous.filter(isActive).map((item) => item.id) : []),
      ...submittedIds
    ]);
    for (const item of current) {
      if (!isActive(item)) submittedIds.delete(item.id);
      if (!previousActive.has(item.id) || isActive(item) || item.phase === "cancelled") continue;
      const id = `generation-task-${item.id}`;
      if (notificationIds.has(id)) continue;
      notificationIds.add(id);
      const message = item.phase === "succeeded" ? text.value.completed : text.value.failed;
      const show = item.phase === "succeeded" ? toast.success : toast.error;
      show(message, {
        id,
        description: item.title || item.prompt.slice(0, 80),
        action: {
          label: text.value.open,
          onClick: () => {
            open.value = true;
          }
        }
      });
    }
  }

  function refresh(): Promise<void> {
    if (!auth.user?.id) return Promise.resolve();
    if (inFlight) return inFlight;
    // 分页与刷新串行，避免旧分页响应重新放回刚删除或刚更新的记录。
    if (pageFlight) return pageFlight.then(() => refresh());
    const userId = auth.user.id;
    const version = epoch;
    loading.value = true;
    const run = async () => {
      try {
        const [recent, active] = await Promise.all([
          listTasks({ scope: "recent" }),
          listTasks({ scope: "active", limit: 50 })
        ]);
        if (!valid(version, userId)) return;
        const recentItems = [...recent.items];
        let cursor = recent.nextCursor;
        // 重新读取用户已展开的页数；不永久保留旧对象，删除会话后下一轮即可移除。
        for (let page = 1; page < recentPageCount && cursor; page += 1) {
          const older = await listTasks({ scope: "recent", cursor });
          if (!valid(version, userId)) return;
          recentItems.push(...older.items);
          cursor = older.nextCursor;
        }
        const merged = new Map([...recentItems, ...active.items].map((item) => [item.id, item]));
        // 长任务可能已经滑出“最近 20 条”；单独回读已观察到的任务，避免漏掉其终态通知。
        const missingIds = [
          ...new Set([...items.value.filter(isActive).map((item) => item.id), ...submittedIds])
        ].filter((id) => !merged.has(id));
        const resolved = await Promise.allSettled(missingIds.map((id) => fetchTask(id)));
        if (!valid(version, userId)) return;
        for (const [index, result] of resolved.entries()) {
          if (result.status === "fulfilled") merged.set(result.value.id, result.value);
          else {
            // 短暂网络失败不能让长任务从观察列表中消失；已删除的任务则不再追踪。
            const reason = result.reason as { error?: { code?: string }; message?: string };
            const id = missingIds[index];
            const previous = items.value.find((item) => item.id === id);
            if (
              previous &&
              reason?.error?.code !== "NOT_FOUND" &&
              reason?.message !== "Task summary unavailable"
            ) {
              merged.set(previous.id, previous);
            }
            if (
              id &&
              (reason?.error?.code === "NOT_FOUND" ||
                reason?.message === "Task summary unavailable")
            )
              submittedIds.delete(id);
          }
        }
        const current = [...merged.values()].sort((a, b) => b.queuedAt - a.queuedAt);
        notifyChanges(items.value, current);
        items.value = current;
        serverActiveCount = active.activeCount;
        updateActiveCount();
        nextCursor.value = recentPageCount < maxRecentPages ? cursor : null;
        baseline = true;
        error.value = "";
        await refreshQuota();
      } catch {
        if (valid(version, userId)) error.value = text.value.loadError;
      } finally {
        if (valid(version, userId)) {
          loading.value = false;
          inFlight = null;
        }
      }
    };
    inFlight = run();
    return inFlight;
  }

  function loadMore(): Promise<void> {
    const userId = auth.user?.id;
    if (!userId || !nextCursor.value || loadingMore.value || loading.value)
      return Promise.resolve();
    const version = epoch;
    const cursor = nextCursor.value;
    loadingMore.value = true;
    const run = async () => {
      try {
        const page = await listTasks({ scope: "recent", cursor });
        if (!valid(version, userId)) return;
        items.value = [
          ...new Map([...page.items, ...items.value].map((item) => [item.id, item])).values()
        ].sort((a, b) => b.queuedAt - a.queuedAt);
        recentPageCount += 1;
        nextCursor.value = recentPageCount < maxRecentPages ? page.nextCursor : null;
        error.value = "";
      } catch {
        if (valid(version, userId)) error.value = text.value.loadError;
      } finally {
        if (valid(version, userId)) {
          loadingMore.value = false;
          pageFlight = null;
        }
      }
    };
    pageFlight = run();
    return pageFlight;
  }

  function updateActiveCount() {
    const observed = new Set([...activeItems.value.map((item) => item.id), ...submittedIds]);
    activeCount.value = Math.max(serverActiveCount, observed.size);
  }

  /**
   * 提交成功立刻登记 ID，不依赖轮询先看见 queued。即使旧轮询尚未结束、任务已秒级完成，
   * 也会在旧请求之后重新读取详情，并且只通知一次。失败保留 ID，后续轮询继续追踪。
   */
  function observeTask(id: string): Promise<void> {
    const userId = auth.user?.id;
    if (!userId) return Promise.resolve();
    const existing = observationFlights.get(id);
    if (existing) return existing;
    const version = epoch;
    submittedIds.add(id);
    updateActiveCount();
    tickVersion += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    const run = async () => {
      try {
        if (inFlight) await inFlight;
        if (!valid(version, userId)) return;
        const task = await fetchTask(id);
        if (!valid(version, userId)) return;
        notifyChanges(items.value, [task]);
        items.value = [task, ...items.value.filter((item) => item.id !== id)].sort(
          (a, b) => b.queuedAt - a.queuedAt
        );
        updateActiveCount();
        await refresh();
      } catch {
        if (valid(version, userId)) error.value = text.value.loadError;
      } finally {
        if (valid(version, userId)) {
          observationFlights.delete(id);
          scheduleNext();
        }
      }
    };
    const promise = run();
    observationFlights.set(id, promise);
    return promise;
  }

  async function getTask(id: string): Promise<GenerationTask | null> {
    const userId = auth.user?.id;
    if (!userId) return null;
    const version = epoch;
    const task = await fetchTask(id);
    return valid(version, userId) ? task : null;
  }

  async function cancel(id: string) {
    const userId = auth.user?.id;
    if (!userId || cancellingIds.value.includes(id)) return false;
    const version = epoch;
    cancellingIds.value.push(id);
    try {
      await cancelTask(id);
      if (!valid(version, userId)) return false;
      toast.success(text.value.cancelledNotice);
      // 等待已有轮询退出后重新读取，避免取消前的响应把排队状态覆盖回来。
      if (inFlight) await inFlight;
      if (valid(version, userId)) await refresh();
      return valid(version, userId);
    } catch {
      if (valid(version, userId)) {
        toast.error(text.value.cancelError);
        await refresh();
      }
      return false;
    } finally {
      if (valid(version, userId))
        cancellingIds.value = cancellingIds.value.filter((value) => value !== id);
    }
  }

  async function tick() {
    const cycle = ++tickVersion;
    if (timer) clearTimeout(timer);
    timer = null;
    if (!started || !auth.user?.id || document.visibilityState === "hidden") return;
    const version = epoch;
    await refresh();
    if (started && cycle === tickVersion && version === epoch && auth.user?.id && isVisible()) {
      scheduleNext();
    }
  }

  function scheduleNext() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (started && auth.user?.id && isVisible())
      timer = setTimeout(() => void tick(), activeCount.value ? 5000 : 30000);
  }

  function start() {
    if (started) return;
    started = true;
    document.addEventListener("visibilitychange", tick);
    void tick();
  }

  function isVisible() {
    return document.visibilityState !== "hidden";
  }

  function stop() {
    started = false;
    epoch += 1;
    tickVersion += 1;
    inFlight = null;
    loading.value = false;
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener("visibilitychange", tick);
  }

  return {
    items,
    activeItems,
    activeCount,
    loading,
    error,
    open,
    cancellingIds,
    nextCursor,
    loadingMore,
    refresh,
    refreshQuota,
    observeTask,
    cancel,
    getTask,
    loadMore,
    start,
    stop
  };
});

function isActive(task: GenerationTask) {
  return task.status === "queued" || task.status === "running";
}
