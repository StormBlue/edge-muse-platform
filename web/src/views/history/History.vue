<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";
import type { Session } from "@/stores/session";

const items = ref<Session[]>([]);
const q = ref("");

async function load() {
  const body = await apiFetch<{ items: Session[] }>(
    `/history${q.value ? `?q=${encodeURIComponent(q.value)}` : ""}`
  );
  items.value = body.items;
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-5 flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">历史</h1>
      <input
        v-model="q"
        class="ui-field h-10 max-w-xs px-3"
        placeholder="搜索标题或 Prompt"
        @keyup.enter="load"
      />
    </div>
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="session in items"
        :key="session.id"
        class="panel block p-4 hover:bg-muted/40"
        :to="`/workspace/s/${session.id}`"
      >
        <div class="mb-3 aspect-video rounded-lg bg-muted"></div>
        <h2 class="font-semibold">{{ session.title }}</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ new Date(session.lastMessageAt).toLocaleString() }}
        </p>
      </RouterLink>
    </div>
  </AppShell>
</template>
