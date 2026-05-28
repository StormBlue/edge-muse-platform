import type { ProviderCapabilities } from "@/stores/auth";
import type { Message, SessionMode } from "@/stores/session";
import type { Component } from "vue";

export type ModeOption = {
  value: SessionMode;
  label: string;
  icon: Component;
};

export type SizeOption = {
  value: string;
  ratio: string;
  label: string;
};

const AUTO_SIZE_VALUE = "auto";
const LEGACY_SIZE_ALIASES: Record<string, string> = {
  "872x1240": "880x1248",
  "1240x872": "1248x880",
  "1240x1752": "1248x1760",
  "1752x1240": "1760x1248",
  "1752x2480": "1760x2480",
  "2480x1752": "2480x1760",
  "1920x1080": "1920x1088",
  "1080x1920": "1088x1920"
};

const DEFAULT_SIZE_VALUES = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1280x720",
  "720x1280",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "1760x2480",
  "2480x1760",
  "1920x1088",
  "1088x1920",
  "2048x1536",
  "1536x2048",
  "1248x1760",
  "1760x1248",
  "2880x2880",
  "3840x2160",
  "2160x3840"
] as const;

const COMMON_SIZE_USAGE_ORDER = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1280x720",
  "720x1280",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "1760x2480",
  "2480x1760",
  "1920x1088",
  "1088x1920",
  "1536x1152",
  "1152x1536",
  "2048x1536",
  "1536x2048",
  "1280x1024",
  "1024x1280",
  "1248x1760",
  "1760x1248",
  "2480x3504",
  "3504x2480",
  "880x1248",
  "1248x880",
  "2048x1024",
  "1024x2048",
  "1536x768",
  "768x1536",
  "2304x1536",
  "1536x2304",
  "2880x2880",
  "3840x2160",
  "2160x3840",
  "3840x1920",
  "1920x3840",
  "2048x2560",
  "2560x2048"
] as const;

const COMMON_SIZE_RANK = new Map<string, number>(
  COMMON_SIZE_USAGE_ORDER.map((size, index) => [size, index] as const)
);

const NAMED_SIZE_LABELS: Record<string, string> = {
  "880x1248": "A6 portrait",
  "1248x880": "A6 landscape",
  "1248x1760": "A5 portrait",
  "1760x1248": "A5 landscape",
  "1760x2480": "A4 portrait",
  "2480x1760": "A4 landscape",
  "2480x3504": "A3 portrait",
  "3504x2480": "A3 landscape"
};

/** Provider 没有明确限制时沿用默认尺寸；`*` 表示所有尺寸都交给上游判断。 */
export function sizeOptionsForProvider(capabilities: ProviderCapabilities | null): SizeOption[] {
  const sizes = capabilities?.supportedSizes ?? [];
  const values =
    !sizes.length || sizes.includes("*")
      ? DEFAULT_SIZE_VALUES
      : shouldForceAutoSize(capabilities)
        ? [AUTO_SIZE_VALUE, ...sizes]
        : sizes;
  return sortSizeValues(values).map(sizeToOption);
}

export function defaultSizeOptions(): SizeOption[] {
  return sortSizeValues(DEFAULT_SIZE_VALUES).map(sizeToOption);
}

export function sortSizeValues(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean).map(normalizeSizeValue))].sort(compareSizeValues);
}

export function sizeToOption(size: string): SizeOption {
  if (size === AUTO_SIZE_VALUE) return { value: size, ratio: "Auto", label: "Auto" };
  const parsed = parseSize(size);
  if (!parsed) return { value: size, ratio: size, label: size };
  const { width, height, divisor } = parsed;
  return {
    value: size,
    ratio: `${width / divisor}:${height / divisor}`,
    label: NAMED_SIZE_LABELS[size]
      ? `${NAMED_SIZE_LABELS[size]} · ${width} x ${height}`
      : `${width} x ${height}`
  };
}

export function maxEdgeForSize(size: string): number | null {
  const parsed = parseSize(size);
  if (!parsed) return null;
  return Math.max(parsed.width, parsed.height);
}

export function isHighResolutionSize(size: string): boolean {
  const maxEdge = maxEdgeForSize(size);
  return maxEdge !== null && maxEdge >= 1600;
}

/** 用于筛「进行中」消息行，与 ChatMessage 展示条件一致。 */
export function isGeneratingMessage(message: Message) {
  return message.status === "queued" || message.status === "running";
}

/** 与后端 `defaultSessionTitle` 同形，用于新会话未命名时的展示。 */
export function defaultSessionTitle(date = new Date()) {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  const second = padDatePart(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function compareSizeValues(left: string, right: string): number {
  if (left === right) return 0;
  if (left === AUTO_SIZE_VALUE) return -1;
  if (right === AUTO_SIZE_VALUE) return 1;

  const leftRank = COMMON_SIZE_RANK.get(left);
  const rightRank = COMMON_SIZE_RANK.get(right);
  if (leftRank !== undefined || rightRank !== undefined) {
    return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
  }

  const leftScore = dynamicSizeScore(left);
  const rightScore = dynamicSizeScore(right);
  if (leftScore !== rightScore) return leftScore - rightScore;
  return left.localeCompare(right);
}

function normalizeSizeValue(size: string): string {
  const normalized = size.trim().toLowerCase();
  return LEGACY_SIZE_ALIASES[normalized] ?? normalized;
}

function shouldForceAutoSize(capabilities: ProviderCapabilities | null): boolean {
  return (
    capabilities?.requestFormat === "micu_images" || capabilities?.requestFormat === "openai_images"
  );
}

function dynamicSizeScore(size: string): number {
  const parsed = parseSize(size);
  if (!parsed) return Number.MAX_SAFE_INTEGER;
  const ratio = `${parsed.width / parsed.divisor}:${parsed.height / parsed.divisor}`;
  const area = parsed.width * parsed.height;
  const ratioRank = ratioUsageRank(ratio);
  const areaRank = areaBucketRank(area);
  const orientationRank = parsed.width >= parsed.height ? 0 : 1;
  return ratioRank * 100 + areaRank * 10 + orientationRank;
}

function ratioUsageRank(ratio: string): number {
  if (ratio === "1:1") return 0;
  if (ratio === "3:2" || ratio === "2:3") return 1;
  if (ratio === "16:9" || ratio === "9:16") return 2;
  if (ratio === "4:3" || ratio === "3:4") return 3;
  if (ratio === "5:4" || ratio === "4:5") return 4;
  if (ratio === "2:1" || ratio === "1:2") return 5;
  return 6;
}

function areaBucketRank(area: number): number {
  if (area <= 1_400_000) return 0;
  if (area <= 2_600_000) return 1;
  if (area <= 4_800_000) return 2;
  if (area <= 8_400_000) return 3;
  return 4;
}

function parseSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = gcd(width, height);
  return { width, height, divisor };
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
