import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { useAuthStore, type ProviderCapabilities } from "@/stores/auth";
import type { GenerationTask } from "@/api/tasks";
import type { PromptCase } from "@/types/promptCases";
import { useImageStudio } from "./useImageStudio";

export const capabilities: ProviderCapabilities = {
  providerId: "provider",
  providerName: "Images",
  providerKeyId: null,
  providerKeyGroupId: "group",
  providerKeyGroupName: "Images",
  requestFormat: "micu_images",
  model: "gpt-image-2",
  supportedModes: ["text2image", "image2image"],
  supportedSizes: ["auto", "1024x1024", "1024x1536", "3840x2160"],
  maxReferenceImages: 5
};

export function image(id = "image-1") {
  return { id, url: `/api/i/${id}`, mime: "image/png", byteSize: 10, width: 1024, height: 1024 };
}

export function task(
  id = "task-1",
  status: GenerationTask["status"] = "succeeded"
): GenerationTask {
  return {
    id,
    sessionId: `session-${id}`,
    messageId: `message-${id}`,
    title: "Landscape",
    status,
    phase: status === "running" ? "generating" : status,
    prompt: `Prompt for ${id}`,
    params: { mode: "text2image", size: "1024x1024", n: 1, generationTargetId: "default" },
    queuedAt: 1000,
    startedAt: status === "queued" ? null : 1100,
    finishedAt: ["queued", "running"].includes(status) ? null : 2000,
    canCancel: status === "queued",
    images: status === "succeeded" ? [image(`${id}-image`)] : [],
    referenceImages: [],
    quota: { precharged: 1, refunded: 0, consumed: 1 },
    errorCode: null,
    errorMessage: null,
    retryOf: null
  };
}

export function promptCase(id = "case-1"): PromptCase {
  return {
    id,
    title: `Case ${id}`,
    category: "Design",
    modes: ["text2image"],
    recommendedSize: "1024x1024",
    tags: [],
    promptTemplate: `Case prompt ${id}`,
    promptSummary: "Case description",
    thumbnailUrl: null,
    sourceUrl: null,
    sourceAuthor: null,
    sourceLicense: "internal",
    sourceRepo: null,
    popularity: {},
    status: "published",
    featured: false,
    sortOrder: 1,
    locale: "zh-CN",
    createdBy: null,
    updatedBy: null,
    createdAt: 1,
    updatedAt: 1
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function mountStudio(path = "/ai-image", component?: Parameters<typeof mount>[0]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = {
    id: "user-1",
    email: "user@example.com",
    username: "user",
    nickname: "User",
    role: "user",
    status: "active",
    maxImagesPerGeneration: 4,
    maxConcurrentTasks: 5
  };
  auth.providerCapabilities = { ...capabilities };
  auth.quota = { allocatedQuota: 100, usedQuota: 0, remainingQuota: 100 };
  auth.promptAssistantEnabled = true;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/ai-image", name: "ai-image", component: { template: "<div />" } },
      { path: "/ai-image/cases/:caseId", name: "ai-image-case", component: { template: "<div />" } }
    ]
  });
  await router.push(path);
  await router.isReady();
  let studio!: ReturnType<typeof useImageStudio>;
  const Harness = defineComponent({
    setup() {
      studio = useImageStudio();
      return () => h("div");
    }
  });
  const i18n = createI18n({
    legacy: false,
    locale: "zh-CN",
    missingWarn: false,
    fallbackWarn: false,
    messages: { "zh-CN": {}, en: {} }
  });
  const wrapper = mount(component ?? Harness, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { AppShell: { template: "<main><slot /></main>" }, ImageViewer: true }
    }
  }) as VueWrapper;
  await flushPromises();
  return { studio, auth, router, wrapper };
}
