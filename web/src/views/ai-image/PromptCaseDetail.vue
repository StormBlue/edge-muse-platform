<script setup lang="ts">
/**
 * 案例详情：展示用户决策所需信息，并明确来源归因。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ExternalLink, Maximize2, WandSparkles, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
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
const previewOpen = ref(false);

const shellClass = computed(() =>
  props.variant === "panel" ? "panel min-h-[24rem] overflow-hidden" : "bg-card overflow-hidden"
);
const bodyClass = computed(() =>
  props.variant === "panel"
    ? "thin-scrollbar max-h-[calc(100vh-15rem)] overflow-y-auto p-4"
    : "thin-scrollbar max-h-[calc(86dvh-4.5rem)] overflow-y-auto p-4"
);

watch(
  () => props.item?.id,
  () => {
    closePreview();
  }
);

function closePreview() {
  previewOpen.value = false;
}

function onPreviewKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !previewOpen.value) return;
  closePreview();
}

onMounted(() => window.addEventListener("keydown", onPreviewKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onPreviewKeydown));
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
      <button
        v-if="item.thumbnailUrl"
        class="group relative block aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted"
        type="button"
        :title="t('aiImage.openCasePreview')"
        @click="previewOpen = true"
      >
        <PromptCaseThumbnail :src="item.thumbnailUrl" :alt="item.title" icon-class="h-8 w-8" />
        <span
          class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/80 text-foreground opacity-0 transition group-hover:opacity-100"
        >
          <Maximize2 class="h-4 w-4" />
        </span>
      </button>
      <div v-else class="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
        <PromptCaseThumbnail :src="item.thumbnailUrl" :alt="item.title" icon-class="h-8 w-8" />
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

    <Teleport to="body">
      <div
        v-if="item?.thumbnailUrl && previewOpen"
        class="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)] bg-black/90 text-white"
        role="dialog"
        aria-modal="true"
        @click.self="closePreview"
      >
        <header
          class="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ item.title }}</p>
            <p class="truncate text-xs text-white/65">
              {{ item.category }} · {{ item.recommendedSize }}
            </p>
          </div>
          <button
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/18"
            type="button"
            :title="t('viewer.close')"
            @click="closePreview"
          >
            <X class="h-4 w-4" />
          </button>
        </header>
        <main class="min-h-0 overflow-auto p-4" @click.self="closePreview">
          <div class="flex min-h-full items-center justify-center">
            <img
              class="max-h-[calc(100dvh-6rem)] max-w-full rounded-lg object-contain shadow-2xl shadow-black/50"
              :src="item.thumbnailUrl"
              :alt="item.title"
            />
          </div>
        </main>
      </div>
    </Teleport>
  </section>
</template>
