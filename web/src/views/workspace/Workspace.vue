<script setup lang="ts">
/**
 * 工作台：会话列表 + 消息流 + 生图输入与模式切换；`useTaskWebSocket` 订阅进行中任务；
 * 路由 `/workspace/s/:sessionId` 与 `sessionId` query 同步加载消息。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import {
  Image as ImageIcon,
  ImageOff,
  Loader2,
  MessageSquare,
  Plus,
  RotateCw,
  Sparkles,
  Type,
  Wifi
} from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { apiFetch } from "@/api/client";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import {
  useSessionStore,
  type ActiveGeneration,
  type ImageAttachment,
  type Message,
  type SessionMode
} from "@/stores/session";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const sessions = useSessionStore();
const auth = useAuthStore();

/** 大图模态当前选中的图片；与右侧「结果缩略条」的选中 id 可独立 */
const selectedImage = ref<ImageAttachment | null>(null);
/** 非对话模式下右侧结果条高亮哪张；null 表示跟默认首张 */
const activePreviewImageId = ref<string | null>(null);
/** 与 `currentSession.mode` 同步的 UI 模式，切换受「进行中任务/单次锁定」限制 */
const activeMode = ref<SessionMode>("text2image");
/** 尚未落库成会话前，用作默认会话标题的草稿 */
const draftTitle = ref(defaultSessionTitle());
const submitting = ref(false);
/** 消息列表可滚动容器，作 IntersectionObserver 的 root */
const messageList = ref<HTMLElement | null>(null);
/** 列表顶部哨兵：进入视口则触发 `loadOlderMessages` */
const topSentinel = ref<HTMLElement | null>(null);

/** 当前会话下所有出图/参考图，供大图查看器轮播 allImages */
const allImages = computed(() =>
  sessions.messages.flatMap((message) => [
    ...message.attachments,
    ...(message.referenceImages ?? [])
  ])
);
const resultImages = computed(() => {
  for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
    const message = sessions.messages[index];
    if (message?.attachments.length) return message.attachments;
  }
  return [];
});

/** 从底部往上找**最后一条带附件的助手消息**，作为非 chat 模式右侧主预览源 */
const activePreviewImage = computed(
  () =>
    resultImages.value.find((image) => image.id === activePreviewImageId.value) ??
    resultImages.value[0] ??
    null
);

const runningMessages = computed(() => sessions.messages.filter(isGeneratingMessage));
/** 同会话多条排队时取最后一个（最新任务） */
const activeRunningMessage = computed(() => {
  const messages = runningMessages.value;
  return messages[messages.length - 1] ?? null;
});
const hasRunningTask = computed(() => runningMessages.value.length > 0);
const latestResultMessage = computed(() => {
  for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
    const message = sessions.messages[index];
    if (message?.role === "assistant" && (message.taskId || message.attachments.length)) {
      return message;
    }
  }
  return null;
});
const activeFailedMessage = computed(() => {
  const message = latestResultMessage.value;
  if (!message || hasRunningTask.value) return null;
  return message.status === "failed" && message.attachments.length === 0 ? message : null;
});

/** 对话模式：两栏布局，主区为聊天气泡列表 */
const isConversationMode = computed(() => activeMode.value === "chat");
/** 最近 6 条用户 prompt 倒序，供对话模式快选 */
const promptRecords = computed(() =>
  sessions.messages
    .filter((message) => message.role === "user" && message.prompt)
    .slice(-6)
    .reverse()
);
const latestPrompt = computed(() => promptRecords.value[0]?.prompt ?? "");

/** 顶栏/右侧与 ChatMessage 一致的进度百分比（0–99 与 queued 保底） */
const generationProgress = computed(() => {
  const progress = activeRunningMessage.value?.progress;
  if (typeof progress === "number") return Math.min(99, Math.max(6, Math.round(progress * 100)));
  return activeRunningMessage.value?.status === "queued" ? 6 : 28;
});
const generationStatusLabel = computed(() =>
  activeRunningMessage.value?.status === "queued"
    ? t("common.queued")
    : t("workspace.generationRunning")
);
const generationPrompt = computed(() => activeRunningMessage.value?.prompt ?? latestPrompt.value);
const failedPrompt = computed(() => activeFailedMessage.value?.prompt ?? latestPrompt.value);
const failedTitle = computed(() =>
  activeFailedMessage.value?.error?.code?.startsWith("PROVIDER")
    ? t("workspace.providerGenerationFailed")
    : t("workspace.generationFailed")
);
const failedMessage = computed(
  () =>
    activeFailedMessage.value?.error?.message ||
    failedPrompt.value ||
    t("workspace.generationFailedHint")
);

const inputLoading = computed(() => submitting.value || sessions.loading);
/** 用于只读/上传区展示与当前「单次」生图配对的 user 消息 */
const latestUserMessage = computed(() => {
  for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
    const message = sessions.messages[index];
    if (message?.role === "user" && message.prompt) return message;
  }
  return null;
});

/**
 * 文生图/图生图每会话只允一条助手任务：已有 taskId 则锁模式，避免同会话重复提交（与后端 assertNoActiveGeneration 一致产品侧表现）
 */
const oneShotTaskLocked = computed(
  () =>
    activeMode.value !== "chat" &&
    sessions.messages.some((message) => message.role === "assistant" && Boolean(message.taskId))
);
/**
 * 输入区绑定的模式：单次锁定时若上一条 user 有参考图则**显示为** image2image，避免 UI 与数据不一致
 */
const taskInputMode = computed<SessionMode>({
  get: () => {
    if (oneShotTaskLocked.value && latestUserMessage.value?.referenceImageIds.length) {
      return "image2image";
    }
    return activeMode.value;
  },
  set: (mode) => {
    activeMode.value = mode;
  }
});
const currentGenerationSettings = computed(() => ({
  size: sessions.currentSession?.settings?.size ?? "1024x1024",
  n: sessions.currentSession?.settings?.n ?? 1
}));

const latestReferenceCount = computed(() => latestUserMessage.value?.referenceImageIds.length ?? 0);
const latestReferenceImages = computed(() => latestUserMessage.value?.referenceImages ?? []);
const sessionTitle = computed(() => sessions.currentSession?.title ?? draftTitle.value);
const canEditTitle = computed(() => !sessions.currentSessionId && !hasRunningTask.value);
const modeSelectionDisabled = computed(
  () => submitting.value || hasRunningTask.value || oneShotTaskLocked.value
);
const modeOptions = computed(() => [
  { value: "text2image" as const, label: t("workspace.text2image"), icon: Type },
  { value: "image2image" as const, label: t("workspace.image2image"), icon: ImageIcon },
  { value: "chat" as const, label: t("workspace.continuousChat"), icon: MessageSquare }
]);

let messageObserver: IntersectionObserver | null = null;
/** 防 `loadMessages` 与 `restore` 的 watch 重入互抢路由 */
let restoringActiveGeneration = false;

const { status, connect, disconnect } = useTaskWebSocket((payload) => {
  sessions.applyTaskEvent(payload);
  const eventType =
    payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
  if (eventType === "task.done") {
    auth.bootstrap();
    disconnect();
  }
  if (eventType === "task.failed") {
    const error =
      payload && typeof payload === "object"
        ? (payload as { error?: { message?: string } }).error
        : null;
    toast.error(error?.message || t("workspace.generationFailedHint"));
    disconnect();
  }
});

onMounted(async () => {
  // 先拉会话列表，再尝试恢复中断任务或按路由加载消息
  await sessions.loadSessions();
  const restored = await restoreActiveGenerationIfNeeded();
  const routeSessionId = currentRouteSessionId();
  if (!restored && routeSessionId) {
    await sessions.loadMessages(routeSessionId);
  } else if (!restored) {
    resetWorkspaceDraft();
  }
  await nextTick();
  setupMessageObserver();
});

onBeforeUnmount(() => {
  messageObserver?.disconnect();
});

watch(
  () => route.params.sessionId,
  async (id) => {
    if (restoringActiveGeneration) return;
    const restored = await restoreActiveGenerationIfNeeded();
    if (restored) return;
    if (typeof id === "string") {
      await sessions.loadMessages(id);
    } else {
      resetWorkspaceDraft();
    }
  }
);

watch(
  () => sessions.currentSession?.mode,
  (mode) => {
    if (mode) activeMode.value = mode;
  },
  { immediate: true }
);

// 结果图列表变化时：若无图则清空高亮；若当前高亮 id 已不在列表则默认选中第一张
watch(
  resultImages,
  (images) => {
    if (!images.length) {
      activePreviewImageId.value = null;
      return;
    }
    if (!images.some((image) => image.id === activePreviewImageId.value)) {
      activePreviewImageId.value = images[0]?.id ?? null;
    }
  },
  { immediate: true }
);

// 切到多轮模式后下一帧再挂顶哨兵，保证 DOM 已渲染
watch(isConversationMode, async (enabled) => {
  if (!enabled) return;
  await nextTick();
  setupMessageObserver();
});

/** 新开一次：非 sysadmin 若有进行中任务则只尝试恢复，不允许多会话并行生图 */
async function newSession() {
  if (!auth.isSysadmin && hasRunningTask.value) {
    await restoreActiveGenerationIfNeeded();
    return;
  }
  disconnect();
  resetWorkspaceDraft();
  await router.push("/workspace");
}

/** 从 `/workspace/s/:sessionId` 取当前会话 id */
function currentRouteSessionId() {
  return typeof route.params.sessionId === "string" ? route.params.sessionId : null;
}

/**
 * 刷新进入时：若存在 queued/running 任务则拉消息、连 WS、必要时 replace 路由到该会话。
 * sysadmin 不自动抢（可多任务），直接 false。
 */
async function restoreActiveGenerationIfNeeded() {
  if (auth.isSysadmin || restoringActiveGeneration) return false;
  const active = await sessions.loadActiveGeneration();
  if (!active) return false;
  await openActiveGeneration(active);
  return true;
}

/** 设置 `restoringActiveGeneration`，保证 watch 路由时不会覆盖刚加载的消息列表 */
async function openActiveGeneration(active: ActiveGeneration) {
  restoringActiveGeneration = true;
  try {
    await sessions.loadMessages(active.sessionId);
    connect(`/ws/task/${active.taskId}`);
    if (currentRouteSessionId() !== active.sessionId) {
      await router.replace(`/workspace/s/${active.sessionId}`);
    }
  } finally {
    restoringActiveGeneration = false;
  }
}

/** 无会话 id 的「空白工作台」：清空消息、预览与标题草稿 */
function resetWorkspaceDraft() {
  sessions.currentSessionId = null;
  sessions.messages = [];
  sessions.nextMessageCursor = null;
  activePreviewImageId.value = null;
  selectedImage.value = null;
  activeMode.value = "text2image";
  draftTitle.value = defaultSessionTitle();
}

/** 三模式切换按钮；受 `modeSelectionDisabled` 时 no-op */
function setActiveMode(mode: SessionMode) {
  if (modeSelectionDisabled.value) return;
  activeMode.value = mode;
}

/** 用于筛「进行中」消息行，与 ChatMessage 展示条件一致 */
function isGeneratingMessage(message: Message) {
  return message.status === "queued" || message.status === "running";
}

/**
 * 向上滚动加载历史：哨兵进入视口则 `loadOlderMessages`，并用 scrollHeight 差值保持视口不跳动
 */
function setupMessageObserver() {
  messageObserver?.disconnect();
  if (!topSentinel.value || !messageList.value) return;
  messageObserver = new IntersectionObserver(
    async ([entry]) => {
      if (!entry?.isIntersecting || !sessions.nextMessageCursor) return;
      const list = messageList.value;
      const previousHeight = list?.scrollHeight ?? 0;
      await sessions.loadOlderMessages();
      await nextTick();
      if (list) list.scrollTop += list.scrollHeight - previousHeight;
    },
    { root: messageList.value, rootMargin: "160px 0px 0px 0px" }
  );
  messageObserver.observe(topSentinel.value);
}

/**
 * 提交生图：图生图先 POST `/uploads`，再 `sessions.generate` + `connect(ws)` + 落到 `/workspace/s/:id`。
 * 冲突 409 时从 `error.details.activeGeneration` 恢复现场。
 */
async function submit(input: {
  prompt: string;
  mode: SessionMode;
  size: string;
  n: number;
  files: File[];
}) {
  if (submitting.value || hasRunningTask.value) return;
  if (input.mode !== "chat" && oneShotTaskLocked.value) return;
  if (input.mode === "image2image" && input.files.length === 0) {
    toast.error(t("workspace.referenceRequired"));
    return;
  }
  submitting.value = true;
  try {
    // 1) 参考图先上传得 imageId
    let referenceImageIds: string[] = [];
    let referenceImages: ImageAttachment[] = [];
    if (input.mode === "image2image" && input.files.length) {
      const form = new FormData();
      input.files.forEach((file) => form.append("files", file));
      const uploaded = await apiFetch<{ images: ImageAttachment[] }>("/uploads", {
        method: "POST",
        body: form
      });
      referenceImageIds = uploaded.images.map((image) => image.id);
      referenceImages = uploaded.images;
    }
    // 2) 创建任务并乐观更新 store → 3) 连 WS → 4) 进会话深链
    const task = await sessions.generate({
      title: draftTitle.value.trim() || defaultSessionTitle(),
      prompt: input.prompt,
      mode: input.mode,
      size: input.size,
      n: input.n,
      referenceImageIds,
      referenceImages
    });
    connect(task.wsUrl);
    draftTitle.value = task.title;
    await router.replace(`/workspace/s/${task.sessionId}`);
  } catch (error) {
    const activeGeneration = activeGenerationFromError(error);
    if (activeGeneration && !auth.isSysadmin) {
      await openActiveGeneration(activeGeneration);
      return;
    }
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("workspace.submitFailed");
    toast.error(message);
  } finally {
    submitting.value = false;
  }
}

/** 失败重试：POST `/tasks/:id/retry` 后本地再插一对 user/assistant 并发 WS（与首发生成同构） */
async function retry(message: Message) {
  if (!message.taskId) return;
  try {
    const body = await apiFetch<{ taskId: string; sessionId: string; messageId: string }>(
      `/tasks/${message.taskId}/retry`,
      {
        method: "POST"
      }
    );
    const createdAt = Date.now();
    sessions.messages.push({
      id: `local-retry-${createdAt}`,
      sessionId: body.sessionId,
      role: "user",
      prompt: message.prompt,
      attachments: [],
      referenceImages: findSourceReferenceImages(message),
      referenceImageIds: findSourceReferenceImageIds(message),
      status: "succeeded",
      createdAt
    });
    sessions.messages.push({
      id: body.messageId,
      sessionId: body.sessionId,
      role: "assistant",
      prompt: message.prompt,
      attachments: [],
      referenceImageIds: [],
      taskId: body.taskId,
      status: "queued",
      progress: 0,
      createdAt: createdAt + 1
    });
    connect(`/ws/task/${body.taskId}`);
  } catch (error) {
    const activeGeneration = activeGenerationFromError(error);
    if (activeGeneration && !auth.isSysadmin) {
      await openActiveGeneration(activeGeneration);
      return;
    }
    const errorMessage =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : t("workspace.submitFailed");
    toast.error(errorMessage);
  }
}

/** 重试时从同会话上一条 user 取参考图 id，保持图生文上下文 */
function findSourceReferenceImageIds(message: Message) {
  return findSourceUserMessage(message)?.referenceImageIds ?? [];
}

/** 重试展示用：带给 `local-retry` user 气泡的缩略引用 */
function findSourceReferenceImages(message: Message) {
  return findSourceUserMessage(message)?.referenceImages ?? [];
}

/** 在消息数组中自 assistant 起向前找同 session 的最近一条 user */
function findSourceUserMessage(message: Message) {
  const messageIndex = sessions.messages.findIndex((item) => item.id === message.id);
  const endIndex = messageIndex >= 0 ? messageIndex - 1 : sessions.messages.length - 1;
  for (let index = endIndex; index >= 0; index -= 1) {
    const candidate = sessions.messages[index];
    if (candidate?.sessionId === message.sessionId && candidate.role === "user") {
      return candidate;
    }
  }
  return null;
}

/** 解析 API 409 响应体中的 `activeGeneration`，用于引导用户到正在跑的任务 */
function activeGenerationFromError(error: unknown): ActiveGeneration | null {
  if (!error || typeof error !== "object" || !("error" in error)) return null;
  const details = (error as { error?: { details?: unknown } }).error?.details;
  if (!details || typeof details !== "object") return null;
  const activeGeneration = (details as { activeGeneration?: ActiveGeneration }).activeGeneration;
  if (
    activeGeneration &&
    typeof activeGeneration.taskId === "string" &&
    typeof activeGeneration.sessionId === "string"
  ) {
    if (activeGeneration.session) sessions.upsertSession(activeGeneration.session);
    return activeGeneration;
  }
  return null;
}

/** 右侧失败态 CTA：对 `activeFailedMessage` 调 `retry` */
async function retryFailedResult() {
  if (!activeFailedMessage.value) return;
  await retry(activeFailedMessage.value);
}

/** 在右侧/抽屉中展示指定附件大图 */
function openImage(image: ImageAttachment) {
  selectedImage.value = image;
}

/** 从结果条「打开」进入与缩略条选中的一张 */
function openActivePreview() {
  if (activePreviewImage.value) openImage(activePreviewImage.value);
}

/** 软删消息（及关联展示），并关闭当前大图 */
async function deleteImageMessage(image: ImageAttachment) {
  if (!image.sessionId || !image.messageId) return;
  if (!window.confirm(t("workspace.deleteConfirm"))) return;
  await apiFetch(`/sessions/${image.sessionId}/messages/${image.messageId}`, { method: "DELETE" });
  sessions.messages = sessions.messages.filter((message) => message.id !== image.messageId);
  selectedImage.value = null;
  toast.success(t("workspace.messageDeleted"));
}

/** 与后端 `defaultSessionTitle` 同形，用于新会话未命名时的展示 */
function defaultSessionTitle(date = new Date()) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/** 标题日期时间各段补零为两位 */
function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
</script>

<template>
  <AppShell>
    <div class="workspace-page">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold">{{ t("workspace.title") }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="ui-button ui-button-primary h-9 px-3 text-sm"
            type="button"
            :disabled="(!auth.isSysadmin && hasRunningTask) || submitting"
            @click="newSession"
          >
            <Plus class="h-4 w-4" />
            {{ t("workspace.newGeneration") }}
          </button>
          <div
            class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Wifi class="h-3.5 w-3.5" />
            {{ t("workspace.websocket") }}: {{ status }}
          </div>
          <div
            v-if="hasRunningTask"
            class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
            {{ generationStatusLabel }}
            <span class="tabular-nums text-muted-foreground">
              {{ t("workspace.generationProgress", { percent: generationProgress }) }}
            </span>
          </div>
          <div
            class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Sparkles class="h-3.5 w-3.5" />
            {{
              auth.quota?.remainingQuota === null
                ? t("workspace.quotaUnlimited")
                : t("workspace.quotaRemaining", { count: auth.quota?.remainingQuota ?? 0 })
            }}
          </div>
        </div>
      </header>

      <section class="panel p-3">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <h2 class="text-sm font-semibold">{{ t("workspace.generationMode") }}</h2>
          </div>
          <div class="grid gap-2 sm:grid-cols-3 lg:w-auto lg:min-w-[30rem]">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              class="flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition"
              :class="[
                activeMode === option.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
                modeSelectionDisabled ? 'cursor-not-allowed opacity-70' : ''
              ]"
              type="button"
              :aria-pressed="activeMode === option.value"
              :disabled="modeSelectionDisabled"
              @click="setActiveMode(option.value)"
            >
              <component :is="option.icon" class="h-4 w-4" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
      </section>

      <div
        class="workspace-grid"
        :class="isConversationMode ? 'workspace-grid--chat' : 'workspace-grid--task'"
      >
        <template v-if="isConversationMode">
          <section
            class="conversation-panel panel flex min-h-[34rem] min-w-0 flex-col overflow-hidden"
          >
            <div class="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold">{{ t("workspace.continuousChat") }}</h2>
              <span
                class="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
              >
                <Loader2 v-if="hasRunningTask" class="h-3.5 w-3.5 animate-spin text-primary" />
                <span v-else class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"></span>
                <template v-if="hasRunningTask">
                  {{ generationStatusLabel }}
                  <span class="tabular-nums">
                    {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                  </span>
                </template>
                <template v-else>{{ status }}</template>
              </span>
            </div>
            <div
              ref="messageList"
              class="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/30 p-4"
            >
              <div ref="topSentinel" class="h-px"></div>
              <div
                v-if="sessions.olderMessagesLoading"
                class="py-2 text-center text-xs text-muted-foreground"
              >
                {{ t("workspace.loadingOlder") }}
              </div>
              <div
                v-if="!sessions.messages.length"
                class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
              >
                <ImageIcon class="h-8 w-8" />
                {{ t("workspace.conversationEmpty") }}
              </div>
              <ChatMessage
                v-for="message in sessions.messages"
                :key="message.id"
                :message="message"
                @open="openImage"
                @retry="retry"
              />
            </div>
          </section>

          <aside class="conversation-side min-h-0">
            <section class="panel overflow-hidden">
              <div class="border-b border-border px-4 py-3">
                <h2 class="text-sm font-semibold">{{ t("workspace.sessionTitle") }}</h2>
              </div>
              <div class="p-4">
                <label v-if="canEditTitle" class="block">
                  <span class="sr-only">{{ t("workspace.sessionTitle") }}</span>
                  <input
                    v-model="draftTitle"
                    class="ui-field h-10 px-3 text-sm"
                    maxlength="80"
                    :placeholder="t('workspace.sessionTitlePlaceholder')"
                    :disabled="submitting"
                  />
                </label>
                <p v-else class="truncate text-sm leading-6 text-muted-foreground">
                  {{ sessionTitle }}
                </p>
              </div>
            </section>

            <section class="panel flex min-h-0 flex-1 flex-col overflow-hidden">
              <div class="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 class="text-sm font-semibold">{{ t("workspace.latestResult") }}</h2>
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <span
                    v-if="hasRunningTask"
                    class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground"
                  >
                    <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
                    {{ generationStatusLabel }}
                  </span>
                  <span
                    v-else-if="activeFailedMessage"
                    class="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-semibold text-destructive"
                  >
                    <ImageOff class="h-3.5 w-3.5" />
                    {{ t("workspace.generationFailed") }}
                  </span>
                  <span
                    class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {{ resultImages.length }}
                  </span>
                </div>
              </div>
              <div
                v-if="activeFailedMessage"
                class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
              >
                <div
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                >
                  <ImageOff class="h-8 w-8" />
                </div>
                <div class="max-w-sm">
                  <p class="text-base font-semibold">{{ failedTitle }}</p>
                  <p class="mt-2 text-sm leading-6 text-muted-foreground">
                    {{ failedMessage }}
                  </p>
                </div>
                <button
                  class="ui-button ui-button-secondary h-9 border-destructive/30 text-destructive"
                  type="button"
                  @click="retryFailedResult"
                >
                  <RotateCw class="h-4 w-4" />
                  {{ t("common.retry") }}
                </button>
              </div>
              <div v-else-if="activePreviewImage" class="flex min-h-0 flex-1 flex-col p-3">
                <button
                  class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-background"
                  type="button"
                  :title="t('workspace.openPreview')"
                  @click="openActivePreview"
                >
                  <img
                    class="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                    :src="activePreviewImage.url"
                    alt=""
                  />
                  <div
                    v-if="hasRunningTask"
                    class="absolute inset-x-3 bottom-3 rounded-lg border border-primary/25 bg-card/95 p-3 text-left shadow-sm backdrop-blur"
                  >
                    <div class="flex items-center gap-2 text-sm font-semibold">
                      <Loader2 class="h-4 w-4 animate-spin text-primary" />
                      {{ t("workspace.generatingNewResult") }}
                      <span class="ml-auto text-xs tabular-nums text-muted-foreground">
                        {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                      </span>
                    </div>
                    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
                      <div
                        class="h-full rounded-full bg-primary transition-all duration-500"
                        :style="{ width: `${generationProgress}%` }"
                      ></div>
                    </div>
                  </div>
                </button>
              </div>
              <div
                v-else-if="hasRunningTask"
                class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
              >
                <div
                  class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Loader2 class="h-7 w-7 animate-spin" />
                </div>
                <div class="max-w-sm">
                  <p class="text-base font-semibold">{{ generationStatusLabel }}</p>
                  <p class="mt-2 text-sm leading-6 text-muted-foreground">
                    {{ generationPrompt || t("workspace.generationHint") }}
                  </p>
                </div>
                <div class="w-full max-w-xs">
                  <div class="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{{ t("workspace.generationHint") }}</span>
                    <span class="tabular-nums">
                      {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                    </span>
                  </div>
                  <div class="mt-2 h-2 overflow-hidden rounded-full bg-primary/15">
                    <div
                      class="h-full rounded-full bg-primary transition-all duration-500"
                      :style="{ width: `${generationProgress}%` }"
                    ></div>
                  </div>
                </div>
              </div>
              <div
                v-else
                class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
              >
                <ImageIcon class="h-10 w-10" />
                {{ t("workspace.noResult") }}
              </div>
            </section>

            <ChatInput
              class="workspace-settings-panel"
              :mode="activeMode"
              :generating="hasRunningTask"
              :loading="inputLoading"
              :allow-custom-count="auth.isSysadmin"
              variant="chat"
              @submit="submit"
            />
          </aside>
        </template>

        <template v-else>
          <section
            class="task-result-panel panel flex min-h-[34rem] min-w-0 flex-col overflow-hidden"
          >
            <div class="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 class="text-sm font-semibold">{{ t("workspace.result") }}</h2>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ latestPrompt || t("workspace.oneShotEmpty") }}
                </p>
              </div>
            </div>
            <div
              v-if="activeFailedMessage"
              class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center"
            >
              <div
                class="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <ImageOff class="h-10 w-10" />
              </div>
              <div class="max-w-xl">
                <p class="text-xl font-semibold">{{ failedTitle }}</p>
                <p class="mt-3 text-sm leading-6 text-muted-foreground">
                  {{ failedMessage }}
                </p>
              </div>
              <button
                class="ui-button ui-button-secondary h-9 border-destructive/30 text-destructive"
                type="button"
                @click="retryFailedResult"
              >
                <RotateCw class="h-4 w-4" />
                {{ t("common.retry") }}
              </button>
            </div>
            <div v-else-if="activePreviewImage" class="flex min-h-0 flex-1 flex-col p-4">
              <button
                class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-background"
                type="button"
                :title="t('workspace.openPreview')"
                @click="openActivePreview"
              >
                <img
                  class="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                  :src="activePreviewImage.url"
                  alt=""
                />
                <div
                  v-if="hasRunningTask"
                  class="absolute inset-x-4 bottom-4 rounded-lg border border-primary/25 bg-card/95 p-3 text-left shadow-sm backdrop-blur"
                >
                  <div class="flex items-center gap-2 text-sm font-semibold">
                    <Loader2 class="h-4 w-4 animate-spin text-primary" />
                    {{ t("workspace.generatingNewResult") }}
                    <span class="ml-auto text-xs tabular-nums text-muted-foreground">
                      {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                    </span>
                  </div>
                  <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
                    <div
                      class="h-full rounded-full bg-primary transition-all duration-500"
                      :style="{ width: `${generationProgress}%` }"
                    ></div>
                  </div>
                </div>
              </button>
              <div
                v-if="resultImages.length > 1"
                class="thin-scrollbar mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1"
              >
                <button
                  v-for="image in resultImages"
                  :key="image.id"
                  class="h-16 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted transition"
                  :class="image.id === activePreviewImage.id ? 'border-primary' : 'border-border'"
                  type="button"
                  @click="activePreviewImageId = image.id"
                >
                  <img class="h-full w-full object-cover" :src="image.url" alt="" loading="lazy" />
                </button>
              </div>
            </div>
            <div
              v-else-if="hasRunningTask"
              class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center"
            >
              <div
                class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Loader2 class="h-9 w-9 animate-spin" />
              </div>
              <div class="max-w-xl">
                <p class="text-xl font-semibold">{{ generationStatusLabel }}</p>
                <p class="mt-3 text-sm leading-6 text-muted-foreground">
                  {{ generationPrompt || t("workspace.generationHint") }}
                </p>
              </div>
              <div class="w-full max-w-md">
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ t("workspace.generationHint") }}</span>
                  <span class="tabular-nums">
                    {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                  </span>
                </div>
                <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-primary/15">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-500"
                    :style="{ width: `${generationProgress}%` }"
                  ></div>
                </div>
              </div>
            </div>
            <div
              v-else
              class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
            >
              <ImageIcon class="h-10 w-10" />
              {{ t("workspace.noResult") }}
            </div>
          </section>

          <aside class="task-side min-h-0">
            <section class="panel thin-scrollbar max-h-64 overflow-y-auto">
              <div class="border-b border-border px-4 py-3">
                <h2 class="text-sm font-semibold">{{ t("workspace.sessionTitle") }}</h2>
              </div>
              <div class="p-4">
                <label v-if="canEditTitle" class="block">
                  <span class="sr-only">{{ t("workspace.sessionTitle") }}</span>
                  <input
                    v-model="draftTitle"
                    class="ui-field h-10 px-3 text-sm"
                    maxlength="80"
                    :placeholder="t('workspace.sessionTitlePlaceholder')"
                    :disabled="submitting"
                  />
                </label>
                <p v-else class="truncate text-sm leading-6 text-muted-foreground">
                  {{ sessionTitle }}
                </p>
              </div>
            </section>

            <ChatInput
              class="workspace-settings-panel"
              :mode="taskInputMode"
              :initial-count="currentGenerationSettings.n"
              :initial-size="currentGenerationSettings.size"
              :generating="hasRunningTask"
              :loading="inputLoading"
              :allow-custom-count="auth.isSysadmin"
              :read-only="oneShotTaskLocked"
              :reference-count="latestReferenceCount"
              :reference-images="latestReferenceImages"
              @open-reference="openImage"
              @submit="submit"
            />
          </aside>
        </template>
      </div>
    </div>
    <ImageViewer
      :image="selectedImage"
      :images="allImages"
      @close="selectedImage = null"
      @delete="deleteImageMessage"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>

<style scoped>
.workspace-page {
  display: grid;
  min-height: calc(100dvh - 6rem);
  grid-template-rows: auto auto auto;
  gap: 1rem;
  overflow: visible;
}

.workspace-grid,
.task-side,
.conversation-side {
  display: grid;
  gap: 1rem;
  min-height: 0;
  overflow: visible;
}

.task-side,
.conversation-side {
  align-content: start;
}

@media (min-width: 1024px) {
  .workspace-page {
    height: calc(100dvh - 6rem);
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .workspace-grid,
  .task-side,
  .conversation-side {
    overflow: hidden;
  }

  .workspace-grid--task {
    grid-template-columns: 22rem minmax(0, 1fr);
  }

  .workspace-grid--chat {
    grid-template-columns: 22rem minmax(0, 1fr);
  }

  .workspace-grid--task .task-side {
    grid-column: 1;
    grid-row: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-grid--chat .conversation-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-grid--chat .conversation-side {
    grid-column: 1;
    grid-row: 1;
  }
}

@media (min-width: 1280px) {
  .workspace-grid {
    height: 100%;
  }

  .workspace-grid--task {
    grid-template-columns: 23rem minmax(0, 1fr);
  }

  .workspace-grid--chat {
    grid-template-columns: 23rem minmax(0, 1fr);
  }

  .task-result-panel,
  .conversation-panel,
  .task-side,
  .conversation-side {
    min-height: 0;
    height: 100%;
  }

  .task-side {
    grid-column: auto;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
  }

  .conversation-side {
    grid-column: auto;
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: stretch;
    overflow: hidden;
  }

  .workspace-settings-panel {
    min-height: 0;
    height: 100%;
  }
}

@media (min-width: 1536px) {
  .workspace-grid--task {
    grid-template-columns: 24rem minmax(0, 1fr);
  }

  .workspace-grid--chat {
    grid-template-columns: 24rem minmax(0, 1fr);
  }
}
</style>
