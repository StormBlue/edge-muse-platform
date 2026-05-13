<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  direction: "previous" | "next";
  mobile?: boolean;
}>();
const emit = defineEmits<{ move: [] }>();

const { t } = useI18n();
</script>

<template>
  <button
    class="viewer-nav"
    :class="[
      mobile ? 'viewer-nav--mobile' : 'viewer-nav--desktop',
      direction === 'previous' ? 'viewer-nav--previous' : 'viewer-nav--next'
    ]"
    type="button"
    :title="t(direction === 'previous' ? 'viewer.previousImage' : 'viewer.nextImage')"
    @click="emit('move')"
  >
    <ChevronLeft v-if="props.direction === 'previous'" class="h-6 w-6" />
    <ChevronRight v-else class="h-6 w-6" />
  </button>
</template>

<style scoped>
.viewer-nav {
  position: absolute;
  z-index: 1;
  display: inline-flex;
  height: 3rem;
  width: 3rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.12);
  color: white;
}

.viewer-nav--previous {
  left: 1rem;
}

.viewer-nav--next {
  right: 1rem;
}

.viewer-nav--mobile {
  display: none;
}

@media (max-width: 640px) {
  .viewer-nav {
    position: fixed;
    top: calc(50dvh + 1.25rem);
    z-index: 60;
    height: 2.5rem;
    width: 2.5rem;
    background: rgb(255 255 255 / 0.2);
    box-shadow: 0 10px 28px rgb(0 0 0 / 0.32);
  }

  .viewer-nav--desktop {
    display: none;
  }

  .viewer-nav--mobile {
    display: inline-flex;
  }

  .viewer-nav--previous {
    left: max(0.75rem, env(safe-area-inset-left));
  }

  .viewer-nav--next {
    right: max(0.75rem, env(safe-area-inset-right));
  }
}
</style>
