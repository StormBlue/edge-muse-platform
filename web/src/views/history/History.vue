<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { apiFetch } from "@/api/client";
import type { ImageAttachment, Message, Session, SessionMode } from "@/stores/session";

type HistorySession = Session & {
  createdAt?: number;
  updatedAt?: number;
  status?: string | null;
  taskCount?: number;
  imageCount?: number;
  requestedImageCount?: number;
  coverImage?: ImageAttachment | null;
};
type TaskParams = {
  prompt?: string;
  mode?: SessionMode;
  size?: string;
  n?: number;
  model?: string;
  referenceImageIds?: string[];
};
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
type HistoryMessage = Message & { referenceImages?: ImageAttachment[]; task?: HistoryTask | null };
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

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const resultMessages = computed(() =>
  detailMessages.value.filter(
    (message) => message.role === "assistant" && (message.task || message.attachments.length)
  )
);
const detailImages = computed(() =>
  detailMessages.value.flatMap((message) => [
    ...(message.referenceImages ?? []).map(toViewerImage),
    ...message.attachments.map(toViewerImage)
  ])
);
const detailGenerationStats = computed(() => summarizeGenerationStats(resultMessages.value));
const taskStatusItems = computed(() => {
  const counts = new Map<string, number>();
  for (const message of resultMessages.value) {
    const status = taskStatusValue(message);
    if (!status) continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => taskStatusSortIndex(left) - taskStatusSortIndex(right))
    .map(([status, count]) => ({ status, count }));
});
const latestTaskStatus = computed(() => {
  const statuses = resultMessages.value
    .map((message) => taskStatusValue(message))
    .filter((status): status is string => Boolean(status));
  return (
    statuses.find((status) => status === "running") ??
    statuses.find((status) => status === "queued") ??
    statuses[statuses.length - 1] ??
    null
  );
});
const taskStatusSummary = computed(() => {
  return taskStatusItems.value
    .map((item) => `${taskStatusLabel(item.status)} ${item.count}`)
    .join(" / ");
});

onMounted(async () => {
  await load(1);
  const sessionId = getRouteSessionId();
  if (sessionId) await loadDetail(sessionId);
});

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

async function openDetail(session: HistorySession) {
  selectedSession.value = session;
  if (getRouteSessionId() === session.id) {
    await loadDetail(session.id);
    return;
  }
  await router.push({ path: "/history", query: { session: session.id } });
}

async function backToGrid() {
  await router.push({ path: "/history" });
}

async function loadDetail(sessionId: string) {
  detailLoading.value = true;
  try {
    const body = await apiFetch<{
      session: HistorySession;
      messages: HistoryMessage[];
    }>(`/history/${sessionId}`);
    selectedSession.value = body.session;
    detailMessages.value = body.messages;
  } finally {
    detailLoading.value = false;
  }
}

function getRouteSessionId() {
  return typeof route.query.session === "string" ? route.query.session : null;
}

function toViewerImage(image: ImageAttachment): ImageAttachment {
  return { ...image, messageId: null };
}

function openImage(image: ImageAttachment) {
  selectedImage.value = toViewerImage(image);
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

function taskStatusSortIndex(status: string) {
  const order = ["running", "queued", "failed", "cancelled", "succeeded"];
  const index = order.indexOf(status);
  return index >= 0 ? index : order.length;
}

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

function summarizeGenerationStats(messages: HistoryMessage[]): GenerationStats {
  const stats = messages.reduce(
    (summary, message) => {
      const item = taskGenerationStats(message);
      summary.total += item.total;
      summary.success += item.success;
      summary.failed += item.failed;
      summary.completed += item.completed;
      return summary;
    },
    { total: 0, success: 0, failed: 0, completed: 0 }
  );
  return {
    ...stats,
    percent: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
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
    count: requestedImageCount(message),
    model: params.model ?? selectedSession.value?.settings?.model ?? "",
    referenceCount:
      message.referenceImages?.length ??
      params.referenceImageIds?.length ??
      message.referenceImageIds.length
  };
}
</script>

<template>
  <AppShell>
    <template v-if="selectedSession || detailLoading">
      <div class="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
      </div>

      <div
        v-if="detailLoading"
        class="panel flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"
      >
        <Loader2 class="h-4 w-4 animate-spin" />
        {{ t("common.loading") }}
      </div>

      <template v-else-if="selectedSession">
        <section class="panel mb-4 p-4">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("workspace.generationMode") }}</p>
              <p class="mt-1 font-semibold">{{ modeLabel(selectedSession.mode) }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("workspace.canvasSize") }}</p>
              <p class="mt-1 font-semibold">{{ selectedSession.settings?.size ?? "-" }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs text-muted-foreground">{{ t("history.generationProgress") }}</p>
                <p class="text-sm font-semibold">{{ detailGenerationStats.percent }}%</p>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary"
                  :style="{ width: `${detailGenerationStats.percent}%` }"
                ></div>
              </div>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("history.totalImages") }}</p>
              <p class="mt-1 font-semibold">{{ detailGenerationStats.total }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("history.successImages") }}</p>
              <p class="mt-1 font-semibold">{{ detailGenerationStats.success }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("history.failedImages") }}</p>
              <p class="mt-1 font-semibold">{{ detailGenerationStats.failed }}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("history.taskStatus") }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <span
                  :class="[
                    'rounded-full border px-2.5 py-1 text-xs font-medium',
                    taskStatusTone(latestTaskStatus)
                  ]"
                >
                  {{ taskStatusLabel(latestTaskStatus) }}
                </span>
              </div>
              <p
                v-if="taskStatusItems.length > 1"
                class="mt-2 text-xs leading-5 text-muted-foreground"
              >
                {{ taskStatusSummary }}
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/25 p-3">
              <p class="text-xs text-muted-foreground">{{ t("history.createdAt") }}</p>
              <p class="mt-1 font-semibold">{{ formatDateTime(selectedSession.createdAt) }}</p>
            </div>
          </div>
        </section>

        <div
          v-if="!resultMessages.length"
          class="panel p-8 text-center text-sm text-muted-foreground"
        >
          {{ t("history.noResults") }}
        </div>
        <div v-else class="grid gap-4 xl:grid-cols-2">
          <article
            v-for="message in resultMessages"
            :key="message.id"
            class="panel overflow-hidden"
          >
            <div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div class="min-w-0">
                <h2 class="line-clamp-2 font-semibold leading-6">
                  {{ message.prompt || selectedSession.title }}
                </h2>
                <p class="mt-1 text-xs text-muted-foreground">
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

            <div class="space-y-4 p-4">
              <div class="grid gap-2 sm:grid-cols-2">
                <div class="rounded-lg bg-muted/35 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ t("history.taskStatus") }}</span>
                  <span class="ml-2 font-medium">{{
                    taskStatusLabel(taskStatusValue(message))
                  }}</span>
                </div>
                <div class="rounded-lg bg-muted/35 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ t("workspace.generationMode") }}</span>
                  <span class="ml-2 font-medium">{{
                    modeLabel(taskParameters(message).mode)
                  }}</span>
                </div>
                <div class="rounded-lg bg-muted/35 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ t("workspace.canvasSize") }}</span>
                  <span class="ml-2 font-medium">{{ taskParameters(message).size }}</span>
                </div>
                <div class="rounded-lg bg-muted/35 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ t("workspace.imageCount") }}</span>
                  <span class="ml-2 font-medium">
                    {{ taskGenerationStats(message).success }} /
                    {{ taskGenerationStats(message).total }}
                  </span>
                </div>
                <div class="rounded-lg bg-muted/35 px-3 py-2 text-sm">
                  <span class="text-muted-foreground">{{ t("history.references") }}</span>
                  <span class="ml-2 font-medium">{{ taskParameters(message).referenceCount }}</span>
                </div>
                <div
                  v-if="taskParameters(message).model"
                  class="rounded-lg bg-muted/35 px-3 py-2 text-sm sm:col-span-2"
                >
                  <span class="text-muted-foreground">{{ t("history.model") }}</span>
                  <span class="ml-2 font-medium">{{ taskParameters(message).model }}</span>
                </div>
              </div>

              <div
                v-if="taskFailureMessage(message)"
                class="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
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

              <div
                v-if="message.referenceImages?.length"
                class="grid gap-2 rounded-lg border border-border bg-muted/20 p-2"
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

              <div v-if="message.attachments.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  v-for="image in message.attachments"
                  :key="image.id"
                  class="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                  type="button"
                  :title="t('workspace.openPreview')"
                  @click="openImage(image)"
                >
                  <img class="h-full w-full object-cover" :src="image.url" alt="" loading="lazy" />
                </button>
              </div>
              <div
                v-else
                class="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
              >
                <ImageIcon class="h-6 w-6" />
                {{ t("history.noResults") }}
              </div>
            </div>
          </article>
        </div>
      </template>
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
