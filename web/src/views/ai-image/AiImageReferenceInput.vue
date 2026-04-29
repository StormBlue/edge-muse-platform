<script setup lang="ts">
import { ref } from "vue";
import { ImagePlus, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { imageFilesFromDataTransfer, imageFilesFromFileList } from "@/utils/referenceImageFiles";

type PreviewImage = {
  file: File;
  url: string;
};

const description = defineModel<string>("description", { required: true });

const props = defineProps<{
  canAcceptFiles: boolean;
  previews: PreviewImage[];
}>();

const emit = defineEmits<{
  addFiles: [files: File[]];
  removeFile: [index: number];
}>();

const { t } = useI18n();
const dragging = ref(false);

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  addReferenceFiles(imageFilesFromFileList(input.files));
  input.value = "";
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  addReferenceFiles(imageFilesFromDataTransfer(event.dataTransfer));
}

function addReferenceFiles(files: File[]) {
  if (!props.canAcceptFiles || !files.length) return;
  emit("addFiles", files);
}
</script>

<template>
  <div class="space-y-3">
    <label class="block">
      <span class="mb-2 block text-xs font-medium text-muted-foreground">
        {{ t("aiImage.referenceDescriptionLabel") }}
      </span>
      <textarea
        v-model="description"
        class="ui-field min-h-24 resize-none p-3 text-sm leading-6"
        :placeholder="t('aiImage.referenceDescriptionPlaceholder')"
      />
      <span class="mt-1 block text-xs leading-5 text-muted-foreground">
        {{ t("aiImage.referenceDescriptionHint") }}
      </span>
    </label>

    <label
      class="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center text-sm font-semibold transition"
      :class="
        dragging
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground'
      "
      tabindex="0"
      @dragenter.prevent="canAcceptFiles && (dragging = true)"
      @dragover.prevent="canAcceptFiles && (dragging = true)"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <ImagePlus class="h-5 w-5" />
      <span>{{ t("workspace.addReferenceImage") }}</span>
      <span class="text-xs font-normal">{{ t("workspace.referenceImageInputHint") }}</span>
      <input
        class="hidden"
        accept="image/png,image/jpeg,image/webp"
        multiple
        type="file"
        @change="onFiles"
      />
    </label>

    <div v-if="previews.length" class="grid grid-cols-3 gap-2">
      <div
        v-for="(preview, index) in previews"
        :key="preview.url"
        class="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      >
        <img class="h-full w-full object-cover" :src="preview.url" alt="" />
        <button
          class="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white"
          type="button"
          @click="emit('removeFile', index)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
