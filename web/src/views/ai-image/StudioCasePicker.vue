<script setup lang="ts">
import { ArrowLeft, ArrowUpRight, Loader2, Search } from "@lucide/vue";
import { nextTick, ref, watch } from "vue";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import { useImageStudioContext } from "./studioContext";
const s = useImageStudioContext();
const showDetail = ref(false);
let trigger: HTMLElement | null = null;
watch(
  () => s.casePickerOpen.value,
  (open) => {
    showDetail.value = false;
    if (open && document.activeElement instanceof HTMLElement) trigger = document.activeElement;
  }
);
async function selectCase(item: Parameters<typeof s.cases.previewCase>[0]) {
  s.cases.previewCase(item, { userSelected: true });
  showDetail.value = true;
  await nextTick();
  if (window.matchMedia("(max-width: 700px)").matches)
    document.querySelector<HTMLButtonElement>(".studio-case-back")?.focus();
}
async function backToCases() {
  showDetail.value = false;
  await nextTick();
  document.querySelector<HTMLButtonElement>('.studio-case-card[aria-pressed="true"]')?.focus();
}
function restoreFocus(event: Event) {
  if (!trigger?.isConnected) return;
  event.preventDefault();
  trigger.focus();
}
async function apply() {
  const detail = s.cases.selectedDetail.value;
  if (!detail) return;
  try {
    await s.applyCase(detail);
  } catch {
    /* 案例控制器已经展示错误，保留当前选择供用户重试。 */
  }
}
</script>
<template>
  <Dialog :open="s.casePickerOpen.value" @update:open="s.casePickerOpen.value = $event">
    <DialogContent
      class="studio-case-dialog"
      :aria-describedby="undefined"
      @close-auto-focus="restoreFocus"
    >
      <div class="studio-case-heading">
        <DialogTitle>{{ s.t("studio.cases") }}</DialogTitle>
      </div>
      <div class="studio-case-filters">
        <label class="studio-case-search"><Search class="size-4" /><input
          v-model="s.cases.search.value"
          :placeholder="s.t('studio.caseSearch')"
          :aria-label="s.t('studio.caseSearch')"
        /></label>
        <select v-model="s.cases.category.value" :aria-label="s.t('studio.allCategories')">
          <option value="">{{ s.t("studio.allCategories") }}</option>
          <option v-for="category in s.cases.categories.value" :key="category" :value="category">
            {{ category }}
          </option>
        </select>
      </div>
      <div class="studio-case-body" :class="{ 'studio-case-body--detail': showDetail }">
        <div class="studio-case-list thin-scrollbar">
          <p v-if="s.cases.loadingInitial.value" class="studio-case-empty" role="status">
            {{ s.t("studio.caseLoading") }}
          </p>
          <div v-else-if="!s.cases.filteredItems.value.length" class="studio-case-empty">
            <p>{{ s.t("studio.noCases") }}</p>
            <Button variant="secondary" @click="s.cases.load()">
              {{ s.t("studio.retryLoad") }}
            </Button>
          </div>
          <div v-else class="studio-case-grid">
            <button
              v-for="item in s.cases.filteredItems.value"
              :key="item.id"
              type="button"
              class="studio-case-card"
              :aria-pressed="s.cases.selectedId.value === item.id"
              @click="selectCase(item)"
            >
              <div class="studio-case-thumbnail">
                <PromptCaseThumbnail :src="item.thumbnailUrl" :alt="item.title" />
              </div>
              <span class="studio-case-title">{{ item.title }}</span><span class="studio-case-category">{{ item.category }} · {{ item.recommendedSize }}</span>
            </button>
          </div>
          <div v-if="s.cases.hasMore.value || s.cases.loadMoreError.value" class="p-3">
            <p v-if="s.cases.loadMoreError.value" role="alert" class="text-xs text-destructive">
              {{ s.cases.loadMoreError.value }}
            </p>
            <Button
              variant="secondary"
              class="w-full"
              :disabled="s.cases.loadingMore.value"
              @click="s.cases.loadMore"
            >
              {{ s.t(s.cases.loadingMore.value ? "common.loading" : "aiImage.loadMoreCases") }}
            </Button>
          </div>
        </div>
        <div class="studio-case-detail thin-scrollbar">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="studio-case-back"
            @click="backToCases"
          >
            <ArrowLeft class="size-4" />{{ s.t("studio.cases") }}
          </Button>
          <div v-if="s.cases.detailLoading.value" class="studio-case-empty">
            <Loader2 class="size-5 animate-spin" />
          </div>
          <p
            v-else-if="s.cases.detailError.value"
            role="alert"
            class="p-4 text-xs text-destructive"
          >
            {{ s.cases.detailError.value }}
          </p>
          <template v-else-if="s.cases.selectedDetail.value">
            <h3>{{ s.cases.selectedDetail.value.title }}</h3>
            <div class="studio-case-preview">
              <PromptCaseThumbnail
                :src="s.cases.selectedDetail.value.thumbnailUrl"
                :alt="s.cases.selectedDetail.value.title"
              />
            </div>
            <p class="studio-case-summary">{{ s.cases.selectedDetail.value.promptSummary }}</p>
            <p class="studio-case-source">
              {{ s.cases.selectedDetail.value.sourceAuthor }} ·
              {{ s.cases.selectedDetail.value.sourceLicense }}
            </p>
            <details class="studio-case-prompt">
              <summary>{{ s.t("studio.prompt") }}</summary>
              <p>{{ s.cases.selectedDetail.value.promptTemplate }}</p>
            </details>
            <Button
              type="button"
              class="w-full mt-4"
              :disabled="s.cases.applying.value || s.submitting.value"
              @click="apply"
            >
              <ArrowUpRight class="size-4" />{{ s.t("studio.useCase") }}
            </Button>
          </template>
          <p v-else class="studio-case-empty">{{ s.t("promptCases.selectCase") }}</p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
<style scoped>
/* 弹窗经 Portal 挂载到 body，根节点不继承调用组件的 scoped 属性。 */
:global(.studio-case-dialog) {
  display: flex;
  width: min(72rem, calc(100vw - 2rem));
  max-width: min(72rem, calc(100vw - 2rem));
  height: min(52rem, calc(100dvh - 2rem));
  max-height: calc(100dvh - 2rem);
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0;
  border-radius: 8px;
}
.studio-case-heading {
  padding: 1.25rem 3rem 1rem 1.25rem;
}
.studio-case-filters {
  display: flex;
  gap: 0.75rem;
  padding: 0 1.25rem 1rem;
  border-bottom: 1px solid var(--border);
}
.studio-case-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.studio-case-search input {
  min-width: 0;
  width: 100%;
  background: transparent;
  font-size: 0.8125rem;
  outline: none;
}
.studio-case-filters select {
  min-width: 0;
  max-width: 40%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem;
  background: var(--card);
  font-size: 0.8125rem;
}
.studio-case-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 19rem;
}
.studio-case-list {
  overflow-y: auto;
  min-width: 0;
}
.studio-case-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(10rem, 100%), 1fr));
  align-items: start;
  gap: 1rem;
  padding: 1.25rem;
}
.studio-case-card {
  min-width: 0;
  text-align: left;
  border-radius: 6px;
  padding: 0.25rem;
  border: 1px solid transparent;
}
.studio-case-card[aria-pressed="true"] {
  border-color: var(--accent);
}
.studio-case-thumbnail {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--muted);
  border-radius: 4px;
}
.studio-case-title {
  display: block;
  margin-top: 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.studio-case-category {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.studio-case-detail {
  overflow-y: auto;
  min-width: 0;
  border-left: 1px solid var(--border);
  padding: 1.25rem;
}
.studio-case-detail h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.studio-case-preview {
  aspect-ratio: 1;
  margin-top: 1rem;
  background: var(--muted);
  border-radius: 6px;
  overflow: hidden;
}
.studio-case-summary {
  margin-top: 1rem;
  font-size: 0.8125rem;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.studio-case-source {
  margin-top: 0.75rem;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}
.studio-case-prompt {
  margin-top: 1rem;
  font-size: 0.75rem;
}
.studio-case-prompt summary {
  cursor: pointer;
}
.studio-case-prompt p {
  margin-top: 0.5rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.studio-case-empty {
  min-height: 10rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}
.studio-case-back {
  display: none;
}
@media (max-width: 700px) {
  :global(.studio-case-dialog) {
    width: calc(100vw - 1rem);
    max-width: calc(100vw - 1rem);
    height: calc(100dvh - 1rem);
    max-height: calc(100dvh - 1rem);
  }
  .studio-case-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .studio-case-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 1rem;
  }
  .studio-case-detail {
    display: none;
    border: none;
  }
  .studio-case-body--detail .studio-case-detail {
    display: block;
  }
  .studio-case-body--detail .studio-case-list {
    display: none;
  }
  .studio-case-back {
    display: inline-flex;
    margin-bottom: 1rem;
  }
}
</style>
