<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import { apiFetch } from "@/api/client";

const oldPassword = ref("");
const newPassword = ref("");
const { t } = useI18n();

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
