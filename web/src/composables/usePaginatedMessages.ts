/**
 * 按会话拉取消息分页（独立 `ref`，**不要**与 `useSessionStore.messages` 同时绑同一 UI 列表）。
 *
 * 与后端约定：`GET /sessions/:id/messages` 按 `createdAt` **倒序**取一页，`nextCursor` 指向更旧边界。
 * - 首次 `loadMore()`：无 `query.cursor`，得到**最新**一页。
 * - 再次：带 `cursor`，得到**更早**一页；合并为 `[新拼的旧页, ...已有]`，即列表索引 0 为当前已加载的**最老**一条。
 *
 * 若需与工作台消息列表完全一致的外键补全，可对 `body.items` 逐条补 `taskId`/`sessionId`/`messageId`（与 session store 中 `loadMessages` 的归一化逻辑对齐）。
 */
import { ref } from "vue";
import { apiFetch } from "@/api/client";
import type { Message } from "@/stores/session";

export function usePaginatedMessages(sessionId: string) {
  /** 当前已加载的消息；时间顺序为**由旧到新**（与聊天窗从上往下一致） */
  const items = ref<Message[]>([]);
  /** 下一页「更早」边界的 `createdAt`；`null` 表示后端已无更旧数据 */
  const cursor = ref<number | null>(null);
  /** 防重复点击并发请求 */
  const loading = ref(false);

  /** 向数组**前部**拼更早一页（与 `sessionStore.loadOlderMessages` 行为对齐） */
  async function loadMore() {
    if (loading.value) return;
    loading.value = true;
    try {
      // 首屏无 cursor → 拉「离现在最近的一页」；之后用 nextCursor 继续向过去翻
      const qs = cursor.value ? `?cursor=${cursor.value}` : "";
      const body = await apiFetch<{ items: Message[]; nextCursor: number | null }>(
        `/sessions/${sessionId}/messages${qs}`
      );
      // 单次接口返回在内存中已是**时间正序**的一页；拼到 front = 更老的消息先出现
      items.value = [...body.items, ...items.value];
      cursor.value = body.nextCursor;
    } finally {
      loading.value = false;
    }
  }

  return { items, cursor, loading, loadMore };
}
