<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";
import type { Session } from "@/stores/session";

type HistorySession = Session & { taskCount?: number };

const items = ref<HistorySession[]>([]);
const q = ref("");
const order = ref<"recent" | "oldest" | "task_count">("recent");

async function load() {
  const params = new URLSearchParams({ order: order.value });
  if (q.value) params.set("q", q.value);
  const body = await apiFetch<{ items: HistorySession[] }>(`/history?${params.toString()}`);
  items.value = body.items;
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">历史</h1>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="order" class="ui-field h-10 w-36 px-3 text-sm" @change="load">
          <option value="recent">最近</option>
          <option value="oldest">最早</option>
          <option value="task_count">任务最多</option>
        </select>
        <input
          v-model="q"
          class="ui-field h-10 max-w-xs px-3"
          placeholder="搜索标题或 Prompt"
          @keyup.enter="load"
        />
        <button class="ui-button ui-button-secondary" type="button" @click="load">搜索</button>
      </div>
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
        <p class="mt-3 text-xs text-muted-foreground">{{ session.taskCount ?? 0 }} 个任务</p>
      </RouterLink>
    </div>
  </AppShell>
</template>
