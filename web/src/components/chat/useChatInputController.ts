import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  imageFilesFromDataTransfer,
  imageFilesFromFileList,
  prepareReferenceImageFiles
} from "@/utils/referenceImageFiles";
import type { ImageAttachment, SessionMode } from "@/stores/session";
import { recreationMessages } from "@/components/image/recreationMessages";

export type ChatInputSizeOption = {
  value: string;
  ratio: string;
  label: string;
};

export type ChatInputGenerationTargetOption = {
  id: string;
  label: string;
  experimental: boolean;
};

export type ChatInputSubmitValue = {
  prompt: string;
  generationTargetId: string;
  mode: SessionMode;
  size: string;
  n: number;
  files: File[];
  referenceImages?: ImageAttachment[];
};

export type ChatInputProps = {
  notice?: string;
  loading?: boolean;
  generating?: boolean;
  mode: SessionMode;
  readOnly?: boolean;
  generationTargetId?: string;
  generationTargets?: ChatInputGenerationTargetOption[];
  initialGenerationTargetId?: string;
  initialSize?: string;
  initialCount?: number;
  initialPrompt?: string;
  initialReferenceImages?: ImageAttachment[];
  initialReferenceCount?: number;
  allowCustomCount?: boolean;
  maxCustomCount?: number;
  referenceCount?: number;
  referenceImages?: ImageAttachment[];
  sizeOptions?: ChatInputSizeOption[];
  maxReferenceFiles?: number | null;
  limitHighResolutionCount?: boolean;
};

type ChatInputEmit = {
  (event: "submit", value: ChatInputSubmitValue): void;
  (event: "update:generationTargetId", value: string): void;
};

const DEFAULT_SIZE_OPTIONS: ChatInputSizeOption[] = [
  { value: "auto", ratio: "Auto", label: "Auto" },
  { value: "1024x1024", ratio: "1:1", label: "1024 x 1024" },
  { value: "1536x1024", ratio: "3:2", label: "1536 x 1024" },
  { value: "1024x1536", ratio: "2:3", label: "1024 x 1536" }
];

const defaultMaxReferenceFiles = 5;
const defaultMaxCustomCount = 200;

export function useChatInputController(props: ChatInputProps, emit: ChatInputEmit) {
  const { t } = useI18n({ useScope: "local", messages: recreationMessages });
  const prompt = ref("");
  const generationTargetId = ref("default");
  const size = ref("auto");
  const n = ref(1);
  const countInput = ref("1");
  const files = ref<File[]>([]);
  const existingReferences = ref<ImageAttachment[]>([]);
  const requiredReferenceCount = ref(0);
  const dragging = ref(false);
  const previews = ref<Array<{ file: File; url: string }>>([]);

  const isReadOnly = computed(() => Boolean(props.readOnly));
  const isImageToImage = computed(() => props.mode === "image2image");
  const isBusy = computed(() => Boolean(props.loading || props.generating));
  const hasPrompt = computed(() => prompt.value.trim().length > 0);
  // 旧任务的配方按原始引用数校验；接口少返回的图片不能被当成用户主动删图。
  const missingReferences = computed(() =>
    isImageToImage.value
      ? Math.max(
          0,
          requiredReferenceCount.value - existingReferences.value.length - files.value.length
        )
      : 0
  );
  const submitDisabled = computed(
    () =>
      isReadOnly.value ||
      isBusy.value ||
      !hasPrompt.value ||
      missingReferences.value > 0 ||
      (isImageToImage.value && files.value.length + existingReferences.value.length === 0)
  );
  const highResolutionCountLocked = computed(
    () => Boolean(props.limitHighResolutionCount) && isHighResolutionSize(size.value)
  );
  const effectiveMaxCustomCount = computed(() => {
    const configured = props.maxCustomCount ?? defaultMaxCustomCount;
    if (!Number.isFinite(configured)) return defaultMaxCustomCount;
    return Math.max(1, Math.min(defaultMaxCustomCount, Math.floor(configured)));
  });
  const countSelectionDisabled = computed(
    () => isReadOnly.value || !props.allowCustomCount || highResolutionCountLocked.value
  );
  const submitLabel = computed(() => {
    if (props.loading) return t("workspace.submitting");
    if (props.generating) return t("workspace.generationRunning");
    return t("workspace.generate");
  });
  const effectiveSizeOptions = computed(() =>
    props.sizeOptions?.length ? props.sizeOptions : DEFAULT_SIZE_OPTIONS
  );
  const effectiveGenerationTargets = computed<ChatInputGenerationTargetOption[]>(() =>
    props.generationTargets?.length
      ? props.generationTargets
      : [{ id: "default", label: t("workspace.defaultGenerationTarget"), experimental: false }]
  );
  const showGenerationTargetSelector = computed(
    () => !isReadOnly.value && effectiveGenerationTargets.value.length > 1
  );
  const effectiveMaxReferenceFiles = computed(() => {
    const value = props.maxReferenceFiles ?? defaultMaxReferenceFiles;
    return Math.max(1, Math.min(defaultMaxReferenceFiles, Math.floor(value)));
  });
  const selectedSizeOption = computed(
    () =>
      effectiveSizeOptions.value.find((option) => option.value === size.value) ?? {
        value: size.value,
        ratio: size.value,
        label: size.value
      }
  );
  const visibleSizeOptions = computed(() =>
    isReadOnly.value ? [selectedSizeOption.value] : effectiveSizeOptions.value
  );
  const visibleCountOptions = computed(() => {
    if (highResolutionCountLocked.value) return [1];
    if (isReadOnly.value) return [n.value];
    return [1];
  });
  const displayedReferenceCount = computed(() => props.referenceCount ?? files.value.length);
  const readonlyReferenceImages = computed(() =>
    isReadOnly.value ? (props.referenceImages ?? []) : existingReferences.value
  );
  const editablePreviews = computed(() => (isReadOnly.value ? [] : previews.value));
  const uploaderLabel = computed(() => {
    if (isReadOnly.value && isImageToImage.value) {
      return t("workspace.referenceImages", { count: displayedReferenceCount.value });
    }
    if (files.value.length) return t("workspace.referenceImages", { count: files.value.length });
    return t("workspace.addReferenceImage");
  });

  watch(
    () => props.initialReferenceCount,
    (value) => {
      requiredReferenceCount.value = Math.max(0, value ?? 0);
    },
    { immediate: true }
  );

  watch(
    () => props.initialPrompt,
    (value) => {
      prompt.value = value ?? "";
    },
    { immediate: true }
  );
  watch(
    () => props.initialReferenceImages,
    (value) => {
      existingReferences.value = [...(value ?? [])];
    },
    { immediate: true }
  );

  watch(
    () => props.generationTargetId ?? props.initialGenerationTargetId,
    (next) => {
      if (next) generationTargetId.value = next;
    },
    { immediate: true }
  );

  watch(generationTargetId, (next) => {
    if (props.generationTargetId !== next) emit("update:generationTargetId", next);
  });

  watch(
    () => effectiveGenerationTargets.value.map((target) => target.id).join("|"),
    () => {
      if (
        effectiveGenerationTargets.value.some((target) => target.id === generationTargetId.value)
      ) {
        return;
      }
      generationTargetId.value = effectiveGenerationTargets.value[0]?.id ?? "default";
    },
    { immediate: true }
  );

  watch(
    () => props.initialSize,
    (next) => {
      if (next) size.value = next;
    },
    { immediate: true }
  );

  watch(
    () => effectiveSizeOptions.value.map((option) => option.value).join("|"),
    () => {
      if (isReadOnly.value) return;
      if (effectiveSizeOptions.value.some((option) => option.value === size.value)) return;
      size.value = effectiveSizeOptions.value[0]?.value ?? "auto";
    },
    { immediate: true }
  );

  watch(
    () => [props.initialCount, props.allowCustomCount, effectiveMaxCustomCount.value] as const,
    ([next]) => {
      setNormalizedCount(
        props.allowCustomCount && typeof next === "number" && !highResolutionCountLocked.value
          ? clampImageCount(next)
          : 1
      );
    },
    { immediate: true }
  );

  watch(highResolutionCountLocked, (locked) => {
    if (locked) setNormalizedCount(1);
  });

  watch(
    () => props.mode,
    (next) => {
      if (next !== "image2image") {
        clearFiles();
        existingReferences.value = [];
      }
      if (!props.allowCustomCount) setNormalizedCount(1);
    }
  );

  watch(
    files,
    (next) => {
      revokePreviews();
      previews.value = next.map((file) => ({ file, url: URL.createObjectURL(file) }));
    },
    { deep: false }
  );

  watch(
    () => [isReadOnly.value, readonlyReferenceImages.value.length] as const,
    ([readOnly, referenceImageCount]) => {
      if (readOnly && referenceImageCount > 0) clearFiles();
    }
  );

  watch(effectiveMaxReferenceFiles, (maxFiles) => {
    existingReferences.value = existingReferences.value.slice(0, maxFiles);
    files.value = files.value.slice(0, Math.max(0, maxFiles - existingReferences.value.length));
  });

  onBeforeUnmount(() => {
    revokePreviews();
  });

  async function submit() {
    if (submitDisabled.value) return;
    const submittedCount =
      props.allowCustomCount && !highResolutionCountLocked.value ? normalizeCountFromInput() : 1;
    emit("submit", {
      prompt: prompt.value.trim(),
      generationTargetId: generationTargetId.value,
      mode: props.mode,
      size: size.value,
      n: submittedCount,
      files: isImageToImage.value ? files.value : [],
      ...(isImageToImage.value && existingReferences.value.length
        ? { referenceImages: existingReferences.value }
        : {})
    });
    if (!isImageToImage.value) clearFiles();
  }

  async function onFiles(event: Event) {
    if (isReadOnly.value) return;
    const input = event.target as HTMLInputElement;
    await addFiles(imageFilesFromFileList(input.files));
    input.value = "";
  }

  async function onDrop(event: DragEvent) {
    if (isReadOnly.value) return;
    dragging.value = false;
    await addFiles(imageFilesFromDataTransfer(event.dataTransfer));
  }

  async function onPaste(event: ClipboardEvent) {
    if (isReadOnly.value) return;
    if (!isImageToImage.value) return;
    const pastedFiles = imageFilesFromDataTransfer(event.clipboardData);
    if (pastedFiles.length) {
      event.preventDefault();
      await addFiles(pastedFiles);
    }
  }

  async function addFiles(inputFiles: File[]) {
    if (isReadOnly.value) return;
    if (!isImageToImage.value) return;
    const compressed = await prepareReferenceImageFiles(inputFiles);
    files.value = [...files.value, ...compressed].slice(
      0,
      Math.max(0, effectiveMaxReferenceFiles.value - existingReferences.value.length)
    );
  }

  function removeFile(index: number) {
    if (isReadOnly.value) return;
    files.value = files.value.filter((_, currentIndex) => currentIndex !== index);
  }

  function removeReference(id: string) {
    if (isReadOnly.value) return;
    existingReferences.value = existingReferences.value.filter((image) => image.id !== id);
  }

  function confirmCurrentReferences() {
    if (isReadOnly.value || isBusy.value) return;
    // 明确确认仅解除原配方数量要求，仍需满足图生图至少一张参考图的正常校验。
    requiredReferenceCount.value = 0;
  }

  function clearFiles() {
    files.value = [];
  }

  function setCount(event: Event) {
    const input = event.target as HTMLInputElement;
    countInput.value = input.value.replace(/[^\d]/g, "");
    const value = Number(countInput.value);
    if (Number.isFinite(value) && value >= 1) n.value = clampImageCount(value);
  }

  function normalizeCount(event: Event) {
    const input = event.target as HTMLInputElement;
    normalizeCountFromInput();
    input.value = countInput.value;
  }

  function clampImageCount(value: number) {
    return Math.min(effectiveMaxCustomCount.value, Math.max(1, Math.floor(value)));
  }

  function setNormalizedCount(value: number) {
    n.value = clampImageCount(value);
    countInput.value = String(n.value);
  }

  function normalizeCountFromInput() {
    const value = countInput.value ? Number(countInput.value) : 1;
    setNormalizedCount(Number.isFinite(value) ? value : 1);
    return n.value;
  }

  function revokePreviews() {
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
  }

  return {
    t,
    prompt,
    generationTargetId,
    size,
    n,
    countInput,
    dragging,
    isReadOnly,
    isImageToImage,
    isBusy,
    maxCustomCount: effectiveMaxCustomCount,
    highResolutionCountLocked,
    submitDisabled,
    countSelectionDisabled,
    submitLabel,
    effectiveMaxReferenceFiles,
    effectiveGenerationTargets,
    showGenerationTargetSelector,
    visibleSizeOptions,
    selectedSizeOption,
    visibleCountOptions,
    readonlyReferenceImages,
    editablePreviews,
    uploaderLabel,
    submit,
    onFiles,
    onDrop,
    onPaste,
    removeFile,
    removeReference,
    missingReferences,
    confirmCurrentReferences,
    setCount,
    normalizeCount
  };
}

function isHighResolutionSize(value: string): boolean {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) return false;
  return Math.max(Number(match[1]), Number(match[2])) >= 1600;
}
