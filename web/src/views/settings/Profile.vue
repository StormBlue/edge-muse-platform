<script setup lang="ts">
/**
 * 个人资料：改昵称。通过 Pinia `auth.updateProfile` 调 PATCH /api/me，与 session 中展示名、审计一致。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const nickname = ref(auth.user?.nickname ?? "");
const { t } = useI18n();

/** 以当前输入覆盖服务端昵称并刷新 store */
async function save() {
  await auth.updateProfile(nickname.value);
  toast.success(t("settings.saved"));
}
</script>

<template>
  <AppShell>
    <div class="max-w-xl">
      <h1 class="mb-4 text-xl font-semibold">{{ t("settings.profileTitle") }}</h1>
      <form class="panel space-y-4 p-5" @submit.prevent="save">
        <label class="block text-sm font-medium">{{ t("auth.nickname") }}</label>
        <input v-model="nickname" class="ui-field h-11 px-3" />
        <button class="ui-button ui-button-primary" type="submit">{{ t("common.save") }}</button>
      </form>
    </div>
  </AppShell>
</template>
