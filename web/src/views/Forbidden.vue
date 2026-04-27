<script setup lang="ts">
/**
 * 403：路由 `meta.role` 与当前用户角色不匹配时由 `router.beforeEach` 重定向至此。
 * 使用与登录页一致的 ScrollArea + 全高居中，避免无 AppShell 时布局跳变。
 */
import { useI18n } from "vue-i18n";
import { ScrollArea } from "@/components/ui/scroll-area";

const { t } = useI18n();
</script>

<template>
  <ScrollArea class="h-dvh bg-background">
    <main class="flex min-h-dvh items-center justify-center bg-background">
      <div class="text-center">
        <h1 class="text-3xl font-semibold">403</h1>
        <p class="mt-2 text-muted-foreground">{{ t("errors.forbidden") }}</p>
        <RouterLink class="ui-button ui-button-primary mt-5" to="/workspace">
          {{ t("errors.backToWorkspace") }}
        </RouterLink>
      </div>
    </main>
  </ScrollArea>
</template>
