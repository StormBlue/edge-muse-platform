<script setup lang="ts">
/**
 * 404：`path: '/:pathMatch(.*)*'` 捕获所有未匹配路径；`meta.public` 允许未登录访问（如分享坏链）。
 */
import { useI18n } from "vue-i18n";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const { t } = useI18n();
</script>

<template>
  <ScrollArea class="h-dvh bg-background">
    <main class="flex min-h-dvh items-center justify-center bg-background">
      <div class="text-center">
        <h1 class="text-3xl font-semibold">404</h1>
        <p class="mt-2 text-muted-foreground">{{ t("errors.notFound") }}</p>
        <RouterLink :class="cn(buttonVariants(), 'mt-5')" to="/workspace">
          {{ t("errors.backToWorkspace") }}
        </RouterLink>
      </div>
    </main>
  </ScrollArea>
</template>
