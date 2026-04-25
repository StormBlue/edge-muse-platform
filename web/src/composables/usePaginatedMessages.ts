import { ref } from "vue";
import { apiFetch } from "@/api/client";
import type { Message } from "@/stores/session";

export function usePaginatedMessages(sessionId: string) {
  const items = ref<Message[]>([]);
  const cursor = ref<number | null>(null);
  const loading = ref(false);

  async function loadMore() {
    if (loading.value) return;
    loading.value = true;
    try {
      const qs = cursor.value ? `?cursor=${cursor.value}` : "";
      const body = await apiFetch<{ items: Message[]; nextCursor: number | null }>(
        `/sessions/${sessionId}/messages${qs}`
      );
      items.value = [...body.items, ...items.value];
      cursor.value = body.nextCursor;
    } finally {
      loading.value = false;
    }
  }

  return { items, cursor, loading, loadMore };
}
