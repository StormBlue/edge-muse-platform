<script setup lang="ts">
/**
 * 单条消息气泡：用户右对齐 / 助手左对齐。
 * - 生成中：`queued`/`running` 显示假进度（无 WS 进度时用 6%/28% 占位）与文案；
 * - 有附件：`ImageMessage` 缩略栅格，点击 emit `open`；
 * - 失败：根据 error.code 是否 PROVIDER* 切换标题，emit `retry` 由父组件重放任务。
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ImageOff, Loader2, RotateCw } from "@lucide/vue";
import ImageMessage from "./ImageMessage.vue";
import type { ImageAttachment, Message } from "@/stores/session";

const props = defineProps<{
  message: Message;
}>();
const emit = defineEmits<{ open: [image: ImageAttachment]; retry: [message: Message] }>();
const { t } = useI18n();

const isGenerating = computed(
  () => props.message.status === "queued" || props.message.status === "running"
);
/**
 * 条宽百分比：优先用 `message.progress`（0~1）；否则 queued 给 6%、running 给 28% 避免条全空
 */
const generationProgress = computed(() => {
  if (typeof props.message.progress === "number") {
    return Math.min(99, Math.max(6, Math.round(props.message.progress * 100)));
  }
  return props.message.status === "queued" ? 6 : 28;
});
const generationStatus = computed(() =>
  props.message.status === "queued" ? t("common.queued") : t("workspace.generationRunning")
);
const isFailed = computed(() => props.message.status === "failed");
const failureTitle = computed(() =>
  props.message.error?.code?.startsWith("PROVIDER")
    ? t("workspace.providerGenerationFailed")
    : t("workspace.generationFailed")
);
const failureMessage = computed(
  () => props.message.error?.message || t("workspace.generationFailedHint")
);
</script>

<template>
  <article
    class="chat-message-row flex"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div
      class="max-w-[86%] rounded-2xl px-4 py-3 text-sm shadow-sm"
      :class="
        message.role === 'user'
          ? 'rounded-br-md bg-primary text-white'
          : 'rounded-bl-md border border-border bg-card text-foreground'
      "
    >
      <p v-if="message.prompt" class="whitespace-pre-wrap leading-6">{{ message.prompt }}</p>
      <div
        v-if="isGenerating"
        class="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-foreground"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Loader2 class="h-4 w-4 animate-spin" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <span class="font-semibold">{{ generationStatus }}</span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ t("workspace.generationProgress", { percent: generationProgress }) }}
              </span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
              <div
                class="h-full rounded-full bg-primary transition-all duration-500"
                :style="{ width: `${generationProgress}%` }"
              ></div>
            </div>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ t("workspace.generationHint") }}
            </p>
          </div>
        </div>
      </div>
      <ImageMessage
        v-if="message.attachments?.length"
        class="mt-3"
        :images="message.attachments"
        @open="emit('open', $event)"
      />
      <div
        v-if="isFailed"
        class="mt-3 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5"
      >
        <div class="flex aspect-[4/3] min-h-44 items-center justify-center p-4 text-center">
          <div class="flex max-w-xs flex-col items-center gap-3">
            <span
              class="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <ImageOff class="h-6 w-6" />
            </span>
            <div>
              <p class="font-semibold text-foreground">{{ failureTitle }}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {{ failureMessage }}
              </p>
            </div>
            <button
              class="ui-button ui-button-secondary h-8 border-destructive/30 text-destructive"
              type="button"
              @click="emit('retry', message)"
            >
              <RotateCw class="h-3.5 w-3.5" />
              {{ t("common.retry") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* 长列表性能：视口外气泡略过绘制，预留高度减布局抖动 */
.chat-message-row {
  content-visibility: auto;
  contain-intrinsic-size: 9rem;
}
</style>
