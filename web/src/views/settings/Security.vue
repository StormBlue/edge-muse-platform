<script setup lang="ts">
/**
 * 安全设置：修改登录密码。依赖已登录态 Cookie，旧密码在服务端与 bcrypt 摘要比对，成功后写新摘要。
 * 不在这里处理「忘记密码」；修改成功后本地清空输入框防肩窥。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/api/client";
import SettingsLayout from "./SettingsLayout.vue";
import { useSettingsSave } from "./useSettingsSave";

const oldPassword = ref("");
const newPassword = ref("");
const { t } = useI18n();
const { saving, error, success, save: saveSettings } = useSettingsSave();

/** POST 成功后清空输入，降低误提交与屏幕残留风险 */
async function save() {
  if (!oldPassword.value.length || newPassword.value.length < 8) return;
  await saveSettings(async () => {
    await apiFetch("/auth/password/change", {
      method: "POST",
      body: JSON.stringify({ oldPassword: oldPassword.value, newPassword: newPassword.value })
    });
    oldPassword.value = "";
    newPassword.value = "";
  }, "settings.passwordChanged");
}
</script>

<template>
  <SettingsLayout :title="t('settings.securityTitle')">
    <form class="space-y-4" :aria-busy="saving" @submit.prevent="save">
      <label for="settings-old-password" class="block text-sm font-medium">{{
        t("settings.oldPassword")
      }}</label>
      <Input
        id="settings-old-password"
        v-model="oldPassword"
        name="oldPassword"
        autocomplete="current-password"
        required
        :disabled="saving"
        class="h-11 px-3"
        :placeholder="t('settings.oldPassword')"
        type="password"
      />
      <label for="settings-new-password" class="block text-sm font-medium">{{
        t("settings.newPassword")
      }}</label>
      <Input
        id="settings-new-password"
        v-model="newPassword"
        name="newPassword"
        autocomplete="new-password"
        required
        minlength="8"
        :disabled="saving"
        class="h-11 px-3"
        :placeholder="t('settings.newPassword')"
        type="password"
      />
      <p v-if="error" role="alert" class="break-words text-sm text-destructive">{{ error }}</p>
      <p role="status" class="text-sm text-muted-foreground">{{ success }}</p>
      <Button type="submit" class="min-h-11" :disabled="saving">
        <Loader2 v-if="saving" class="h-4 w-4 animate-spin" aria-hidden="true" />
        {{ t("settings.changePassword") }}
      </Button>
    </form>
  </SettingsLayout>
</template>
