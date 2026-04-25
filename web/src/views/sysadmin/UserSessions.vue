<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";
import type { Message, Session } from "@/stores/session";

const route = useRoute();
const initialUserId = typeof route.params.userId === "string" ? route.params.userId : "";
const userId = ref(initialUserId === "_" ? "" : initialUserId);
const sessions = ref<Session[]>([]);
const messages = ref<Message[]>([]);
const selectedSessionId = ref("");

async function loadSessions() {
  if (!userId.value.trim()) return;
  const body = await apiFetch<{ items: Session[] }>(
    `/sysadmin/users/${encodeURIComponent(userId.value.trim())}/sessions`
  );
  sessions.value = body.items;
  messages.value = [];
  selectedSessionId.value = "";
}

async function loadMessages(sessionId: string) {
  selectedSessionId.value = sessionId;
  const body = await apiFetch<{ items: Message[] }>(`/sysadmin/sessions/${sessionId}/messages`);
  messages.value = body.items;
}

onMounted(() => {
  if (userId.value) loadSessions();
});
</script>

<template>
  <AppShell>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">用户会话查看</h1>
      <form class="flex gap-2" @submit.prevent="loadSessions">
        <input v-model="userId" class="ui-field h-10 w-80 px-3" placeholder="用户 ID" />
        <button class="ui-button ui-button-primary" type="submit">加载</button>
      </form>
    </div>
    <div class="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside class="panel max-h-[calc(100vh-10rem)] overflow-auto p-2">
        <button
          v-for="session in sessions"
          :key="session.id"
          class="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
          :class="selectedSessionId === session.id ? 'bg-muted font-semibold' : ''"
          type="button"
          @click="loadMessages(session.id)"
        >
          <span class="block truncate">{{ session.title }}</span>
          <span class="text-xs text-muted-foreground">
            {{ new Date(session.lastMessageAt).toLocaleString() }}
          </span>
        </button>
      </aside>
      <section class="panel max-h-[calc(100vh-10rem)] overflow-auto p-4">
        <article v-for="message in messages" :key="message.id" class="border-b border-border py-3">
          <p class="text-xs uppercase text-muted-foreground">{{ message.role }}</p>
          <p class="mt-1 whitespace-pre-wrap text-sm">{{ message.prompt }}</p>
          <div v-if="message.attachments?.length" class="mt-2 grid grid-cols-3 gap-2">
            <img
              v-for="image in message.attachments"
              :key="image.id"
              class="aspect-square rounded-lg object-cover"
              :src="image.url"
              alt=""
            />
          </div>
        </article>
      </section>
    </div>
  </AppShell>
</template>
