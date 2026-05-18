<script setup lang="ts">
/**
 * 运维巡查：按路由 userId 拉取指定用户的会话/消息/任务与图（sysadmin 只读全量数据）。
 */
import { Loader2 } from "@lucide/vue";
import PaginationControls from "@/components/admin/PaginationControls.vue";
import AppShell from "@/components/layout/AppShell.vue";
import UserSessionsDetailView from "./UserSessionsDetailView.vue";
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
    <UserSessionsDetailView
      v-if="selectedSessionId"
      :active-message-index="activeMessageIndex"
      :active-messages="activeMessages"
      :audit-images="auditImages"
      :detail-loading="detailLoading"
      :display-result-messages="displayResultMessages"
      :failure-count-label="failureCountLabel"
      :failure-group-title="failureGroupTitle"
      :failure-groups="failureGroups"
      :failure-image-range-label="failureImageRangeLabel"
      :format-date-time="formatDateTime"
      :format-duration="formatDuration"
      :generation-failures="generationFailures"
      :has-failure-details="hasFailureDetails"
      :image-index-label="imageIndexLabel"
      :image-title="imageTitle"
      :is-long-prompt="isLongPrompt"
      :message-prompt-text="messagePromptText"
      :mode-label="modeLabel"
      :requested-image-count="requestedImageCount"
      :role-label="roleLabel"
      :selected-image="selectedImage"
      :selected-session="selectedSession"
      :status-label="statusLabel"
      :status-tone="statusTone"
      :t="t"
      :task-failure-message="taskFailureMessage"
      :task-parameters="taskParameters"
      :updated-at-label="formatDateTime(selectedSession?.lastMessageAt)"
      :user-label="userLabel"
      :user-sub-label="userSubLabel"
      @back="backToTable"
      @close-image="selectedImage = null"
      @next="nextMessage"
      @open-image="openImage"
      @previous="previousMessage"
      @select-image="selectedImage = $event"
    />

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
  </AppShell>
</template>
