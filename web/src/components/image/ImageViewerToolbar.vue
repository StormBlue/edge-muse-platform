<script setup lang="ts">
import { Copy, Download, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from "@lucide/vue";
import { useI18n } from "vue-i18n";

defineProps<{
  canCopyPrompt: boolean;
  canDelete: boolean;
  downloadFileName: string;
  downloadUrl: string;
}>();
const emit = defineEmits<{
  close: [];
  copyPrompt: [];
  delete: [];
  resetZoom: [];
  zoomIn: [];
  zoomOut: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="image-viewer-toolbar flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 sm:px-4"
  >
    <button
      class="viewer-button"
      type="button"
      :title="t('viewer.zoomOut')"
      @click="emit('zoomOut')"
    >
      <ZoomOut class="h-4 w-4" />
    </button>
    <button
      class="viewer-button"
      type="button"
      :title="t('viewer.resetZoom')"
      @click="emit('resetZoom')"
    >
      <RotateCcw class="h-4 w-4" />
    </button>
    <button class="viewer-button" type="button" :title="t('viewer.zoomIn')" @click="emit('zoomIn')">
      <ZoomIn class="h-4 w-4" />
    </button>
    <button
      class="viewer-button"
      type="button"
      :title="t('viewer.copyPrompt')"
      :disabled="!canCopyPrompt"
      @click="emit('copyPrompt')"
    >
      <Copy class="h-4 w-4" />
    </button>
    <a
      class="viewer-button"
      :href="downloadUrl"
      :download="downloadFileName"
      :title="t('viewer.download')"
    >
      <Download class="h-4 w-4" />
    </a>
    <button
      class="viewer-button"
      type="button"
      :title="t('viewer.deleteMessage')"
      :disabled="!canDelete"
      @click="emit('delete')"
    >
      <Trash2 class="h-4 w-4" />
    </button>
    <button class="viewer-button" type="button" :title="t('viewer.close')" @click="emit('close')">
      <X class="h-4 w-4" />
    </button>
  </div>
</template>

<style scoped>
.viewer-button {
  display: inline-flex;
  height: 2.25rem;
  width: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.1);
  color: white;
}

.viewer-button:hover {
  background: rgb(255 255 255 / 0.18);
}

@media (max-width: 640px) {
  .image-viewer-toolbar {
    max-width: 8.75rem;
  }

  .viewer-button {
    height: 2rem;
    width: 2rem;
  }
}
</style>
