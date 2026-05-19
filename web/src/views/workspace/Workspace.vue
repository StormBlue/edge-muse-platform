<script setup lang="ts">
/**
 * 工作台：会话列表 + 消息流 + 生图输入与模式切换；`useTaskWebSocket` 订阅进行中任务；
 * 路由 `/workspace/s/:sessionId` 与 `sessionId` query 同步加载消息。
 */
import AppShell from "@/components/layout/AppShell.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import WorkspaceHeader from "./WorkspaceHeader.vue";
import WorkspaceModeSelector from "./WorkspaceModeSelector.vue";
import WorkspaceResultPanel from "./WorkspaceResultPanel.vue";
import { useWorkspaceController } from "./useWorkspaceController";

const {
  t,
  auth,
  selectedImage,
  activePreviewImageId,
  activeMode,
  draftTitle,
  submitting,
  allImages,
  resultImages,
  activePreviewImage,
  activeFailedMessage,
  latestPrompt,
  generationProgress,
  generationStatusLabel,
  generationPrompt,
  failedTitle,
  failedMessage,
  inputLoading,
  oneShotTaskLocked,
  generationTargetId,
  taskInputMode,
  currentGenerationSettings,
  latestReferenceCount,
  latestReferenceImages,
  sessionTitle,
  canEditTitle,
  modeSelectionDisabled,
  modeOptions,
  generationTargets,
  providerSizeOptions,
  limitHighResolutionCount,
  maxReferenceFiles,
  hasRunningTask,
  status,
  newSession,
  setActiveMode,
  submit,
  retryFailedResult,
  openImage,
  openActivePreview,
  deleteImageMessage
} = useWorkspaceController();
</script>

<template>
  <AppShell>
    <div class="workspace-page">
      <WorkspaceHeader
        :has-running-task="hasRunningTask"
        :is-sysadmin="auth.isSysadmin"
        :submitting="submitting"
        :websocket-status="status"
        :generation-status-label="generationStatusLabel"
        :generation-progress="generationProgress"
        :remaining-quota="auth.quota?.remainingQuota"
        @new-session="newSession"
      />

      <WorkspaceModeSelector
        v-model:draft-title="draftTitle"
        :active-mode="activeMode"
        :mode-options="modeOptions"
        :disabled="modeSelectionDisabled"
        :session-title="sessionTitle"
        :can-edit-title="canEditTitle"
        :submitting="submitting"
        @select="setActiveMode"
      />

      <div class="workspace-grid workspace-grid--task">
        <ChatInput
          v-model:generation-target-id="generationTargetId"
          class="workspace-task-input-panel"
          :mode="taskInputMode"
          :generation-targets="generationTargets"
          :initial-count="currentGenerationSettings.n"
          :initial-generation-target-id="currentGenerationSettings.generationTargetId"
          :initial-size="currentGenerationSettings.size"
          :generating="hasRunningTask"
          :loading="inputLoading"
          :allow-custom-count="auth.isSysadmin"
          :read-only="oneShotTaskLocked"
          :size-options="providerSizeOptions"
          :limit-high-resolution-count="limitHighResolutionCount"
          :max-reference-files="maxReferenceFiles"
          :reference-count="latestReferenceCount"
          :reference-images="latestReferenceImages"
          @open-reference="openImage"
          @submit="submit"
        />

        <WorkspaceResultPanel
          :title="t('workspace.result')"
          :subtitle="latestPrompt"
          :active-failed="Boolean(activeFailedMessage)"
          :active-preview-image="activePreviewImage"
          :result-images="resultImages"
          :has-running-task="hasRunningTask"
          :generation-status-label="generationStatusLabel"
          :generation-progress="generationProgress"
          :generation-prompt="generationPrompt"
          :failed-title="failedTitle"
          :failed-message="failedMessage"
          @retry-failed="retryFailedResult"
          @open-preview="openActivePreview"
          @select-image-id="activePreviewImageId = $event"
        />
      </div>
    </div>
    <ImageViewer
      :image="selectedImage"
      :images="allImages"
      @close="selectedImage = null"
      @delete="deleteImageMessage"
      @select="selectedImage = $event"
    />
  </AppShell>
</template>

<style scoped>
.workspace-page {
  display: grid;
  container-type: inline-size;
  min-height: calc(100dvh - 6rem);
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.75rem;
  overflow: visible;
}

.workspace-grid {
  display: grid;
  gap: 0.75rem;
  min-height: 0;
  overflow: visible;
}

.task-result-panel,
.workspace-task-input-panel {
  min-height: 0;
}

@media (min-width: 1024px) {
  .workspace-page {
    height: calc(100dvh - 6rem);
    min-height: 0;
    overflow: hidden;
  }
}

@container (min-width: 56rem) {
  .workspace-grid {
    overflow: hidden;
  }

  .workspace-grid--task {
    grid-template-columns: minmax(22rem, 30rem) minmax(0, 1fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1;
    grid-row: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-grid {
    height: 100%;
  }

  .task-result-panel,
  .workspace-task-input-panel {
    min-height: 0;
    height: 100%;
  }
}

@container (min-width: 78rem) {
  .workspace-grid--task {
    grid-template-columns: minmax(24rem, 34rem) minmax(0, 1fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
    grid-row: 1;
  }
}

@container (min-width: 120rem) {
  .workspace-grid--task {
    grid-template-columns: minmax(28rem, 36rem) minmax(0, 1fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
  }
}
</style>
