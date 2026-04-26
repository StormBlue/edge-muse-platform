<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import type { ImageAttachment, Message, Session, SessionMode } from "@/stores/session";

type AuditSession = Session & {
  userId?: string;
  user?: {
    id: string;
    email?: string | null;
    username?: string | null;
    nickname?: string | null;
    role?: string | null;
  };
  providerKeyId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  deletedAt?: number | null;
  taskCount?: number;
};

type AuditImageAttachment = ImageAttachment & {
  createdAt?: number | null;
  generationDurationMs?: number | null;
  generationIndex?: number | null;
};

type TaskParams = {
  prompt?: string;
  mode?: SessionMode;
  size?: string;
  n?: number;
  model?: string;
  referenceImageIds?: string[];
};

type AuditMessage = Omit<Message, "attachments"> & {
  attachments: AuditImageAttachment[];
  referenceImages?: AuditImageAttachment[];
  task?: {
    id?: string;
    mode?: SessionMode | null;
    params?: TaskParams;
    status?: string | null;
    errorCode?: string | null;
    errorMsg?: string | null;
    queuedAt?: number | null;
    startedAt?: number | null;
    finishedAt?: number | null;
    durationMs?: number | null;
    generationFailures?: Array<{
      index: number;
      code: string;
      message: string;
      phase?: string | null;
      createdAt?: number | null;
    }>;
  } | null;
};

type FailureGroup = {
  key: string;
  code: string;
  message: string;
  phase?: string | null;
  count: number;
  indexes: number[];
};

type UserOption = {
  id: string;
  email: string | null;
  username: string | null;
  nickname: string | null;
  role: string;
  status: string;
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { locale, t } = useI18n();
const userId = ref(resolveRouteUserId());
const q = ref("");
const userOptions = ref<UserOption[]>([]);
const sessions = ref<AuditSession[]>([]);
const messages = ref<AuditMessage[]>([]);
const selectedSession = ref<AuditSession | null>(null);
const selectedImage = ref<ImageAttachment | null>(null);
const page = ref(1);
const pageInput = ref("1");
const pageSize = 12;
const total = ref(0);
const loading = ref(false);
const detailLoading = ref(false);
const activeMessageIndex = ref(0);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const selectedSessionId = computed(() => selectedSession.value?.id ?? getRouteSessionId());
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
        Number(right.message.attachments.length > 0) - Number(left.message.attachments.length > 0);
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
    ...message.attachments.map(toViewerImage),
    ...(message.referenceImages ?? []).map(toViewerImage)
  ])
);

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
  () => route.params.userId,
  async () => {
    const nextUserId = resolveRouteUserId();
    userId.value = nextUserId;
    await loadSessions(1);
    const sessionId = getRouteSessionId();
    if (sessionId) {
      await loadDetail(sessionId);
      return;
    }
    clearDetail();
  }
);

watch(
  () => route.query.session,
  async () => {
    const sessionId = getRouteSessionId();
    if (sessionId) {
      await loadDetail(sessionId);
      return;
    }
    clearDetail();
  }
);

onMounted(async () => {
  void loadUserOptions();
  await loadSessions(1);
  const sessionId = getRouteSessionId();
  if (sessionId) await loadDetail(sessionId);
});

function resolveRouteUserId() {
  const routeUserId = typeof route.params.userId === "string" ? route.params.userId : "";
  if (routeUserId === "_") return "";
  if (routeUserId === "me") return auth.user?.id ?? "";
  return routeUserId;
}

function clearDetail() {
  selectedSession.value = null;
  messages.value = [];
  selectedImage.value = null;
  activeMessageIndex.value = 0;
}

async function submitFilters() {
  const normalizedUserId = userId.value.trim();
  const routeUserId = normalizedUserId || "_";
  const currentRouteUserId = typeof route.params.userId === "string" ? route.params.userId : "";
  if (currentRouteUserId !== routeUserId) {
    await router.push({ path: `/sysadmin/users/${encodeURIComponent(routeUserId)}/sessions` });
    return;
  }
  await loadSessions(1);
}

async function loadUserOptions() {
  try {
    const body = await apiFetch<{ items: UserOption[] }>("/sysadmin/users");
    userOptions.value = body.items;
  } catch {
    userOptions.value = [];
  }
}

async function loadSessions(nextPage = page.value) {
  const normalizedUserId = userId.value.trim();
  userId.value = normalizedUserId;
  const targetPage = sanitizePage(nextPage);
  loading.value = true;
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
    sessions.value = body.items;
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
  await loadSessions(targetPage);
}

async function openDetail(session: AuditSession) {
  selectedSession.value = session;
  if (getRouteSessionId() === session.id) {
    await loadDetail(session.id);
    return;
  }
  await router.push({ path: route.path, query: { session: session.id } });
}

async function backToTable() {
  await router.push({ path: route.path });
}

async function loadDetail(sessionId: string) {
  detailLoading.value = true;
  try {
    const body = await apiFetch<{
      session: AuditSession;
      messages: AuditMessage[];
    }>(`/sysadmin/sessions/${encodeURIComponent(sessionId)}/detail`);
    selectedSession.value = body.session;
    messages.value = body.messages.map(normalizeMessageAttachments);
    activeMessageIndex.value = 0;
  } finally {
    detailLoading.value = false;
  }
}

function getRouteSessionId() {
  return typeof route.query.session === "string" ? route.query.session : null;
}

function sanitizePage(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function clampPageInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return page.value;
  return Math.min(Math.max(Math.floor(parsed), 1), totalPages.value);
}

function normalizeMessageAttachments(message: AuditMessage): AuditMessage {
  return {
    ...message,
    referenceImages: (message.referenceImages ?? []).map((image) => ({
      ...image,
      taskId: image.taskId ?? message.taskId ?? null,
      sessionId: image.sessionId ?? message.sessionId,
      messageId: image.messageId ?? message.id,
      prompt: image.prompt ?? message.prompt ?? null
    })),
    attachments: message.attachments.map((image) => ({
      ...image,
      taskId: image.taskId ?? message.taskId ?? null,
      sessionId: image.sessionId ?? message.sessionId,
      messageId: image.messageId ?? message.id,
      prompt: image.prompt ?? message.prompt ?? null
    }))
  };
}

function toViewerImage(image: ImageAttachment): ImageAttachment {
  return { ...image, messageId: null };
}

function openImage(image: ImageAttachment) {
  selectedImage.value = toViewerImage(image);
}

function imageTitle(image: AuditImageAttachment) {
  return `${t("workspace.openPreview")} / ${t("sysadmin.imageDuration")} ${formatDuration(
    image.generationDurationMs
  )}`;
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

function roleLabel(role: string) {
  if (role === "user") return t("sysadmin.messageUser");
  if (role === "assistant") return t("sysadmin.messageAssistant");
  if (role === "system") return t("sysadmin.messageSystem");
  return role;
}

function userLabel(user?: AuditSession["user"] | UserOption | null) {
  if (!user) return "-";
  const name = user.nickname || user.username || user.email || user.id;
  return user.role ? `${name} · ${user.role}` : name;
}

function userSubLabel(user?: AuditSession["user"] | UserOption | null) {
  if (!user) return "";
  return [user.username, user.email].filter(Boolean).join(" · ") || user.id;
}

function statusLabel(status?: string | null) {
  if (!status) return "-";
  if (["queued", "running", "succeeded", "failed", "cancelled"].includes(status)) {
    return t(`common.${status}`);
  }
  return status;
}

function statusTone(status?: string | null) {
  if (status === "succeeded") return "bg-primary/15 text-primary";
  if (status === "failed" || status === "cancelled") return "bg-destructive/10 text-destructive";
  if (status === "running" || status === "queued") return "bg-accent/10 text-accent";
  return "bg-muted text-muted-foreground";
}

function requestedImageCount(message: AuditMessage) {
  const configured = message.task?.params?.n ?? selectedSession.value?.settings?.n;
  const count = typeof configured === "number" && Number.isFinite(configured) ? configured : 0;
  return Math.max(Math.floor(count), message.attachments.length);
}

function taskParameters(message: AuditMessage) {
  const params = message.task?.params ?? {};
  return {
    mode: message.task?.mode ?? params.mode ?? selectedSession.value?.mode ?? null,
    size: params.size ?? selectedSession.value?.settings?.size ?? "-",
    count: requestedImageCount(message),
    model: params.model ?? selectedSession.value?.settings?.model ?? "",
    referenceCount:
      message.referenceImages?.length ??
      params.referenceImageIds?.length ??
      message.referenceImageIds.length,
    durationMs: message.task?.durationMs ?? null
  };
}

function messagePromptText(message: AuditMessage) {
  return message.prompt || message.task?.params?.prompt || "";
}

function isLongPrompt(message: AuditMessage) {
  const prompt = messagePromptText(message);
  return prompt.length > 260 || prompt.split("\n").length > 5;
}

function generationFailures(message: AuditMessage) {
  return message.task?.generationFailures ?? [];
}

function taskFailureMessage(message: AuditMessage) {
  return message.task?.errorMsg || message.error?.message || "";
}

function hasFailureDetails(message: AuditMessage) {
  return generationFailures(message).length > 0 || Boolean(taskFailureMessage(message));
}

function failureGroups(message: AuditMessage) {
  const groups = new Map<string, FailureGroup>();
  for (const failure of generationFailures(message)) {
    const code = failure.code || "UNKNOWN_ERROR";
    const failureMessage = failure.message || "-";
    const phase = failure.phase ?? null;
    const key = [code, phase ?? "", failureMessage].join("\u0000");
    const group = groups.get(key) ?? {
      key,
      code,
      message: failureMessage,
      phase,
      count: 0,
      indexes: []
    };
    group.count += 1;
    if (typeof failure.index === "number" && Number.isFinite(failure.index)) {
      group.indexes.push(failure.index);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

function failureCountLabel(count: number) {
  return t("sysadmin.failureImagesCount", { count });
}

function failureGroupTitle(group: FailureGroup) {
  return group.count > 1 ? `${group.code} · ${failureCountLabel(group.count)}` : group.code;
}

function failureImageRangeLabel(group: FailureGroup) {
  const sorted = [...new Set(group.indexes)]
    .filter((index) => Number.isFinite(index))
    .sort((left, right) => left - right);
  if (!sorted.length) return "-";

  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (const index of sorted.slice(1)) {
    if (index === end + 1) {
      end = index;
      continue;
    }
    ranges.push(formatFailureIndexRange(start, end));
    start = index;
    end = index;
  }
  ranges.push(formatFailureIndexRange(start, end));
  return ranges.join(", ");
}

function formatFailureIndexRange(start: number, end: number) {
  const displayStart = start + 1;
  const displayEnd = end + 1;
  return displayStart === displayEnd ? `#${displayStart}` : `#${displayStart}-#${displayEnd}`;
}

function imageIndexLabel(index?: number | null) {
  return typeof index === "number" ? `#${index + 1}` : "#?";
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

function formatDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.max(Math.round(value), 0)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
</script>

<template>
  <AppShell>
    <template v-if="selectedSessionId">
      <div class="flex h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden">
        <div
          class="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
        >
          <div class="min-w-0">
            <button
              class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
              type="button"
              @click="backToTable"
            >
              <ArrowLeft class="h-4 w-4" />
              {{ t("sysadmin.backToSessionTable") }}
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
              :disabled="activeMessageIndex <= 0"
              @click="previousMessage"
            >
              <ChevronLeft class="h-4 w-4" />
              {{ t("common.previous") }}
            </button>
            <span class="min-w-16 text-center text-muted-foreground">
              {{ activeMessageIndex + 1 }} / {{ displayResultMessages.length }}
            </span>
            <button
              class="ui-button ui-button-secondary h-9 px-3"
              type="button"
              :disabled="activeMessageIndex >= displayResultMessages.length - 1"
              @click="nextMessage"
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

        <template v-else>
          <div
            v-if="!displayResultMessages.length"
            class="panel flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
          >
            {{ t("sysadmin.noMessages") }}
          </div>
          <div v-else class="min-h-0 flex-1">
            <article
              v-for="message in activeMessages"
              :key="message.id"
              class="panel h-full min-h-0 overflow-hidden"
            >
              <div
                class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,24rem)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-none 2xl:grid-cols-[minmax(0,1fr)_26rem]"
              >
                <ScrollArea class="h-full min-h-0 bg-muted/15">
                  <div class="flex flex-col gap-4 p-3 sm:p-4">
                    <section>
                      <div
                        v-if="message.attachments.length"
                        :class="[
                          'grid gap-3',
                          message.attachments.length === 1
                            ? 'min-h-[24rem] grid-cols-1'
                            : 'grid-cols-2 2xl:grid-cols-3'
                        ]"
                      >
                        <div v-for="image in message.attachments" :key="image.id" class="min-w-0">
                          <button
                            :class="[
                              'w-full overflow-hidden rounded-lg border border-border bg-muted',
                              message.attachments.length === 1 ? 'min-h-[24rem]' : 'aspect-square'
                            ]"
                            type="button"
                            :title="imageTitle(image)"
                            @click="openImage(image)"
                          >
                            <img
                              class="h-full w-full object-contain"
                              :src="image.url"
                              alt=""
                              loading="lazy"
                            />
                          </button>
                          <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {{ imageIndexLabel(image.generationIndex) }}
                            · {{ formatDuration(image.generationDurationMs) }}
                          </p>
                        </div>
                      </div>
                      <div
                        v-else
                        class="flex min-h-[24rem] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                      >
                        {{ t("history.noResults") }}
                      </div>
                    </section>

                    <section
                      v-if="message.referenceImages?.length"
                      class="rounded-lg border border-border bg-background/70 p-3"
                    >
                      <p class="mb-2 text-xs font-medium text-muted-foreground">
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
                          <img class="h-full w-full object-cover" :src="image.url" alt="" />
                        </button>
                      </div>
                    </section>

                    <ScrollArea
                      v-if="hasFailureDetails(message)"
                      class="h-40 rounded-lg border border-destructive/25 bg-destructive/5"
                    >
                      <div class="px-3 py-2 text-sm text-destructive">
                        <p class="font-semibold">
                          {{
                            message.task?.errorCode?.startsWith("PROVIDER")
                              ? t("workspace.providerGenerationFailed")
                              : t("workspace.generationFailed")
                          }}
                        </p>
                        <p
                          v-if="generationFailures(message).length"
                          class="mt-1 text-xs text-destructive/80"
                        >
                          {{ failureCountLabel(generationFailures(message).length) }}
                        </p>

                        <div v-if="failureGroups(message).length" class="mt-2 flex flex-col gap-3">
                          <div v-for="group in failureGroups(message)" :key="group.key">
                            <div class="flex items-start justify-between gap-3">
                              <div class="min-w-0">
                                <p class="truncate text-xs font-semibold">
                                  {{ failureGroupTitle(group) }}
                                </p>
                                <p class="mt-0.5 font-mono text-[11px] text-destructive/70">
                                  {{ failureImageRangeLabel(group) }}
                                </p>
                              </div>
                              <span
                                v-if="group.count > 1"
                                class="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium"
                              >
                                {{ failureCountLabel(group.count) }}
                              </span>
                            </div>
                            <p v-if="group.phase" class="mt-1 text-[11px] text-destructive/70">
                              {{ t("sysadmin.failurePhase") }}: {{ group.phase }}
                            </p>
                            <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
                              {{ group.message }}
                            </p>
                          </div>
                        </div>
                        <p v-else class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
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
                            {{ t("sysadmin.messageRole") }}
                          </p>
                          <p class="mt-1 font-medium">{{ roleLabel(message.role) }}</p>
                          <p class="mt-1 text-xs text-muted-foreground">
                            {{ formatDateTime(message.createdAt) }}
                          </p>
                        </div>
                        <span
                          :class="[
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                            statusTone(message.task?.status ?? message.status)
                          ]"
                        >
                          {{ statusLabel(message.task?.status ?? message.status) }}
                        </span>
                      </div>

                      <dl
                        v-if="selectedSession"
                        class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                      >
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.sessionId") }}</dt>
                          <dd class="min-w-0 truncate font-mono font-medium">
                            {{ selectedSession.id }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.userFilter") }}</dt>
                          <dd class="min-w-0">
                            <p class="truncate font-medium">
                              {{ userLabel(selectedSession.user) }}
                            </p>
                            <p class="truncate text-xs text-muted-foreground">
                              {{ userSubLabel(selectedSession.user) }}
                            </p>
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("adminUsers.taskCount") }}</dt>
                          <dd class="min-w-0 font-medium">{{ selectedSession.taskCount ?? 0 }}</dd>
                        </div>
                      </dl>

                      <dl
                        class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                      >
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.generationMode") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ modeLabel(taskParameters(message).mode) }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.canvasSize") }}</dt>
                          <dd class="min-w-0 font-medium">{{ taskParameters(message).size }}</dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.imageCount") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ message.attachments.length }} / {{ requestedImageCount(message) }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("history.references") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ taskParameters(message).referenceCount }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.imageDuration") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ formatDuration(taskParameters(message).durationMs) }}
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
                          v-if="isLongPrompt(message)"
                          class="mt-2 min-h-0 flex-1 rounded-lg bg-muted/35"
                        >
                          <div class="whitespace-pre-wrap break-words p-3 text-sm leading-6">
                            {{ messagePromptText(message) || "-" }}
                          </div>
                        </ScrollArea>
                        <div
                          v-else
                          class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/35 p-3 text-sm leading-6"
                        >
                          {{ messagePromptText(message) || "-" }}
                        </div>
                      </section>
                    </div>
                  </ScrollArea>
                </aside>
              </div>
            </article>
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 class="text-xl font-semibold leading-8">{{ t("sysadmin.userSessionsTitle") }}</h1>
        <form
          class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
          @submit.prevent="submitFilters"
        >
          <select
            v-model="userId"
            class="ui-field h-10 !w-full px-3 text-sm sm:!w-72"
            @change="submitFilters"
          >
            <option value="">{{ t("sysadmin.allUsers") }}</option>
            <option
              v-if="userId && !userOptions.some((user) => user.id === userId)"
              :value="userId"
            >
              {{ userId }}
            </option>
            <option v-for="user in userOptions" :key="user.id" :value="user.id">
              {{ userLabel(user) }}
            </option>
          </select>
          <input
            v-model="q"
            class="ui-field col-span-2 h-10 !w-full px-3 sm:col-span-1 sm:!w-72"
            :placeholder="t('sysadmin.auditSearchPlaceholder')"
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
      <div v-else class="panel overflow-hidden">
        <div class="thin-scrollbar overflow-auto">
          <table class="w-full min-w-[76rem] border-collapse text-sm">
            <thead class="bg-muted text-left text-muted-foreground">
              <tr>
                <th class="w-20 p-3">#</th>
                <th class="p-3">{{ t("workspace.sessionTitle") }}</th>
                <th class="p-3">{{ t("sysadmin.userFilter") }}</th>
                <th class="p-3">{{ t("workspace.generationMode") }}</th>
                <th class="p-3">{{ t("adminUsers.taskCount") }}</th>
                <th class="p-3">{{ t("history.createdAt") }}</th>
                <th class="p-3">{{ t("history.updatedAt") }}</th>
                <th class="p-3 text-right">{{ t("sysadmin.actions") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!sessions.length" class="border-t border-border">
                <td class="p-8 text-center text-muted-foreground" colspan="8">
                  {{ t("sysadmin.noSessions") }}
                </td>
              </tr>
              <tr
                v-for="(session, index) in sessions"
                :key="session.id"
                class="cursor-pointer border-t border-border transition hover:bg-muted/40"
                tabindex="0"
                @click="openDetail(session)"
                @keyup.enter="openDetail(session)"
              >
                <td class="p-3 font-mono text-muted-foreground">{{ tableRowNumber(index) }}</td>
                <td class="p-3">
                  <p class="truncate font-medium">{{ session.title }}</p>
                  <p class="truncate font-mono text-xs text-muted-foreground">{{ session.id }}</p>
                </td>
                <td class="p-3">
                  <p class="truncate font-medium">{{ userLabel(session.user) }}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ userSubLabel(session.user) }}
                  </p>
                </td>
                <td class="p-3">{{ modeLabel(session.mode) }}</td>
                <td class="p-3 font-mono">{{ session.taskCount ?? 0 }}</td>
                <td class="p-3 text-muted-foreground">{{ formatDateTime(session.createdAt) }}</td>
                <td class="p-3 text-muted-foreground">
                  {{ formatDateTime(session.lastMessageAt) }}
                </td>
                <td class="p-3 text-right">
                  <button
                    class="ui-button ui-button-secondary h-8 text-xs"
                    type="button"
                    @click.stop="openDetail(session)"
                  >
                    {{ t("sysadmin.viewDetail") }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
              @click="loadSessions(page - 1)"
            >
              <ChevronLeft class="h-4 w-4" />
              {{ t("common.previous") }}
            </button>
            <button
              class="ui-button ui-button-secondary h-9 px-3 text-sm"
              type="button"
              :disabled="page >= totalPages || loading"
              @click="loadSessions(page + 1)"
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
              for="audit-page-jump"
            >
              {{ t("history.jumpTo") }}
            </label>
            <input
              id="audit-page-jump"
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
      :images="auditImages"
      @close="selectedImage = null"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>
