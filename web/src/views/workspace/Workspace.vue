<script setup lang="ts">
/**
 * 工作台：会话列表 + 消息流 + 生图输入与模式切换；`useTaskWebSocket` 订阅进行中任务；
 * 路由 `/workspace/s/:sessionId` 与 `sessionId` query 同步加载消息。
 */
import { Image as ImageIcon, Loader2 } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import WorkspaceHeader from "./WorkspaceHeader.vue";
import WorkspaceModeSelector from "./WorkspaceModeSelector.vue";
import WorkspaceResultPanel from "./WorkspaceResultPanel.vue";
import { useWorkspaceController } from "./useWorkspaceController";

const {
  t,
  sessions,
  auth,
  selectedImage,
  activePreviewImageId,
  activeMode,
  draftTitle,
  submitting,
  messageList,
  topSentinel,
  allImages,
  resultImages,
  activePreviewImage,
  activeFailedMessage,
  isConversationMode,
  latestPrompt,
  generationProgress,
  generationStatusLabel,
  generationPrompt,
  failedTitle,
  failedMessage,
  inputLoading,
  oneShotTaskLocked,
  taskInputMode,
  currentGenerationSettings,
  latestReferenceCount,
  latestReferenceImages,
  sessionTitle,
  canEditTitle,
  modeSelectionDisabled,
  modeOptions,
  providerSizeOptions,
  maxReferenceFiles,
  hasRunningTask,
  status,
  newSession,
  setActiveMode,
  submit,
  retry,
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

      <div
        class="workspace-grid"
        :class="isConversationMode ? 'workspace-grid--chat' : 'workspace-grid--task'"
      >
        <template v-if="isConversationMode">
          <ChatInput
            class="workspace-chat-input-panel"
            :mode="activeMode"
            :generating="hasRunningTask"
            :loading="inputLoading"
            :allow-custom-count="auth.isSysadmin"
            :size-options="providerSizeOptions"
            :max-reference-files="maxReferenceFiles"
            variant="chat"
            @submit="submit"
          />

          <section
            class="conversation-panel panel flex min-h-[28rem] min-w-0 flex-col overflow-hidden"
          >
            <div class="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 class="text-sm font-semibold">{{ t("workspace.continuousChat") }}</h2>
              <span
                class="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
              >
                <Loader2 v-if="hasRunningTask" class="h-3.5 w-3.5 animate-spin text-primary" />
                <span v-else class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"></span>
                <template v-if="hasRunningTask">
                  {{ generationStatusLabel }}
                  <span class="tabular-nums">
                    {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                  </span>
                </template>
                <template v-else>{{ status }}</template>
              </span>
            </div>
            <div
              ref="messageList"
              class="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto bg-muted/30 p-4"
            >
              <div ref="topSentinel" class="h-px"></div>
              <div
                v-if="sessions.olderMessagesLoading"
                class="py-2 text-center text-xs text-muted-foreground"
              >
                {{ t("workspace.loadingOlder") }}
              </div>
              <div
                v-if="!sessions.messages.length"
                class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
              >
                <ImageIcon class="h-8 w-8" />
                {{ t("workspace.conversationEmpty") }}
              </div>
              <ChatMessage
                v-for="message in sessions.messages"
                :key="message.id"
                :message="message"
                @open="openImage"
                @retry="retry"
              />
            </div>
          </section>

          <WorkspaceResultPanel
            compact
            class="conversation-result-panel"
            :title="t('workspace.latestResult')"
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
          />
        </template>

        <template v-else>
          <ChatInput
            class="workspace-task-input-panel"
            :mode="taskInputMode"
            :initial-count="currentGenerationSettings.n"
            :initial-size="currentGenerationSettings.size"
            :generating="hasRunningTask"
            :loading="inputLoading"
            :allow-custom-count="auth.isSysadmin"
            :read-only="oneShotTaskLocked"
            :size-options="providerSizeOptions"
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
        </template>
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
  gap: 0.875rem;
  overflow: visible;
}

.workspace-grid {
  display: grid;
  gap: 1rem;
  min-height: 0;
  overflow: visible;
}

@media (min-width: 1024px) {
  .workspace-page {
    height: calc(100dvh - 6rem);
    min-height: 0;
  }
}

@container (min-width: 56rem) {
  .workspace-grid {
    overflow: hidden;
  }

  .workspace-grid--task {
    grid-template-columns: minmax(22rem, 28rem) minmax(0, 1fr);
  }

  .workspace-grid--chat {
    grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1;
    grid-row: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-grid--chat .workspace-chat-input-panel {
    grid-column: 1;
    grid-row: 1;
  }

  .workspace-grid--chat .conversation-panel {
    grid-column: 2;
    grid-row: 1;
  }

  .workspace-grid {
    height: 100%;
  }

  .task-result-panel,
  .conversation-panel,
  .conversation-result-panel,
  .workspace-task-input-panel,
  .workspace-chat-input-panel {
    min-height: 0;
    height: 100%;
  }
}

@container (min-width: 78rem) {
  .workspace-grid--task {
    grid-template-columns: minmax(22rem, 1fr) minmax(18rem, 0.72fr) minmax(0, 1.45fr);
  }

  .workspace-grid--chat {
    grid-template-columns: minmax(20rem, 23rem) minmax(0, 1.3fr) minmax(18rem, 0.8fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1 / span 2;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 3;
  }

  .workspace-grid--chat .conversation-result-panel {
    grid-column: 3;
    grid-row: 1;
  }
}

@container (min-width: 120rem) {
  .workspace-grid--task {
    grid-template-columns: minmax(44rem, 58rem) minmax(0, 1fr);
  }

  .workspace-grid--task .workspace-task-input-panel {
    grid-column: 1;
  }

  .workspace-grid--task .task-result-panel {
    grid-column: 2;
  }

  .workspace-grid--chat {
    grid-template-columns: minmax(22rem, 28rem) minmax(0, 1fr) minmax(22rem, 34rem);
  }
}
</style>
