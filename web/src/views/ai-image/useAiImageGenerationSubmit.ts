/**
 * AI 图像生成页的提交链路。
 *
 * 复用现有 `/api/uploads`、`/api/generate`、WebSocket 和 session store；本页只负责更友好的 prompt 准备。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { trackExperimentEvent } from "@/api/experiments";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore, type ImageAttachment } from "@/stores/session";
import { imageFilesFromFileList, prepareReferenceImageFiles } from "@/utils/referenceImageFiles";
import { defaultSessionTitle, sizeOptionsForProvider } from "@/views/workspace/workspaceOptions";
import type { PromptCaseMode } from "@/types/promptCases";

export function useAiImageGenerationSubmit() {
  const { t } = useI18n();
  const auth = useAuthStore();
  const sessions = useSessionStore();
  const mode = ref<PromptCaseMode>("text2image");
  const size = ref("1024x1024");
  const files = ref<File[]>([]);
  const previews = ref<Array<{ file: File; url: string }>>([]);
  const submitting = ref(false);

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
  const resultImages = computed(() => {
    for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
      const message = sessions.messages[index];
      if (message?.attachments.length) return message.attachments;
    }
    return [];
  });

  const { status, connect, disconnect } = useTaskWebSocket((payload) => {
    sessions.applyTaskEvent(payload);
    const type = payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
    if (type === "task.done") {
      const taskId =
        payload && typeof payload === "object"
          ? (payload as { task?: { id?: string } }).task?.id
          : undefined;
      void trackExperimentEvent({ eventName: "generate_succeeded", route: "/ai-image", taskId });
      void auth.bootstrap();
      disconnect();
    }
    if (type === "task.failed") {
      const taskId =
        payload && typeof payload === "object"
          ? (payload as { task?: { id?: string } }).task?.id
          : undefined;
      void trackExperimentEvent({ eventName: "generate_failed", route: "/ai-image", taskId });
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

  async function submit(prompt: string, title?: string) {
    const trimmed = prompt.trim();
    if (!trimmed || submitting.value || hasRunningTask.value) return;
    if (!supportedModes.value.includes(mode.value)) {
      toast.error(t("workspace.modeUnsupported"));
      return;
    }
    if (!sizeOptions.value.some((option) => option.value === size.value)) {
      toast.error(t("workspace.sizeUnsupported"));
      return;
    }
    if (mode.value === "image2image" && !files.value.length) {
      toast.error(t("workspace.referenceRequired"));
      return;
    }

    submitting.value = true;
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
        referenceImages: uploaded.referenceImages
      });
      connect(task.wsUrl);
      toast.success(t("aiImage.submitted"));
      if (mode.value === "image2image") clearFiles();
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error
          ? (error as { error: { message: string } }).error.message
          : t("workspace.submitFailed");
      toast.error(message);
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
