<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  ArrowUpRight,
  Columns2,
  Download,
  Image,
  ImagePlus,
  Loader2,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  Square,
  X
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useImageStudioContext } from "./studioContext";

const s = useImageStudioContext();
const now = ref(Date.now());
const timer = setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => clearInterval(timer));
const elapsed = computed(() => {
  const task = s.currentTask.value;
  if (!task) return "0:00";
  const seconds = Math.max(0, Math.floor(((task.finishedAt ?? now.value) - task.queuedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});
const selectedDownload = computed(
  () =>
    `${s.selectedImage.value?.id ?? "image"}.${s.selectedImage.value?.mime.includes("jpeg") ? "jpg" : s.selectedImage.value?.mime.includes("webp") ? "webp" : "png"}`
);
</script>

<template>
  <section class="studio-results" :aria-label="s.t('studio.results')">
    <div class="studio-results-bar">
      <div class="flex min-w-0 items-center gap-2 text-xs" role="status">
        <Loader2
          v-if="s.isRunning.value || s.loadingTask.value"
          class="size-4 shrink-0 animate-spin text-accent"
        />
        <span
          v-else
          class="studio-status-dot"
          :class="{ 'studio-status-dot--failed': s.currentTask.value?.status === 'failed' }"
        />
        <span class="truncate font-medium">{{
          s.currentTask.value ? s.t(`studio.${s.currentTask.value.phase}`) : s.t("studio.results")
        }}</span>
        <span v-if="s.currentTask.value" class="text-muted-foreground tabular-nums">{{
          elapsed
        }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Button
          v-if="s.currentTask.value?.canCancel"
          type="button"
          variant="secondary"
          size="sm"
          :disabled="s.activity.cancellingIds.includes(s.currentTask.value.id)"
          @click="s.cancelCurrent"
        >
          <X class="size-3.5" />{{ s.t("studio.cancel") }}
        </Button>
        <div
          v-if="s.selectedImage.value"
          class="flex gap-1"
          role="group"
          :aria-label="s.t('studio.compare')"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-pressed="!s.comparing.value"
            :aria-label="s.t('studio.single')"
            :title="s.t('studio.single')"
            @click="s.comparing.value = false"
          >
            <Square class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-pressed="s.comparing.value"
            :aria-label="s.t('studio.compare')"
            :title="s.t('studio.compare')"
            :disabled="!s.comparisonImage.value"
            @click="s.comparing.value = true"
          >
            <Columns2 class="size-4" />
          </Button>
        </div>
      </div>
    </div>
    <div class="studio-results-scroll thin-scrollbar">
      <div v-if="s.error.value" class="studio-error" role="alert">
        <p>{{ s.error.value }}</p>
        <Button variant="secondary" size="sm" @click="s.retryRoute">
          <RotateCcw class="size-3.5" />{{ s.t("studio.retryLoad") }}
        </Button>
      </div>
      <div
        v-if="s.selectedImage.value"
        class="studio-image-stage"
        :class="{ 'studio-image-stage--compare': s.comparing.value && s.comparisonImage.value }"
      >
        <figure v-if="s.comparing.value && s.comparisonImage.value" class="studio-image-figure">
          <div class="studio-image-caption">
            <label for="studio-comparison" class="sr-only">{{ s.t("studio.compareSelect") }}</label><select
              id="studio-comparison"
              :value="s.comparisonImage.value.id"
              :aria-label="s.t('studio.compareSelect')"
              @change="s.comparisonImageId.value = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="image in s.comparisonImages.value" :key="image.id" :value="image.id">
                {{ image.displayName || image.id }}
              </option>
            </select>
          </div>
          <button
            type="button"
            class="studio-image-view"
            :title="s.t('studio.enlarge')"
            @click="s.viewerImage.value = s.comparisonImage.value"
          >
            <img :src="s.comparisonImage.value.url" :alt="s.t('studio.original')" />
          </button>
          <figcaption>
            <span v-if="s.comparisonImage.value.width && s.comparisonImage.value.height">{{ s.comparisonImage.value.width }} × {{ s.comparisonImage.value.height }}</span>
            <span v-else>{{ s.comparisonImage.value.size }}</span>
            <span>{{ s.comparisonImage.value.model }}</span>
            <p>{{ s.comparisonImage.value.prompt }}</p>
          </figcaption>
        </figure>
        <figure class="studio-image-figure">
          <div v-if="s.comparing.value" class="studio-image-caption">
            {{ s.t("studio.current") }}
          </div>
          <button
            type="button"
            class="studio-image-view"
            :title="s.t('studio.enlarge')"
            @click="s.viewerImage.value = s.selectedImage.value"
          >
            <img
              :src="s.selectedImage.value.url"
              :alt="s.currentTask.value?.prompt || s.t('studio.current')"
            /><span class="studio-enlarge"><Maximize2 class="size-4" /></span>
          </button>
          <figcaption v-if="s.comparing.value">
            <span v-if="s.selectedImage.value.width && s.selectedImage.value.height">{{ s.selectedImage.value.width }} × {{ s.selectedImage.value.height }}</span>
            <span v-else>{{ s.selectedImage.value.size }}</span>
            <span>{{ s.currentTask.value?.params.model }}</span>
            <p>{{ s.currentTask.value?.prompt }}</p>
          </figcaption>
        </figure>
      </div>
      <div v-else class="studio-empty">
        <Loader2
          v-if="s.isRunning.value || s.loadingTask.value"
          class="size-8 animate-spin text-accent"
        /><Image v-else class="size-8 text-muted-foreground" />
        <p>
          {{
            s.currentTask.value ? s.t(`studio.${s.currentTask.value.phase}`) : s.t("studio.empty")
          }}
        </p>
      </div>
      <div v-if="s.currentTask.value?.status === 'failed'" class="studio-error" role="alert">
        <p>{{ s.currentTask.value.errorMessage || s.t("studio.failed") }}</p>
        <Button variant="secondary" :disabled="s.submitting.value" @click="s.retryCurrent">
          <RotateCcw class="size-4" />{{ s.t("studio.retryFailed") }}
        </Button>
      </div>
      <div
        v-if="s.images.value.length > 1"
        class="studio-filmstrip"
        :aria-label="s.t('studio.chooseImage')"
      >
        <button
          v-for="(image, index) in s.images.value"
          :key="image.id"
          type="button"
          :aria-pressed="s.selectedImage.value?.id === image.id"
          :aria-label="`${s.t('studio.chooseImage')} ${index + 1}`"
          @click="s.selectedImageId.value = image.id"
        >
          <img :src="image.url" :alt="`${index + 1}`" loading="lazy" />
        </button>
      </div>
      <div v-if="s.currentTask.value" class="studio-result-details">
        <div class="studio-result-actions">
          <Button
            type="button"
            variant="secondary"
            :disabled="s.submitting.value"
            @click="s.reuseCurrent(false)"
          >
            <SlidersHorizontal class="size-4" />{{ s.t("studio.reuse") }}
          </Button>
          <Button
            v-if="s.selectedImage.value"
            type="button"
            variant="secondary"
            :disabled="s.submitting.value"
            @click="s.reuseCurrent(true)"
          >
            <ImagePlus class="size-4" />{{ s.t("studio.reference") }}
          </Button>
          <a
            v-if="s.selectedImage.value"
            :href="s.selectedImage.value.url"
            :download="selectedDownload"
            class="studio-download"
            :aria-label="s.t('studio.download')"
            :title="s.t('studio.download')"
          ><Download class="size-4" /></a>
        </div>
        <div class="studio-task-meta">
          <span>{{
            s.currentTask.value.params.model || s.currentTask.value.params.generationTargetId
          }}</span><span>{{ s.currentTask.value.params.size }}</span><span>{{ s.currentTask.value.images.length }} / {{ s.currentTask.value.params.n }}</span>
        </div>
        <div class="studio-quota">
          <span>{{ s.t("studio.quotaPrecharged") }}
            <b>{{ s.currentTask.value.quota.precharged }}</b></span><span>{{ s.t("studio.quotaRefunded") }} <b>{{ s.currentTask.value.quota.refunded }}</b></span><span>{{ s.t(s.isRunning.value ? "studio.quotaHeld" : "studio.quotaConsumed") }}
            <b>{{ s.currentTask.value.quota.consumed }}</b></span>
        </div>
        <details class="studio-task-prompt">
          <summary>{{ s.t("studio.taskPrompt") }}</summary>
          <p>{{ s.currentTask.value.prompt }}</p>
        </details>
      </div>
      <div class="studio-recent">
        <div class="flex items-center justify-between gap-2">
          <h2>{{ s.t("studio.recent") }}</h2>
          <Button variant="ghost" size="sm" @click="s.activity.open = true">
            {{ s.t("studio.viewAll") }}<ArrowUpRight class="size-3.5" />
          </Button>
        </div>
        <div class="studio-recent-list">
          <button
            v-for="task in s.activity.items.slice(0, 6)"
            :key="task.id"
            class="studio-recent-task"
            type="button"
            :aria-pressed="s.currentTask.value?.id === task.id"
            @click="s.openTask(task)"
          >
            <img
              v-if="task.images[0]"
              :src="task.images[0].url"
              :alt="task.title"
              loading="lazy"
            /><span v-else class="studio-recent-placeholder"><Loader2
              v-if="task.status === 'queued' || task.status === 'running'"
              class="size-4 animate-spin"
            /><Image v-else class="size-4" /></span>
            <span class="min-w-0"><span class="studio-recent-prompt">{{ task.prompt }}</span><span class="text-xs text-muted-foreground">{{
              s.t(`studio.${task.phase}`)
            }}</span></span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-results {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.studio-results-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 3.0625rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
.studio-status-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}
.studio-status-dot--failed {
  background: var(--destructive);
}
.studio-results-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.studio-image-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 0.75rem;
  padding: 1.25rem;
}
.studio-image-stage--compare {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.studio-image-figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.studio-image-view {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 12rem;
  height: min(48dvh, 34rem);
  overflow: hidden;
  background: color-mix(in oklch, var(--muted), var(--background) 50%);
  border-radius: 6px;
}
.studio-image-view img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}
.studio-enlarge {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: grid;
  place-items: center;
  height: 2rem;
  width: 2rem;
  background: var(--card);
  border-radius: 4px;
}
.studio-image-caption {
  display: flex;
  align-items: center;
  min-height: 2.25rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
}
.studio-image-caption select {
  max-width: 100%;
  min-width: 0;
  width: 100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.375rem;
}
figcaption {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  padding-top: 0.5rem;
  overflow-wrap: anywhere;
}
figcaption p {
  margin-top: 0.25rem;
  line-height: 1.5;
}
.studio-filmstrip {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding: 0 1.25rem 1rem;
}
.studio-filmstrip button {
  flex: 0 0 4rem;
  height: 4rem;
  border: 2px solid transparent;
  border-radius: 6px;
  overflow: hidden;
}
.studio-filmstrip button[aria-pressed="true"] {
  border-color: var(--accent);
}
.studio-filmstrip img {
  height: 100%;
  width: 100%;
  object-fit: contain;
}
.studio-empty {
  display: flex;
  min-height: 20rem;
  height: min(48dvh, 34rem);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
  font-size: 0.8125rem;
}
.studio-empty-error {
  color: var(--destructive);
  max-width: 30rem;
  overflow-wrap: anywhere;
}
.studio-result-details {
  padding: 0 1.25rem 1.25rem;
}
.studio-result-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.studio-download {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.studio-task-meta,
.studio-quota {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.875rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.studio-quota b {
  color: var(--foreground);
  font-weight: 500;
}
.studio-task-prompt {
  margin-top: 0.875rem;
  font-size: 0.75rem;
}
.studio-task-prompt summary {
  cursor: pointer;
  color: var(--muted-foreground);
}
.studio-task-prompt p {
  padding-top: 0.5rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.studio-recent {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
.studio-recent h2 {
  font-size: 0.75rem;
  font-weight: 600;
}
.studio-recent-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
  gap: 0.25rem 0.75rem;
  margin-top: 0.5rem;
}
.studio-recent-task {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.5rem 0;
  text-align: left;
}
.studio-recent-task > img,
.studio-recent-placeholder {
  width: 2.75rem;
  height: 2.75rem;
  flex-shrink: 0;
  object-fit: contain;
  border-radius: 4px;
  background: var(--muted);
}
.studio-recent-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted-foreground);
}
.studio-recent-prompt {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
}
.studio-recent-task[aria-pressed="true"] .studio-recent-prompt {
  color: var(--accent);
}
.studio-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 1rem 1.25rem;
  padding: 0.75rem;
  border-left: 2px solid var(--destructive);
  font-size: 0.75rem;
  color: var(--destructive);
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .studio-image-stage {
    padding: 0.75rem;
    gap: 0.5rem;
  }
  .studio-image-stage--compare .studio-image-view {
    min-height: 8rem;
    height: 15rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: none;
  }
}
</style>
