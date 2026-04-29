<script setup lang="ts">
/**
 * sysadmin 普通用户视角预览。
 *
 * 这里故意只展示会出现在用户端案例详情里的字段，帮助管理员在发布前检查归因和回填文案。
 */
import { Copy, ExternalLink, ImageOff } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { PromptCase } from "@/types/promptCases";

defineProps<{
  item: PromptCase | null;
}>();

const emit = defineEmits<{
  copyPrompt: [item: PromptCase];
}>();

const { t } = useI18n();
</script>

<template>
  <aside class="panel flex min-h-[30rem] flex-col overflow-hidden">
    <div class="border-b border-border p-4">
      <h2 class="font-semibold">{{ t("promptCases.userPreview") }}</h2>
      <p class="mt-1 text-xs text-muted-foreground">{{ t("promptCases.userPreviewHint") }}</p>
    </div>

    <div
      v-if="!item"
      class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
    >
      {{ t("promptCases.selectCase") }}
    </div>

    <div v-else class="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
      <div class="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
        <img
          v-if="item.thumbnailUrl"
          class="h-full w-full object-contain"
          :src="item.thumbnailUrl"
          :alt="item.title"
        />
        <div v-else class="flex h-full items-center justify-center text-muted-foreground">
          <ImageOff class="h-8 w-8" />
        </div>
      </div>

      <div>
        <div class="mb-2 flex flex-wrap gap-2">
          <span class="rounded-full bg-primary/15 px-2 py-1 text-xs text-primary">
            {{ item.category }}
          </span>
          <span class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            {{ item.recommendedSize }}
          </span>
          <span
            v-for="mode in item.modes"
            :key="mode"
            class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
          >
            {{ t(`workspace.${mode}`) }}
          </span>
        </div>
        <h3 class="text-lg font-semibold leading-snug">{{ item.title }}</h3>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ item.promptSummary }}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        <span
          v-for="tag in item.tags"
          :key="tag"
          class="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <div class="rounded-lg border border-border bg-muted/30 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-muted-foreground">
            {{ t("promptCases.promptTemplate") }}
          </span>
          <button
            class="ui-button ui-button-secondary h-8 text-xs"
            type="button"
            @click="emit('copyPrompt', item)"
          >
            <Copy class="h-3.5 w-3.5" />
            {{ t("promptCases.copyPrompt") }}
          </button>
        </div>
        <pre class="whitespace-pre-wrap break-words text-xs leading-5">{{
          item.promptTemplate
        }}</pre>
      </div>

      <div class="space-y-1 text-xs text-muted-foreground">
        <p>
          {{ t("promptCases.sourceLicense") }}:
          <span class="font-medium text-foreground">{{ item.sourceLicense }}</span>
        </p>
        <p v-if="item.sourceAuthor">
          {{ t("promptCases.sourceAuthor") }}:
          <span class="font-medium text-foreground">{{ item.sourceAuthor }}</span>
        </p>
        <a
          v-if="item.sourceUrl"
          class="inline-flex items-center gap-1 text-primary"
          :href="item.sourceUrl"
          target="_blank"
          rel="noreferrer"
        >
          {{ t("promptCases.sourceUrl") }}
          <ExternalLink class="h-3 w-3" />
        </a>
      </div>
    </div>
  </aside>
</template>
