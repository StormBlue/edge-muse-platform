import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { listDetailEntryState, returnToList } from "@/lib/listDetailNavigation";
import { isSameStringQuery, queryString } from "@/lib/routeQuery";
import { useAuthStore } from "@/stores/auth";
import type { ImageAttachment, SessionMode } from "@/stores/session";
import {
  auditFailureImageRangeLabel,
  auditGenerationFailures,
  auditImageIndexLabel,
  auditMessagePromptText,
  auditStatusTone,
  auditTaskFailureMessage,
  auditTaskParameters,
  auditUserLabel,
  auditUserSubLabel,
  formatAuditDateTime,
  formatAuditDuration,
  groupAuditGenerationFailures,
  hasAuditFailureDetails,
  isAuditLongPrompt,
  normalizeAuditMessageAttachments,
  requestedAuditImageCount,
  toAuditViewerImage
} from "./userSessionsHelpers";
import {
  buildUserSessionsListQuery,
  clampUserSessionsPageInput,
  readUserSessionsRoutePage,
  readUserSessionsRouteSessionId,
  resolveUserSessionsRouteUserId,
  sanitizeUserSessionsPage
} from "./userSessionsRouteQuery";
import type {
  AuditImageAttachment,
  AuditMessage,
  AuditSession,
  FailureGroup,
  UserOption
} from "./userSessionsTypes";

export function useUserSessionsController() {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const { locale, t } = useI18n();

  const userId = ref(resolveRouteUserId());
  const q = ref(queryString(route.query.q).trim());
  const userOptions = ref<UserOption[]>([]);
  const sessions = ref<AuditSession[]>([]);
  const messages = ref<AuditMessage[]>([]);
  const selectedSession = ref<AuditSession | null>(null);
  const selectedImage = ref<ImageAttachment | null>(null);
  const page = ref(readUserSessionsRoutePage(route.query));
  const pageInput = ref(String(page.value));
  const pageSize = 12;
  const total = ref(0);
  const loading = ref(false);
  const loadError = ref("");
  const detailLoading = ref(false);
  const activeMessageIndex = ref(0);

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
  const selectedSessionId = computed(
    () => selectedSession.value?.id ?? readUserSessionsRouteSessionId(route.query)
  );
  const resultMessages = computed(() =>
    messages.value.filter(
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
  const activeMessages = computed(() => {
    const message = displayResultMessages.value[activeMessageIndex.value];
    return message ? [message] : [];
  });
  const auditImages = computed(() =>
    messages.value.flatMap((message) => [
      ...message.attachments.map(toAuditViewerImage),
      ...(message.referenceImages ?? []).map(toAuditViewerImage)
    ])
  );
  let syncingListRoute = false;
  let listRequest = 0;
  let detailRequest = 0;
  let disposed = false;

  watch(page, (value) => {
    pageInput.value = String(value);
  });

  watch(displayResultMessages, (items) => {
    if (items.length === 0) {
      activeMessageIndex.value = 0;
      return;
    }
    activeMessageIndex.value = Math.min(activeMessageIndex.value, items.length - 1);
  });

  watch(
    () => [route.params.userId, route.query.page, route.query.q],
    async () => {
      if (syncingListRoute) return;
      userId.value = resolveRouteUserId();
      q.value = queryString(route.query.q).trim();
      await loadSessions(readUserSessionsRoutePage(route.query), { syncRoute: false });
    }
  );

  watch(
    () => route.query.session,
    async () => {
      const sessionId = readUserSessionsRouteSessionId(route.query);
      if (sessionId) {
        await loadDetail(sessionId);
        return;
      }
      clearDetail();
    }
  );

  onMounted(() => {
    void loadUserOptions();
    void loadSessions(page.value, { syncRoute: false });
    const sessionId = readUserSessionsRouteSessionId(route.query);
    if (sessionId) void loadDetail(sessionId);
  });

  onBeforeUnmount(() => {
    disposed = true;
    listRequest += 1;
    detailRequest += 1;
  });

  /** 顶栏提交：必要时改路由到 `/users/:id/sessions` 再拉表。 */
  async function submitFilters() {
    const normalizedUserId = userId.value === "__all_users__" ? "" : userId.value.trim();
    userId.value = normalizedUserId;
    const routeUserId = normalizedUserId || "_";
    const currentRouteUserId = typeof route.params.userId === "string" ? route.params.userId : "";
    if (currentRouteUserId !== routeUserId) {
      clearDetail();
      await replaceListRoute(
        `/sysadmin/users/${encodeURIComponent(routeUserId)}/sessions`,
        1,
        null
      );
      await loadSessions(1, { syncRoute: false });
      return;
    }
    await loadSessions(1);
  }

  /** 顶栏下拉的邮箱/昵称候选项，失败时置空不阻塞页。 */
  async function loadUserOptions() {
    try {
      const body = await apiFetch<{ items: UserOption[] }>("/sysadmin/users");
      if (disposed) return;
      userOptions.value = body.items;
    } catch {
      userOptions.value = [];
    }
  }

  /** 拉左表；`userId` 空时用路由占位 `_` 表示全量/未指定。 */
  async function loadSessions(nextPage = page.value, options: { syncRoute?: boolean } = {}) {
    const request = ++listRequest;
    const normalizedUserId = userId.value.trim();
    userId.value = normalizedUserId;
    const targetPage = sanitizeUserSessionsPage(nextPage);
    if (options.syncRoute !== false) await replaceListQuery(targetPage);
    if (request !== listRequest) return;
    loading.value = true;
    loadError.value = "";
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(pageSize)
      });
      if (q.value.trim()) params.set("q", q.value.trim());
      const routeUserId = normalizedUserId || "_";
      const body = await apiFetch<{
        items: AuditSession[];
        page: number;
        pageSize: number;
        total: number;
      }>(`/sysadmin/users/${encodeURIComponent(routeUserId)}/sessions?${params.toString()}`);
      if (request !== listRequest) return;
      sessions.value = body.items;
      page.value = body.page;
      total.value = body.total;
    } catch (error) {
      if (request === listRequest) {
        sessions.value = [];
        total.value = 0;
        page.value = targetPage;
        loadError.value = reportLoadError(error);
      }
    } finally {
      if (request === listRequest) loading.value = false;
    }
  }

  /** 从输入框跳页，非法或与当前页相同则 no-op。 */
  async function jumpToPage() {
    const targetPage = clampUserSessionsPageInput(pageInput.value, page.value, totalPages.value);
    pageInput.value = String(targetPage);
    if (targetPage === page.value) return;
    await loadSessions(targetPage);
  }

  /** 点表格行：若已在该 session 的 URL 上则直接 `loadDetail`，否则 push 带 query。 */
  async function openDetail(session: AuditSession) {
    selectedSession.value = session;
    if (readUserSessionsRouteSessionId(route.query) === session.id) {
      await loadDetail(session.id);
      return;
    }
    await pushListRoute(route.path, page.value, session.id);
  }

  async function backToTable() {
    clearDetail();
    await returnToList(router, route, buildUserSessionsListQuery({ page: page.value, q: q.value }));
  }

  /** 拉单会话的 session 头 + 全量消息，供右侧审计。 */
  async function loadDetail(sessionId: string) {
    const request = ++detailRequest;
    messages.value = [];
    selectedImage.value = null;
    detailLoading.value = true;
    try {
      const body = await apiFetch<{
        session: AuditSession;
        messages: AuditMessage[];
      }>(`/sysadmin/sessions/${encodeURIComponent(sessionId)}/detail`);
      if (request !== detailRequest || readUserSessionsRouteSessionId(route.query) !== sessionId)
        return;
      selectedSession.value = body.session;
      messages.value = body.messages.map(normalizeAuditMessageAttachments);
      activeMessageIndex.value = 0;
    } catch (error) {
      if (request !== detailRequest || readUserSessionsRouteSessionId(route.query) !== sessionId)
        return;
      reportLoadError(error);
      clearDetail();
      await returnToList(
        router,
        route,
        buildUserSessionsListQuery({ page: page.value, q: q.value }),
        true
      );
    } finally {
      if (request === detailRequest) detailLoading.value = false;
    }
  }

  function resolveRouteUserId() {
    return resolveUserSessionsRouteUserId(route.params.userId, auth.user?.id);
  }

  function clearDetail() {
    detailRequest += 1;
    detailLoading.value = false;
    selectedSession.value = null;
    messages.value = [];
    selectedImage.value = null;
    activeMessageIndex.value = 0;
  }

  function reportLoadError(error: unknown) {
    const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
    const text = typeof message === "string" && message ? message : t("common.failed");
    toast.error(text);
    return text;
  }

  async function replaceListQuery(nextPage = page.value) {
    const query = buildUserSessionsListQuery({
      page: nextPage,
      q: q.value,
      sessionId: readUserSessionsRouteSessionId(route.query)
    });
    if (isSameStringQuery(query, route.query)) return;
    await replaceListRoute(route.path, nextPage);
  }

  async function pushListRoute(
    path: string,
    nextPage = page.value,
    sessionId = readUserSessionsRouteSessionId(route.query)
  ) {
    await writeListRoute("push", path, nextPage, sessionId);
  }

  async function replaceListRoute(
    path: string,
    nextPage = page.value,
    sessionId = readUserSessionsRouteSessionId(route.query)
  ) {
    await writeListRoute("replace", path, nextPage, sessionId);
  }

  async function writeListRoute(
    method: "push" | "replace",
    path: string,
    nextPage = page.value,
    sessionId = readUserSessionsRouteSessionId(route.query)
  ) {
    const query = buildUserSessionsListQuery({ page: nextPage, q: q.value, sessionId });
    syncingListRoute = true;
    try {
      await router[method]({
        path,
        query,
        ...(method === "push" ? { state: listDetailEntryState(route) } : {})
      });
    } finally {
      syncingListRoute = false;
    }
  }

  function openImage(image: ImageAttachment) {
    selectedImage.value = toAuditViewerImage(image);
  }

  function imageTitle(image: AuditImageAttachment) {
    return `${t("workspace.openPreview")} / ${t("sysadmin.imageDuration")} ${formatAuditDuration(
      image.generationDurationMs
    )}`;
  }

  function formatDateTime(value?: number | null) {
    return formatAuditDateTime(locale.value, value);
  }

  function modeLabel(mode?: SessionMode | null) {
    return mode ? t(`workspace.${mode}`) : "-";
  }

  function roleLabel(role: string) {
    if (role === "user") return t("sysadmin.messageUser");
    if (role === "assistant") return t("sysadmin.messageAssistant");
    if (role === "system") return t("sysadmin.messageSystem");
    return role;
  }

  function statusLabel(status?: string | null) {
    if (!status) return "-";
    if (["queued", "running", "succeeded", "failed", "cancelled"].includes(status)) {
      return t(`common.${status}`);
    }
    return status;
  }

  function requestedImageCount(message: AuditMessage) {
    return requestedAuditImageCount(message, selectedSession.value);
  }

  function taskParameters(message: AuditMessage) {
    return auditTaskParameters(message, selectedSession.value);
  }

  function failureCountLabel(count: number) {
    return t("sysadmin.failureImagesCount", { count });
  }

  function failureGroupTitle(group: FailureGroup) {
    return group.count > 1 ? `${group.code} · ${failureCountLabel(group.count)}` : group.code;
  }

  function tableRowNumber(index: number) {
    return (page.value - 1) * pageSize + index + 1;
  }

  function previousMessage() {
    activeMessageIndex.value = Math.max(activeMessageIndex.value - 1, 0);
  }

  function nextMessage() {
    activeMessageIndex.value = Math.min(
      activeMessageIndex.value + 1,
      Math.max(displayResultMessages.value.length - 1, 0)
    );
  }

  return {
    t,
    userId,
    q,
    userOptions,
    sessions,
    selectedSession,
    selectedImage,
    page,
    pageInput,
    total,
    loading,
    loadError,
    detailLoading,
    activeMessageIndex,
    totalPages,
    selectedSessionId,
    displayResultMessages,
    activeMessages,
    auditImages,
    submitFilters,
    loadSessions,
    jumpToPage,
    openDetail,
    backToTable,
    openImage,
    imageTitle,
    formatDateTime,
    modeLabel,
    roleLabel,
    userLabel: auditUserLabel,
    userSubLabel: auditUserSubLabel,
    statusLabel,
    statusTone: auditStatusTone,
    requestedImageCount,
    taskParameters,
    messagePromptText: auditMessagePromptText,
    isLongPrompt: isAuditLongPrompt,
    generationFailures: auditGenerationFailures,
    taskFailureMessage: auditTaskFailureMessage,
    hasFailureDetails: hasAuditFailureDetails,
    failureGroups: groupAuditGenerationFailures,
    failureCountLabel,
    failureGroupTitle,
    failureImageRangeLabel: auditFailureImageRangeLabel,
    imageIndexLabel: auditImageIndexLabel,
    tableRowNumber,
    previousMessage,
    nextMessage,
    formatDuration: formatAuditDuration
  };
}
