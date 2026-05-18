<script setup lang="ts">
/**
 * 案例缩略图。
 *
 * 远程素材可能过期或本地无法访问，组件内统一处理加载失败，避免卡片出现浏览器破图。
 */
import { ref, watch } from "vue";
import { ImageOff } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    src: string | null;
    alt: string;
    iconClass?: string;
    fit?: "contain" | "cover";
  }>(),
  { iconClass: "h-6 w-6", fit: "contain" }
);

const failed = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
  }
);
</script>

<template>
  <div class="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
    <img
      v-if="src && !failed"
      :class="['h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain']"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <ImageOff v-else :class="iconClass" />
  </div>
</template>
