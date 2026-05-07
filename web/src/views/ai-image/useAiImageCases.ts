/**
 * AI 图像生成页的案例浏览控制器。
 *
 * 案例列表只加载轻量卡片数据；完整 prompt 模板在用户查看详情或应用案例时按需获取。
 */
import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { getPublishedPromptCase, listPublishedPromptCasePage } from "@/api/promptCases";
import { useUiStore } from "@/stores/ui";
import {
  filterPromptCases,
  promptCaseApplyResult,
  promptCaseModeResult,
  sortPromptCaseCategories
} from "./promptCaseSelection";
import {
  PROMPT_CASE_MODES,
  type PromptCase,
  type PromptCaseFacets,
  type PromptCaseListItem,
  type PromptCaseMode,
  type PromptCasePageInfo
} from "@/types/promptCases";
import type { ApiError } from "@/api/client";

export type AiImagePromptSource = "case" | "assistant" | "user" | null;

export type UseAiImageCasesOptions = {
  supportedModes?: Ref<PromptCaseMode[]> | ComputedRef<PromptCaseMode[]>;
};

const CASE_PAGE_LIMIT = 60;
const EMPTY_PAGE_INFO: PromptCasePageInfo = {
  nextCursor: null,
  hasMore: false,
  limit: CASE_PAGE_LIMIT
};
const EMPTY_FACETS: PromptCaseFacets = {
  categories: [],
  sizes: [],
  modes: []
};

export function useAiImageCases(options: UseAiImageCasesOptions = {}) {
  const { t } = useI18n();
  const ui = useUiStore();
  const items = ref<PromptCaseListItem[]>([]);
  const pageInfo = ref<PromptCasePageInfo>({ ...EMPTY_PAGE_INFO });
  const facets = ref<PromptCaseFacets>({ ...EMPTY_FACETS });
  const detailsById = ref<Record<string, PromptCase>>({});
  const detailLoadingById = ref<Record<string, boolean>>({});
  const detailErrorById = ref<Record<string, string>>({});
  const selectedId = ref<string | null>(null);
  const category = ref("");
  const filterMode = ref<"" | PromptCaseMode>("");
  const selectedMode = ref<PromptCaseMode>("image2image");
  const size = ref("");
  const search = ref("");
  const finalPrompt = ref("");
  const finalPromptSource = ref<AiImagePromptSource>(null);
  const resettablePrompt = ref("");
  const resettablePromptSource = ref<Exclude<AiImagePromptSource, "user"> | null>(null);
  const caseContextId = ref<string | null>(null);
  const loadingInitial = ref(false);
  const loadingMore = ref(false);
  const loaded = ref(false);
  const loadMoreError = ref<string | null>(null);
  const applyingCaseId = ref<string | null>(null);
  const detailPromises = new Map<string, Promise<PromptCase>>();
  let loadSeq = 0;
  let filterReloadTimer: ReturnType<typeof setTimeout> | null = null;

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
  const filteredItems = computed(() =>
    filterPromptCases(items.value, {
      category: category.value,
      mode: filterMode.value,
      size: size.value,
      search: search.value,
      supportedModes: supportedModes.value
    })
  );
  const selectedListItem = computed(() =>
    selectedId.value ? filteredItems.value.find((item) => item.id === selectedId.value) : null
  );
  const selected = computed(() => {
    const listItem = selectedListItem.value;
    if (listItem) return detailsById.value[listItem.id] ?? listItem;
    return filteredItems.value[0] ?? null;
  });
  const selectedDetail = computed(() =>
    selectedId.value ? (detailsById.value[selectedId.value] ?? null) : null
  );
  const caseContext = computed(() => {
    if (!caseContextId.value) return null;
    return (
      detailsById.value[caseContextId.value] ??
      availableItems.value.find((item) => item.id === caseContextId.value) ??
      items.value.find((item) => item.id === caseContextId.value) ??
      null
    );
  });
  const caseContextDetail = computed(() =>
    caseContextId.value ? (detailsById.value[caseContextId.value] ?? null) : null
  );
  const categories = computed(() =>
    supportedModes.value.length
      ? sortPromptCaseCategories(facets.value.categories.map((item) => item.value))
      : []
  );
  const sizes = computed(() =>
    supportedModes.value.length ? facets.value.sizes.map((item) => item.value).sort() : []
  );
  const canResetPrompt = computed(
    () => Boolean(resettablePromptSource.value) && finalPrompt.value !== resettablePrompt.value
  );
  const loading = computed(() => loadingInitial.value);
  const hasMore = computed(() => pageInfo.value.hasMore);
  const detailLoading = computed(() =>
    selectedId.value ? Boolean(detailLoadingById.value[selectedId.value]) : false
  );
  const detailError = computed(() =>
    selectedId.value ? (detailErrorById.value[selectedId.value] ?? null) : null
  );
  const applying = computed(() =>
    selectedId.value ? applyingCaseId.value === selectedId.value : Boolean(applyingCaseId.value)
  );

  watch(
    supportedModes,
    (nextModes) => {
      if (filterMode.value && !nextModes.includes(filterMode.value)) filterMode.value = "";
      if (!nextModes.includes(selectedMode.value)) {
        selectedMode.value = nextModes[0] ?? "image2image";
      }
      ensureAvailableSelection();
      if (loaded.value) scheduleReload();
    },
    { deep: true }
  );

  watch(
    () => [ui.locale, category.value, filterMode.value, size.value, search.value],
    () => {
      if (!loaded.value) return;
      scheduleReload(search.value.trim() ? 250 : 0);
    }
  );

  onScopeDispose(() => clearFilterReloadTimer());

  async function load(locale = ui.locale) {
    clearFilterReloadTimer();
    if (!supportedModes.value.length) {
      loadSeq += 1;
      items.value = [];
      pageInfo.value = { ...EMPTY_PAGE_INFO };
      facets.value = { ...EMPTY_FACETS };
      loaded.value = true;
      ensureAvailableSelection();
      return;
    }
    const currentSeq = ++loadSeq;
    loadingInitial.value = true;
    loadMoreError.value = null;
    try {
      const page = await listPublishedPromptCasePage({
        ...currentListParams(locale),
        cursor: null
      });
      if (currentSeq !== loadSeq) return;
      items.value = page.items;
      pageInfo.value = page.pageInfo;
      facets.value = page.facets;
      loaded.value = true;
      ensureAvailableSelection();
      if (ui.locale !== locale) void load(ui.locale);
    } catch (error) {
      if (currentSeq === loadSeq) toast.error(errorMessage(error, t("aiImage.caseLoadFailed")));
    } finally {
      if (currentSeq === loadSeq) loadingInitial.value = false;
    }
  }

  async function loadMore() {
    if (loadingInitial.value || loadingMore.value || !pageInfo.value.nextCursor) return;
    const currentSeq = loadSeq;
    loadingMore.value = true;
    loadMoreError.value = null;
    try {
      const page = await listPublishedPromptCasePage({
        ...currentListParams(ui.locale),
        cursor: pageInfo.value.nextCursor
      });
      if (currentSeq !== loadSeq) return;
      const seen = new Set(items.value.map((item) => item.id));
      items.value = [...items.value, ...page.items.filter((item) => !seen.has(item.id))];
      pageInfo.value = page.pageInfo;
      facets.value = page.facets;
      ensureAvailableSelection();
    } catch (error) {
      if (currentSeq !== loadSeq) return;
      loadMoreError.value = errorMessage(error, t("aiImage.caseLoadFailed"));
      toast.error(loadMoreError.value);
    } finally {
      if (currentSeq === loadSeq) loadingMore.value = false;
    }
  }

  async function loadSelectedDetail() {
    if (!selectedId.value) return null;
    try {
      return await ensureCaseDetail(selectedId.value);
    } catch (error) {
      toast.error(errorMessage(error, t("aiImage.caseDetailLoadFailed")));
      return null;
    }
  }

  function selectCase(item: PromptCase) {
    cacheDetail(item);
    const result = promptCaseApplyResult(item, filterMode.value, supportedModes.value);
    selectedId.value = item.id;
    caseContextId.value = item.id;
    setResettablePrompt(result.prompt, "case");
    selectedMode.value = result.mode;
    return result;
  }

  async function applyCasePrompt(
    item: PromptCaseListItem | PromptCase | string,
    options: { toastSuccess?: boolean } = {}
  ) {
    const id = typeof item === "string" ? item : item.id;
    applyingCaseId.value = id;
    try {
      const detail = await ensureCaseDetail(item);
      const result = selectCase(detail);
      if (options.toastSuccess !== false) toast.success(t("aiImage.promptFilled"));
      return result;
    } catch (error) {
      toast.error(errorMessage(error, t("aiImage.caseDetailLoadFailed")));
      throw error;
    } finally {
      if (applyingCaseId.value === id) applyingCaseId.value = null;
    }
  }

  function startBlankCase() {
    caseContextId.value = null;
    clearPrompt({ discardResetTarget: true });
  }

  function setPrompt(value: string, source: Exclude<AiImagePromptSource, null>) {
    finalPrompt.value = value;
    finalPromptSource.value = source;
    if (source === "case" || source === "assistant") {
      resettablePrompt.value = value;
      resettablePromptSource.value = source;
    }
  }

  function resetPrompt() {
    if (!resettablePromptSource.value) return;
    finalPrompt.value = resettablePrompt.value;
    finalPromptSource.value = resettablePromptSource.value;
  }

  function ensureAvailableSelection() {
    const available = availableItems.value;
    const visible = filteredItems.value;
    if (!available.length) {
      selectedId.value = null;
      caseContextId.value = null;
      if (finalPromptSource.value === "case") clearPrompt({ discardResetTarget: true });
      if (resettablePromptSource.value === "case") discardResetTarget();
      selectedMode.value = supportedModes.value[0] ?? "image2image";
      return;
    }
    if (!visible.length) {
      selectedId.value = null;
      selectedMode.value = supportedModes.value[0] ?? "image2image";
      return;
    }
    const contextAvailable = caseContextId.value
      ? available.some((item) => item.id === caseContextId.value) ||
        Boolean(detailsById.value[caseContextId.value])
      : false;
    if (!contextAvailable) {
      caseContextId.value = null;
      if (finalPromptSource.value === "case") clearPrompt({ discardResetTarget: true });
      if (resettablePromptSource.value === "case") discardResetTarget();
    }
    const selectedAvailable = selectedId.value
      ? visible.some((item) => item.id === selectedId.value)
      : false;
    if (!selectedAvailable) {
      previewCase(visible[0]);
      return;
    }

    const current = visible.find((item) => item.id === selectedId.value);
    if (current && !supportedModes.value.includes(selectedMode.value)) {
      selectedMode.value = promptCaseModeResult(current, filterMode.value, supportedModes.value);
      if (finalPromptSource.value === "case" && caseContext.value) {
        const result = promptCaseApplyResult(
          caseContext.value,
          filterMode.value,
          supportedModes.value
        );
        setResettablePrompt(result.prompt, "case");
      }
    }
  }

  function previewCase(
    item: PromptCaseListItem | PromptCase,
    options: { userSelected?: boolean } = {}
  ) {
    if (isFullPromptCase(item)) cacheDetail(item);
    selectedId.value = item.id;
    selectedMode.value = promptCaseModeResult(item, filterMode.value, supportedModes.value);
    if (options.userSelected) caseContextId.value = item.id;
    if (finalPromptSource.value === "case") clearPrompt({ discardResetTarget: true });
    void ensureCaseDetail(item).catch(() => {
      // 详情面板会展示错误状态；预览时不额外弹 toast。
    });
  }

  function setResettablePrompt(value: string, source: Exclude<AiImagePromptSource, "user" | null>) {
    finalPrompt.value = value;
    finalPromptSource.value = source;
    resettablePrompt.value = value;
    resettablePromptSource.value = source;
  }

  function clearPrompt(options: { discardResetTarget?: boolean } = {}) {
    finalPrompt.value = "";
    finalPromptSource.value = resettablePromptSource.value ? "user" : null;
    if (options.discardResetTarget) discardResetTarget();
  }

  function discardResetTarget() {
    resettablePrompt.value = "";
    resettablePromptSource.value = null;
    if (!finalPrompt.value.trim()) finalPromptSource.value = null;
  }

  function currentListParams(locale: string) {
    return {
      category: category.value,
      mode: effectiveServerMode(),
      size: size.value,
      locale,
      limit: CASE_PAGE_LIMIT,
      search: search.value
    };
  }

  function effectiveServerMode() {
    if (filterMode.value) return filterMode.value;
    return supportedModes.value.length === 1 ? supportedModes.value[0] : undefined;
  }

  function scheduleReload(delay = 0) {
    clearFilterReloadTimer();
    filterReloadTimer = setTimeout(() => {
      filterReloadTimer = null;
      void load(ui.locale);
    }, delay);
  }

  function clearFilterReloadTimer() {
    if (!filterReloadTimer) return;
    clearTimeout(filterReloadTimer);
    filterReloadTimer = null;
  }

  async function ensureCaseDetail(itemOrId: PromptCaseListItem | PromptCase | string) {
    if (typeof itemOrId !== "string" && isFullPromptCase(itemOrId)) {
      cacheDetail(itemOrId);
      return itemOrId;
    }
    const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
    const cached = detailsById.value[id];
    if (cached) return cached;
    const existingPromise = detailPromises.get(id);
    if (existingPromise) return existingPromise;

    detailLoadingById.value = { ...detailLoadingById.value, [id]: true };
    detailErrorById.value = omitKey(detailErrorById.value, id);
    const promise = getPublishedPromptCase(id, { locale: ui.locale })
      .then((detail) => {
        cacheDetail(detail);
        detailErrorById.value = omitKey(detailErrorById.value, id);
        return detail;
      })
      .catch((error) => {
        detailErrorById.value = {
          ...detailErrorById.value,
          [id]: errorMessage(error, t("aiImage.caseDetailLoadFailed"))
        };
        throw error;
      })
      .finally(() => {
        detailPromises.delete(id);
        detailLoadingById.value = { ...detailLoadingById.value, [id]: false };
      });
    detailPromises.set(id, promise);
    return promise;
  }

  function cacheDetail(item: PromptCase) {
    detailsById.value = { ...detailsById.value, [item.id]: item };
  }

  return {
    availableItems,
    applying,
    canResetPrompt,
    caseContext,
    caseContextDetail,
    caseContextId,
    categories,
    category,
    detailError,
    detailLoading,
    detailsById,
    facets,
    filteredItems,
    finalPrompt,
    finalPromptSource,
    filterMode,
    hasMore,
    items,
    loadMoreError,
    loading,
    loadingInitial,
    loadingMore,
    pageInfo,
    search,
    selected,
    selectedDetail,
    selectedId,
    selectedMode,
    size,
    sizes,
    applyCasePrompt,
    clearPrompt,
    load,
    loadMore,
    loadSelectedDetail,
    previewCase,
    resetPrompt,
    selectCase,
    setPrompt,
    startBlankCase
  };
}

function isFullPromptCase(item: PromptCaseListItem | PromptCase): item is PromptCase {
  return "promptTemplate" in item;
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function errorMessage(error: unknown, fallback: string) {
  const maybeApiError = error as Partial<ApiError>;
  return maybeApiError.error?.message || fallback;
}
