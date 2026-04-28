/**
 * AI 图像生成页的案例浏览控制器。
 *
 * 只读取 published 案例；初始加载只预览案例，用户明确选择/应用后才回填 prompt。
 */
import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { listPublishedPromptCases } from "@/api/promptCases";
import { useUiStore } from "@/stores/ui";
import {
  filterPromptCases,
  promptCaseApplyResult,
  promptCaseCategories,
  promptCaseSizes
} from "./promptCaseSelection";
import { PROMPT_CASE_MODES, type PromptCase, type PromptCaseMode } from "@/types/promptCases";
import type { ApiError } from "@/api/client";

export type AiImagePromptSource = "case" | "assistant" | "user" | null;

export type UseAiImageCasesOptions = {
  supportedModes?: Ref<PromptCaseMode[]> | ComputedRef<PromptCaseMode[]>;
};

export function useAiImageCases(options: UseAiImageCasesOptions = {}) {
  const { t } = useI18n();
  const ui = useUiStore();
  const items = ref<PromptCase[]>([]);
  const selectedId = ref<string | null>(null);
  const category = ref("");
  const filterMode = ref<"" | PromptCaseMode>("");
  const selectedMode = ref<PromptCaseMode>("text2image");
  const size = ref("");
  const search = ref("");
  const finalPrompt = ref("");
  const finalPromptSource = ref<AiImagePromptSource>(null);
  const caseContextId = ref<string | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  let loadSeq = 0;

  const supportedModes = computed(() => {
    const modes = options.supportedModes?.value ?? [...PROMPT_CASE_MODES];
    return modes.filter((mode): mode is PromptCaseMode => PROMPT_CASE_MODES.includes(mode));
  });
  const availableItems = computed(() =>
    filterPromptCases(items.value, {
      category: "",
      mode: "",
      size: "",
      search: "",
      supportedModes: supportedModes.value
    })
  );
  const selected = computed(
    () =>
      availableItems.value.find((item) => item.id === selectedId.value) ??
      availableItems.value[0] ??
      null
  );
  const caseContext = computed(
    () => availableItems.value.find((item) => item.id === caseContextId.value) ?? null
  );
  const categories = computed(() => promptCaseCategories(availableItems.value));
  const sizes = computed(() => promptCaseSizes(availableItems.value));
  const filteredItems = computed(() =>
    filterPromptCases(availableItems.value, {
      category: category.value,
      mode: filterMode.value,
      size: size.value,
      search: search.value,
      supportedModes: supportedModes.value
    })
  );

  watch(supportedModes, (nextModes) => {
    if (filterMode.value && !nextModes.includes(filterMode.value)) filterMode.value = "";
    ensureAvailableSelection();
  });

  watch(
    () => ui.locale,
    (locale) => {
      if (!loaded.value) return;
      void load(locale);
    }
  );

  async function load(locale = ui.locale) {
    const currentSeq = ++loadSeq;
    loading.value = true;
    try {
      const nextItems = await listPublishedPromptCases({ locale });
      if (currentSeq !== loadSeq) return;
      items.value = nextItems;
      loaded.value = true;
      ensureAvailableSelection();
      if (ui.locale !== locale) void load(ui.locale);
    } catch (error) {
      if (currentSeq === loadSeq) toast.error(errorMessage(error, t("aiImage.caseLoadFailed")));
    } finally {
      if (currentSeq === loadSeq) loading.value = false;
    }
  }

  function selectCase(item: PromptCase) {
    const result = promptCaseApplyResult(item, filterMode.value, supportedModes.value);
    selectedId.value = item.id;
    caseContextId.value = item.id;
    finalPrompt.value = result.prompt;
    finalPromptSource.value = "case";
    selectedMode.value = result.mode;
    return result;
  }

  function applyCasePrompt(item: PromptCase) {
    const result = selectCase(item);
    toast.success(t("aiImage.promptFilled"));
    return result;
  }

  function clearPrompt() {
    finalPrompt.value = "";
    finalPromptSource.value = null;
  }

  function setPrompt(value: string, source: Exclude<AiImagePromptSource, null>) {
    finalPrompt.value = value;
    finalPromptSource.value = source;
  }

  function ensureAvailableSelection() {
    const available = availableItems.value;
    if (!available.length) {
      selectedId.value = null;
      caseContextId.value = null;
      if (finalPromptSource.value === "case") clearPrompt();
      selectedMode.value = supportedModes.value[0] ?? "text2image";
      return;
    }
    const contextAvailable = caseContextId.value
      ? available.some((item) => item.id === caseContextId.value)
      : false;
    if (!contextAvailable) {
      caseContextId.value = null;
      if (finalPromptSource.value === "case") clearPrompt();
    }
    const selectedAvailable = selectedId.value
      ? available.some((item) => item.id === selectedId.value)
      : false;
    if (!selectedAvailable) {
      previewCase(available[0]);
      return;
    }

    const current = available.find((item) => item.id === selectedId.value);
    if (current && !supportedModes.value.includes(selectedMode.value)) {
      const result = promptCaseApplyResult(current, filterMode.value, supportedModes.value);
      selectedMode.value = result.mode;
      if (finalPromptSource.value === "case") finalPrompt.value = result.prompt;
    }
  }

  function previewCase(item: PromptCase, options: { userSelected?: boolean } = {}) {
    const result = promptCaseApplyResult(item, filterMode.value, supportedModes.value);
    selectedId.value = item.id;
    selectedMode.value = result.mode;
    if (options.userSelected) caseContextId.value = item.id;
    if (finalPromptSource.value === "case") clearPrompt();
  }

  return {
    availableItems,
    caseContext,
    caseContextId,
    categories,
    category,
    filteredItems,
    finalPrompt,
    finalPromptSource,
    filterMode,
    items,
    loading,
    search,
    selected,
    selectedId,
    selectedMode,
    size,
    sizes,
    applyCasePrompt,
    clearPrompt,
    load,
    previewCase,
    selectCase,
    setPrompt
  };
}

function errorMessage(error: unknown, fallback: string) {
  const maybeApiError = error as Partial<ApiError>;
  return maybeApiError.error?.message || fallback;
}
