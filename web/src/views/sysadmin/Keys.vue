<script setup lang="ts">
import { onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

type KeyRow = {
  id: string;
  providerId: string;
  label: string;
  keyHint: string;
  enabled: boolean;
  allocatedQuota: number | null;
  usedQuota: number;
};
const keys = ref<KeyRow[]>([]);
const form = ref({
  providerId: "",
  label: "",
  apiKey: "",
  allocatedQuota: null as number | null,
  enabled: true
});

async function load() {
  keys.value = (await apiFetch<{ items: KeyRow[] }>("/sysadmin/provider-keys")).items;
}

async function create() {
  await apiFetch("/sysadmin/provider-keys", { method: "POST", body: JSON.stringify(form.value) });
  toast.success("密钥已创建");
  form.value.apiKey = "";
  await load();
}
onMounted(load);
</script>

<template>
  <AppShell>
    <div class="grid gap-4 lg:grid-cols-[24rem_1fr]">
      <form class="panel space-y-3 p-4" @submit.prevent="create">
        <h1 class="font-semibold">创建密钥</h1>
        <input v-model="form.providerId" class="ui-field h-10 px-3" placeholder="Provider ID" />
        <input v-model="form.label" class="ui-field h-10 px-3" placeholder="标签" />
        <input
          v-model="form.apiKey"
          class="ui-field h-10 px-3"
          placeholder="API Key"
          type="password"
        />
        <button class="ui-button ui-button-primary w-full" type="submit">创建</button>
      </form>
      <div class="panel overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-muted text-left text-muted-foreground">
            <tr>
              <th class="p-3">标签</th>
              <th class="p-3">末4位</th>
              <th class="p-3">配额</th>
              <th class="p-3">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="key in keys" :key="key.id" class="border-t border-border">
              <td class="p-3">{{ key.label }}</td>
              <td class="p-3 font-mono">{{ key.keyHint }}</td>
              <td class="p-3">{{ key.usedQuota }} / {{ key.allocatedQuota ?? "∞" }}</td>
              <td class="p-3">{{ key.enabled ? "启用" : "停用" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
