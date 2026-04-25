import type { SessionMode } from "../types";

export type ProviderImage =
  | { kind: "base64"; data: string; mime: string }
  | { kind: "url"; url: string }
  | { kind: "bytes"; bytes: Uint8Array; mime: string };

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

export type GenerateResponse = {
  requestId?: string;
  images: ProviderImage[];
  text?: string;
  raw: unknown;
};

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

export interface ImageProvider {
  id: string;
  name: string;
  supportedSizes: string[];
  health(req: Pick<GenerateRequest, "apiKey" | "baseUrl" | "model">): Promise<boolean>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

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
