<script setup lang="ts">
/**
 * 历史会话列表与详情：按 API 分页拉会话，点进展开消息与任务信息；封面图来自接口 `coverImage`。
 */
import { ref } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import HistoryDetailDialog from "./HistoryDetailDialog.vue";
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
  canDeleteSelectedSession,
  totalPages,
  resultMessages,
  displayResultMessages,
  activeResultMessages,
  detailImages,
  load,
  jumpToPage,
  openDetail,
  backToGrid,
  deleteSelectedSession,
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

const deleteDialogOpen = ref(false);

async function confirmDeleteSession() {
  await deleteSelectedSession();
  deleteDialogOpen.value = false;
}
</script>

<template>
  <AppShell>
    <HistoryDetailDialog
      v-if="selectedSession || detailLoading"
      :active-result-index="activeResultIndex"
      :active-result-messages="activeResultMessages"
      :can-delete-selected-session="canDeleteSelectedSession"
      :detail-loading="detailLoading"
      :display-result-messages="displayResultMessages"
      :format-date-time="formatDateTime"
      :is-long-prompt="isLongPrompt"
      :message-prompt-text="messagePromptText"
      :mode-label="modeLabel"
      :result-messages="resultMessages"
      :selected-session="selectedSession"
      :t="t"
      :task-failure-message="taskFailureMessage"
      :task-generation-stats="taskGenerationStats"
      :task-parameters="taskParameters"
      :task-status-label="taskStatusLabel"
      :task-status-tone="taskStatusTone"
      :task-status-value="taskStatusValue"
      @back="backToGrid"
      @delete="deleteDialogOpen = true"
      @next-result="nextResult"
      @open-image="openImage"
      @previous-result="previousResult"
    />

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

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t("history.deleteSession") }}</DialogTitle>
          <DialogDescription>
            {{ t("history.deleteConfirm") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" type="button" @click="deleteDialogOpen = false">
            {{ t("common.cancel") }}
          </Button>
          <Button variant="destructive" type="button" @click="confirmDeleteSession">
            {{ t("common.delete") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </AppShell>
</template>
