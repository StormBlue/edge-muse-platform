import { getCurrentScope, onScopeDispose, watch, type ComputedRef, type Ref } from "vue";
import type { Router } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useTaskActivityStore } from "@/stores/taskActivity";
import {
  useSessionStore,
  type ActiveGeneration,
  type ImageAttachment,
  type Message,
  type SessionMode
} from "@/stores/session";
import { defaultSessionTitle } from "./workspaceOptions";

type Translate = (key: string, params?: Record<string, unknown>) => string;

type WorkspaceActionOptions = {
  t: Translate;
  router: Router;
  sessions: ReturnType<typeof useSessionStore>;
  auth: ReturnType<typeof useAuthStore>;
  connect: (url: string) => void;
  draftTitle: Ref<string>;
  submitting: Ref<boolean>;
  selectedImage: Ref<ImageAttachment | null>;
  hasRunningTask: ComputedRef<boolean>;
  oneShotTaskLocked: ComputedRef<boolean>;
  maxReferenceFiles: ComputedRef<number>;
  activeFailedMessage: ComputedRef<Message | null>;
  activePreviewImage: ComputedRef<ImageAttachment | null>;
  supportsMode: (mode: SessionMode) => boolean;
  supportsSize: (size: string) => boolean;
  openActiveGeneration: (active: ActiveGeneration) => Promise<void>;
  reuseSource?: Ref<{ sourceTaskId: string; sourceImageId?: string } | null>;
};

export function useWorkspaceActions(options: WorkspaceActionOptions) {
  const taskActivity = useTaskActivityStore();
  const {
    t,
    router,
    sessions,
    auth,
    connect,
    draftTitle,
    submitting,
    selectedImage,
    hasRunningTask,
    oneShotTaskLocked,
    maxReferenceFiles,
    activeFailedMessage,
    activePreviewImage,
    supportsMode,
    supportsSize,
    openActiveGeneration
  } = options;
  let actionVersion = 0;
  let accountVersion = 0;
  let disposed = false;
  function invalidate() {
    actionVersion += 1;
    submitting.value = false;
  }
  // 路由往返也递增版本，不能仅比较最终 URL；旧请求不得污染重新打开的页面。
  watch(() => router.currentRoute.value.fullPath, invalidate, { flush: "sync" });
  watch(
    () => auth.user?.id,
    () => {
      accountVersion += 1;
      invalidate();
    },
    { flush: "sync" }
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      invalidate();
    });

  function startAction() {
    const version = ++actionVersion;
    const account = accountVersion;
    const userId = auth.user?.id;
    const path = router.currentRoute.value.fullPath;
    submitting.value = true;
    const sameAccount = () => account === accountVersion && userId === auth.user?.id;
    const isCurrent = () =>
      !disposed &&
      version === actionVersion &&
      sameAccount() &&
      path === router.currentRoute.value.fullPath;
    const finish = () => {
      if (version === actionVersion) submitting.value = false;
    };
    return { sameAccount, isCurrent, finish };
  }

  /**
   * 提交生图：图生图先上传参考图，再创建任务、连 WS、落到会话深链。
   * 若后端返回单活跃任务冲突，则恢复到正在跑的任务，避免用户误开新会话。
   */
  async function submit(input: {
    prompt: string;
    generationTargetId: string;
    mode: SessionMode;
    size: string;
    n: number;
    files: File[];
    referenceImages?: ImageAttachment[];
  }) {
    if (disposed || submitting.value || hasRunningTask.value) return;
    if (!supportsMode(input.mode)) {
      toast.error(t("workspace.modeUnsupported"));
      return;
    }
    if (!supportsSize(input.size)) {
      toast.error(t("workspace.sizeUnsupported"));
      return;
    }
    if (oneShotTaskLocked.value) return;
    const existingReferences = input.referenceImages ?? [];
    if (input.mode === "image2image" && input.files.length + existingReferences.length === 0) {
      toast.error(t("workspace.referenceRequired"));
      return;
    }
    if (
      input.mode === "image2image" &&
      input.files.length + existingReferences.length > maxReferenceFiles.value
    ) {
      toast.error(t("workspace.referenceLimit", { count: maxReferenceFiles.value }));
      return;
    }
    const request = startAction();
    const title = draftTitle.value.trim() || defaultSessionTitle();
    const source = { ...options.reuseSource?.value };
    try {
      let referenceImageIds: string[] =
        input.mode === "image2image" ? existingReferences.map((image) => image.id) : [];
      let referenceImages: ImageAttachment[] =
        input.mode === "image2image" ? [...existingReferences] : [];
      if (input.mode === "image2image" && input.files.length) {
        const form = new FormData();
        input.files.forEach((file) => form.append("files", file));
        const uploaded = await apiFetch<{ images: ImageAttachment[] }>("/uploads", {
          method: "POST",
          body: form
        });
        if (!request.isCurrent()) return;
        referenceImageIds = [...referenceImageIds, ...uploaded.images.map((image) => image.id)];
        referenceImages = [...referenceImages, ...uploaded.images];
      }
      const task = await sessions.generate(
        {
          title,
          prompt: input.prompt,
          generationTargetId: input.generationTargetId,
          mode: input.mode,
          size: input.size,
          n: input.n,
          referenceImageIds,
          referenceImages,
          ...source,
          ...workspaceGenerationEvent(input, referenceImageIds.length)
        },
        { canApply: request.isCurrent }
      );
      // 同账号已受理任务仍登记全局；跨账号响应完全忽略，页面写入另受路由版本保护。
      if (!request.sameAccount()) return;
      void taskActivity.observeTask(task.taskId);
      if (!request.isCurrent()) return;
      connect(task.wsUrl);
      draftTitle.value = task.title;
      await router.replace(`/workspace/s/${task.sessionId}`);
    } catch (error) {
      if (!request.isCurrent()) return;
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
      request.finish();
    }
  }

  /** 失败重试：沿用原 user 的 prompt/参考图，本地补一对消息后接入新 task WS。 */
  async function retry(message: Message) {
    if (disposed || !message.taskId || submitting.value || hasRunningTask.value) return;
    const request = startAction();
    const referenceImages = findSourceReferenceImages(message);
    const referenceImageIds = findSourceReferenceImageIds(message);
    try {
      const body = await apiFetch<{ taskId: string; sessionId: string; messageId: string }>(
        `/tasks/${message.taskId}/retry`,
        {
          method: "POST",
          body: JSON.stringify({
            generationEvent: {
              route: "/workspace",
              metadata: {
                isRetry: true,
                retryTrigger: "workspace"
              }
            }
          })
        }
      );
      if (!request.sameAccount()) return;
      void taskActivity.observeTask(body.taskId);
      if (!request.isCurrent()) return;
      const createdAt = Date.now();
      sessions.messages.push({
        id: `local-retry-${createdAt}`,
        sessionId: body.sessionId,
        role: "user",
        prompt: message.prompt,
        attachments: [],
        referenceImages,
        referenceImageIds,
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
      if (!request.isCurrent()) return;
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
    } finally {
      request.finish();
    }
  }

  async function retryFailedResult() {
    if (!activeFailedMessage.value) return;
    await retry(activeFailedMessage.value);
  }

  function openImage(image: ImageAttachment) {
    selectedImage.value = image;
  }

  function openActivePreview() {
    if (activePreviewImage.value) openImage(activePreviewImage.value);
  }

  async function deleteImageMessage(image: ImageAttachment) {
    if (!image.sessionId || !image.messageId) return;
    if (!window.confirm(t("workspace.deleteConfirm"))) return;
    await apiFetch(`/sessions/${image.sessionId}/messages/${image.messageId}`, {
      method: "DELETE"
    });
    sessions.messages = sessions.messages.filter((message) => message.id !== image.messageId);
    selectedImage.value = null;
    toast.success(t("workspace.messageDeleted"));
  }

  function findSourceReferenceImageIds(message: Message) {
    return findSourceUserMessage(message)?.referenceImageIds ?? [];
  }

  function findSourceReferenceImages(message: Message) {
    return findSourceUserMessage(message)?.referenceImages ?? [];
  }

  function findSourceUserMessage(message: Message) {
    const messageIndex = sessions.messages.findIndex((item) => item.id === message.id);
    const endIndex = messageIndex >= 0 ? messageIndex - 1 : sessions.messages.length - 1;
    for (let index = endIndex; index >= 0; index -= 1) {
      const candidate = sessions.messages[index];
      if (candidate?.sessionId === message.sessionId && candidate.role === "user") return candidate;
    }
    return null;
  }

  function workspaceGenerationEvent(
    input: { generationTargetId: string; mode: SessionMode; size: string; n: number },
    referenceImageCount: number
  ) {
    return {
      generationEvent: {
        route: "/workspace",
        metadata: {
          mode: input.mode,
          size: input.size,
          n: input.n,
          generationTargetId: input.generationTargetId,
          referenceImageCount,
          promptSource: "user"
        }
      }
    };
  }

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

  return {
    submit,
    retry,
    retryFailedResult,
    openImage,
    openActivePreview,
    deleteImageMessage
  };
}
