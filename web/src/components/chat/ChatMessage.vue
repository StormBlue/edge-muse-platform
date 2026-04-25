<script setup lang="ts">
import { Loader2, RotateCw } from "lucide-vue-next";
import ImageMessage from "./ImageMessage.vue";
import type { ImageAttachment, Message } from "@/stores/session";

defineProps<{
  message: Message;
}>();
const emit = defineEmits<{ open: [image: ImageAttachment]; retry: [message: Message] }>();
</script>

<template>
  <article class="flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
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
        v-if="message.status === 'queued' || message.status === 'running'"
        class="mt-3 flex items-center gap-2 text-muted-foreground"
      >
        <Loader2 class="h-4 w-4 animate-spin" />
        正在生成
      </div>
      <ImageMessage
        v-if="message.attachments?.length"
        class="mt-3"
        :images="message.attachments"
        @open="emit('open', $event)"
      />
      <div v-if="message.status === 'failed'" class="mt-3 flex items-center gap-2 text-destructive">
        <span>生成失败</span>
        <button
          class="ui-button ui-button-secondary h-8"
          type="button"
          @click="emit('retry', message)"
        >
          <RotateCw class="h-3.5 w-3.5" />
          重试
        </button>
      </div>
    </div>
  </article>
</template>
