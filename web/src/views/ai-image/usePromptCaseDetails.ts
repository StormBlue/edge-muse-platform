import { computed, ref, type Ref } from "vue";
import { getPublishedPromptCase } from "@/api/promptCases";
import { errorMessage, isFullPromptCase, omitKey } from "./aiImageCasesHelpers";
import type { PromptCase, PromptCaseListItem } from "@/types/promptCases";

type UsePromptCaseDetailsOptions = {
  detailErrorFallback: () => string;
  locale: Ref<string>;
};

export function usePromptCaseDetails(options: UsePromptCaseDetailsOptions) {
  const detailsById = ref<Record<string, PromptCase>>({});
  const detailLoadingById = ref<Record<string, boolean>>({});
  const detailErrorById = ref<Record<string, string>>({});
  const detailPromises = new Map<string, Promise<PromptCase>>();

  function selectedDetail(selectedId: Ref<string | null>) {
    return computed(() =>
      selectedId.value ? (detailsById.value[selectedId.value] ?? null) : null
    );
  }

  function contextDetail(caseContextId: Ref<string | null>) {
    return computed(() =>
      caseContextId.value ? (detailsById.value[caseContextId.value] ?? null) : null
    );
  }

  function detailLoading(selectedId: Ref<string | null>) {
    return computed(() =>
      selectedId.value ? Boolean(detailLoadingById.value[selectedId.value]) : false
    );
  }

  function detailError(selectedId: Ref<string | null>) {
    return computed(() =>
      selectedId.value ? (detailErrorById.value[selectedId.value] ?? null) : null
    );
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
    const promise = getPublishedPromptCase(id, { locale: options.locale.value })
      .then((detail) => {
        cacheDetail(detail);
        detailErrorById.value = omitKey(detailErrorById.value, id);
        return detail;
      })
      .catch((error) => {
        detailErrorById.value = {
          ...detailErrorById.value,
          [id]: errorMessage(error, options.detailErrorFallback())
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
    detailErrorById,
    detailLoadingById,
    detailsById,
    cacheDetail,
    contextDetail,
    detailError,
    detailLoading,
    ensureCaseDetail,
    selectedDetail
  };
}
