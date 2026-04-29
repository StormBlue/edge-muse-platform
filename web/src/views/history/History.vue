<script setup lang="ts">
/**
 * 历史会话列表与详情：按 API 分页拉会话，点进展开消息与任务信息；封面图来自接口 `coverImage`。
 */
import { ArrowLeft, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import HistoryGrid from "./HistoryGrid.vue";
import { useHistoryController } from "./useHistoryController";

const {
  t,
  items,
  q,
  order,
  page,
  pageInput,
  total,
  loading,
  detailLoading,
  selectedSession,
  selectedImage,
  activeResultIndex,
  totalPages,
  resultMessages,
  displayResultMessages,
  activeResultMessages,
  detailImages,
  load,
  jumpToPage,
  openDetail,
  backToGrid,
  openImage,
  formatDateTime,
  modeLabel,
  taskStatusValue,
  taskStatusLabel,
  sessionStatusLabel,
  taskStatusTone,
  taskFailureMessage,
  messagePromptText,
  isLongPrompt,
  taskGenerationStats,
  sessionImageCountLabel,
  taskParameters,
  previousResult,
  nextResult
} = useHistoryController();
</script>

<template>
  <AppShell>
    <template v-if="selectedSession || detailLoading">
      <div class="flex h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden">
        <div
          class="mb-4 flex shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <div class="min-w-0">
            <button
              class="ui-button ui-button-secondary mb-3 h-9 px-3 text-sm"
              type="button"
              @click="backToGrid"
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
          <div
            v-if="displayResultMessages.length > 1"
            class="flex shrink-0 items-center gap-2 text-sm"
          >
            <button
              class="ui-button ui-button-secondary h-9 px-3"
              type="button"
              :disabled="activeResultIndex <= 0"
              @click="previousResult"
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
              @click="nextResult"
            >
              {{ t("common.next") }}
              <ChevronRight class="h-4 w-4" />
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
                class="panel h-full min-h-0 overflow-hidden"
              >
                <div
                  class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(14rem,22rem)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-none 2xl:grid-cols-[minmax(0,1fr)_24rem]"
                >
                  <ScrollArea class="h-full min-h-0 bg-muted/15">
                    <div class="p-3 sm:p-4">
                      <div
                        v-if="message.attachments.length"
                        :class="[
                          'grid gap-3',
                          message.attachments.length === 1
                            ? 'min-h-[24rem] grid-cols-1'
                            : 'grid-cols-2 2xl:grid-cols-3'
                        ]"
                      >
                        <button
                          v-for="image in message.attachments"
                          :key="image.id"
                          :class="[
                            'overflow-hidden rounded-lg border border-border bg-muted',
                            message.attachments.length === 1 ? 'min-h-[24rem]' : 'aspect-square'
                          ]"
                          type="button"
                          :title="t('workspace.openPreview')"
                          @click="openImage(image)"
                        >
                          <img
                            class="h-full w-full object-contain"
                            :src="image.url"
                            alt=""
                            loading="lazy"
                          />
                        </button>
                      </div>
                      <div
                        v-else
                        class="flex min-h-[24rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                      >
                        <ImageIcon class="h-6 w-6" />
                        {{ t("history.noResults") }}
                      </div>

                      <ScrollArea
                        v-if="taskFailureMessage(message)"
                        class="mt-3 h-40 rounded-lg border border-destructive/25 bg-destructive/5"
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
                  </ScrollArea>

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
                                <div
                                  class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                                >
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
                              @click="openImage(image)"
                            >
                              <img
                                class="h-full w-full object-cover"
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

    <HistoryGrid
      v-else
      v-model:order="order"
      v-model:page-input="pageInput"
      v-model:q="q"
      :format-date-time="formatDateTime"
      :items="items"
      :loading="loading"
      :page="page"
      :session-image-count-label="sessionImageCountLabel"
      :session-status-label="sessionStatusLabel"
      :task-status-tone="taskStatusTone"
      :t="t"
      :total="total"
      :total-pages="totalPages"
      @jump="jumpToPage"
      @load="load"
      @open-detail="openDetail"
    />

    <ImageViewer
      :image="selectedImage"
      :images="detailImages"
      @close="selectedImage = null"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>
