import { onBeforeUnmount, ref } from "vue";

export function useTaskWebSocket(onMessage: (payload: unknown) => void) {
  const status = ref<"idle" | "connecting" | "open" | "closed">("idle");
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;

  function connect(url: string) {
    disconnect();
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
        onMessage(JSON.parse(event.data));
      } catch {
        onMessage(event.data);
      }
    };
    socket.onclose = () => {
      status.value = "closed";
      reconnectTimer = window.setTimeout(() => connect(wsUrl), 3000);
    };
  }

  function disconnect() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket?.close();
    socket = null;
  }

  onBeforeUnmount(disconnect);

  return { status, connect, disconnect };
}
