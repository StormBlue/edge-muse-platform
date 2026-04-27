<script setup lang="ts">
/**
 * 安全设置：修改登录密码。依赖已登录态 Cookie，旧密码在服务端与 bcrypt 摘要比对，成功后写新摘要。
 * 不在这里处理「忘记密码」；修改成功后本地清空输入框防肩窥。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

const oldPassword = ref("");
const newPassword = ref("");
const { t } = useI18n();

/** POST 成功后清空输入，降低误提交与屏幕残留风险 */
async function save() {
  await apiFetch("/auth/password/change", {
    method: "POST",
    body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPassword.value })
  });
  toast.success(t("settings.passwordChanged"));
  oldPassword.value = "";
  newPassword.value = "";
}
</script>

<template>
  <AppShell>
    <div class="max-w-xl">
      <h1 class="mb-4 text-xl font-semibold">{{ t("settings.securityTitle") }}</h1>
      <form class="panel space-y-4 p-5" @submit.prevent="save">
        <input
          v-model="oldPassword"
          class="ui-field h-11 px-3"
          :placeholder="t('settings.oldPassword')"
          type="password"
        />
        <input
          v-model="newPassword"
          class="ui-field h-11 px-3"
          :placeholder="t('settings.newPassword')"
          type="password"
        />
        <button class="ui-button ui-button-primary" type="submit">
          {{ t("settings.changePassword") }}
        </button>
      </form>
    </div>
  </AppShell>
</template>
