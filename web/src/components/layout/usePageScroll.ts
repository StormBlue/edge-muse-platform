import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const positions = new Map<string, number>();

/** Shells remount between pages, so keep their inner scroll position outside the component. */
export function usePageScroll(viewport: Ref<HTMLElement | null>) {
  const route = useRoute();
  const auth = useAuthStore();
  let key = `${auth.user?.id}:${route.fullPath}`;
  let pending: number | null = positions.get(key) ?? 0;
  let observer: ResizeObserver | null = null;

  function save() {
    positions.set(key, pending ?? viewport.value?.scrollTop ?? 0);
    if (positions.size > 80) positions.delete(positions.keys().next().value!);
  }
  function restore() {
    const element = viewport.value;
    if (!element || pending === null) return;
    element.scrollTop = pending;
    if (element.scrollHeight - element.clientHeight >= pending) pending = null;
  }
  function onUserScroll() {
    pending = null;
  }

  onMounted(() => {
    restore();
    if (viewport.value?.firstElementChild) {
      observer = new ResizeObserver(restore);
      observer.observe(viewport.value.firstElementChild);
    }
    viewport.value?.addEventListener("wheel", onUserScroll, { passive: true });
    viewport.value?.addEventListener("touchstart", onUserScroll, { passive: true });
    viewport.value?.addEventListener("pointerdown", onUserScroll, { passive: true });
    viewport.value?.addEventListener("keydown", onUserScroll);
  });
  watch(
    () => route.fullPath,
    async (path) => {
      save();
      key = `${auth.user?.id}:${path}`;
      pending = positions.get(key) ?? 0;
      await nextTick();
      restore();
    }
  );
  onBeforeUnmount(() => {
    save();
    observer?.disconnect();
    viewport.value?.removeEventListener("wheel", onUserScroll);
    viewport.value?.removeEventListener("touchstart", onUserScroll);
    viewport.value?.removeEventListener("pointerdown", onUserScroll);
    viewport.value?.removeEventListener("keydown", onUserScroll);
  });
}
