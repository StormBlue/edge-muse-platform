/**
 * 单任务 WebSocket：连接 `/ws/task/:taskId`（见 server handleTaskWebSocket → Durable Object TaskRoom）
 *
 * - 相对路径 wsUrl 会按当前页面协议补全为 ws: / wss:。
 * - 断线后 3s 自动重连（非用户主动 disconnect），保证「离开再回来」类场景能尽量收到 task.update。
 * - onMessage：应交给 sessionStore.applyTaskEvent 或等价逻辑。
 *
 * 连接时序（符号）：
 *   浏览器 --WebSocket--> Worker /ws/task/:id --转发--> DO TaskRoom
 *   DO --(连接瞬间)--> 推送 storage 中 latest 事件（避免错过最后一帧状态）
 *
 * 重连策略：断线后 **3s** 用**同一解析后的 wsUrl** 再连；用户/组件 `disconnect` 则永久停重连。
 */
import { onBeforeUnmount, ref } from "vue";

/**
 * @param onMessage 收到服务端文本：先按 JSON 解析；失败则把原始字符串传入（兼容非 JSON 调试帧）
 * @returns `status` 供 UI 展示连接态；`connect` 支持相对路径（补全与当前页同 host 的 ws/wss）
 */
export function useTaskWebSocket(onMessage: (payload: unknown) => void) {
  const status = ref<"idle" | "connecting" | "open" | "closed">("idle");
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  /** 为 true 表示组件卸载或用户主动关闭，不再自动重连（与「网络闪断」区分） */
  let manuallyClosed = false;

  /**
   * 建立连接：先 `disconnect` 避免重复 socket；相对 URL 按页面协议选 wss/ws（与 https/http 一致）。
   * `onclose` 闭包捕获 `wsUrl`，重连时仍连**同一 task**（勿在热更新后混用旧 url）。
   */
  function connect(url: string) {
    disconnect();
    manuallyClosed = false;
    status.value = "connecting";
    const wsUrl = url.startsWith("ws")
      ? url
      : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${url}`;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      status.value = "open";
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data as string));
      } catch {
        onMessage(event.data);
      }
    };
    socket.onclose = () => {
      status.value = "closed";
      // 非用户 disconnect：短延迟同 URL 重连，防网络闪断错过 task 终态
      if (!manuallyClosed) reconnectTimer = window.setTimeout(() => connect(wsUrl), 3000);
    };
  }

  /** 置手动关闭、清定时器、关 socket；供切会话/离开页时停止重连风暴 */
  function disconnect() {
    manuallyClosed = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
    socket = null;
  }

  onBeforeUnmount(disconnect);

  return { status, connect, disconnect };
}
