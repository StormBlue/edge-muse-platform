<script setup lang="ts">
/**
 * 历史会话列表与详情：按 API 分页拉会话，点进展开消息与任务信息；封面图来自接口 `coverImage`。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/api/client";
import type { ImageAttachment, Message, Session, SessionMode } from "@/stores/session";

/** 列表页扩展 Session：统计字段 + 封面图 */
type HistorySession = Session & {
  createdAt?: number;
  updatedAt?: number;
  status?: string | null;
  taskCount?: number;
  imageCount?: number;
  requestedImageCount?: number;
  coverImage?: ImageAttachment | null;
};
/** 与任务/会话 settings 对齐的参数字段快照 */
type TaskParams = {
  prompt?: string;
  mode?: SessionMode;
  size?: string;
  n?: number;
  model?: string;
  referenceImageIds?: string[];
};
/** 详情里从消息挂接的任务摘要 */
type HistoryTask = {
  id: string;
  mode: SessionMode | null;
  params: TaskParams;
  status: string | null;
  errorCode?: string | null;
  errorMsg?: string | null;
  queuedAt?: number | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};
/** 历史详情中单条消息，可带 reference 与 task 嵌套 */
type HistoryMessage = Message & { referenceImages?: ImageAttachment[]; task?: HistoryTask | null };
/** 单条结果进度条用：总张数/成功/失败/完成百分比 */
type GenerationStats = {
  total: number;
  success: number;
  failed: number;
  completed: number;
  percent: number;
};

const route = useRoute();
const router = useRouter();
const { locale, t } = useI18n();
const items = ref<HistorySession[]>([]);
const q = ref("");
/** 排序：最近 / 最旧 / 按任务数 */
const order = ref<"recent" | "oldest" | "task_count">("recent");
const page = ref(1);
const pageInput = ref("1");
const pageSize = 12;
const total = ref(0);
const loading = ref(false);
const detailLoading = ref(false);
const selectedSession = ref<HistorySession | null>(null);
const detailMessages = ref<HistoryMessage[]>([]);
const selectedImage = ref<ImageAttachment | null>(null);
/** 在 `displayResultMessages` 中当前高亮下标 */
const activeResultIndex = ref(0);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
/** 仅助手行且已有 task 或附件，作「可浏览结果」集合 */
const resultMessages = computed(() =>
  detailMessages.value.filter(
    (message) => message.role === "assistant" && (message.task || message.attachments.length)
  )
);
/** 有出图的助手消息优先，其余保持原序 */
const displayResultMessages = computed(() =>
  resultMessages.value
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const imagePriority =
        Number(right.message.attachments.length > 0) - Number(left.message.attachments.length > 0);
      return imagePriority || left.index - right.index;
    })
    .map(({ message }) => message)
);
/** 与 UserSessions/Workspace 类似：有图条目前排 */
const activeResultMessages = computed(() => {
  const message = displayResultMessages.value[activeResultIndex.value];
  return message ? [message] : [];
});
/** 当前会话下全部出图+参考，供 ImageViewer 画廊 */
const detailImages = computed(() =>
  detailMessages.value.flatMap((message) => [
    ...message.attachments.map(toViewerImage),
    ...(message.referenceImages ?? []).map(toViewerImage)
  ])
);

onMounted(async () => {
  await load(1);
  const sessionId = getRouteSessionId();
  if (sessionId) await loadDetail(sessionId);
});

// 深链或浏览器前进后退：带 session 则拉详情，否则回到网格并清空右栏
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

/** 分页拉取当前用户历史会话，支持 order/q */
async function load(nextPage = page.value) {
  const targetPage = sanitizePage(nextPage);
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

/** 与当前 URL 的 session 一致时只拉数据，避免重复 push */
async function openDetail(session: HistorySession) {
  selectedSession.value = session;
  if (getRouteSessionId() === session.id) {
    await loadDetail(session.id);
    return;
  }
  await router.push({ path: "/history", query: { session: session.id } });
}

/** 清 query.session 回到只显示网格 */
async function backToGrid() {
  await router.push({ path: "/history" });
}

/** GET /history/:id 拉会话头 + 全消息 */
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

/** 深链 `?session=` */
function getRouteSessionId() {
  return typeof route.query.session === "string" ? route.query.session : null;
}

/** 画廊模式不绑定 messageId，避免 Viewer 按消息过滤过窄 */
function toViewerImage(image: ImageAttachment): ImageAttachment {
  return { ...image, messageId: null };
}

function openImage(image: ImageAttachment) {
  selectedImage.value = toViewerImage(image);
}

/** 列表与详情时间展示 */
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

/** 优先 task.status，否则仅有 taskId 时退回到消息级状态 */
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

/** 与 UserSessions 类似：按状态给边框/底色的 Tailwind 组合 */
function taskStatusTone(status?: string | null) {
  if (status === "succeeded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "failed" || status === "cancelled") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (status === "running") {
    return "border-accent/30 bg-accent/10 text-accent";
  }
  if (status === "queued") {
    return "border-primary/25 bg-primary/10 text-primary";
  }
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

/** 多图任务：用请求张数、成功附件数、终态推失败张数，算进度条 */
function taskGenerationStats(message: HistoryMessage): GenerationStats {
  const total = requestedImageCount(message);
  const success = message.attachments.length;
  const status = taskStatusValue(message);
  const failed = status === "failed" || status === "cancelled" ? Math.max(total - success, 0) : 0;
  const completed = Math.min(total, success + failed);
  return {
    total,
    success,
    failed,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

/** 与 sysadmin 审计页一致：配置 n 与已出张数取 max 防除零 */
function requestedImageCount(message: HistoryMessage) {
  const configured = message.task?.params?.n ?? selectedSession.value?.settings?.n;
  const count = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
  return Math.max(Math.floor(count), message.attachments.length);
}

/** 网格卡片上「已出/请求」的国际化片段 */
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

/** 右栏卡片的 mode/size/model/参考数等展示结构 */
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

/** 底栏结果条上一张 */
function previousResult() {
  activeResultIndex.value = Math.max(activeResultIndex.value - 1, 0);
}

/** 底栏结果条下一张，上界与 `displayResultMessages` 长度绑定 */
function nextResult() {
  activeResultIndex.value = Math.min(
    activeResultIndex.value + 1,
    Math.max(displayResultMessages.value.length - 1, 0)
  );
}
</script>

<template>
  <AppShell>
    <template v-if="selectedSession || detailLoading">
      <div class="flex h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden">
        <div
          class="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div class="min-w-0">
            <button
              class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
              type="button"
              @click="backToGrid"
            >
              <ArrowLeft class="h-4 w-4" />
              {{ t("history.backToGrid") }}
            </button>
            <h1 class="truncate text-xl font-semibold leading-8">
              {{ selectedSession?.title ?? t("history.detail") }}
            </h1>
            <p v-if="selectedSession" class="mt-1 text-sm text-muted-foreground">
              {{ t("history.updatedAt") }} {{ formatDateTime(selectedSession.lastMessageAt) }}
            </p>
          </div>
          <div
            v-if="displayResultMessages.length > 1"
            class="flex shrink-0 items-center gap-2 text-sm"
          >
            <button
              class="ui-button ui-button-secondary h-9 px-3"
              type="button"
              :disabled="activeResultIndex <= 0"
              @click="previousResult"
            >
              <ChevronLeft class="h-4 w-4" />
              {{ t("common.previous") }}
            </button>
            <span class="min-w-16 text-center text-muted-foreground">
              {{ activeResultIndex + 1 }} / {{ displayResultMessages.length }}
            </span>
            <button
              class="ui-button ui-button-secondary h-9 px-3"
              type="button"
              :disabled="activeResultIndex >= displayResultMessages.length - 1"
              @click="nextResult"
            >
              {{ t("common.next") }}
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          v-if="detailLoading"
          class="panel flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" />
          {{ t("common.loading") }}
        </div>

        <template v-else-if="selectedSession">
          <div
            v-if="!resultMessages.length"
            class="panel flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
          >
            {{ t("history.noResults") }}
          </div>
          <div v-else class="min-h-0 flex-1">
            <div class="h-full min-h-0">
              <article
                v-for="message in activeResultMessages"
                :key="message.id"
                class="panel h-full min-h-0 overflow-hidden"
              >
                <div
                  class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(14rem,22rem)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-none 2xl:grid-cols-[minmax(0,1fr)_24rem]"
                >
                  <ScrollArea class="h-full min-h-0 bg-muted/15">
                    <div class="p-3 sm:p-4">
                      <div
                        v-if="message.attachments.length"
                        :class="[
                          'grid gap-3',
                          message.attachments.length === 1
                            ? 'min-h-[24rem] grid-cols-1'
                            : 'grid-cols-2 2xl:grid-cols-3'
                        ]"
                      >
                        <button
                          v-for="image in message.attachments"
                          :key="image.id"
                          :class="[
                            'overflow-hidden rounded-lg border border-border bg-muted',
                            message.attachments.length === 1 ? 'min-h-[24rem]' : 'aspect-square'
                          ]"
                          type="button"
                          :title="t('workspace.openPreview')"
                          @click="openImage(image)"
                        >
                          <img
                            class="h-full w-full object-contain"
                            :src="image.url"
                            alt=""
                            loading="lazy"
                          />
                        </button>
                      </div>
                      <div
                        v-else
                        class="flex min-h-[24rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                      >
                        <ImageIcon class="h-6 w-6" />
                        {{ t("history.noResults") }}
                      </div>

                      <ScrollArea
                        v-if="taskFailureMessage(message)"
                        class="mt-3 h-40 rounded-lg border border-destructive/25 bg-destructive/5"
                      >
                        <div class="px-3 py-2 text-sm text-destructive">
                          <p class="font-semibold">
                            {{
                              message.task?.errorCode?.startsWith("PROVIDER")
                                ? t("workspace.providerGenerationFailed")
                                : t("workspace.generationFailed")
                            }}
                          </p>
                          <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
                            {{ taskFailureMessage(message) }}
                          </p>
                        </div>
                      </ScrollArea>
                    </div>
                  </ScrollArea>

                  <aside
                    class="h-full min-h-0 min-w-0 overflow-hidden border-t border-border bg-background lg:border-l lg:border-t-0"
                  >
                    <ScrollArea class="h-full min-h-0">
                      <div class="flex min-h-full flex-col gap-4 p-4">
                        <div class="flex shrink-0 items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-xs text-muted-foreground">
                              {{ t("history.createdAt") }}
                            </p>
                            <p class="mt-1 text-sm font-medium">
                              {{ formatDateTime(message.createdAt) }}
                            </p>
                          </div>
                          <span
                            :class="[
                              'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium',
                              taskStatusTone(taskStatusValue(message))
                            ]"
                          >
                            {{ taskStatusLabel(taskStatusValue(message)) }}
                          </span>
                        </div>

                        <dl
                          class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                        >
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">
                              {{ t("history.generationProgress") }}
                            </dt>
                            <dd class="min-w-0">
                              <div class="flex items-center gap-2">
                                <div
                                  class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                                >
                                  <div
                                    class="h-full rounded-full bg-primary"
                                    :style="{ width: `${taskGenerationStats(message).percent}%` }"
                                  ></div>
                                </div>
                                <span class="shrink-0 font-medium">
                                  {{ taskGenerationStats(message).percent }}%
                                </span>
                              </div>
                            </dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">{{ t("history.totalImages") }}</dt>
                            <dd class="min-w-0 font-medium">
                              {{ taskGenerationStats(message).total }}
                            </dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">{{ t("history.successImages") }}</dt>
                            <dd class="min-w-0 font-medium">
                              {{ taskGenerationStats(message).success }}
                            </dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">{{ t("history.failedImages") }}</dt>
                            <dd class="min-w-0 font-medium">
                              {{ taskGenerationStats(message).failed }}
                            </dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">
                              {{ t("workspace.generationMode") }}
                            </dt>
                            <dd class="min-w-0 font-medium">
                              {{ modeLabel(taskParameters(message).mode) }}
                            </dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">{{ t("workspace.canvasSize") }}</dt>
                            <dd class="min-w-0 font-medium">{{ taskParameters(message).size }}</dd>
                          </div>
                          <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                            <dt class="text-muted-foreground">{{ t("history.references") }}</dt>
                            <dd class="min-w-0 font-medium">
                              {{ taskParameters(message).referenceCount }}
                            </dd>
                          </div>
                          <div
                            v-if="taskParameters(message).model"
                            class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2"
                          >
                            <dt class="text-muted-foreground">{{ t("history.model") }}</dt>
                            <dd class="min-w-0 break-words font-medium">
                              {{ taskParameters(message).model }}
                            </dd>
                          </div>
                        </dl>

                        <div
                          v-if="message.referenceImages?.length"
                          class="grid shrink-0 gap-2 rounded-lg border border-border bg-muted/20 p-2"
                        >
                          <p class="text-xs font-medium text-muted-foreground">
                            {{ t("history.references") }}
                          </p>
                          <div class="flex flex-wrap gap-2">
                            <button
                              v-for="image in message.referenceImages"
                              :key="image.id"
                              class="h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                              type="button"
                              :title="t('workspace.openPreview')"
                              @click="openImage(image)"
                            >
                              <img
                                class="h-full w-full object-cover"
                                :src="image.url"
                                alt=""
                                loading="lazy"
                              />
                            </button>
                          </div>
                        </div>

                        <section
                          :class="[
                            'min-w-0',
                            isLongPrompt(message) ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0'
                          ]"
                        >
                          <h2 class="text-xs font-medium text-muted-foreground">
                            {{ t("workspace.prompt") }}
                          </h2>
                          <ScrollArea
                            :class="[
                              'mt-2 rounded-lg bg-muted/35',
                              isLongPrompt(message) ? 'min-h-0 flex-1' : 'max-h-48'
                            ]"
                          >
                            <div class="whitespace-pre-wrap break-words p-3 text-sm leading-6">
                              {{ messagePromptText(message) }}
                            </div>
                          </ScrollArea>
                        </section>
                      </div>
                    </ScrollArea>
                  </aside>
                </div>
              </article>
            </div>
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 class="text-xl font-semibold leading-8">{{ t("history.title") }}</h1>
        <form
          class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
          @submit.prevent="load(1)"
        >
          <select
            v-model="order"
            class="ui-field h-10 !w-full px-3 text-sm sm:!w-40"
            @change="load(1)"
          >
            <option value="recent">{{ t("history.recent") }}</option>
            <option value="oldest">{{ t("history.oldest") }}</option>
            <option value="task_count">{{ t("history.taskCountOrder") }}</option>
          </select>
          <input
            v-model="q"
            class="ui-field col-span-2 h-10 !w-full px-3 sm:col-span-1 sm:!w-80"
            :placeholder="t('history.searchPlaceholder')"
          />
          <button class="ui-button ui-button-secondary h-10" type="submit">
            {{ t("common.search") }}
          </button>
        </form>
      </div>

      <div
        v-if="loading"
        class="panel flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 class="h-4 w-4 animate-spin" />
        {{ t("common.loading") }}
      </div>
      <div v-else-if="!items.length" class="panel p-8 text-center text-sm text-muted-foreground">
        {{ t("history.noHistory") }}
      </div>
      <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <button
          v-for="session in items"
          :key="session.id"
          class="panel overflow-hidden text-left transition hover:bg-muted/40"
          type="button"
          @click="openDetail(session)"
        >
          <div class="relative aspect-[4/3] bg-muted">
            <img
              v-if="session.coverImage"
              class="h-full w-full object-cover"
              :src="session.coverImage.url"
              alt=""
              loading="lazy"
            />
            <div
              v-else
              class="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
            >
              <ImageIcon class="h-7 w-7" />
              {{ t("history.noCover") }}
            </div>
            <span
              class="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs shadow-sm"
            >
              {{ sessionImageCountLabel(session) }}
            </span>
            <span
              :class="[
                'absolute left-2 top-2 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm',
                taskStatusTone(session.status)
              ]"
            >
              {{ sessionStatusLabel(session.status) }}
            </span>
          </div>
          <div class="p-4">
            <h2 class="truncate font-semibold">{{ session.title }}</h2>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{{ formatDateTime(session.lastMessageAt) }}</span>
              <span aria-hidden="true">/</span>
              <span>{{ t("history.sessionStatus") }} {{ sessionStatusLabel(session.status) }}</span>
            </div>
          </div>
        </button>
      </div>

      <div
        v-if="total > 0"
        class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      >
        <p class="min-w-0 text-sm text-muted-foreground">
          {{ t("history.pageStatus", { page, totalPages, total }) }}
        </p>
        <div
          class="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
        >
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="ui-button ui-button-secondary h-9 px-3 text-sm"
              type="button"
              :disabled="page <= 1 || loading"
              @click="load(page - 1)"
            >
              <ChevronLeft class="h-4 w-4" />
              {{ t("common.previous") }}
            </button>
            <button
              class="ui-button ui-button-secondary h-9 px-3 text-sm"
              type="button"
              :disabled="page >= totalPages || loading"
              @click="load(page + 1)"
            >
              {{ t("common.next") }}
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
          <form
            class="flex min-w-0 max-w-full shrink-0 items-center gap-2 sm:pl-2"
            :aria-label="t('history.jumpToPage')"
            @submit.prevent="jumpToPage"
          >
            <label
              class="shrink-0 whitespace-nowrap text-sm text-muted-foreground"
              for="history-page-jump"
            >
              {{ t("history.jumpTo") }}
            </label>
            <input
              id="history-page-jump"
              v-model="pageInput"
              class="ui-field h-9 !w-20 shrink-0 px-2 text-center text-sm"
              type="number"
              inputmode="numeric"
              min="1"
              :max="totalPages"
              :aria-label="t('history.pageNumber')"
              :disabled="loading"
            />
            <button
              class="ui-button ui-button-secondary h-9 shrink-0 whitespace-nowrap px-3 text-sm"
              type="submit"
              :disabled="loading"
            >
              {{ t("history.jumpToPage") }}
            </button>
          </form>
        </div>
      </div>
    </template>

    <ImageViewer
      :image="selectedImage"
      :images="detailImages"
      @close="selectedImage = null"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>
