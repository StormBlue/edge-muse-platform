import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/api/client";
import { useSessionStore } from "./session";

vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const page = (id: string, nextCursor: number | null = null) => ({
  items: [
    {
      id,
      sessionId: id,
      role: "user",
      status: "succeeded",
      attachments: [],
      referenceImageIds: [],
      createdAt: 1
    }
  ],
  nextCursor
});

beforeEach(() => {
  setActivePinia(createPinia());
  api.mockReset();
});

describe("session navigation request ownership", () => {
  it("ignores a slow initial page after switching sessions", async () => {
    const first = deferred();
    api.mockReturnValueOnce(first.promise).mockResolvedValueOnce(page("b"));
    const store = useSessionStore();
    const pending = store.loadMessages("a");
    await store.loadMessages("b");
    first.resolve(page("a", 10));
    await pending;
    expect(store.currentSessionId).toBe("b");
    expect(store.messages.map((message) => message.id)).toEqual(["b"]);
    expect(store.nextMessageCursor).toBeNull();
  });

  it("ignores an older page and its loading cleanup after a new load starts", async () => {
    const stale = deferred();
    const current = deferred();
    api
      .mockResolvedValueOnce(page("a", 10))
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(page("b", 20))
      .mockReturnValueOnce(current.promise);
    const store = useSessionStore();
    await store.loadMessages("a");
    const staleLoad = store.loadOlderMessages();
    await store.loadMessages("b");
    const currentLoad = store.loadOlderMessages();
    stale.resolve(page("old-a"));
    await staleLoad;
    expect(store.olderMessagesLoading).toBe(true);
    expect(store.messages.map((message) => message.id)).toEqual(["b"]);
    current.resolve(page("old-b"));
    await currentLoad;
    expect(store.olderMessagesLoading).toBe(false);
    expect(store.messages.map((message) => message.id)).toEqual(["old-b", "b"]);
  });

  it("invalidates outstanding messages when creating a session", async () => {
    const stale = deferred();
    api
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ session: { id: "new", mode: "image2image" } });
    const store = useSessionStore();
    const pending = store.loadMessages("a");
    await store.createSession();
    stale.resolve(page("a"));
    await pending;
    expect(store.currentSessionId).toBe("new");
    expect(store.messages).toEqual([]);
  });
});
