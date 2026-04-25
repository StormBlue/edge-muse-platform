<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="text-center">
      <h1 class="text-3xl font-semibold">403</h1>
      <p class="mt-2 text-muted-foreground">{{ t("errors.forbidden") }}</p>
      <RouterLink class="ui-button ui-button-primary mt-5" to="/workspace">
        {{ t("errors.backToWorkspace") }}
      </RouterLink>
    </div>
  </main>
</template>
