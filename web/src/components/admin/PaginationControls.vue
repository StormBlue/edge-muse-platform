<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  page: number;
  totalPages: number;
  total: number;
  loading?: boolean;
  pageInput: string;
  inputId: string;
}>();

defineEmits<{
  previous: [];
  next: [];
  jump: [];
  "update:pageInput": [value: string];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="total > 0"
    class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
  >
    <p class="min-w-0 text-sm text-muted-foreground">
      {{ t("history.pageStatus", { page, totalPages, total }) }}
    </p>
    <div
      class="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
    >
      <div class="flex shrink-0 items-center gap-2">
        <button
          class="ui-button ui-button-secondary h-9 px-3 text-sm"
          type="button"
          :disabled="page <= 1 || loading"
          @click="$emit('previous')"
        >
          <ChevronLeft class="h-4 w-4" />
          {{ t("common.previous") }}
        </button>
        <button
          class="ui-button ui-button-secondary h-9 px-3 text-sm"
          type="button"
          :disabled="page >= totalPages || loading"
          @click="$emit('next')"
        >
          {{ t("common.next") }}
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
      <form
        class="flex min-w-0 max-w-full shrink-0 items-center gap-2 sm:pl-2"
        :aria-label="t('history.jumpToPage')"
        @submit.prevent="$emit('jump')"
      >
        <label class="shrink-0 whitespace-nowrap text-sm text-muted-foreground" :for="inputId">
          {{ t("history.jumpTo") }}
        </label>
        <input
          :id="inputId"
          :value="pageInput"
          class="ui-field h-9 !w-20 shrink-0 px-2 text-center text-sm"
          type="number"
          inputmode="numeric"
          min="1"
          :max="totalPages"
          :aria-label="t('history.pageNumber')"
          :disabled="loading"
          @input="$emit('update:pageInput', ($event.target as HTMLInputElement).value)"
        />
        <button
          class="ui-button ui-button-secondary h-9 shrink-0 whitespace-nowrap px-3 text-sm"
          type="submit"
          :disabled="loading"
        >
          {{ t("history.jumpToPage") }}
        </button>
      </form>
    </div>
  </div>
</template>
