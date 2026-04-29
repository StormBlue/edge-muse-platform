<script setup lang="ts">
/**
 * 运维巡查：按路由 userId 拉取指定用户的会话/消息/任务与图（sysadmin 只读全量数据）。
 */
import { Loader2 } from "lucide-vue-next";
import PaginationControls from "@/components/admin/PaginationControls.vue";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserSessionsDetailHeader from "./UserSessionsDetailHeader.vue";
import UserSessionsFailureDetails from "./UserSessionsFailureDetails.vue";
import UserSessionsTable from "./UserSessionsTable.vue";
import { useUserSessionsController } from "./useUserSessionsController";

const {
  t,
  userId,
  q,
  userOptions,
  sessions,
  selectedSession,
  selectedImage,
  page,
  pageInput,
  total,
  loading,
  detailLoading,
  activeMessageIndex,
  totalPages,
  selectedSessionId,
  displayResultMessages,
  activeMessages,
  auditImages,
  submitFilters,
  loadSessions,
  jumpToPage,
  openDetail,
  backToTable,
  openImage,
  imageTitle,
  formatDateTime,
  modeLabel,
  roleLabel,
  userLabel,
  userSubLabel,
  statusLabel,
  statusTone,
  requestedImageCount,
  taskParameters,
  messagePromptText,
  isLongPrompt,
  generationFailures,
  taskFailureMessage,
  hasFailureDetails,
  failureGroups,
  failureCountLabel,
  failureGroupTitle,
  failureImageRangeLabel,
  imageIndexLabel,
  tableRowNumber,
  previousMessage,
  nextMessage,
  formatDuration
} = useUserSessionsController();
</script>

<template>
  <AppShell>
    <template v-if="selectedSessionId">
      <div class="flex h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden">
        <UserSessionsDetailHeader
          :selected-session="selectedSession"
          :active-message-index="activeMessageIndex"
          :result-count="displayResultMessages.length"
          :updated-at-label="formatDateTime(selectedSession?.lastMessageAt)"
          @back="backToTable"
          @previous="previousMessage"
          @next="nextMessage"
        />

        <div
          v-if="detailLoading"
          class="panel flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 class="h-4 w-4 animate-spin" />
          {{ t("common.loading") }}
        </div>

        <template v-else>
          <div
            v-if="!displayResultMessages.length"
            class="panel flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground"
          >
            {{ t("sysadmin.noMessages") }}
          </div>
          <div v-else class="min-h-0 flex-1">
            <article
              v-for="message in activeMessages"
              :key="message.id"
              class="panel h-full min-h-0 overflow-hidden"
            >
              <div
                class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,24rem)] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-none 2xl:grid-cols-[minmax(0,1fr)_26rem]"
              >
                <ScrollArea class="h-full min-h-0 bg-muted/15">
                  <div class="flex h-full min-h-0 flex-col gap-4 p-3 sm:p-4">
                    <section
                      :class="message.attachments.length <= 1 ? 'min-h-0 flex-1' : 'shrink-0'"
                    >
                      <div
                        v-if="message.attachments.length"
                        :class="[
                          'grid gap-3',
                          message.attachments.length === 1
                            ? 'h-full min-h-0 grid-cols-1'
                            : 'grid-cols-2 2xl:grid-cols-3'
                        ]"
                      >
                        <div
                          v-for="image in message.attachments"
                          :key="image.id"
                          :class="[
                            'min-w-0',
                            message.attachments.length === 1 ? 'flex h-full min-h-0 flex-col' : ''
                          ]"
                        >
                          <button
                            :class="[
                              'w-full overflow-hidden rounded-lg border border-border bg-muted',
                              message.attachments.length === 1 ? 'min-h-0 flex-1' : 'aspect-square'
                            ]"
                            type="button"
                            :title="imageTitle(image)"
                            @click="openImage(image)"
                          >
                            <img
                              class="h-full w-full object-contain"
                              :src="image.url"
                              alt=""
                              loading="lazy"
                            />
                          </button>
                          <p class="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {{ imageIndexLabel(image.generationIndex) }}
                            · {{ formatDuration(image.generationDurationMs) }}
                          </p>
                        </div>
                      </div>
                      <div
                        v-else
                        class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                      >
                        {{ t("history.noResults") }}
                      </div>
                    </section>

                    <section
                      v-if="message.referenceImages?.length"
                      class="rounded-lg border border-border bg-background/70 p-3"
                    >
                      <p class="mb-2 text-xs font-medium text-muted-foreground">
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
                          <img class="h-full w-full object-contain" :src="image.url" alt="" />
                        </button>
                      </div>
                    </section>

                    <UserSessionsFailureDetails
                      v-if="hasFailureDetails(message)"
                      :failure-count-label="failureCountLabel"
                      :failure-group-title="failureGroupTitle"
                      :failure-groups="failureGroups"
                      :failure-image-range-label="failureImageRangeLabel"
                      :generation-failures="generationFailures"
                      :message="message"
                      :t="t"
                      :task-failure-message="taskFailureMessage"
                    />
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
                            {{ t("sysadmin.messageRole") }}
                          </p>
                          <p class="mt-1 font-medium">{{ roleLabel(message.role) }}</p>
                          <p class="mt-1 text-xs text-muted-foreground">
                            {{ formatDateTime(message.createdAt) }}
                          </p>
                        </div>
                        <span
                          :class="[
                            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                            statusTone(message.task?.status ?? message.status)
                          ]"
                        >
                          {{ statusLabel(message.task?.status ?? message.status) }}
                        </span>
                      </div>

                      <dl
                        v-if="selectedSession"
                        class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                      >
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.sessionId") }}</dt>
                          <dd class="min-w-0 truncate font-mono font-medium">
                            {{ selectedSession.id }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.userFilter") }}</dt>
                          <dd class="min-w-0">
                            <p class="truncate font-medium">
                              {{ userLabel(selectedSession.user) }}
                            </p>
                            <p class="truncate text-xs text-muted-foreground">
                              {{ userSubLabel(selectedSession.user) }}
                            </p>
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("adminUsers.taskCount") }}</dt>
                          <dd class="min-w-0 font-medium">{{ selectedSession.taskCount ?? 0 }}</dd>
                        </div>
                      </dl>

                      <dl
                        class="shrink-0 divide-y divide-border rounded-lg border border-border text-sm"
                      >
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.generationMode") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ modeLabel(taskParameters(message).mode) }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.canvasSize") }}</dt>
                          <dd class="min-w-0 font-medium">{{ taskParameters(message).size }}</dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("workspace.imageCount") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ message.attachments.length }} / {{ requestedImageCount(message) }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("history.references") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ taskParameters(message).referenceCount }}
                          </dd>
                        </div>
                        <div class="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
                          <dt class="text-muted-foreground">{{ t("sysadmin.imageDuration") }}</dt>
                          <dd class="min-w-0 font-medium">
                            {{ formatDuration(taskParameters(message).durationMs) }}
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
                          v-if="isLongPrompt(message)"
                          class="mt-2 min-h-0 flex-1 rounded-lg bg-muted/35"
                        >
                          <div class="whitespace-pre-wrap break-words p-3 text-sm leading-6">
                            {{ messagePromptText(message) || "-" }}
                          </div>
                        </ScrollArea>
                        <div
                          v-else
                          class="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/35 p-3 text-sm leading-6"
                        >
                          {{ messagePromptText(message) || "-" }}
                        </div>
                      </section>
                    </div>
                  </ScrollArea>
                </aside>
              </div>
            </article>
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <h1 class="text-xl font-semibold leading-8">{{ t("sysadmin.userSessionsTitle") }}</h1>
        <form
          class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end"
          @submit.prevent="submitFilters"
        >
          <select
            v-model="userId"
            class="ui-field h-10 !w-full px-3 text-sm sm:!w-72"
            @change="submitFilters"
          >
            <option value="">{{ t("sysadmin.allUsers") }}</option>
            <option
              v-if="userId && !userOptions.some((user) => user.id === userId)"
              :value="userId"
            >
              {{ userId }}
            </option>
            <option v-for="user in userOptions" :key="user.id" :value="user.id">
              {{ userLabel(user) }}
            </option>
          </select>
          <input
            v-model="q"
            class="ui-field col-span-2 h-10 !w-full px-3 sm:col-span-1 sm:!w-72"
            :placeholder="t('sysadmin.auditSearchPlaceholder')"
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
      <UserSessionsTable
        v-else
        :format-date-time="formatDateTime"
        :mode-label="modeLabel"
        :sessions="sessions"
        :table-row-number="tableRowNumber"
        :t="t"
        :user-label="userLabel"
        :user-sub-label="userSubLabel"
        @open-detail="openDetail"
      />

      <PaginationControls
        v-model:page-input="pageInput"
        input-id="audit-page-jump"
        :page="page"
        :total-pages="totalPages"
        :total="total"
        :loading="loading"
        @previous="loadSessions(page - 1)"
        @next="loadSessions(page + 1)"
        @jump="jumpToPage"
      />
    </template>

    <ImageViewer
      :image="selectedImage"
      :images="auditImages"
      @close="selectedImage = null"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>
