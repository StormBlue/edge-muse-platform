<script setup lang="ts">
/**
 * 案例详情：展示用户决策所需信息，并明确来源归因。
 */
import { computed } from "vue";
import { ExternalLink, ImageOff, WandSparkles } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { PromptCase } from "@/types/promptCases";

const props = withDefaults(
  defineProps<{
    item: PromptCase | null;
    variant?: "panel" | "sheet";
  }>(),
  { variant: "panel" }
);

const emit = defineEmits<{
  apply: [item: PromptCase];
}>();

const { t } = useI18n();

const shellClass = computed(() =>
  props.variant === "panel" ? "panel min-h-[24rem] overflow-hidden" : "bg-card overflow-hidden"
);
const bodyClass = computed(() =>
  props.variant === "panel"
    ? "thin-scrollbar max-h-[calc(100vh-15rem)] overflow-y-auto p-4"
    : "thin-scrollbar max-h-[calc(86dvh-4.5rem)] overflow-y-auto p-4"
);
</script>

<template>
  <section :class="shellClass">
    <div v-if="variant === 'panel'" class="border-b border-border px-4 py-3">
      <h2 class="text-sm font-semibold">{{ t("aiImage.caseDetail") }}</h2>
    </div>
    <div
      v-if="!item"
      class="flex min-h-96 items-center justify-center text-sm text-muted-foreground"
    >
      {{ t("promptCases.selectCase") }}
    </div>
    <div v-else :class="bodyClass">
      <div class="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
        <img
          v-if="item.thumbnailUrl"
          class="h-full w-full object-cover"
          :src="item.thumbnailUrl"
          :alt="item.title"
        />
        <div v-else class="flex h-full items-center justify-center text-muted-foreground">
          <ImageOff class="h-8 w-8" />
        </div>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex flex-wrap gap-2">
          <span class="rounded-full bg-primary/15 px-2 py-1 text-xs text-primary">
            {{ item.category }}
          </span>
          <span
            v-for="mode in item.modes"
            :key="mode"
            class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
          >
            {{ t(`workspace.${mode}`) }}
          </span>
          <span class="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            {{ item.recommendedSize }}
          </span>
        </div>
        <h3 class="text-xl font-semibold leading-snug">{{ item.title }}</h3>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">{{ item.promptSummary }}</p>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="tag in item.tags"
          :key="tag"
          class="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>

      <button
        class="ui-button ui-button-primary mt-5 w-full"
        type="button"
        @click="emit('apply', item)"
      >
        <WandSparkles class="h-4 w-4" />
        {{ t("aiImage.useCasePrompt") }}
      </button>

      <div class="mt-5 rounded-lg border border-border bg-muted/30 p-3">
        <p class="text-xs font-medium text-muted-foreground">
          {{ t("promptCases.promptTemplate") }}
        </p>
        <pre class="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{{
          item.promptTemplate
        }}</pre>
      </div>

      <div class="mt-4 space-y-1 text-xs text-muted-foreground">
        <p>
          {{ t("promptCases.sourceLicense") }}:
          <span class="font-medium text-foreground">{{ item.sourceLicense }}</span>
        </p>
        <p v-if="item.sourceAuthor">
          {{ t("promptCases.sourceAuthor") }}:
          <span class="font-medium text-foreground">{{ item.sourceAuthor }}</span>
        </p>
        <p v-if="item.sourceRepo">
          {{ t("promptCases.sourceRepo") }}:
          <span class="font-medium text-foreground">{{ item.sourceRepo }}</span>
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
  </section>
</template>
