<script setup lang="ts">
import { computed } from "vue";
import { Image as ImageIcon, Loader2 } from "lucide-vue-next";
import PaginationControls from "@/components/admin/PaginationControls.vue";
import type { HistorySession } from "./historyTypes";

type Translate = (key: string, named?: Record<string, unknown>) => string;

const props = defineProps<{
  formatDateTime: (value?: number | null) => string;
  items: HistorySession[];
  loading: boolean;
  order: string;
  page: number;
  pageInput: string;
  sessionImageCountLabel: (session: HistorySession) => string;
  sessionStatusLabel: (status?: string | null) => string;
  taskStatusTone: (status?: string | null) => string;
  t: Translate;
  total: number;
  totalPages: number;
  q: string;
}>();

const emit = defineEmits<{
  "update:order": [value: string];
  "update:pageInput": [value: string];
  "update:q": [value: string];
  jump: [];
  load: [page: number];
  openDetail: [session: HistorySession];
}>();

const pageInputModel = computed({
  get: () => props.pageInput,
  set: (value) => emit("update:pageInput", value)
});
</script>

<template>
  <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
    <h1 class="text-xl font-semibold leading-8">{{ t("history.title") }}</h1>
    <form
      class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
      @submit.prevent="emit('load', 1)"
    >
      <select
        class="ui-field h-10 !w-full px-3 text-sm sm:!w-40"
        :value="order"
        @change="emit('update:order', ($event.target as HTMLSelectElement).value)"
      >
        <option value="recent">{{ t("history.recent") }}</option>
        <option value="oldest">{{ t("history.oldest") }}</option>
        <option value="task_count">{{ t("history.taskCountOrder") }}</option>
      </select>
      <input
        class="ui-field col-span-2 h-10 !w-full px-3 sm:col-span-1 sm:!w-80"
        :placeholder="t('history.searchPlaceholder')"
        :value="q"
        @input="emit('update:q', ($event.target as HTMLInputElement).value)"
      />
      <button class="ui-button ui-button-secondary h-10" type="submit">
        {{ t("common.search") }}
      </button>
    </form>
  </div>

  <div
    v-if="loading"
    class="panel flex min-h-80 items-center justify-center gap-2 text-sm text-muted-foreground"
  >
    <Loader2 class="h-4 w-4 animate-spin" />
    {{ t("common.loading") }}
  </div>
  <div v-else-if="!items.length" class="panel p-8 text-center text-sm text-muted-foreground">
    {{ t("history.noHistory") }}
  </div>
  <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    <button
      v-for="session in items"
      :key="session.id"
      class="panel overflow-hidden text-left transition hover:bg-muted/40"
      type="button"
      @click="emit('openDetail', session)"
    >
      <div class="relative aspect-[4/3] bg-muted">
        <img
          v-if="session.coverImage"
          class="h-full w-full object-cover"
          :src="session.coverImage.url"
          alt=""
          loading="lazy"
        />
        <div
          v-else
          class="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <ImageIcon class="h-7 w-7" />
          {{ t("history.noCover") }}
        </div>
        <span
          class="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs shadow-sm"
        >
          {{ sessionImageCountLabel(session) }}
        </span>
        <span
          :class="[
            'absolute left-2 top-2 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm',
            taskStatusTone(session.status)
          ]"
        >
          {{ sessionStatusLabel(session.status) }}
        </span>
      </div>
      <div class="p-4">
        <h2 class="truncate font-semibold">{{ session.title }}</h2>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{{ formatDateTime(session.lastMessageAt) }}</span>
          <span aria-hidden="true">/</span>
          <span>{{ t("history.sessionStatus") }} {{ sessionStatusLabel(session.status) }}</span>
        </div>
      </div>
    </button>
  </div>

  <PaginationControls
    v-model:page-input="pageInputModel"
    input-id="history-page-jump"
    :page="page"
    :total-pages="totalPages"
    :total="total"
    :loading="loading"
    @previous="emit('load', page - 1)"
    @next="emit('load', page + 1)"
    @jump="emit('jump')"
  />
</template>
