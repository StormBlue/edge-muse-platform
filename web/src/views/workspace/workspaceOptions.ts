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

/** Provider 没有明确限制时沿用默认尺寸；`*` 表示所有尺寸都交给上游判断。 */
export function sizeOptionsForProvider(capabilities: ProviderCapabilities | null): SizeOption[] {
  const sizes = capabilities?.supportedSizes ?? [];
  if (!sizes.length || sizes.includes("*")) return defaultSizeOptions();
  return sizes.map(sizeToOption);
}

export function defaultSizeOptions(): SizeOption[] {
  return ["auto", "1536x1024", "1024x1024", "1024x1536"].map(sizeToOption);
}

export function sizeToOption(size: string): SizeOption {
  if (size === "auto") return { value: size, ratio: "Auto", label: "Auto" };
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return { value: size, ratio: size, label: size };
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = gcd(width, height);
  return {
    value: size,
    ratio: `${width / divisor}:${height / divisor}`,
    label: `${width} x ${height}`
  };
}

export function maxEdgeForSize(size: string): number | null {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) return null;
  return Math.max(Number(match[1]), Number(match[2]));
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
