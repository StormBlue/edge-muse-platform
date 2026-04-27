<script setup lang="ts">
/**
 * 系统管理员个人偏好：将「默认用于生图的 API 密钥」写入用户行（`preferredProviderKeyId`），
 * 与运行时 `resolveProviderKey` 的优先顺序相关；仅列 enabled 的密钥。
 */
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";
import { useAuthStore } from "@/stores/auth";

/** 下拉候选项；与全局密钥表一致，仅作展示用 hint */
type ProviderKeyRow = {
  id: string;
  label: string;
  keyHint: string;
  enabled: boolean;
};

const auth = useAuthStore();
const { t } = useI18n();
const keys = ref<ProviderKeyRow[]>([]);
/** 可空：空串表示不指定，走服务端其它默认 */
const preferredProviderKeyId = ref("");

/** 拉密钥列表并同步当前用户已保存的偏好 */
async function load() {
  const body = await apiFetch<{ items: ProviderKeyRow[] }>("/sysadmin/provider-keys");
  keys.value = body.items.filter((key) => key.enabled);
  preferredProviderKeyId.value = auth.user?.preferredProviderKeyId ?? "";
}

/** PATCH 后 bootstrap 以刷新顶栏/配额等依赖 user 的展示 */
async function save() {
  await apiFetch("/sysadmin/preferences", {
    method: "PATCH",
    body: JSON.stringify({ preferredProviderKeyId: preferredProviderKeyId.value })
  });
  await auth.bootstrap();
  toast.success(t("sysadmin.preferencesSaved"));
}

onMounted(load);
</script>

<template>
  <AppShell>
    <form class="panel max-w-lg space-y-4 p-5" @submit.prevent="save">
      <div>
        <h1 class="text-xl font-semibold">{{ t("sysadmin.preferencesTitle") }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t("sysadmin.preferencesDescription") }}
        </p>
      </div>
      <select v-model="preferredProviderKeyId" class="ui-field h-10 px-3">
        <option value="">{{ t("sysadmin.selectKey") }}</option>
        <option v-for="key in keys" :key="key.id" :value="key.id">
          {{ key.label }} ({{ key.keyHint }})
        </option>
      </select>
      <button class="ui-button ui-button-primary" type="submit">{{ t("common.save") }}</button>
    </form>
  </AppShell>
</template>
