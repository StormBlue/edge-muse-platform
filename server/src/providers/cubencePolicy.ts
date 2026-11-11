/** Confirmed in https://cubence.ai/en/models on 2026-11-11. */
export const CUBENCE_SUPPORTED_MODELS = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"] as const;
export const CUBENCE_DEFAULT_MODEL = CUBENCE_SUPPORTED_MODELS[0];

export function isCubenceImageProvider(provider: { id: string; requestFormat: string }): boolean {
  return provider.id === "prv_cubence" && provider.requestFormat === "openai_images";
}

export function isAllowedCubenceModel(model: string): boolean {
  return CUBENCE_SUPPORTED_MODELS.some((supported) => supported === model);
}

/** Old key configuration must not keep sending retired model choices. */
export function resolveCubenceModel(model: string): string {
  return isAllowedCubenceModel(model) ? model : CUBENCE_DEFAULT_MODEL;
}
