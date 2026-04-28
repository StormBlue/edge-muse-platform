/**
 * AI 图像生成页的提交链路。
 *
 * 复用现有 `/api/uploads`、`/api/generate`、WebSocket 和 session store；本页只负责更友好的 prompt 准备。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore, type ImageAttachment } from "@/stores/session";
import { imageFilesFromFileList, prepareReferenceImageFiles } from "@/utils/referenceImageFiles";
import { imagesForAiImageActiveResult } from "./aiImageResultScope";
import {
  getAiImageSubmitBlockReason,
  type AiImageSubmitBlockReason
} from "./aiImageSubmitValidation";
import { defaultSessionTitle, sizeOptionsForProvider } from "@/views/workspace/workspaceOptions";
import type { PromptCaseMode } from "@/types/promptCases";

export type AiImageSubmitExperimentEvent = {
  route?: string;
  caseId?: string;
  metadata?: Record<string, unknown>;
};

export function useAiImageGenerationSubmit() {
  const { t } = useI18n();
  const auth = useAuthStore();
  const sessions = useSessionStore();
  const mode = ref<PromptCaseMode>("text2image");
  const size = ref("1024x1024");
  const files = ref<File[]>([]);
  const previews = ref<Array<{ file: File; url: string }>>([]);
  const submitting = ref(false);
  const activeTaskId = ref<string | null>(null);
  const activeSessionId = ref<string | null>(null);

  const sizeOptions = computed(() => sizeOptionsForProvider(auth.providerCapabilities));
  const supportedModes = computed(() =>
    (auth.providerCapabilities?.supportedModes ?? ["text2image", "image2image"]).filter(
      (item): item is PromptCaseMode => item === "text2image" || item === "image2image"
    )
  );
  const maxReferenceFiles = computed(() => auth.providerCapabilities?.maxReferenceImages ?? 5);
  const runningMessages = computed(() =>
    sessions.messages.filter(
      (message) => message.status === "queued" || message.status === "running"
    )
  );
  const hasRunningTask = computed(() => runningMessages.value.length > 0);
  const resultImages = computed(() =>
    imagesForAiImageActiveResult(sessions.messages, {
      taskId: activeTaskId.value,
      sessionId: activeSessionId.value
    })
  );

  const { status, connect, disconnect } = useTaskWebSocket((payload) => {
    sessions.applyTaskEvent(payload);
    const type = payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
    if (type === "task.done") {
      void auth.bootstrap();
      disconnect();
    }
    if (type === "task.failed") {
      toast.error(t("workspace.generationFailedHint"));
      disconnect();
    }
  });

  watch(
    () => sizeOptions.value.map((option) => option.value).join("|"),
    () => {
      if (sizeOptions.value.some((option) => option.value === size.value)) return;
      size.value = sizeOptions.value[0]?.value ?? "1024x1024";
    },
    { immediate: true }
  );

  watch(mode, (next) => {
    if (next === "text2image") clearFiles();
  });

  watch(files, (next) => {
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
    previews.value = next.map((file) => ({ file, url: URL.createObjectURL(file) }));
  });

  onBeforeUnmount(() => {
    disconnect();
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
  });

  async function addFiles(input: FileList | File[]) {
    const prepared = await prepareReferenceImageFiles(imageFilesFromFileList(input));
    files.value = [...files.value, ...prepared].slice(0, Math.max(1, maxReferenceFiles.value));
  }

  function removeFile(index: number) {
    files.value = files.value.filter((_, currentIndex) => currentIndex !== index);
  }

  function clearFiles() {
    files.value = [];
  }

  async function submit(
    prompt: string,
    title?: string,
    experimentEvent?: AiImageSubmitExperimentEvent
  ) {
    const trimmed = prompt.trim();
    const blockReason = getAiImageSubmitBlockReason({
      prompt: trimmed,
      submitting: submitting.value,
      hasRunningTask: hasRunningTask.value,
      mode: mode.value,
      supportedModes: supportedModes.value,
      size: size.value,
      sizeOptions: sizeOptions.value,
      referenceImageCount: files.value.length
    });
    if (blockReason) {
      toast.error(submitBlockMessage(blockReason));
      return { submitted: false as const, reason: blockReason };
    }

    submitting.value = true;
    activeTaskId.value = null;
    activeSessionId.value = null;
    try {
      const uploaded = await uploadReferencesIfNeeded();
      // AI 图像生成页每次提交独立创建会话，避免误写入用户刚才在专业工作台打开的会话。
      sessions.currentSessionId = null;
      const task = await sessions.generate({
        title: title || defaultSessionTitle(),
        prompt: trimmed,
        mode: mode.value,
        size: size.value,
        n: 1,
        referenceImageIds: uploaded.referenceImageIds,
        referenceImages: uploaded.referenceImages,
        experimentEvent
      });
      activeTaskId.value = task.taskId;
      activeSessionId.value = task.sessionId;
      connect(task.wsUrl);
      toast.success(t("aiImage.submitted"));
      if (mode.value === "image2image") clearFiles();
      return { submitted: true as const, taskId: task.taskId };
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error
          ? (error as { error: { message: string } }).error.message
          : t("workspace.submitFailed");
      toast.error(message);
      return { submitted: false as const, reason: "request_failed" as const };
    } finally {
      submitting.value = false;
    }
  }

  async function uploadReferencesIfNeeded() {
    if (mode.value !== "image2image" || !files.value.length) {
      return { referenceImageIds: [] as string[], referenceImages: [] as ImageAttachment[] };
    }
    const form = new FormData();
    files.value.forEach((file) => form.append("files", file));
    const body = await apiFetch<{ images: ImageAttachment[] }>("/uploads", {
      method: "POST",
      body: form
    });
    return {
      referenceImageIds: body.images.map((image) => image.id),
      referenceImages: body.images
    };
  }

  function submitBlockMessage(reason: AiImageSubmitBlockReason) {
    if (reason === "empty_prompt") return t("workspace.emptyPrompt");
    if (reason === "mode_unsupported") return t("workspace.modeUnsupported");
    if (reason === "size_unsupported") return t("workspace.sizeUnsupported");
    if (reason === "reference_required") return t("workspace.referenceRequired");
    if (reason === "submitting") return t("workspace.submitting");
    return t("workspace.generationRunning");
  }

  return {
    files,
    hasRunningTask,
    maxReferenceFiles,
    mode,
    previews,
    resultImages,
    sessions,
    size,
    sizeOptions,
    status,
    submitting,
    supportedModes,
    addFiles,
    clearFiles,
    removeFile,
    submit
  };
}
