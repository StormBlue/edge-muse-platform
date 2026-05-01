<script setup lang="ts">
/**
 * 用户端案例卡片列表。
 *
 * 这里不暴露 draft/hidden 状态，数据源已由后端限制为 published。
 */
import { Star } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import type { PromptCase } from "@/types/promptCases";

defineProps<{
  items: PromptCase[];
  loading: boolean;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [item: PromptCase];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="prompt-case-gallery panel flex min-h-[18rem] flex-col overflow-hidden">
    <div class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">{{ t("aiImage.caseGallery") }}</h2>
    </div>
    <div
      v-if="loading"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t("common.loading") }}
    </div>
    <div
      v-else-if="!items.length"
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t("aiImage.noCases") }}
    </div>
    <div
      v-else
      class="prompt-case-grid thin-scrollbar grid min-h-0 flex-1 gap-3 overflow-y-auto p-3"
    >
      <button
        v-for="item in items"
        :key="item.id"
        class="prompt-case-card group overflow-hidden rounded-lg border border-border bg-card p-0 text-left transition hover:border-primary/60"
        :class="item.id === selectedId ? 'border-primary bg-primary/5' : ''"
        type="button"
        @click="emit('select', item)"
      >
        <div class="relative aspect-[4/3] overflow-hidden border-b border-border bg-muted">
          <PromptCaseThumbnail :src="item.thumbnailUrl" :alt="item.title" icon-class="h-6 w-6" />
          <span
            v-if="item.featured"
            class="absolute left-0 top-0 z-10 inline-flex items-center gap-1 rounded-br-md bg-background/90 px-2 py-1 text-xs shadow-sm"
          >
            <Star class="h-3 w-3 text-primary" />
            {{ t("promptCases.featured") }}
          </span>
        </div>
        <div class="flex min-w-0 flex-col overflow-hidden p-3">
          <p class="truncate text-sm font-semibold">{{ item.title }}</p>
          <p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {{ item.promptSummary }}
          </p>
          <div class="mt-2 flex max-h-6 flex-wrap gap-1 overflow-hidden">
            <span
              v-for="tag in item.tags.slice(0, 2)"
              :key="tag"
              class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {{ tag }}
            </span>
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {{ item.recommendedSize }}
            </span>
          </div>
          <p class="mt-auto truncate pt-1 text-xs text-muted-foreground">
            {{ item.sourceAuthor || item.sourceRepo || item.sourceLicense }}
          </p>
        </div>
      </button>
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
  grid-template-columns: minmax(0, 1fr);
}

.prompt-case-card {
  box-shadow: 0 10px 24px color-mix(in oklch, var(--foreground), transparent 94%);
}

.prompt-case-card:hover {
  background: color-mix(in oklch, var(--primary), transparent 94%);
  transform: translateY(-1px);
}

@container (min-width: 36rem) {
  .prompt-case-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 58rem) {
  .prompt-case-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
