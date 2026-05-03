import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import {
  isSameStringQuery,
  queryPositiveInt,
  queryString,
  type StringQuery
} from "@/lib/routeQuery";
import type { ImageAttachment, SessionMode } from "@/stores/session";
import type { GenerationStats, HistoryMessage, HistorySession } from "./historyTypes";

type HistoryOrder = "recent" | "oldest" | "task_count";

export function useHistoryController() {
  const route = useRoute();
  const router = useRouter();
  const { locale, t } = useI18n();

  const items = ref<HistorySession[]>([]);
  const q = ref(queryString(route.query.q).trim());
  const order = ref<HistoryOrder>(readRouteOrder());
  const page = ref(readRoutePage());
  const pageInput = ref(String(page.value));
  const pageSize = 12;
  const total = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const selectedSession = ref<HistorySession | null>(null);
  const detailMessages = ref<HistoryMessage[]>([]);
  const selectedImage = ref<ImageAttachment | null>(null);
  const activeResultIndex = ref(0);

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
  const resultMessages = computed(() =>
    detailMessages.value.filter(
      (message) => message.role === "assistant" && (message.task || message.attachments.length)
    )
  );
  const displayResultMessages = computed(() =>
    resultMessages.value
      .map((message, index) => ({ message, index }))
      .sort((left, right) => {
        const imagePriority =
          Number(right.message.attachments.length > 0) -
          Number(left.message.attachments.length > 0);
        return imagePriority || left.index - right.index;
      })
      .map(({ message }) => message)
  );
  const activeResultMessages = computed(() => {
    const message = displayResultMessages.value[activeResultIndex.value];
    return message ? [message] : [];
  });
  const canDeleteSelectedSession = computed(
    () =>
      Boolean(selectedSession.value?.taskCount) &&
      resultMessages.value.length > 0 &&
      resultMessages.value.every((message) => {
        const status = taskStatusValue(message);
        return status === "succeeded" || status === "failed";
      })
  );
  const detailImages = computed(() =>
    detailMessages.value.flatMap((message) => [
      ...message.attachments.map(toViewerImage),
      ...(message.referenceImages ?? []).map(toViewerImage)
    ])
  );

  let syncingListQuery = false;

  onMounted(async () => {
    await load(page.value, { syncRoute: false });
    const sessionId = getRouteSessionId();
    if (sessionId) await loadDetail(sessionId);
  });

  watch(
    () => [route.query.page, route.query.q, route.query.order],
    async () => {
      if (syncingListQuery) return;
      const nextPage = readRoutePage();
      const nextQ = queryString(route.query.q).trim();
      const nextOrder = readRouteOrder();
      if (page.value === nextPage && q.value === nextQ && order.value === nextOrder) return;
      q.value = nextQ;
      order.value = nextOrder;
      await load(nextPage, { syncRoute: false });
    }
  );

  watch(
    () => route.query.session,
    async () => {
      const sessionId = getRouteSessionId();
      if (sessionId) {
        await loadDetail(sessionId);
      } else {
        selectedSession.value = null;
        detailMessages.value = [];
        selectedImage.value = null;
      }
    }
  );

  watch(page, (value) => {
    pageInput.value = String(value);
  });

  watch(displayResultMessages, (messages) => {
    if (messages.length === 0) {
      activeResultIndex.value = 0;
      return;
    }
    activeResultIndex.value = Math.min(activeResultIndex.value, messages.length - 1);
  });

  async function load(nextPage = page.value, options: { syncRoute?: boolean } = {}) {
    const targetPage = sanitizePage(nextPage);
    if (options.syncRoute !== false) await replaceListQuery(targetPage);
    loading.value = true;
    try {
      const params = new URLSearchParams({
        order: order.value,
        page: String(targetPage),
        pageSize: String(pageSize)
      });
      if (q.value.trim()) params.set("q", q.value.trim());
      const body = await apiFetch<{
        items: HistorySession[];
        page: number;
        pageSize: number;
        total: number;
      }>(`/history?${params.toString()}`);
      items.value = body.items;
      page.value = body.page;
      total.value = body.total;
    } finally {
      loading.value = false;
    }
  }

  async function jumpToPage() {
    const targetPage = clampPageInput(pageInput.value);
    pageInput.value = String(targetPage);
    if (targetPage === page.value) return;
    await load(targetPage);
  }

  async function openDetail(session: HistorySession) {
    selectedSession.value = session;
    if (getRouteSessionId() === session.id) {
      await loadDetail(session.id);
      return;
    }
    await pushHistoryQuery(historyListQuery(page.value, session.id));
  }

  async function backToGrid() {
    await pushHistoryQuery(historyListQuery(page.value, null));
  }

  async function deleteSelectedSession() {
    const session = selectedSession.value;
    if (!session || !canDeleteSelectedSession.value) return;
    try {
      await apiFetch(`/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    } catch (error) {
      toast.error(errorMessage(error) || t("history.deleteFailed"));
      return;
    }
    items.value = items.value.filter((item) => item.id !== session.id);
    total.value = Math.max(total.value - 1, 0);
    toast.success(t("history.sessionDeleted"));
    await pushHistoryQuery(historyListQuery(page.value, null));
    selectedSession.value = null;
    detailMessages.value = [];
    selectedImage.value = null;
    if (items.value.length === 0 && page.value > 1) {
      await load(page.value - 1);
    } else {
      await load(page.value, { syncRoute: false });
    }
  }

  /** GET /history/:id 拉会话头 + 全消息；后端已合并 D1 持久化图片，前端只做展示。 */
  async function loadDetail(sessionId: string) {
    detailLoading.value = true;
    try {
      const body = await apiFetch<{
        session: HistorySession;
        messages: HistoryMessage[];
      }>(`/history/${sessionId}`);
      selectedSession.value = body.session;
      detailMessages.value = body.messages;
      activeResultIndex.value = 0;
    } finally {
      detailLoading.value = false;
    }
  }

  function getRouteSessionId() {
    return typeof route.query.session === "string" ? route.query.session : null;
  }

  function readRoutePage() {
    return queryPositiveInt(route.query.page, 1);
  }

  function readRouteOrder(): HistoryOrder {
    const value = queryString(route.query.order);
    return value === "oldest" || value === "task_count" ? value : "recent";
  }

  function historyListQuery(nextPage = page.value, sessionId = getRouteSessionId()) {
    const query: StringQuery = {
      page: String(sanitizePage(nextPage)),
      order: order.value
    };
    const trimmedQ = q.value.trim();
    if (trimmedQ) query.q = trimmedQ;
    if (sessionId) query.session = sessionId;
    return query;
  }

  async function replaceListQuery(nextPage = page.value) {
    const query = historyListQuery(nextPage);
    if (isSameStringQuery(query, route.query)) return;
    syncingListQuery = true;
    try {
      await router.replace({ path: "/history", query });
    } finally {
      syncingListQuery = false;
    }
  }

  async function pushHistoryQuery(query: StringQuery) {
    syncingListQuery = true;
    try {
      await router.push({ path: "/history", query });
    } finally {
      syncingListQuery = false;
    }
  }

  function toViewerImage(image: ImageAttachment): ImageAttachment {
    return { ...image, messageId: null };
  }

  function openImage(image: ImageAttachment) {
    selectedImage.value = toViewerImage(image);
  }

  function errorMessage(error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "error" in error &&
      error.error &&
      typeof error.error === "object" &&
      "message" in error.error
    ) {
      const message = error.error.message;
      return typeof message === "string" ? message : "";
    }
    return "";
  }

  function formatDateTime(value?: number | null) {
    if (!value) return "-";
    return new Intl.DateTimeFormat(locale.value, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(value);
  }

  function modeLabel(mode?: SessionMode | null) {
    return mode ? t(`workspace.${mode}`) : "-";
  }

  function taskStatusValue(message: HistoryMessage) {
    return message.task?.status ?? (message.taskId ? message.status : null);
  }

  function taskStatusLabel(status?: string | null) {
    if (!status) return "-";
    if (["queued", "running", "succeeded", "failed", "cancelled"].includes(status)) {
      return t(`common.${status}`);
    }
    return status;
  }

  function sessionStatusLabel(status?: string | null) {
    return status ? taskStatusLabel(status) : t("history.noTaskStatus");
  }

  function taskStatusTone(status?: string | null) {
    if (status === "succeeded") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
    }
    if (status === "failed" || status === "cancelled") {
      return "border-destructive/25 bg-destructive/10 text-destructive";
    }
    if (status === "running") return "border-accent/30 bg-accent/10 text-accent";
    if (status === "queued") return "border-primary/25 bg-primary/10 text-primary";
    return "border-border bg-muted/35 text-muted-foreground";
  }

  function taskFailureMessage(message: HistoryMessage) {
    return message.task?.errorMsg || message.error?.message || "";
  }

  function messagePromptText(message: HistoryMessage) {
    return message.prompt || message.task?.params?.prompt || selectedSession.value?.title || "-";
  }

  function isLongPrompt(message: HistoryMessage) {
    const prompt = messagePromptText(message);
    return prompt.length > 260 || prompt.split("\n").length > 5;
  }

  /** 多图任务：用请求张数、成功附件数、终态推失败张数，算进度条。 */
  function taskGenerationStats(message: HistoryMessage): GenerationStats {
    const totalImages = requestedImageCount(message);
    const success = message.attachments.length;
    const status = taskStatusValue(message);
    const failed =
      status === "failed" || status === "cancelled" ? Math.max(totalImages - success, 0) : 0;
    const completed = Math.min(totalImages, success + failed);
    return {
      total: totalImages,
      success,
      failed,
      completed,
      percent: totalImages > 0 ? Math.round((completed / totalImages) * 100) : 0
    };
  }

  function requestedImageCount(message: HistoryMessage) {
    const configured = message.task?.params?.n ?? selectedSession.value?.settings?.n;
    const count = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
    return Math.max(Math.floor(count), message.attachments.length);
  }

  function sessionImageCountLabel(session: HistorySession) {
    const success = Math.max(Math.floor(session.imageCount ?? 0), 0);
    const requested = Math.max(Math.floor(session.requestedImageCount ?? success), success);
    if (requested > success) {
      return t("history.imageProgressCount", { success, total: requested });
    }
    return t("history.imageCount", { count: success });
  }

  function sanitizePage(value: number) {
    return Number.isFinite(value) ? Math.max(Math.floor(value), 1) : 1;
  }

  function clampPageInput(value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return page.value;
    return Math.min(sanitizePage(numeric), totalPages.value);
  }

  function taskParameters(message: HistoryMessage) {
    const params = message.task?.params ?? {};
    return {
      mode: message.task?.mode ?? params.mode ?? selectedSession.value?.mode ?? null,
      size: params.size ?? selectedSession.value?.settings?.size ?? "-",
      model: params.model ?? selectedSession.value?.settings?.model ?? "",
      referenceCount:
        message.referenceImages?.length ??
        params.referenceImageIds?.length ??
        message.referenceImageIds.length
    };
  }

  function previousResult() {
    activeResultIndex.value = Math.max(activeResultIndex.value - 1, 0);
  }

  function nextResult() {
    activeResultIndex.value = Math.min(
      activeResultIndex.value + 1,
      Math.max(displayResultMessages.value.length - 1, 0)
    );
  }

  return {
    t,
    items,
    q,
    order,
    page,
    pageInput,
    total,
    loading,
    detailLoading,
    selectedSession,
    selectedImage,
    activeResultIndex,
    canDeleteSelectedSession,
    totalPages,
    resultMessages,
    displayResultMessages,
    activeResultMessages,
    detailImages,
    load,
    jumpToPage,
    openDetail,
    backToGrid,
    deleteSelectedSession,
    openImage,
    formatDateTime,
    modeLabel,
    taskStatusValue,
    taskStatusLabel,
    sessionStatusLabel,
    taskStatusTone,
    taskFailureMessage,
    messagePromptText,
    isLongPrompt,
    taskGenerationStats,
    sessionImageCountLabel,
    taskParameters,
    previousResult,
    nextResult
  };
}
