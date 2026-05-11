<script setup lang="ts">
import type { PromptCase, PromptCaseListItem } from "@/types/promptCases";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import PromptCaseGallery from "./PromptCaseGallery.vue";

defineProps<{
  applying: boolean;
  detailError: string | null;
  detailItem: PromptCase | null;
  detailLoading: boolean;
  filteredItems: PromptCaseListItem[];
  hasMore: boolean;
  loadMoreError: string | null;
  loadingInitial: boolean;
  loadingMore: boolean;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  apply: [item: PromptCase];
  loadMore: [];
  select: [item: PromptCaseListItem];
}>();
</script>

<template>
  <PromptCaseGallery
    :items="filteredItems"
    :error="loadMoreError"
    :has-more="hasMore"
    :loading-initial="loadingInitial"
    :loading-more="loadingMore"
    :selected-id="selectedId"
    @load-more="emit('loadMore')"
    @select="emit('select', $event)"
  />
  <div class="desktop-case-detail">
    <PromptCaseDetail
      :applying="applying"
      :error="detailError"
      :item="detailItem"
      :loading="detailLoading"
      @apply="emit('apply', $event)"
    />
  </div>
</template>
<style scoped>
.desktop-case-detail {
  display: none;
}

@container (min-width: 64rem) {
  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }

  .desktop-case-detail :deep(.panel) {
    height: 100%;
    min-height: 0;
  }
}

@media (min-width: 1024px) {
  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }
}
</style>
