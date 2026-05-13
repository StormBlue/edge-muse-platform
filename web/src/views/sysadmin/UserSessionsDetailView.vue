<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import UserSessionsDetailHeader from "./UserSessionsDetailHeader.vue";
import UserSessionsFailureDetails from "./UserSessionsFailureDetails.vue";
import type {
  AuditImageAttachment,
  AuditMessage,
  AuditSession,
  FailureGroup
} from "./userSessionsTypes";
import type { SessionMode } from "@/stores/session";

defineProps<{
  selectedSession: AuditSession | null;
  selectedImage: AuditImageAttachment | null;
  auditImages: AuditImageAttachment[];
  detailLoading: boolean;
  activeMessageIndex: number;
  displayResultMessages: AuditMessage[];
  activeMessages: AuditMessage[];
  t: (key: string, params?: Record<string, unknown>) => string;
  updatedAtLabel: string;
  imageTitle: (image: AuditImageAttachment) => string;
  formatDateTime: (value?: number | null) => string;
  modeLabel: (mode?: SessionMode | null) => string;
  roleLabel: (role: string) => string;
  userLabel: (user?: AuditSession["user"] | null) => string;
  userSubLabel: (user?: AuditSession["user"] | null) => string;
  statusLabel: (status?: string | null) => string;
  statusTone: (status?: string | null) => string;
  requestedImageCount: (message: AuditMessage) => number;
  taskParameters: (message: AuditMessage) => {
    mode: SessionMode | null;
    size: string;
    count: number;
    referenceCount: number;
    durationMs: number | null;
    model: string;
  };
  messagePromptText: (message: AuditMessage) => string;
  isLongPrompt: (message: AuditMessage) => boolean;
  generationFailures: (message: AuditMessage) => unknown[];
  taskFailureMessage: (message: AuditMessage) => string;
  hasFailureDetails: (message: AuditMessage) => boolean;
  failureGroups: (message: AuditMessage) => FailureGroup[];
  failureCountLabel: (count: number) => string;
  failureGroupTitle: (group: FailureGroup) => string;
  failureImageRangeLabel: (group: FailureGroup) => string;
  imageIndexLabel: (index?: number | null) => string;
  formatDuration: (duration?: number | null) => string;
}>();

defineEmits<{
  back: [];
  previous: [];
  next: [];
  openImage: [image: AuditImageAttachment];
  closeImage: [];
  selectImage: [image: AuditImageAttachment];
}>();
</script>

<template>
  <div class="audit-detail-shell flex min-h-0 flex-col">
    <UserSessionsDetailHeader
      :selected-session="selectedSession"
      :active-message-index="activeMessageIndex"
      :result-count="displayResultMessages.length"
      :updated-at-label="updatedAtLabel"
      @back="$emit('back')"
      @previous="$emit('previous')"
      @next="$emit('next')"
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
          class="panel audit-detail-card overflow-hidden"
        >
          <div
            class="audit-detail-layout grid min-h-0 lg:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]"
          >
            <div class="min-h-0 overflow-hidden bg-muted/15">
              <div class="audit-detail-media flex min-h-0 flex-col gap-4 p-3 sm:p-4">
                <section class="audit-detail-images-section min-h-0 overflow-hidden">
                  <ScrollArea v-if="message.attachments.length" class="audit-detail-images">
                    <div class="audit-detail-masonry">
                      <button
                        v-for="image in message.attachments"
                        :key="image.id"
                        class="audit-detail-masonry-item"
                        type="button"
                        :title="imageTitle(image)"
                        @click="$emit('openImage', image)"
                      >
                        <img
                          class="audit-detail-masonry-image"
                          :src="image.url"
                          :width="image.width ?? undefined"
                          :height="image.height ?? undefined"
                          alt=""
                          loading="lazy"
                        />
                        <span class="audit-detail-masonry-meta">
                          {{ imageIndexLabel(image.generationIndex) }}
                          · {{ formatDuration(image.generationDurationMs) }}
                        </span>
                      </button>
                    </div>
                  </ScrollArea>
                  <div
                    v-else
                    class="audit-detail-empty flex min-h-0 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
                  >
                    {{ t("history.noResults") }}
                  </div>
                </section>

                <section
                  v-if="message.referenceImages?.length"
                  class="audit-detail-reference shrink-0 rounded-lg border border-border bg-background/70 p-3"
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
                      @click="$emit('openImage', image)"
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
            </div>

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

    <ImageViewer
      :image="selectedImage"
      :images="auditImages"
      @close="$emit('closeImage')"
      @select="$emit('selectImage', $event)"
    />
  </div>
</template>

<style scoped>
.audit-detail-shell {
  height: calc(100dvh - 6rem);
  overflow: hidden;
}

.audit-detail-card {
  height: 100%;
  min-height: 0;
}

.audit-detail-layout {
  height: 100%;
  grid-template-rows: minmax(0, 1fr);
}

.audit-detail-media {
  height: 100%;
}

.audit-detail-images-section {
  flex: 1 1 auto;
}

.audit-detail-images,
.audit-detail-empty {
  height: 100%;
  min-height: 0;
}

.audit-detail-masonry {
  column-gap: 0.75rem;
  column-width: 13rem;
}

.audit-detail-masonry-item {
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

.audit-detail-masonry-item:hover {
  border-color: color-mix(in oklch, var(--primary), transparent 55%);
  box-shadow: var(--shadow-panel);
  transform: translateY(-1px);
}

.audit-detail-masonry-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(70dvh, 52rem);
  object-fit: contain;
}

.audit-detail-masonry-meta {
  display: block;
  overflow: hidden;
  padding: 0.35rem 0.5rem 0.45rem;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@supports (grid-template-rows: masonry) {
  .audit-detail-masonry {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    grid-template-rows: masonry;
    gap: 0.75rem;
    column-width: auto;
  }

  .audit-detail-masonry-item {
    display: block;
    margin: 0;
  }
}

@media (max-width: 1023px) {
  .audit-detail-shell {
    height: auto;
    min-height: calc(100dvh - 9rem);
    overflow: visible;
  }

  .audit-detail-card,
  .audit-detail-layout,
  .audit-detail-media {
    height: auto;
  }

  .audit-detail-layout {
    display: flex;
    flex-direction: column;
  }

  .audit-detail-images-section {
    flex: 0 0 auto;
  }

  .audit-detail-images,
  .audit-detail-empty {
    min-height: 18rem;
    height: min(62dvh, 44rem);
  }
}

@media (max-width: 640px) {
  .audit-detail-masonry {
    column-gap: 0.5rem;
    column-width: 10.5rem;
  }

  .audit-detail-masonry-item {
    margin-bottom: 0.5rem;
  }
}
</style>
