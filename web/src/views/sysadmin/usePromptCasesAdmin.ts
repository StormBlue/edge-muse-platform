/**
 * sysadmin 案例管理页控制器。
 *
 * 页面只负责布局；加载、编辑、导入、状态流转都收口在这里，便于后续补单元测试。
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  bulkUpdateSysadminPromptCases,
  createSysadminPromptCase,
  importSysadminPromptCases,
  listSysadminPromptCases,
  updateSysadminPromptCase
} from "@/api/promptCases";
import { parseImportCases } from "./promptCaseImportParser";
import {
  promptCaseToForm,
  type PromptCase,
  type PromptCaseBulkPatchInput,
  type PromptCaseFilters,
  type PromptCaseFormInput,
  type PromptCaseStatus
} from "@/types/promptCases";
import type { ApiError } from "@/api/client";

const defaultFilters = (): PromptCaseFilters => ({
  status: "",
  category: "",
  mode: "",
  locale: "zh-CN",
  source: "",
  featured: "",
  search: ""
});

export function usePromptCasesAdmin() {
  const { t } = useI18n();
  const items = ref<PromptCase[]>([]);
  const filters = ref(defaultFilters());
  const selectedId = ref<string | null>(null);
  const selectedIds = ref(new Set<string>());
  const loading = ref(false);
  const saving = ref(false);
  const editorOpen = ref(false);
  const importOpen = ref(false);
  const importSource = ref("manual");
  const importSourceUrl = ref("");
  const importText = ref("");
  const bulkCategory = ref("");
  const editing = ref<PromptCase | null>(null);

  const selected = computed(
    () => items.value.find((item) => item.id === selectedId.value) ?? items.value[0] ?? null
  );
  const selectedCount = computed(() => selectedIds.value.size);
  const categories = computed(() =>
    Array.from(new Set(items.value.map((item) => item.category))).sort((a, b) => a.localeCompare(b))
  );

  async function load() {
    loading.value = true;
    try {
      const nextItems = await listSysadminPromptCases(filters.value);
      items.value = nextItems;
      // 筛选或刷新后必须同步 selectedId，否则预览会回退首条但表格高亮仍指向旧 id。
      if (!nextItems.length) {
        selectedId.value = null;
      } else if (!selectedId.value || !nextItems.some((item) => item.id === selectedId.value)) {
        selectedId.value = nextItems[0].id;
      }
      syncSelectedIds(nextItems);
    } catch (error) {
      toast.error(errorMessage(error, t("promptCases.loadFailed")));
    } finally {
      loading.value = false;
    }
  }

  function openCreate() {
    editing.value = null;
    editorOpen.value = true;
  }

  function openEdit(item: PromptCase) {
    editing.value = item;
    editorOpen.value = true;
  }

  async function save(input: PromptCaseFormInput) {
    if (saving.value) return;
    saving.value = true;
    try {
      const item = editing.value
        ? await updateSysadminPromptCase(editing.value.id, input)
        : await createSysadminPromptCase(input);
      toast.success(editing.value ? t("promptCases.updated") : t("promptCases.created"));
      editorOpen.value = false;
      editing.value = null;
      selectedId.value = item.id;
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("promptCases.saveFailed")));
    } finally {
      saving.value = false;
    }
  }

  async function patchCase(item: PromptCase, patch: Partial<PromptCaseFormInput>) {
    if (saving.value) return;
    saving.value = true;
    try {
      const updated = await updateSysadminPromptCase(item.id, patch);
      toast.success(t("promptCases.updated"));
      selectedId.value = updated.id;
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("promptCases.saveFailed")));
    } finally {
      saving.value = false;
    }
  }

  function changeStatus(item: PromptCase, status: PromptCaseStatus) {
    return patchCase(item, { status });
  }

  function toggleFeatured(item: PromptCase) {
    return patchCase(item, { featured: !item.featured });
  }

  async function bulkPatch(patch: PromptCaseBulkPatchInput) {
    if (saving.value) return;
    const ids = Array.from(selectedIds.value);
    if (!ids.length) {
      toast.error(t("promptCases.bulkEmpty"));
      return;
    }
    saving.value = true;
    try {
      const result = await bulkUpdateSysadminPromptCases({ ids, patch });
      toast.success(t("promptCases.bulkUpdated", { count: result.items.length }));
      clearSelection();
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("promptCases.saveFailed")));
    } finally {
      saving.value = false;
    }
  }

  function bulkChangeStatus(status: PromptCaseStatus) {
    return bulkPatch({ status });
  }

  function bulkSetFeatured(featured: boolean) {
    return bulkPatch({ featured });
  }

  function bulkSetCategory() {
    const category = bulkCategory.value.trim();
    if (!category) {
      toast.error(t("promptCases.bulkCategoryRequired"));
      return;
    }
    return bulkPatch({ category });
  }

  function clearSelection() {
    selectedIds.value = new Set();
    bulkCategory.value = "";
  }

  function toggleSelected(id: string, checked: boolean) {
    const next = new Set(selectedIds.value);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    selectedIds.value = next;
  }

  function toggleAllVisible(checked: boolean) {
    const next = new Set(selectedIds.value);
    for (const item of items.value) {
      if (checked) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
    }
    selectedIds.value = next;
  }

  function syncSelectedIds(nextItems: PromptCase[]) {
    const availableIds = new Set(nextItems.map((item) => item.id));
    selectedIds.value = new Set(Array.from(selectedIds.value).filter((id) => availableIds.has(id)));
  }

  function openImport() {
    importSource.value = "manual";
    importSourceUrl.value = "";
    importText.value = "";
    importOpen.value = true;
  }

  async function submitImport() {
    if (saving.value) return;
    const cases = parseImportCases(importText.value);
    if (!cases.length) {
      toast.error(t("promptCases.importEmpty"));
      return;
    }
    saving.value = true;
    try {
      const result = await importSysadminPromptCases({
        source: importSource.value.trim() || "manual",
        sourceUrl: importSourceUrl.value.trim() || null,
        cases
      });
      toast.success(
        t("promptCases.imported", {
          count: result.imported.length,
          failed: result.errors.length
        })
      );
      importOpen.value = false;
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("promptCases.importFailed")));
    } finally {
      saving.value = false;
    }
  }

  function copyPrompt(item: PromptCase) {
    void navigator.clipboard.writeText(item.promptTemplate);
    toast.success(t("promptCases.promptCopied"));
  }

  function resetFilters() {
    filters.value = defaultFilters();
    clearSelection();
    void load();
  }

  return {
    bulkCategory,
    bulkChangeStatus,
    bulkSetCategory,
    bulkSetFeatured,
    categories,
    clearSelection,
    editorOpen,
    editing,
    filters,
    importOpen,
    importSource,
    importSourceUrl,
    importText,
    items,
    loading,
    saving,
    selected,
    selectedCount,
    selectedId,
    selectedIds,
    changeStatus,
    copyPrompt,
    load,
    openCreate,
    openEdit,
    openImport,
    promptCaseToForm,
    resetFilters,
    save,
    submitImport,
    toggleAllVisible,
    toggleFeatured,
    toggleSelected
  };
}

function errorMessage(error: unknown, fallback: string) {
  const maybeApiError = error as Partial<ApiError>;
  return maybeApiError.error?.message || fallback;
}
