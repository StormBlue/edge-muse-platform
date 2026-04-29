import { apiFetch } from "@/api/client";

export type GenerationRoute = "/workspace" | "/ai-image";

export type GenerationEntry = {
  navTarget: GenerationRoute;
  showWorkspace: boolean;
  showAiImage: boolean;
};

export type GenerationEntrySettings = {
  showWorkspace: boolean;
  showAiImage: boolean;
  updatedAt: number;
  updatedBy: string | null;
};

export type GenerationPageUsageMetric = {
  route: GenerationRoute;
  submitted: number;
  succeeded: number;
  failed: number;
};

export type GenerationUsageWindow = {
  since: number;
  until: number;
  days: number;
};

export type ClientGenerationEventName =
  | "entry_exposed"
  | "page_opened"
  | "prompt_case_selected"
  | "assistant_started"
  | "assistant_prompt_filled"
  | "history_returned";

export type ClientGenerationEventInput = {
  eventName: ClientGenerationEventName;
  route: GenerationRoute;
  caseId?: string;
  metadata?: Record<string, unknown>;
};

export async function getGenerationEntryAdmin() {
  return apiFetch<{
    settings: GenerationEntrySettings;
    usageWindow: GenerationUsageWindow;
    pageUsage: GenerationPageUsageMetric[];
  }>("/sysadmin/generation-entry");
}

export async function saveGenerationEntrySettings(input: {
  showWorkspace: boolean;
  showAiImage: boolean;
}) {
  const body = await apiFetch<{ settings: GenerationEntrySettings }>("/sysadmin/generation-entry", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
  return body.settings;
}

export async function trackGenerationEvent(input: ClientGenerationEventInput) {
  await apiFetch("/generation/events", {
    method: "POST",
    body: JSON.stringify(input)
  }).catch(() => undefined);
}
