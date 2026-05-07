<script setup lang="ts">
/**
 * 用户端案例卡片列表。
 *
 * 这里不暴露 draft/hidden 状态，数据源已由后端限制为 published。
 */
import { Star } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import type { PromptCaseListItem } from "@/types/promptCases";

defineProps<{
  items: PromptCaseListItem[];
  loadingInitial: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  loadMore: [];
  select: [item: PromptCaseListItem];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="prompt-case-gallery panel flex min-h-[18rem] flex-col overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">{{ t("aiImage.caseGallery") }}</h2>
    </div>
    <div
      v-if="loadingInitial"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      aria-live="polite"
    >
      {{ t("common.loading") }}
    </div>
    <div
      v-else-if="!items.length"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t("aiImage.noCases") }}
    </div>
    <div v-else class="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div class="prompt-case-grid grid gap-3 p-3">
        <article
          v-for="item in items"
          :key="item.id"
          class="prompt-case-card group overflow-hidden rounded-lg border border-border bg-card p-0 text-left transition hover:border-primary/60"
          :class="item.id === selectedId ? 'border-primary bg-primary/5' : ''"
          role="button"
          tabindex="0"
          :aria-pressed="item.id === selectedId"
          @click="emit('select', item)"
          @keydown.enter.prevent="emit('select', item)"
          @keydown.space.prevent="emit('select', item)"
        >
          <div class="prompt-case-poster relative aspect-[2/3] overflow-hidden bg-muted">
            <PromptCaseThumbnail
              :src="item.thumbnailUrl"
              :alt="item.title"
              icon-class="h-8 w-8"
              fit="cover"
            />
            <span
              v-if="item.featured"
              class="absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-br-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm"
            >
              <Star class="h-3 w-3 text-primary" />
              {{ t("promptCases.featured") }}
            </span>
            <span
              class="absolute right-2 top-2 z-10 rounded-full bg-background/85 px-2 py-1 text-xs font-medium shadow-sm"
            >
              {{ item.recommendedSize }}
            </span>
            <div
              class="absolute inset-x-0 bottom-0 z-10 flex min-w-0 flex-col overflow-hidden p-3 text-white"
            >
              <p class="line-clamp-2 text-sm font-semibold leading-5">{{ item.title }}</p>
              <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/80">
                {{ item.promptSummary }}
              </p>
              <div class="mt-2 flex max-h-6 flex-wrap gap-1 overflow-hidden">
                <span
                  v-for="tag in item.tags.slice(0, 2)"
                  :key="tag"
                  class="rounded-full bg-background/85 px-2 py-0.5 text-xs text-foreground shadow-sm"
                >
                  {{ tag }}
                </span>
              </div>
              <p class="mt-auto truncate pt-2 text-xs text-white/70">
                {{ item.sourceAuthor || item.sourceRepo || item.sourceLicense }}
              </p>
            </div>
          </div>
        </article>
      </div>
      <div class="border-t border-border p-3" aria-live="polite">
        <p v-if="error" class="mb-2 text-xs leading-5 text-destructive">{{ error }}</p>
        <button
          v-if="hasMore || error"
          class="ui-button ui-button-secondary h-10 w-full text-sm"
          type="button"
          :disabled="loadingMore"
          @click="emit('loadMore')"
        >
          {{ loadingMore ? t("common.loading") : t("aiImage.loadMoreCases") }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prompt-case-gallery {
  container-type: inline-size;
  max-height: min(34rem, calc(100dvh - 12rem));
}

.prompt-case-grid {
  align-content: start;
  grid-template-columns: repeat(auto-fill, minmax(min(10.5rem, 100%), 1fr));
}

.prompt-case-card {
  display: block;
  align-self: start;
  width: 100%;
  height: max-content;
  cursor: pointer;
  box-shadow: 0 10px 24px color-mix(in oklch, var(--foreground), transparent 94%);
}

.prompt-case-card > * {
  pointer-events: none;
}

.prompt-case-poster::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgb(0 0 0 / 0.06) 0%,
    rgb(0 0 0 / 0.08) 42%,
    rgb(0 0 0 / 0.76) 100%
  );
}

.prompt-case-card:hover :deep(img) {
  transform: scale(1.03);
}

.prompt-case-card:hover {
  background: color-mix(in oklch, var(--primary), transparent 94%);
  transform: translateY(-1px);
}

@container (min-width: 36rem) {
  .prompt-case-grid {
    grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  }
}

@container (min-width: 58rem) {
  .prompt-case-grid {
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  }
}
</style>
