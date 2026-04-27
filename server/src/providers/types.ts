/**
 * 多服务商**抽象层**：`ImageProvider` 由 `providers/registry` 按 `request_format` 选择实现。
 * 单图返回统一为 `ProviderImage` 的判别联合，供 `lib/tasks` 落 R2 前归一化。
 */
import type { SessionMode } from "../types";

/** 单张生成结果在内存中的形态：直链 URL 需再 fetch，base64/bytes 可直接解码上传 */
export type ProviderImage =
  | { kind: "base64"; data: string; mime: string }
  | { kind: "url"; url: string }
  | { kind: "bytes"; bytes: Uint8Array; mime: string };

/** 对适配器暴露的一次生成入参（含解密密钥与解析后的 baseUrl） */
export type GenerateRequest = {
  prompt: string;
  mode: SessionMode;
  model: string;
  size: string;
  apiKey: string;
  baseUrl: string;
  referenceImages?: Array<{ bytes: Uint8Array; mime: string }>;
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  logContext?: ProviderLogContext;
};

/** 适配器必须返回的规范结构；`raw` 落库时可能脱敏截断 */
export type GenerateResponse = {
  requestId?: string;
  images: ProviderImage[];
  text?: string;
  raw: unknown;
};

/** 结构化日志字段，贯穿 provider → tasks 的 logInfo */
export type ProviderLogContext = {
  taskId?: string;
  sessionId?: string;
  messageId?: string;
  userId?: string;
  providerId?: string;
  providerKeyId?: string;
  requestFormat?: string;
  generationIndex?: number;
};

/**
 * 单个服务商实现约定：`health` 供后台探测；`generate` 完成协议差异与多模态入参。
 */
export interface ImageProvider {
  id: string;
  name: string;
  supportedSizes: string[];
  health(req: Pick<GenerateRequest, "apiKey" | "baseUrl" | "model">): Promise<boolean>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

/**
 * 第三方 HTTP/解析错误包装：可带 `body` 供日志脱敏，上层映射为 `PROVIDER_ERROR` 等。
 */
export class ProviderError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly body?: unknown;

  constructor(code: string, message: string, options?: { status?: number; body?: unknown }) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = options?.status;
    this.body = options?.body;
  }
}
