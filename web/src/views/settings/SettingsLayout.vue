<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { LockKeyhole, UserRound } from "@lucide/vue";
import AppShell from "@/components/layout/AppShell.vue";

defineProps<{ title: string }>();
const { t } = useI18n();
const sections = [
  { to: "/settings/profile", label: "settings.profileTitle", icon: UserRound },
  { to: "/settings/security", label: "settings.securityTitle", icon: LockKeyhole }
];
</script>

<template>
  <AppShell>
    <section class="w-full max-w-xl">
      <h1 class="mb-4 text-xl font-semibold">{{ title }}</h1>
      <nav
        class="mb-6 flex flex-wrap gap-2 border-b border-border pb-2"
        :aria-label="t('common.settings')"
      >
        <RouterLink
          v-for="section in sections"
          :key="section.to"
          :to="section.to"
          class="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          active-class="bg-muted !text-foreground"
        >
          <component :is="section.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
          {{ t(section.label) }}
        </RouterLink>
      </nav>
      <slot />
    </section>
  </AppShell>
</template>
