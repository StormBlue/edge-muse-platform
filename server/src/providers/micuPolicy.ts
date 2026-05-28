export const MICU_REQUEST_FORMAT = "micu_images";
export const MICU_STANDARD_MODEL = "gpt-image-2";
export const MICU_PRO_MODEL = "gpt-image-2-pro";
export const MICU_HIGH_RESOLUTION_EDGE = 1600;
export const MICU_4K_EDGE = 3000;
export const MICU_MIN_SIZE_EDGE = 256;
export const MICU_MAX_SIZE_EDGE = 4096;
export const MICU_SIZE_ALIGNMENT = 8;
export const MICU_STANDARD_PARALLEL_GENERATIONS = 5;
export const MICU_PRO_PARALLEL_GENERATIONS = 1;
export const AUTO_IMAGE_SIZE = "auto";

/**
 * 米醋 GPT image2 支持任意合法 WxH；这里是给 UI 展示的常用预设。
 * A 系列纸张尺寸按 8 倍数对齐，避免被米醋代理拒绝。
 */
export const MICU_IMAGE_SIZE_PRESETS = [
  AUTO_IMAGE_SIZE,
  "1024x1024",
  "1280x720",
  "720x1280",
  "1536x1024",
  "1024x1536",
  "1536x1152",
  "1152x1536",
  "1280x1024",
  "1024x1280",
  "1536x768",
  "768x1536",
  "1920x1080",
  "1080x1920",
  "2048x1152",
  "1152x2048",
  "2048x2048",
  "2048x1536",
  "1536x2048",
  "2048x1024",
  "1024x2048",
  "2048x2560",
  "2560x2048",
  "2304x1536",
  "1536x2304",
  "3840x2160",
  "2160x3840",
  "3840x1920",
  "1920x3840",
  "2880x2880",
  "872x1240",
  "1240x872",
  "1240x1752",
  "1752x1240",
  "1752x2480",
  "2480x1752",
  "2480x3504",
  "3504x2480"
] as const;

export function maxEdgeForSize(size: string): number | null {
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return null;
  return Math.max(Number(match[1]), Number(match[2]));
}

export function isMicuHighResolutionSize(size: string): boolean {
  const maxEdge = maxEdgeForSize(size);
  return maxEdge !== null && maxEdge >= MICU_HIGH_RESOLUTION_EDGE;
}

export function isMicu4KSize(size: string): boolean {
  const maxEdge = maxEdgeForSize(size);
  return maxEdge !== null && maxEdge >= MICU_4K_EDGE;
}

export function isValidMicuImageSize(size: string): boolean {
  const match = /^(\d+)x(\d+)$/i.exec(size.trim());
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return (
    width >= MICU_MIN_SIZE_EDGE &&
    height >= MICU_MIN_SIZE_EDGE &&
    width <= MICU_MAX_SIZE_EDGE &&
    height <= MICU_MAX_SIZE_EDGE &&
    width % MICU_SIZE_ALIGNMENT === 0 &&
    height % MICU_SIZE_ALIGNMENT === 0
  );
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
