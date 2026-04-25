<script setup lang="ts">
import type { ImageAttachment } from "@/stores/session";

defineProps<{
  images: ImageAttachment[];
}>();
const emit = defineEmits<{ open: [image: ImageAttachment] }>();
</script>

<template>
  <div
    class="grid gap-2"
    :class="images.length === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'"
  >
    <button
      v-for="image in images"
      :key="image.id"
      class="aspect-square overflow-hidden rounded-lg border border-border bg-muted"
      type="button"
      @click="emit('open', image)"
    >
      <img class="h-full w-full object-cover" :src="image.url" alt="" loading="lazy" />
    </button>
  </div>
</template>
