<script setup lang="ts">
import { Search, WandSparkles } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import type { PromptCaseMode } from "@/types/promptCases";

defineProps<{
  categories: string[];
  category: string;
  filterMode: "" | PromptCaseMode;
  search: string;
  sizes: string[];
  size: string;
  supportedModes: PromptCaseMode[];
}>();

const emit = defineEmits<{
  startBlankAssistantFlow: [];
  "update:category": [value: string];
  "update:filterMode": [value: "" | PromptCaseMode];
  "update:search": [value: string];
  "update:size": [value: string];
}>();

const { t } = useI18n();

function updateSearch(event: Event) {
  emit("update:search", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="case-picker-panel panel p-3">
    <div class="case-picker-toolbar">
      <button class="direct-create-entry" type="button" @click="emit('startBlankAssistantFlow')">
        <span class="direct-create-icon">
          <WandSparkles class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-base font-semibold leading-6">
            {{ t("aiImage.startBlankAssistant") }}
          </span>
          <span class="mt-1 block text-sm leading-5 text-muted-foreground">
            {{ t("aiImage.blankCaseSummary") }}
          </span>
        </span>
        <span class="direct-create-action">
          {{ t("aiImage.startBlankAssistantAction") }}
        </span>
      </button>
      <div class="thin-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1">
        <button
          class="h-9 shrink-0 rounded-lg border px-3 text-sm font-medium"
          :class="!category ? 'border-primary bg-primary/10' : 'border-border bg-card'"
          type="button"
          @click="emit('update:category', '')"
        >
          {{ t("aiImage.allCategories") }}
        </button>
        <button
          v-for="item in categories"
          :key="item"
          class="h-9 shrink-0 rounded-lg border px-3 text-sm font-medium"
          :class="category === item ? 'border-primary bg-primary/10' : 'border-border bg-card'"
          type="button"
          @click="emit('update:category', item)"
        >
          {{ item }}
        </button>
      </div>
      <div class="case-filter-row">
        <label class="case-search-field">
          <Search class="h-4 w-4 text-muted-foreground" />
          <input
            class="min-w-0 flex-1 bg-transparent text-sm outline-none"
            :placeholder="t('aiImage.searchCases')"
            :value="search"
            type="search"
            @input="updateSearch"
          />
        </label>
        <select
          class="ui-field h-10 min-w-36 px-3 text-sm"
          :value="filterMode"
          @change="
            emit(
              'update:filterMode',
              ($event.target as HTMLSelectElement).value as '' | PromptCaseMode
            )
          "
        >
          <option value="">{{ t("promptCases.allModes") }}</option>
          <option v-for="mode in supportedModes" :key="mode" :value="mode">
            {{ t(`workspace.${mode}`) }}
          </option>
        </select>
        <select
          class="ui-field h-10 min-w-36 px-3 text-sm"
          :value="size"
          @change="emit('update:size', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t("aiImage.allSizes") }}</option>
          <option v-for="caseSize in sizes" :key="caseSize" :value="caseSize">
            {{ caseSize }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>
<style scoped>
.case-picker-toolbar {
  display: grid;
  min-width: 0;
  gap: 0.75rem;
}

.case-filter-row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(12rem, 1fr);
  gap: 0.5rem;
}

.case-search-field {
  display: flex;
  min-width: 0;
  height: 2.5rem;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--card), transparent 8%);
  padding: 0 0.75rem;
}

.direct-create-entry {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in oklch, var(--primary), transparent 62%);
  background:
    linear-gradient(135deg, color-mix(in oklch, var(--primary), transparent 88%), transparent),
    color-mix(in oklch, var(--card), transparent 10%);
  padding: 0.875rem;
  box-shadow: 0 10px 24px color-mix(in oklch, var(--primary), transparent 88%);
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.direct-create-entry:hover {
  border-color: color-mix(in oklch, var(--primary), transparent 35%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
}

.direct-create-entry:active {
  transform: translateY(1px);
}

.direct-create-icon {
  display: inline-flex;
  height: 2.75rem;
  width: 2.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: linear-gradient(
    135deg,
    var(--primary),
    color-mix(in oklch, var(--primary), var(--accent) 28%)
  );
  color: var(--primary-foreground);
}

.direct-create-action {
  display: inline-flex;
  min-height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: var(--primary);
  padding: 0.5rem 0.875rem;
  color: var(--primary-foreground);
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
}

@container (min-width: 50rem) {
  .case-picker-toolbar {
    grid-template-columns: minmax(21rem, 0.9fr) minmax(0, 1.1fr);
    align-items: stretch;
  }

  .case-filter-row {
    grid-column: 1 / -1;
    grid-template-columns: minmax(14rem, 1fr) minmax(9rem, 12rem) minmax(9rem, 12rem);
  }
}
</style>
