<script setup lang="ts">
/** 常驻创作器：输入与结果共享一次页面状态，案例和助手作为按需工具。 */
import { LayoutGrid, Plus } from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { Button } from "@/components/ui/button";
import StudioEditor from "./StudioEditor.vue";
import StudioResults from "./StudioResults.vue";
import StudioCasePicker from "./StudioCasePicker.vue";
import { useImageStudio } from "./useImageStudio";
import { provideImageStudio } from "./studioContext";

const s = useImageStudio();
provideImageStudio(s);
</script>

<template>
  <AppShell>
    <div class="image-studio" :class="`image-studio--${s.mobileTab.value}`">
      <header class="image-studio-header">
        <div class="min-w-0">
          <h1>{{ s.t("studio.title") }}</h1>
          <p v-if="s.activeCase.value" class="image-studio-context">
            {{ s.activeCase.value.title }}
          </p>
        </div>
        <div class="image-studio-tools">
          <Button
            type="button"
            variant="secondary"
            :disabled="s.submitting.value"
            @click="s.openCases"
          >
            <LayoutGrid class="size-4" /><span>{{ s.t("studio.cases") }}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            :disabled="s.submitting.value"
            :title="s.t('studio.new')"
            :aria-label="s.t('studio.new')"
            @click="s.newCreation"
          >
            <Plus class="size-4" />
          </Button>
        </div>
      </header>
      <nav class="image-studio-mobile-tabs" :aria-label="s.t('studio.title')">
        <button
          type="button"
          :aria-pressed="s.mobileTab.value === 'create'"
          @click="s.mobileTab.value = 'create'"
        >
          {{ s.t("studio.create") }}
        </button>
        <button
          type="button"
          :aria-pressed="s.mobileTab.value === 'results'"
          @click="s.mobileTab.value = 'results'"
        >
          {{ s.t("studio.results") }}<span v-if="s.isRunning.value" class="image-studio-running" />
        </button>
      </nav>
      <div class="image-studio-body"><StudioEditor /><StudioResults /></div>
      <StudioCasePicker />
      <ImageViewer
        :can-delete="false"
        :image="s.viewerImage.value"
        :images="s.images.value"
        @close="s.viewerImage.value = null"
        @select="s.viewerImage.value = $event"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.image-studio {
  display: flex;
  min-width: 0;
  height: calc(100dvh - 10.5rem - env(safe-area-inset-bottom, 0px));
  min-height: 20rem;
  flex-direction: column;
  container: studio / inline-size;
}
.image-studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.375rem 0.125rem 1rem;
}
.image-studio-header h1 {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
}
.image-studio-context {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
}
.image-studio-tools {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.image-studio-body {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr);
  border-top: 1px solid var(--border);
}
.image-studio-mobile-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  padding: 0.25rem;
  background: var(--muted);
  border-radius: 6px;
}
.image-studio-mobile-tabs button {
  min-height: 2.25rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  border-radius: 4px;
  font-size: 0.8125rem;
}
.image-studio-mobile-tabs button[aria-pressed="true"] {
  background: var(--card);
  font-weight: 600;
}
.image-studio-running {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--accent);
}
.image-studio--create :deep(.studio-results) {
  display: none;
}
.image-studio--results :deep(.studio-editor) {
  display: none;
}
@container app-content (min-width: 52rem) {
  .image-studio {
    height: calc(100dvh - 6.25rem);
    min-height: 0;
  }
  .image-studio-mobile-tabs {
    display: none;
  }
  .image-studio-body {
    grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr);
    overflow: hidden;
  }
  .image-studio :deep(.studio-editor),
  .image-studio :deep(.studio-results) {
    display: flex;
  }
  .image-studio :deep(.studio-editor) {
    border-right: 1px solid var(--border);
  }
}
@container app-content (min-width: 90rem) {
  .image-studio-body {
    grid-template-columns: 27rem minmax(0, 1fr);
  }
}
@media (max-width: 390px) {
  .image-studio-header h1 {
    font-size: 1rem;
  }
  .image-studio-tools {
    gap: 0.125rem;
  }
  .image-studio-tools :deep(button) {
    padding-inline: 0.5rem;
    font-size: 0.75rem;
  }
}
</style>
