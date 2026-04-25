<script setup lang="ts">
import { Download, X } from "lucide-vue-next";
import type { ImageAttachment } from "@/stores/session";

defineProps<{ image: ImageAttachment | null }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div
    v-if="image"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
    @click.self="emit('close')"
  >
    <button
      class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
      type="button"
      @click="emit('close')"
    >
      <X class="h-5 w-5" />
    </button>
    <img class="max-h-[86vh] max-w-[92vw] rounded-lg object-contain" :src="image.url" alt="" />
    <a
      class="absolute bottom-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
      :href="image.url"
      download
    >
      <Download class="mr-2 inline h-4 w-4" />
      下载原图
    </a>
  </div>
</template>
