<script setup lang="ts">
/**
 * AI 助手聊天历史区。
 *
 * 独立处理消息展示和自动滚动，避免主面板混入纯展示细节。
 */
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AssistantMessage } from "./promptAssistantTypes";

const props = defineProps<{
  messages: AssistantMessage[];
  loading: boolean;
}>();

const { t } = useI18n();
const chatEndRef = ref<HTMLElement | null>(null);

watch(
  () => [props.messages.length, props.loading],
  () => {
    void nextTick(() => chatEndRef.value?.scrollIntoView({ block: "end" }));
  }
);
</script>

<template>
  <div
    class="prompt-assistant-messages thin-scrollbar max-h-72 space-y-3 overflow-y-auto p-3"
    aria-live="polite"
  >
    <div v-if="!messages.length" class="flex justify-start">
      <div class="max-w-[88%] rounded-lg rounded-tl-sm bg-muted px-3 py-2">
        <p class="mb-1 text-xs font-medium text-muted-foreground">
          {{ t("aiImage.assistantAiLabel") }}
        </p>
        <p class="text-sm leading-6">{{ t("aiImage.assistantEmpty") }}</p>
      </div>
    </div>

    <div
      v-for="(message, index) in messages"
      :key="`${message.role}-${index}`"
      class="flex"
      :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <div
        class="max-w-[88%] rounded-lg px-3 py-2 shadow-sm"
        :class="
          message.role === 'user'
            ? 'rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-tl-sm bg-muted'
        "
      >
        <p
          class="mb-1 text-xs font-medium"
          :class="message.role === 'user' ? 'text-primary-foreground/75' : 'text-muted-foreground'"
        >
          {{
            message.role === "user"
              ? t("aiImage.assistantUserLabel")
              : t("aiImage.assistantAiLabel")
          }}
        </p>
        <p class="whitespace-pre-wrap break-words text-sm leading-6">{{ message.content }}</p>
      </div>
    </div>

    <div v-if="loading" class="flex justify-start">
      <div class="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
        {{ t("aiImage.assistantThinking") }}
      </div>
    </div>
    <div ref="chatEndRef" />
  </div>
</template>
