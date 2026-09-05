<script setup lang="ts">
/**
 * 个人资料：改昵称。通过 Pinia `auth.updateProfile` 调 PATCH /api/me，与 session 中展示名、审计一致。
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import SettingsLayout from "./SettingsLayout.vue";
import { useSettingsSave } from "./useSettingsSave";

const auth = useAuthStore();
const nickname = ref(auth.user?.nickname ?? "");
const { t } = useI18n();
const { saving, error, success, save: saveSettings } = useSettingsSave();

/** 以当前输入覆盖服务端昵称并刷新 store */
async function save() {
  if (!nickname.value.length || nickname.value.length > 40) return;
  await saveSettings(() => auth.updateProfile(nickname.value), "settings.saved");
}
</script>

<template>
  <SettingsLayout :title="t('settings.profileTitle')">
    <form class="space-y-4" :aria-busy="saving" @submit.prevent="save">
      <label for="settings-nickname" class="block text-sm font-medium">{{
        t("auth.nickname")
      }}</label>
      <Input
        id="settings-nickname"
        v-model="nickname"
        name="nickname"
        autocomplete="nickname"
        class="h-11 px-3"
        required
        maxlength="40"
        :disabled="saving"
      />
      <p v-if="error" role="alert" class="break-words text-sm text-destructive">{{ error }}</p>
      <p role="status" class="text-sm text-muted-foreground">{{ success }}</p>
      <Button type="submit" class="min-h-11" :disabled="saving">
        <Loader2 v-if="saving" class="h-4 w-4 animate-spin" aria-hidden="true" />
        {{ t("common.save") }}
      </Button>
    </form>
  </SettingsLayout>
</template>
