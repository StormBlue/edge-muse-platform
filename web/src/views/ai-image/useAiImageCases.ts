/**
 * AI 图像生成页的案例浏览控制器。
 *
 * 只读取 published 案例；选中案例后回填 prompt，但不自动提交生成，避免误消耗配额。
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { listPublishedPromptCases } from "@/api/promptCases";
import {
  filterPromptCases,
  promptCaseApplyResult,
  promptCaseCategories,
  promptCaseSizes
} from "./promptCaseSelection";
import type { PromptCase, PromptCaseMode } from "@/types/promptCases";
import type { ApiError } from "@/api/client";

export function useAiImageCases() {
  const { t } = useI18n();
  const items = ref<PromptCase[]>([]);
  const selectedId = ref<string | null>(null);
  const category = ref("");
  const mode = ref<"" | PromptCaseMode>("");
  const size = ref("");
  const search = ref("");
  const finalPrompt = ref("");
  const loading = ref(false);

  const selected = computed(
    () => items.value.find((item) => item.id === selectedId.value) ?? items.value[0] ?? null
  );
  const categories = computed(() => promptCaseCategories(items.value));
  const sizes = computed(() => promptCaseSizes(items.value));
  const filteredItems = computed(() =>
    filterPromptCases(items.value, {
      category: category.value,
      mode: mode.value,
      size: size.value,
      search: search.value
    })
  );

  async function load() {
    loading.value = true;
    try {
      items.value = await listPublishedPromptCases({ locale: "zh-CN" });
      if (!selectedId.value && items.value[0]) selectCase(items.value[0]);
    } catch (error) {
      toast.error(errorMessage(error, t("aiImage.caseLoadFailed")));
    } finally {
      loading.value = false;
    }
  }

  function selectCase(item: PromptCase) {
    const result = promptCaseApplyResult(item, mode.value);
    selectedId.value = item.id;
    finalPrompt.value = result.prompt;
    mode.value = result.mode;
  }

  function applyCasePrompt(item: PromptCase) {
    selectCase(item);
    toast.success(t("aiImage.promptFilled"));
  }

  function clearPrompt() {
    finalPrompt.value = "";
  }

  return {
    categories,
    category,
    filteredItems,
    finalPrompt,
    items,
    loading,
    mode,
    search,
    selected,
    selectedId,
    size,
    sizes,
    applyCasePrompt,
    clearPrompt,
    load,
    selectCase
  };
}

function errorMessage(error: unknown, fallback: string) {
  const maybeApiError = error as Partial<ApiError>;
  return maybeApiError.error?.message || fallback;
}
