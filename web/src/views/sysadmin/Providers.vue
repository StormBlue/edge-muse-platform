<script setup lang="ts">
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  supportedSizes: string[];
};
const items = ref<Provider[]>([]);
const form = ref({
  name: "Local Mock Provider",
  baseUrl: "mock:",
  defaultModel: "gpt-image-2",
  supportedSizes: ["1024x1024", "auto"],
  enabled: true
});

async function load() {
  items.value = (await apiFetch<{ items: Provider[] }>("/sysadmin/providers")).items;
}

async function create() {
  await apiFetch("/sysadmin/providers", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("服务商已创建");
  await load();
}

onMounted(load);
</script>

<template>
  <AppShell>
    <div class="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <form class="panel space-y-3 p-4" @submit.prevent="create">
        <h1 class="font-semibold">创建服务商</h1>
        <input v-model="form.name" class="ui-field h-10 px-3" placeholder="名称" />
        <input v-model="form.baseUrl" class="ui-field h-10 px-3" placeholder="Base URL" />
        <input v-model="form.defaultModel" class="ui-field h-10 px-3" placeholder="模型" />
        <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
      </form>
      <div class="grid gap-3 md:grid-cols-2">
        <article v-for="provider in items" :key="provider.id" class="panel p-4">
          <h2 class="font-semibold">{{ provider.name }}</h2>
          <p class="mt-1 break-all text-sm text-muted-foreground">{{ provider.baseUrl }}</p>
          <p class="mt-3 text-xs">
            {{ provider.defaultModel }} · {{ provider.enabled ? "启用" : "停用" }}
          </p>
        </article>
      </div>
    </div>
  </AppShell>
</template>
