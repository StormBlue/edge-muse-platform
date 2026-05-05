export const MICU_REQUEST_FORMAT = "micu_images";
export const MICU_STANDARD_MODEL = "gpt-image-2";
export const MICU_PRO_MODEL = "gpt-image-2-pro";
export const MICU_HIGH_RESOLUTION_EDGE = 1600;
export const MICU_STANDARD_PARALLEL_GENERATIONS = 5;
export const MICU_PRO_PARALLEL_GENERATIONS = 1;

export function maxEdgeForSize(size: string): number | null {
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return null;
  return Math.max(Number(match[1]), Number(match[2]));
}

export function isMicuHighResolutionSize(size: string): boolean {
  const maxEdge = maxEdgeForSize(size);
  return maxEdge !== null && maxEdge >= MICU_HIGH_RESOLUTION_EDGE;
}

export function effectiveMicuModel(model: string, size: string): string {
  if (model === MICU_STANDARD_MODEL && isMicuHighResolutionSize(size)) return MICU_PRO_MODEL;
  return model;
}

export function resolveMicuParallelGenerations(model: string, size: string): number {
  const effectiveModel = effectiveMicuModel(model, size);
  if (/pro/i.test(effectiveModel) || isMicuHighResolutionSize(size)) {
    return MICU_PRO_PARALLEL_GENERATIONS;
  }
  return MICU_STANDARD_PARALLEL_GENERATIONS;
}
