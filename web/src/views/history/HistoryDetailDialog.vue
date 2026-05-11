<script setup lang="ts">
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Trash2
} from "lucide-vue-next";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImageAttachment, SessionMode } from "@/stores/session";
import type { GenerationStats, HistoryMessage, HistorySession } from "./historyTypes";

type TaskParameters = {
  mode: SessionMode | null;
  size: string;
  model: string;
  referenceCount: number;
};

defineProps<{
  activeResultIndex: number;
  activeResultMessages: HistoryMessage[];
  canDeleteSelectedSession: boolean;
  detailLoading: boolean;
  displayResultMessages: HistoryMessage[];
  formatDateTime: (value?: number | null) => string;
  isLongPrompt: (message: HistoryMessage) => boolean;
  messagePromptText: (message: HistoryMessage) => string;
  modeLabel: (mode?: SessionMode | null) => string;
  resultMessages: HistoryMessage[];
  selectedSession: HistorySession | null;
  taskFailureMessage: (message: HistoryMessage) => string;
  taskGenerationStats: (message: HistoryMessage) => GenerationStats;
  taskParameters: (message: HistoryMessage) => TaskParameters;
  taskStatusLabel: (status?: string | null) => string;
  taskStatusTone: (status?: string | null) => string;
  taskStatusValue: (message: HistoryMessage) => string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}>();

const emit = defineEmits<{
  back: [];
  delete: [];
  nextResult: [];
  openImage: [image: ImageAttachment];
  previousResult: [];
}>();
</script>

<template>
  <div class="history-detail-shell flex min-h-0 flex-col">
    <div class="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="min-w-0">
        <button
          class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
          type="button"
          @click="emit('back')"
        >
          <ArrowLeft class="h-4 w-4" />
          {{ t("history.backToGrid") }}
        </button>
        <h1 class="truncate text-xl font-semibold leading-8">
          {{ selectedSession?.title ?? t("history.detail") }}
        </h1>
        <p v-if="selectedSession" class="mt-1 text-sm text-muted-foreground">
          {{ t("history.updatedAt") }} {{ formatDateTime(selectedSession.lastMessageAt) }}
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2 text-sm">
        <template v-if="displayResultMessages.length > 1">
          <button
            class="ui-button ui-button-secondary h-9 px-3"
            type="button"
            :disabled="activeResultIndex <= 0"
            @click="emit('previousResult')"
          >
            <ChevronLeft class="h-4 w-4" />
            {{ t("common.previous") }}
          </button>
          <span class="min-w-16 text-center text-muted-foreground">
            {{ activeResultIndex + 1 }} / {{ displayResultMessages.length }}
          </span>
          <button
            class="ui-button ui-button-secondary h-9 px-3"
            type="button"
            :disabled="activeResultIndex >= displayResultMessages.length - 1"
            @click="emit('nextResult')"
          >
            {{ t("common.next") }}
            <ChevronRight class="h-4 w-4" />
          </button>
        </template>
        <button
          v-if="selectedSession"
          class="ui-button h-9 border-destructive/25 bg-destructive/10 px-3 text-sm text-destructive"
          type="button"
          :disabled="!canDeleteSelectedSession"
          :title="
            canDeleteSelectedSession ? t('history.deleteSession') : t('history.deleteUnavailable')
          "
          @click="emit('delete')"
        >
          <Trash2 class="h-4 w-4" />
          {{ t("history.deleteSession") }}
        </button>
      </div>
    </div>

    <div
      v-if="detailLoading"
      class="panel flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 class="h-4 w-4 animate-spin" />
      {{ t("common.loading") }}
    </div>

    <template v-else-if="selectedSession">
      <div
        v-if="!resultMessages.length"
        class="panel flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
      >
        {{ t("history.noResults") }}
      </div>
      <div v-else class="min-h-0 flex-1">
        <div class="h-full min-h-0">
          <article
            v-for="message in activeResultMessages"
            :key="message.id"
            class="panel history-detail-card overflow-hidden"
          >
            <div
              class="history-detail-layout grid min-h-0 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]"
            >
              <div class="min-h-0 overflow-hidden bg-muted/15">
                <div class="history-detail-media flex min-h-0 flex-col p-3 sm:p-4">
                  <ScrollArea v-if="message.attachments.length" class="history-detail-images">
                    <div class="history-detail-masonry">
                      <button
                        v-for="image in message.attachments"
                        :key="image.id"
                        class="history-detail-masonry-item"
                        type="button"
                        :title="t('workspace.openPreview')"
                        @click="emit('openImage', image)"
                      >
                        <img
                          class="history-detail-masonry-image"
                          :src="image.url"
                          :width="image.width ?? undefined"
                          :height="image.height ?? undefined"
                          alt=""
                          loading="lazy"
                        />
                      </button>
                    </div>
                  </ScrollArea>
                  <div
                    v-else
                    class="history-detail-empty flex min-h-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                  >
                    <ImageIcon class="h-6 w-6" />
                    {{ t("history.noResults") }}
                  </div>

                  <ScrollArea
                    v-if="taskFailureMessage(message)"
                    class="history-detail-failure mt-3 rounded-lg border border-destructive/25 bg-destructive/5"
                  >
                    <div class="px-3 py-2 text-sm text-destructive">
                      <p class="font-semibold">
                        {{
                          message.task?.errorCode?.startsWith("PROVIDER")
                            ? t("workspace.providerGenerationFailed")
                            : t("workspace.generationFailed")
                        }}
                      </p>
                      <p class="mt-1 whitespace-pre-wrap break-words text-xs leading-5">
                        {{ taskFailureMessage(message) }}
                      </p>
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <aside
                class="h-full min-h-0 min-w-0 overflow-hidden border-t border-border bg-background lg:border-l lg:border-t-0"
              >
                <ScrollArea class="h-full min-h-0">
                  <div class="flex min-h-full flex-col gap-4 p-4">
                    <div class="flex shrink-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-xs text-muted-foreground">
                          {{ t("history.createdAt") }}
                        </p>
                        <p class="mt-1 text-sm font-medium">
                          {{ formatDateTime(message.createdAt) }}
                        </p>
                      </div>
                      <span
                        :class="[
                          'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium',
                          taskStatusTone(taskStatusValue(message))
                        ]"
                      >
                        {{ taskStatusLabel(taskStatusValue(message)) }}
                      </span>
                    </div>

                    <dl
                      class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                    >
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">
                          {{ t("history.generationProgress") }}
                        </dt>
                        <dd class="min-w-0">
                          <div class="flex items-center gap-2">
                            <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                class="h-full rounded-full bg-primary"
                                :style="{ width: `${taskGenerationStats(message).percent}%` }"
                              ></div>
                            </div>
                            <span class="shrink-0 font-medium">
                              {{ taskGenerationStats(message).percent }}%
                            </span>
                          </div>
                        </dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">{{ t("history.totalImages") }}</dt>
                        <dd class="min-w-0 font-medium">
                          {{ taskGenerationStats(message).total }}
                        </dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">{{ t("history.successImages") }}</dt>
                        <dd class="min-w-0 font-medium">
                          {{ taskGenerationStats(message).success }}
                        </dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">{{ t("history.failedImages") }}</dt>
                        <dd class="min-w-0 font-medium">
                          {{ taskGenerationStats(message).failed }}
                        </dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">
                          {{ t("workspace.generationMode") }}
                        </dt>
                        <dd class="min-w-0 font-medium">
                          {{ modeLabel(taskParameters(message).mode) }}
                        </dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">{{ t("workspace.canvasSize") }}</dt>
                        <dd class="min-w-0 font-medium">{{ taskParameters(message).size }}</dd>
                      </div>
                      <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                        <dt class="text-muted-foreground">{{ t("history.references") }}</dt>
                        <dd class="min-w-0 font-medium">
                          {{ taskParameters(message).referenceCount }}
                        </dd>
                      </div>
                      <div
                        v-if="taskParameters(message).model"
                        class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2"
                      >
                        <dt class="text-muted-foreground">{{ t("history.model") }}</dt>
                        <dd class="min-w-0 break-words font-medium">
                          {{ taskParameters(message).model }}
                        </dd>
                      </div>
                    </dl>

                    <div
                      v-if="message.referenceImages?.length"
                      class="grid shrink-0 gap-2 rounded-lg border border-border bg-muted/20 p-2"
                    >
                      <p class="text-xs font-medium text-muted-foreground">
                        {{ t("history.references") }}
                      </p>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="image in message.referenceImages"
                          :key="image.id"
                          class="h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                          type="button"
                          :title="t('workspace.openPreview')"
                          @click="emit('openImage', image)"
                        >
                          <img
                            class="h-full w-full object-contain"
                            :src="image.url"
                            alt=""
                            loading="lazy"
                          />
                        </button>
                      </div>
                    </div>

                    <section
                      :class="[
                        'min-w-0',
                        isLongPrompt(message) ? 'flex min-h-0 flex-1 flex-col' : 'shrink-0'
                      ]"
                    >
                      <h2 class="text-xs font-medium text-muted-foreground">
                        {{ t("workspace.prompt") }}
                      </h2>
                      <ScrollArea
                        :class="[
                          'mt-2 rounded-lg bg-muted/35',
                          isLongPrompt(message) ? 'min-h-0 flex-1' : 'max-h-48'
                        ]"
                      >
                        <div class="whitespace-pre-wrap break-words p-3 text-sm leading-6">
                          {{ messagePromptText(message) }}
                        </div>
                      </ScrollArea>
                    </section>
                  </div>
                </ScrollArea>
              </aside>
            </div>
          </article>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.history-detail-shell {
  height: calc(100dvh - 6rem);
  overflow: hidden;
}

.history-detail-card {
  height: 100%;
  min-height: 0;
}

.history-detail-layout {
  height: 100%;
  grid-template-rows: minmax(0, 1fr);
}

.history-detail-media {
  height: 100%;
}

.history-detail-images,
.history-detail-empty {
  min-height: 0;
  flex: 1 1 auto;
}

.history-detail-failure {
  height: 10rem;
  flex: 0 0 auto;
}

.history-detail-masonry {
  column-gap: 0.75rem;
  column-width: 13rem;
}

.history-detail-masonry-item {
  display: inline-block;
  width: 100%;
  margin: 0 0 0.75rem;
  overflow: hidden;
  break-inside: avoid;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
  text-align: left;
  transition:
    border-color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.history-detail-masonry-item:hover {
  border-color: color-mix(in oklch, var(--primary), transparent 55%);
  box-shadow: var(--shadow-panel);
  transform: translateY(-1px);
}

.history-detail-masonry-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(70dvh, 52rem);
  object-fit: contain;
}

@supports (grid-template-rows: masonry) {
  .history-detail-masonry {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    grid-template-rows: masonry;
    gap: 0.75rem;
    column-width: auto;
  }

  .history-detail-masonry-item {
    display: block;
    margin: 0;
  }
}

@media (max-width: 1023px) {
  .history-detail-shell {
    height: auto;
    min-height: calc(100dvh - 9rem);
    overflow: visible;
  }

  .history-detail-card,
  .history-detail-layout,
  .history-detail-media {
    height: auto;
  }

  .history-detail-layout {
    display: flex;
    flex-direction: column;
  }

  .history-detail-images,
  .history-detail-empty {
    min-height: 18rem;
    height: min(62dvh, 44rem);
    flex: 0 0 auto;
  }

  .history-detail-failure {
    height: auto;
    max-height: 12rem;
  }
}

@media (max-width: 640px) {
  .history-detail-masonry {
    column-gap: 0.5rem;
    column-width: 10.5rem;
  }

  .history-detail-masonry-item {
    margin-bottom: 0.5rem;
  }
}
</style>
