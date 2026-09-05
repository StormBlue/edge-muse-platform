// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { toRaw } from "vue";
import { apiFetch } from "@/api/client";
import { useTaskActivityStore } from "@/stores/taskActivity";
import { deferred, image, mountStudio, promptCase, task } from "./studioTestUtils";

vi.mock("@/api/client", () => ({ apiFetch: vi.fn() }));
const wrappers: VueWrapper[] = [];
async function open(path?: string) {
  const result = await mountStudio(path);
  wrappers.push(result.wrapper);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "WebSocket",
    class {
      onopen = null;
      onmessage = null;
      onclose = null;
      close() {}
    }
  );
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path.startsWith("/tasks/")) return { summary: task(path.split("/")[2]) } as never;
    if (path.startsWith("/tasks?")) return { items: [], activeCount: 0, nextCursor: null } as never;
    if (path.startsWith("/prompt-cases/"))
      return { item: promptCase(path.split("/")[2].split("?")[0]) } as never;
    if (path === "/generate") return { taskId: "created" } as never;
    if (path === "/me")
      return {
        user: { id: "user-1" },
        quota: { allocatedQuota: 100, usedQuota: 1, remainingQuota: 99 }
      } as never;
    return undefined as never;
  });
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("image studio routing and generation", () => {
  it("starts in an editable blank studio without fetching a case or generating", async () => {
    const { studio } = await open("/ai-image?mode=blank");
    expect(studio.prompt.value).toBe("");
    expect(studio.currentTask.value).toBeNull();
    expect(studio.mobileTab.value).toBe("create");
    expect(studio.casePickerOpen.value).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it("restores an explicit task without replacing the unsubmitted editor", async () => {
    const { studio, router } = await open();
    studio.prompt.value = "My unfinished prompt";
    await router.push("/ai-image?task=one");
    await flushPromises();
    expect(studio.currentTask.value?.id).toBe("one");
    expect(studio.mobileTab.value).toBe("results");
    expect(studio.prompt.value).toBe("My unfinished prompt");
    expect(
      vi
        .mocked(apiFetch)
        .mock.calls.some(([path, options]) => path === "/generate" || options?.method === "POST")
    ).toBe(false);
  });
  it("applies a case URL once and preserves same-case edits across in-page navigation", async () => {
    const { studio, router } = await open("/ai-image/cases/example");
    expect(studio.prompt.value).toBe("Case prompt example");
    expect(studio.activeCase.value?.id).toBe("example");
    expect(studio.size.value).toBe("1024x1024");
    studio.prompt.value = "My edited case";
    await router.push("/ai-image");
    await router.push("/ai-image/cases/example");
    await flushPromises();
    expect(studio.prompt.value).toBe("My edited case");
    await studio.newCreation();
    expect(router.currentRoute.value.query).toEqual({ mode: "blank" });
    expect(studio.activeCase.value).toBeNull();
    expect(studio.prompt.value).toBe("");
  });
  it("ignores an older task request after navigating to another task", async () => {
    const slow = deferred<unknown>();
    const fast = deferred<unknown>();
    vi.mocked(apiFetch).mockImplementation(
      (path) => (path === "/tasks/slow" ? slow.promise : fast.promise) as never
    );
    const { studio, router } = await open("/ai-image?task=slow");
    await router.push("/ai-image?task=fast");
    fast.resolve({ summary: task("fast") });
    await flushPromises();
    slow.resolve({ summary: task("slow") });
    await flushPromises();
    expect(studio.currentTask.value?.id).toBe("fast");
    expect(studio.loadingTask.value).toBe(false);
  });
  it("does not restore the previous account's delayed task or source", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockReturnValue(pending.promise as never);
    const { studio, auth } = await open("/ai-image?sourceTask=private&reuse=params");
    auth.user = { ...auth.user!, id: "user-2" };
    await flushPromises();
    pending.resolve({ summary: task("private") });
    await flushPromises();
    expect(studio.currentTask.value).toBeNull();
    expect(studio.sourceTask.value).toBeNull();
    expect(studio.prompt.value).toBe("");
    expect(studio.loadingTask.value).toBe(false);
  });

  it("clears editor undo, creative requirements, viewer and lineage when the account changes", async () => {
    const { studio, auth } = await open(
      "/ai-image?sourceTask=source&reuse=reference&image=source-image"
    );
    studio.replacePrompt("Private revised idea");
    studio.brief.value.subject = "Private product";
    studio.viewerImage.value = image("private-image");
    auth.user = { ...auth.user!, id: "user-2" };
    await flushPromises();
    studio.undo();
    expect(studio.prompt.value).toBe("");
    expect(studio.undoPrompt.value).toBeNull();
    expect(studio.brief.value.subject).toBe("");
    expect(studio.viewerImage.value).toBeNull();
    studio.prompt.value = "New account idea";
    studio.mode.value = "text2image";
    await studio.submit();
    const generation = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/generate");
    const payload = JSON.parse(generation?.[1]?.body as string);
    expect(payload).not.toHaveProperty("sourceTaskId");
    expect(payload).not.toHaveProperty("sourceImageId");
  });

  it("fills the assistant suggestion for review and supports undo without generating", async () => {
    const { studio } = await open();
    studio.prompt.value = "Original requirement";
    studio.editorTab.value = "assistant";
    studio.applyAssistant({
      prompt: "Refined requirement",
      recommendedSize: "1024x1024",
      turnCount: 2
    });
    expect(studio.prompt.value).toBe("Refined requirement");
    expect(studio.editorTab.value).toBe("editor");
    expect(studio.size.value).toBe("1024x1024");
    studio.undo();
    expect(studio.prompt.value).toBe("Original requirement");
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/generate")).toBe(false);
    const tracked = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/generation/events");
    expect(JSON.parse(tracked?.[1]?.body as string)).toMatchObject({
      eventName: "assistant_prompt_filled",
      metadata: { turnCount: 2 }
    });
  });
  it("does not let a delayed case overwrite text typed while it was loading", async () => {
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockReturnValue(pending.promise as never);
    const { studio } = await open("/ai-image/cases/slow");
    studio.prompt.value = "User typed a different idea";
    pending.resolve({ item: promptCase("slow") });
    await flushPromises();
    expect(studio.prompt.value).toBe("User typed a different idea");
    expect(studio.loadingTask.value).toBe(false);
  });
  it("loads result reuse without POST, then submits existing references and provenance without uploading", async () => {
    const { studio } = await open("/ai-image?sourceTask=source&reuse=reference&image=source-image");
    expect(studio.mode.value).toBe("image2image");
    expect(studio.prompt.value).toBe("Prompt for source");
    expect(studio.references.value.map((entry) => entry.image?.id)).toEqual(["source-image"]);
    expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(
      false
    );
    await studio.submit();
    await flushPromises();
    const generation = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/generate");
    expect(JSON.parse(generation?.[1]?.body as string)).toMatchObject({
      mode: "image2image",
      referenceImageIds: ["source-image"],
      sourceTaskId: "source",
      sourceImageId: "source-image"
    });
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/uploads")).toBe(false);
  });
  it("restores original references for parameter reuse and rejects a missing selected result", async () => {
    const source = {
      ...task("source"),
      params: { ...task().params, mode: "image2image" as const },
      referenceImages: [image("ref-one"), image("ref-two")]
    };
    vi.mocked(apiFetch).mockResolvedValue({ summary: source } as never);
    const { studio, router } = await open("/ai-image?sourceTask=source&reuse=params");
    expect(studio.references.value.map((entry) => entry.image?.id)).toEqual(["ref-one", "ref-two"]);
    await router.push("/ai-image?sourceTask=source&reuse=reference&image=missing");
    await flushPromises();
    expect(studio.error.value).not.toBe("");
    expect(vi.mocked(apiFetch).mock.calls.every(([, options]) => options?.method !== "POST")).toBe(
      true
    );
  });
  it("retains prompt and local reference after a failed submit following upload", async () => {
    const { studio } = await open();
    const file = new File(["bytes"], "reference.png", { type: "image/png" });
    studio.prompt.value = "Keep my prompt";
    studio.mode.value = "image2image";
    studio.references.value = [{ key: "local", file, url: "blob:local", name: file.name }];
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/uploads") return { images: [image("uploaded")] } as never;
      throw { error: { code: "PROVIDER_ERROR", message: "Provider unavailable" } };
    });
    await studio.submit();
    expect(studio.prompt.value).toBe("Keep my prompt");
    expect(toRaw(studio.references.value[0].file)).toBe(file);
    expect(studio.references.value[0].url).toBe("blob:local");
    expect(studio.error.value).toBe("Provider unavailable");
    expect(studio.submitting.value).toBe(false);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("blocks a restored recipe with deleted references until they are replaced or the mode changes", async () => {
    const source = {
      ...task("source"),
      params: {
        ...task().params,
        mode: "image2image" as const,
        referenceImageIds: ["available", "deleted"]
      },
      referenceImages: [image("available")]
    };
    vi.mocked(apiFetch).mockResolvedValue({ summary: source } as never);
    const { studio } = await open("/ai-image?sourceTask=source&reuse=params");
    expect(studio.references.value).toHaveLength(1);
    expect(studio.canSubmit.value).toBe(false);
    await studio.submit();
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/generate")).toBe(false);
    studio.mode.value = "text2image";
    await flushPromises();
    expect(studio.canSubmit.value).toBe(true);
    studio.mode.value = "image2image";
    studio.references.value.push({
      key: "replacement",
      image: image("replacement"),
      url: "/api/i/replacement",
      name: "replacement"
    });
    await flushPromises();
    expect(studio.canSubmit.value).toBe(true);
  });
  it("does not regress a globally observed terminal task when older detail arrives", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: task("one", "queued") } as never);
    const { studio } = await open("/ai-image?task=one");
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockReturnValue(pending.promise as never);
    const refreshing = studio.refreshCurrentTask();
    useTaskActivityStore().items = [task("one", "succeeded")];
    await flushPromises();
    pending.resolve({ summary: task("one", "queued") });
    await refreshing;
    expect(studio.currentTask.value?.status).toBe("succeeded");
    expect(studio.currentTask.value?.canCancel).toBe(false);
    expect(studio.images.value).toHaveLength(1);
  });

  it("observes an accepted submission globally without navigating back after the user leaves", async () => {
    const { studio, router } = await open();
    studio.prompt.value = "New idea";
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockReturnValueOnce(pending.promise as never);
    const submitting = studio.submit();
    await router.push("/ai-image?mode=blank");
    pending.resolve({ taskId: "accepted" });
    await submitting;
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ mode: "blank" });
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/tasks/accepted")).toBe(true);
    expect(studio.submitting.value).toBe(false);
  });

  it.each(["success", "failure"])("ignores a prior account's late retry %s", async (outcome) => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ summary: task("failed", "failed") } as never);
    const { studio, auth, router } = await open("/ai-image?task=failed");
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockReturnValueOnce(pending.promise as never);
    const retrying = studio.retryCurrent();
    auth.user = { ...auth.user!, id: "user-2" };
    await flushPromises();
    if (outcome === "success") pending.resolve({ taskId: "old-account-retry" });
    else pending.reject({ error: { message: "Private failure details" } });
    await retrying;
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ task: "failed" });
    expect(studio.error.value).toBe("");
    expect(studio.currentTask.value).toBeNull();
    expect(studio.submitting.value).toBe(false);
    expect(
      vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/tasks/old-account-retry")
    ).toBe(false);
  });
});
