import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import {
  History,
  Image,
  KeyRound,
  FlaskConical,
  Library,
  LayoutDashboard,
  MessagesSquare,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users
} from "lucide-vue-next";
import { trackExperimentEvent } from "@/api/experiments";
import {
  buildGenerationEntryExposureEvents,
  buildGenerationHistoryReturnEvents,
  buildGenerationRouteOpenEvents
} from "@/components/layout/generationExperimentEvents";
import { useAuthStore } from "@/stores/auth";
import { type ThemeMode, useUiStore } from "@/stores/ui";

export function useAppShellController() {
  const auth = useAuthStore();
  const ui = useUiStore();
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const themeMenuOpen = ref(false);
  const themeMenuRef = ref<HTMLElement | null>(null);
  const isDesktopSidebar = ref(false);
  let sidebarModeQuery: MediaQueryList | null = null;
  let stopSidebarModeSync: (() => void) | null = null;
  const exposedGenerationEntries = new Set<string>();
  const openedGenerationRoutes = new Set<string>();
  const directGenerationRoutes = new Set<string>();
  const returnedHistoryRoutes = new Set<string>();

  const quotaLabel = computed(() => {
    if (!auth.quota) return "--";
    if (auth.quota.allocatedQuota === null) return t("common.unlimited");
    return `${Math.max(auth.quota.allocatedQuota - auth.quota.usedQuota, 0)}/${auth.quota.allocatedQuota}`;
  });

  const nav = computed(() => {
    const dashboardEntry = {
      to: "/sysadmin/dashboard",
      label: t("nav.dashboard"),
      icon: LayoutDashboard,
      show: auth.isSysadmin
    };
    const sharedEntries = [
      {
        to: "/ai-image",
        label: t("nav.aiImage"),
        icon: Sparkles,
        show: auth.isSysadmin || (auth.generationExperience?.showAi ?? true)
      },
      {
        to: "/workspace",
        label: t("nav.workspace"),
        icon: Image,
        show: auth.isSysadmin || (auth.generationExperience?.showLegacy ?? true)
      },
      { to: "/history", label: t("nav.history"), icon: History, show: true },
      { to: "/admin/users", label: t("nav.admin"), icon: Users, show: auth.isAdmin }
    ];
    const sysadminEntries = [
      { to: "/sysadmin/keys", label: t("nav.keys"), icon: KeyRound, show: auth.isSysadmin },
      {
        to: "/sysadmin/users/_/sessions",
        label: t("nav.sessionAudit"),
        icon: MessagesSquare,
        show: auth.isSysadmin
      },
      {
        to: "/sysadmin/preferences",
        label: t("nav.preferences"),
        icon: SlidersHorizontal,
        show: auth.isSysadmin
      },
      {
        to: "/sysadmin/prompt-cases",
        label: t("nav.promptCases"),
        icon: Library,
        show: auth.isSysadmin
      },
      {
        to: "/sysadmin/experiments/generation",
        label: t("nav.generationExperiment"),
        icon: FlaskConical,
        show: auth.isSysadmin
      }
    ];
    return auth.isSysadmin
      ? [dashboardEntry, ...sharedEntries, ...sysadminEntries]
      : [...sharedEntries, dashboardEntry, ...sysadminEntries];
  });

  const visibleNav = computed(() => nav.value.filter((entry) => entry.show));
  const themeOptions = computed(() => [
    { value: "auto" as ThemeMode, label: t("theme.system"), icon: Monitor },
    { value: "light" as ThemeMode, label: t("theme.light"), icon: Sun },
    { value: "dark" as ThemeMode, label: t("theme.dark"), icon: Moon }
  ]);
  const currentTheme = computed(
    () => themeOptions.value.find((option) => option.value === ui.theme) ?? themeOptions.value[0]
  );
  const themeTitle = computed(() => `${t("theme.label")}: ${currentTheme.value.label}`);
  const sidebarToggleLabel = computed(() => {
    if (isDesktopSidebar.value) {
      return ui.sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar");
    }
    return ui.sidebarOpen ? t("shell.closeSidebar") : t("shell.openSidebar");
  });
  const userInitial = computed(() => auth.user?.nickname?.trim().charAt(0).toUpperCase() || "U");
  const userSummaryTitle = computed(() =>
    [auth.user?.nickname, auth.user?.email].filter(Boolean).join(" · ")
  );

  function selectTheme(theme: ThemeMode) {
    ui.setTheme(theme);
    themeMenuOpen.value = false;
  }

  function isActiveNav(to: string) {
    return route.path.startsWith(to.split("/").slice(0, 3).join("/"));
  }

  function syncSidebarMode() {
    isDesktopSidebar.value = sidebarModeQuery?.matches ?? false;
    if (isDesktopSidebar.value) ui.closeSidebar();
  }

  function toggleSidebarNav() {
    if (isDesktopSidebar.value) {
      ui.toggleSidebarCollapsed();
      return;
    }
    ui.toggleSidebar();
  }

  function closeMobileSidebar() {
    if (!isDesktopSidebar.value) ui.closeSidebar();
  }

  function trackGenerationEntryExposure() {
    const events = buildGenerationEntryExposureEvents(visibleNav.value);
    for (const event of events) {
      const key = `${event.metadata?.variant ?? "unknown"}:${event.route}:${
        auth.generationExperience?.variant ?? "unknown"
      }`;
      if (exposedGenerationEntries.has(key)) continue;
      exposedGenerationEntries.add(key);
      void trackExperimentEvent(event);
    }
  }

  function trackGenerationRouteOpen() {
    const events = buildGenerationRouteOpenEvents(
      route.path,
      route.fullPath,
      auth.generationExperience,
      auth.isSysadmin,
      openedGenerationRoutes,
      directGenerationRoutes
    );
    for (const event of events) void trackExperimentEvent(event);
  }

  function trackGenerationHistoryReturn(previous: { path: string; fullPath: string } | undefined) {
    if (!previous) return;
    const events = buildGenerationHistoryReturnEvents(
      previous.path,
      previous.fullPath,
      route.path,
      route.fullPath,
      auth.generationExperience,
      auth.isSysadmin,
      returnedHistoryRoutes
    );
    for (const event of events) void trackExperimentEvent(event);
  }

  async function logout() {
    await auth.logout();
    await router.push("/login");
  }

  function closeThemeMenu(event: PointerEvent) {
    if (!themeMenuOpen.value) return;
    if (themeMenuRef.value?.contains(event.target as Node)) return;
    themeMenuOpen.value = false;
  }

  watch(
    () => ({ path: route.path, fullPath: route.fullPath }),
    (_current, previous) => {
      closeMobileSidebar();
      trackGenerationHistoryReturn(previous);
      trackGenerationEntryExposure();
      trackGenerationRouteOpen();
    }
  );

  watch(
    () => [
      auth.generationExperience?.variant,
      auth.generationExperience?.navTarget,
      auth.generationExperience?.showAi,
      auth.generationExperience?.showLegacy,
      ui.locale
    ],
    () => {
      trackGenerationEntryExposure();
      trackGenerationRouteOpen();
    }
  );

  onMounted(() => {
    document.addEventListener("pointerdown", closeThemeMenu);
    sidebarModeQuery = window.matchMedia("(min-width: 1024px)");
    syncSidebarMode();
    sidebarModeQuery.addEventListener("change", syncSidebarMode);
    stopSidebarModeSync = () => sidebarModeQuery?.removeEventListener("change", syncSidebarMode);
    trackGenerationEntryExposure();
    trackGenerationRouteOpen();
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", closeThemeMenu);
    stopSidebarModeSync?.();
  });

  return {
    auth,
    ui,
    t,
    themeMenuOpen,
    themeMenuRef,
    isDesktopSidebar,
    quotaLabel,
    visibleNav,
    themeOptions,
    currentTheme,
    themeTitle,
    sidebarToggleLabel,
    userInitial,
    userSummaryTitle,
    selectTheme,
    isActiveNav,
    toggleSidebarNav,
    closeMobileSidebar,
    logout
  };
}
