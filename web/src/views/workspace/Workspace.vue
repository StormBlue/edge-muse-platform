<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import ChatMessage from "@/components/chat/ChatMessage.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import { apiFetch } from "@/api/client";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import {
  useSessionStore,
  type ImageAttachment,
  type Message,
  type SessionMode
} from "@/stores/session";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const sessions = useSessionStore();
const auth = useAuthStore();
const selectedImage = ref<ImageAttachment | null>(null);
const { status, connect } = useTaskWebSocket((payload) => {
  sessions.applyTaskEvent(payload);
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { type?: string }).type === "task.done"
  ) {
    auth.bootstrap();
  }
});

onMounted(async () => {
  await sessions.loadSessions();
  const routeSessionId =
    typeof route.params.sessionId === "string" ? route.params.sessionId : sessions.currentSessionId;
  if (routeSessionId) await sessions.loadMessages(routeSessionId);
});

watch(
  () => route.params.sessionId,
  async (id) => {
    if (typeof id === "string") await sessions.loadMessages(id);
  }
);

async function newSession() {
  const session = await sessions.createSession();
  await router.push(`/workspace/s/${session.id}`);
}

async function submit(input: {
  prompt: string;
  mode: SessionMode;
  size: string;
  n: number;
  files: File[];
}) {
  try {
    let referenceImageIds: string[] = [];
    if (input.files.length) {
      const form = new FormData();
      input.files.forEach((file) => form.append("files", file));
      const uploaded = await apiFetch<{ images: ImageAttachment[] }>("/uploads", {
        method: "POST",
        body: form
      });
      referenceImageIds = uploaded.images.map((image) => image.id);
    }
    const task = await sessions.generate({ ...input, referenceImageIds });
    connect(task.wsUrl);
    await router.replace(`/workspace/s/${task.sessionId}`);
  } catch (error) {
    const message =
      error && typeof error === "object" && "error" in error
        ? (error as { error: { message: string } }).error.message
        : "提交失败";
    toast.error(message);
  }
}

async function retry(message: Message) {
  if (!message.taskId) return;
  const body = await apiFetch<{ taskId: string }>(`/tasks/${message.taskId}/retry`, {
    method: "POST"
  });
  connect(`/ws/task/${body.taskId}`);
}
</script>

<template>
  <AppShell>
    <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside class="panel h-[calc(100vh-7.5rem)] overflow-hidden">
        <div class="flex items-center justify-between border-b border-border p-3">
          <h2 class="text-sm font-semibold">会话</h2>
          <button
            class="ui-button ui-button-primary h-8 px-3 text-xs"
            type="button"
            @click="newSession"
          >
            新会话
          </button>
        </div>
        <div class="thin-scrollbar h-full overflow-y-auto p-2">
          <RouterLink
            v-for="session in sessions.sessions"
            :key="session.id"
            :to="`/workspace/s/${session.id}`"
            class="block rounded-lg px-3 py-2 text-sm hover:bg-muted"
            :class="
              session.id === sessions.currentSessionId
                ? 'bg-muted font-semibold'
                : 'text-muted-foreground'
            "
          >
            <span class="block truncate">{{ session.title }}</span>
            <span class="text-xs">{{ new Date(session.lastMessageAt).toLocaleString() }}</span>
          </RouterLink>
        </div>
      </aside>

      <section class="flex h-[calc(100vh-7.5rem)] min-w-0 flex-col">
        <div class="mb-3 flex items-center justify-between">
          <div>
            <h1 class="text-lg font-semibold">{{ sessions.currentSession?.title ?? "工作台" }}</h1>
            <p class="text-xs text-muted-foreground">WebSocket: {{ status }}</p>
          </div>
          <div class="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {{
              auth.quota?.remainingQuota === null
                ? "无限配额"
                : `剩余 ${auth.quota?.remainingQuota ?? 0}`
            }}
          </div>
        </div>
        <div
          class="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-muted/40 p-4"
        >
          <div
            v-if="!sessions.messages.length"
            class="flex h-full items-center justify-center text-sm text-muted-foreground"
          >
            输入 Prompt 开始生成图片
          </div>
          <ChatMessage
            v-for="message in sessions.messages"
            :key="message.id"
            :message="message"
            @open="selectedImage = $event"
            @retry="retry"
          />
        </div>
        <div class="mt-3">
          <ChatInput :loading="sessions.loading" @submit="submit" />
        </div>
      </section>
    </div>
    <ImageViewer :image="selectedImage" @close="selectedImage = null" />
  </AppShell>
</template>
