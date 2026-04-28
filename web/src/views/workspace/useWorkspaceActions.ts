import type { ComputedRef, Ref } from "vue";
import type { Router } from "vue-router";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { isDirectGenerationAccess } from "@/components/layout/generationExperimentEvents";
import { useAuthStore } from "@/stores/auth";
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
};

export function useWorkspaceActions(options: WorkspaceActionOptions) {
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

  /**
   * 提交生图：图生图先上传参考图，再创建任务、连 WS、落到会话深链。
   * 若后端返回单活跃任务冲突，则恢复到正在跑的任务，避免用户误开新会话。
   */
  async function submit(input: {
    prompt: string;
    mode: SessionMode;
    size: string;
    n: number;
    files: File[];
  }) {
    if (submitting.value || hasRunningTask.value) return;
    if (!supportsMode(input.mode)) {
      toast.error(t("workspace.modeUnsupported"));
      return;
    }
    if (!supportsSize(input.size)) {
      toast.error(t("workspace.sizeUnsupported"));
      return;
    }
    if (input.mode !== "chat" && oneShotTaskLocked.value) return;
    if (input.mode === "image2image" && input.files.length === 0) {
      toast.error(t("workspace.referenceRequired"));
      return;
    }
    if (input.mode === "image2image" && input.files.length > maxReferenceFiles.value) {
      toast.error(t("workspace.referenceLimit", { count: maxReferenceFiles.value }));
      return;
    }
    submitting.value = true;
    try {
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
      const task = await sessions.generate({
        title: draftTitle.value.trim() || defaultSessionTitle(),
        prompt: input.prompt,
        mode: input.mode,
        size: input.size,
        n: input.n,
        referenceImageIds,
        referenceImages,
        ...workspaceGenerationExperimentEvent(input, referenceImageIds.length)
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

  /** 失败重试：沿用原 user 的 prompt/参考图，本地补一对消息后接入新 task WS。 */
  async function retry(message: Message) {
    if (!message.taskId) return;
    try {
      const body = await apiFetch<{ taskId: string; sessionId: string; messageId: string }>(
        `/tasks/${message.taskId}/retry`,
        {
          method: "POST",
          body: JSON.stringify({
            experimentEvent: {
              route: "/workspace",
              metadata: {
                isRetry: true,
                retryTrigger: "workspace",
                directAccess: isDirectGenerationAccess(
                  "/workspace",
                  auth.generationExperience,
                  auth.isSysadmin
                )
              }
            }
          })
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

  function workspaceGenerationExperimentEvent(
    input: { mode: SessionMode; size: string; n: number },
    referenceImageCount: number
  ) {
    // AI 图像生成 A/B 只比较文生图、图生图；连续对话另行聚合，避免污染 A 变体口径。
    if (input.mode === "chat") return {};
    return {
      experimentEvent: {
        route: "/workspace",
        metadata: {
          mode: input.mode,
          size: input.size,
          n: input.n,
          referenceImageCount,
          promptSource: "user",
          directAccess: isDirectGenerationAccess(
            "/workspace",
            auth.generationExperience,
            auth.isSysadmin
          )
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
