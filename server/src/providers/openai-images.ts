/**
 * OpenAI Images API 适配器：面向 Cubence 这类只实现 `/v1/images/*` 的服务商。
 *
 * 与 `OpenAICompatibleProvider` 的区别：
 * - 不先尝试 `/v1/responses`，文生图直接走 `/v1/images/generations`。
 * - 图生图直接走 multipart 的 `/v1/images/edits`。
 * - 只声明文生图和图生图，任务创建阶段会提前拦截不支持的模式。
 */
import { logError, logInfo, logWarn, urlSummary } from "../lib/log";
import { toArrayBuffer } from "../lib/encoding";
import type {
  GenerateRequest,
  GenerateResponse,
  ImageProvider,
  ProviderImage,
  ProviderLogContext
} from "./types";
import { ProviderError } from "./types";
import { parseProviderImages } from "./openai-compatible";

const DEFAULT_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "2048x2048",
  "2880x2880",
  "3840x2160",
  "2160x3840",
  "auto"
];
const PROVIDER_FETCH_TIMEOUT_MS = 10 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;

export class OpenAIImagesProvider implements ImageProvider {
  id = "openai_images";
  name = "OpenAI Images";
  supportedSizes = DEFAULT_SIZES;
  supportedModes: ImageProvider["supportedModes"] = ["text2image", "image2image"];
  /** Cubence 文档只展示一个 `image` 字段，首版按单参考图严格处理。 */
  maxReferenceImages = 1;

  /** 基础鉴权探测：不消耗图片额度，但不能完全证明 Cubence share group 已配置。 */
  async health(req: Pick<GenerateRequest, "apiKey" | "baseUrl" | "model">): Promise<boolean> {
    const startedAt = Date.now();
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    logInfo("provider.health.started", {
      providerAdapter: this.id,
      baseUrl: urlSummary(req.baseUrl),
      model: req.model
    });
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          Accept: "application/json"
        }
      });
      logInfo("provider.health.finished", {
        providerAdapter: this.id,
        baseUrl: urlSummary(req.baseUrl),
        model: req.model,
        status: response.status,
        ok: response.ok,
        latencyMs: Date.now() - startedAt
      });
      return response.ok;
    } catch (error) {
      logError("provider.health.exception", error, {
        providerAdapter: this.id,
        baseUrl: urlSummary(req.baseUrl),
        model: req.model,
        latencyMs: Date.now() - startedAt
      });
      return false;
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    logInfo("provider.generate.started", {
      ...req.logContext,
      providerAdapter: this.id,
      mode: req.mode,
      model: req.model,
      size: req.size,
      baseUrl: urlSummary(req.baseUrl),
      referenceImageCount: req.referenceImages?.length ?? 0
    });
    if (req.mode === "text2image") return this.generations(req);
    if (req.mode === "image2image") return this.edits(req);
    throw new ProviderError("PROVIDER_UNSUPPORTED_MODE", `${this.name} does not support this mode`);
  }

  /** Cubence 文生图：JSON 请求，返回 data[].b64_json。 */
  private async generations(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerJsonFetch(
      `${baseUrl}/v1/images/generations`,
      req.apiKey,
      {
        model: req.model,
        prompt: req.prompt,
        n: 1,
        size: req.size
      },
      {
        ...req.logContext,
        providerAdapter: this.id,
        endpoint: "images.generations",
        mode: req.mode,
        model: req.model,
        size: req.size,
        requestedImageCount: 1
      }
    );
    return parsedImageResponse(json, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.generations"
    });
  }

  /** Cubence 图生图：multipart/form-data，请勿手动设置 Content-Type，避免 boundary 缺失。 */
  private async edits(req: GenerateRequest): Promise<GenerateResponse> {
    const referenceImages = req.referenceImages ?? [];
    if (referenceImages.length === 0) {
      throw new ProviderError("PROVIDER_VALIDATION_ERROR", "Reference image required");
    }
    if (referenceImages.length > this.maxReferenceImages) {
      throw new ProviderError(
        "PROVIDER_VALIDATION_ERROR",
        `${this.name} accepts at most ${this.maxReferenceImages} reference image`
      );
    }

    const image = referenceImages[0];
    const form = new FormData();
    form.set("model", req.model);
    form.set("prompt", req.prompt);
    form.set("n", "1");
    form.set("size", req.size);
    // FormData 的第三个参数保留文件名；Cubence/OpenAI Images edits 会据此识别上传文件。
    form.set(
      "image",
      new Blob([toArrayBuffer(image.bytes)], { type: image.mime }),
      fileNameForMime(image.mime)
    );

    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerMultipartFetch(
      `${baseUrl}/v1/images/edits`,
      req.apiKey,
      form,
      {
        keys: ["image", "model", "n", "prompt", "size"],
        model: req.model,
        promptLength: req.prompt.length,
        imageCount: referenceImages.length,
        imageBytes: image.bytes.byteLength,
        imageMime: image.mime
      },
      {
        ...req.logContext,
        providerAdapter: this.id,
        endpoint: "images.edits",
        mode: req.mode,
        model: req.model,
        size: req.size,
        referenceImageCount: referenceImages.length
      }
    );
    return parsedImageResponse(json, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.edits"
    });
  }
}

type ProviderFetchLogContext = ProviderLogContext & {
  providerAdapter: string;
  endpoint: string;
  mode?: string;
  model?: string;
  size?: string;
  referenceImageCount?: number;
  requestedImageCount?: number;
};

async function providerJsonFetch(
  url: string,
  apiKey: string,
  body: unknown,
  logContext: ProviderFetchLogContext
): Promise<unknown> {
  const bodyText = JSON.stringify(body);
  return providerFetch(url, {
    apiKey,
    body: bodyText,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    logContext,
    requestBodyShape: requestBodyShape(body),
    requestBodyChars: bodyText.length
  });
}

async function providerMultipartFetch(
  url: string,
  apiKey: string,
  body: FormData,
  requestShape: UnknownRecord,
  logContext: ProviderFetchLogContext
): Promise<unknown> {
  return providerFetch(url, {
    apiKey,
    body,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    logContext,
    requestBodyShape: requestShape,
    requestBodyChars: null
  });
}

async function providerFetch(
  url: string,
  input: {
    apiKey: string;
    body: BodyInit;
    headers: HeadersInit;
    logContext: ProviderFetchLogContext;
    requestBodyShape: UnknownRecord;
    requestBodyChars: number | null;
  }
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  logInfo("provider.fetch.started", {
    ...input.logContext,
    url: urlSummary(url),
    requestBodyChars: input.requestBodyChars,
    requestBodyShape: input.requestBodyShape
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: input.headers,
      body: input.body,
      signal: controller.signal
    });
    const responseText = await response.text();
    const json = tryJson(responseText);
    const responseFields = {
      ...input.logContext,
      url: urlSummary(url),
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      latencyMs: Date.now() - startedAt,
      responseChars: responseText.length,
      responseContentType: response.headers.get("Content-Type"),
      responseRequestId:
        response.headers.get("x-request-id") ??
        response.headers.get("cf-ray") ??
        response.headers.get("request-id") ??
        null,
      responseJson: json !== null,
      responseShape: payloadShape(json)
    };
    if (!response.ok) {
      logWarn("provider.fetch.failed", responseFields);
      throw new ProviderError("PROVIDER_HTTP_ERROR", providerMessage(json, responseText), {
        status: response.status,
        body: json ?? responseText
      });
    }
    logInfo("provider.fetch.succeeded", responseFields);
    return json ?? {};
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    logError("provider.fetch.exception", error, {
      ...input.logContext,
      url: urlSummary(url),
      latencyMs: Date.now() - startedAt
    });
    throw new ProviderError(
      "PROVIDER_FETCH_ERROR",
      error instanceof Error ? error.message : "Provider failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parsedImageResponse(
  json: unknown,
  logContext: ProviderLogContext & { providerAdapter: string; endpoint: string }
): GenerateResponse {
  const images = parseProviderImages(json);
  const requestId = stringValue((json as UnknownRecord).id);
  logInfo("provider.response.parsed", {
    ...logContext,
    requestId: requestId ?? null,
    imageCount: images.length,
    imageKinds: imageKindCounts(images),
    payloadShape: payloadShape(json)
  });
  return { requestId, images, raw: json };
}

function requestBodyShape(body: unknown): UnknownRecord {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { type: typeof body };
  const record = body as UnknownRecord;
  const shape: UnknownRecord = { keys: Object.keys(record).sort() };
  if (typeof record.model === "string") shape.model = record.model;
  if (typeof record.prompt === "string") shape.promptLength = record.prompt.length;
  if (typeof record.size === "string") shape.size = record.size;
  if (typeof record.n === "number") shape.n = record.n;
  return shape;
}

function payloadShape(payload: unknown): UnknownRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { type: Array.isArray(payload) ? "array" : typeof payload };
  }
  const record = payload as UnknownRecord;
  const shape: UnknownRecord = { keys: Object.keys(record).slice(0, 30).sort() };
  if (Array.isArray(record.data)) shape.dataItems = record.data.length;
  if (record.error && typeof record.error === "object") {
    const error = record.error as UnknownRecord;
    shape.errorCode = stringValue(error.code);
    shape.errorType = stringValue(error.type);
    shape.errorMessage = stringValue(error.message);
  }
  return shape;
}

function providerMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const record = json as UnknownRecord;
    const error = record.error as UnknownRecord | undefined;
    return stringValue(error?.message) ?? stringValue(record.message) ?? fallback;
  }
  return fallback;
}

function imageKindCounts(images: ProviderImage[]): Record<string, number> {
  return images.reduce<Record<string, number>>((counts, image) => {
    counts[image.kind] = (counts[image.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function fileNameForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "reference.jpg";
  if (mime.includes("webp")) return "reference.webp";
  return "reference.png";
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
