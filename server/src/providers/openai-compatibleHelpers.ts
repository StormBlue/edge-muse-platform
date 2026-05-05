import { base64ToBytes } from "../lib/encoding";
import { logError, logInfo, logWarn, urlSummary } from "../lib/log";
import type { GenerateRequest, GenerateResponse, ProviderImage, ProviderLogContext } from "./types";
import { ProviderError } from "./types";

const PROVIDER_FETCH_TIMEOUT_MS = 10 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;

type ProviderFetchLogContext = ProviderLogContext & {
  providerAdapter: string;
  endpoint: string;
  mode?: string;
  model?: string;
  size?: string;
  referenceImageCount?: number;
  requestedImageCount?: number;
  messageCount?: number;
};

/** 带超时与结构化请求/响应日志的 POST JSON，失败抛 ProviderError。 */
export async function providerFetch(
  url: string,
  apiKey: string,
  body: unknown,
  logContext: ProviderFetchLogContext
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  const bodyText = JSON.stringify(body);
  logInfo("provider.fetch.started", {
    ...logContext,
    url: urlSummary(url),
    requestBodyChars: bodyText.length,
    requestBodyShape: requestBodyShape(body)
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: bodyText,
      signal: controller.signal
    });
    const responseText = await response.text();
    const json = tryJson(responseText);
    const responseFields = {
      ...logContext,
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
      ...logContext,
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

/**
 * 从任意 OpenAI/兼容 JSON 中递归收集图片：支持 output/data/choices、内嵌 b64、url 字段与字符串里的 img/markdown。
 */
export function parseProviderImages(payload: unknown): ProviderImage[] {
  const images: ProviderImage[] = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      for (const image of extractImagesFromText(value)) images.push(image);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object") return;
    const record = value as UnknownRecord;
    collectImagesFromRecord(record, images);
    const markdownContent = stringValue(record.content);
    if (markdownContent) {
      for (const image of extractImagesFromText(markdownContent)) images.push(image);
    }
    if ("image_url" in record && typeof record.image_url !== "string") visit(record.image_url);
    if ("attachments" in record) visit(record.attachments);
    if ("src" in record) visit(record.src);
    if ("image" in record) visit(record.image);
    if ("images" in record) visit(record.images);
    if ("data" in record) visit(record.data);
    if ("output" in record) visit(record.output);
    if ("choices" in record) visit(record.choices);
    if ("message" in record) visit(record.message);
    if ("content" in record && typeof record.content !== "string") visit(record.content);
  };
  visit(payload);
  return dedupeImages(images);
}

function collectImagesFromRecord(record: UnknownRecord, images: ProviderImage[]): void {
  for (const key of [
    "b64_json",
    "base64_json",
    "result",
    "image_base64",
    "base64",
    "b64",
    "data_url"
  ]) {
    const value = stringValue(record[key]);
    if (!value) continue;
    const image = imageFromUrlOrData(value);
    if (image) images.push(image);
  }

  for (const key of ["image_url", "url", "src", "image", "asset_url", "download_url"]) {
    const value = stringValue(record[key]);
    if (!value) continue;
    const image = imageFromUrlOrData(value, { allowAnyHttpUrl: true });
    if (image) images.push(image);
  }
}

export function imageKindCounts(images: ProviderImage[]): Record<string, number> {
  return images.reduce<Record<string, number>>((counts, image) => {
    counts[image.kind] = (counts[image.kind] ?? 0) + 1;
    return counts;
  }, {});
}

/** 响应体摘要：output 项 type、error 块等，供 fetch 完成日志。 */
export function payloadShape(payload: unknown): UnknownRecord {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { type: Array.isArray(payload) ? "array" : typeof payload };
  }
  const record = payload as UnknownRecord;
  const shape: UnknownRecord = { keys: Object.keys(record).slice(0, 30).sort() };
  if (Array.isArray(record.output)) {
    shape.outputItems = record.output.length;
    shape.outputTypes = record.output
      .filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
      .map((item) => stringValue(item.type) ?? "unknown")
      .slice(0, 20);
  }
  if (Array.isArray(record.data)) shape.dataItems = record.data.length;
  if (Array.isArray(record.choices)) shape.choiceItems = record.choices.length;
  if (record.error && typeof record.error === "object") {
    const error = record.error as UnknownRecord;
    shape.errorCode = stringValue(error.code);
    shape.errorType = stringValue(error.type);
    shape.errorMessage = stringValue(error.message);
  }
  return shape;
}

export function extractText(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const record = json as UnknownRecord;
  const choices = record.choices;
  if (!Array.isArray(choices)) return undefined;
  const first = choices[0] as UnknownRecord | undefined;
  const message = first?.message as UnknownRecord | undefined;
  return stringValue(message?.content);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 本地/CI：`baseUrl: mock:` 时返回确定性 SVG，无外部网络。 */
export function mockGenerate(req: GenerateRequest): GenerateResponse {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#faf7f2"/>
  <rect x="96" y="96" width="832" height="832" rx="48" fill="#fff" stroke="#e8ded4" stroke-width="4"/>
  <circle cx="734" cy="298" r="92" fill="#f59e0b" opacity=".8"/>
  <path d="M168 810 C 310 620, 466 676, 584 540 S 760 420, 856 812 Z" fill="#8b5cf6" opacity=".24"/>
  <path d="M180 822 C 328 670, 434 720, 560 592 S 746 516, 844 822 Z" fill="#d97706" opacity=".33"/>
  <text x="512" y="460" text-anchor="middle" font-family="Inter, Arial" font-size="44" font-weight="700" fill="#1f2937">Edge Muse Mock</text>
  <text x="512" y="528" text-anchor="middle" font-family="Inter, Arial" font-size="24" fill="#6b7280">${escapeXml(req.prompt.slice(0, 72))}</text>
</svg>`;
  return {
    requestId: crypto.randomUUID(),
    images: [{ kind: "bytes", bytes: new TextEncoder().encode(svg), mime: "image/svg+xml" }],
    raw: { mock: true }
  };
}

function extractImagesFromText(text: string): ProviderImage[] {
  const images: ProviderImage[] = [];
  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /!\[[^\]]*]\(([^)]+)\)/g,
    /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g,
    /(https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?)/gi,
    /"((?:https?:\/\/)[^"]+)"/gi,
    /'((?:https?:\/\/)[^']+)'/gi,
    /([A-Za-z0-9+/=]{200,})/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const image = imageFromUrlOrData(match[1]);
      if (image) images.push(image);
    }
  }
  return images;
}

function imageFromUrlOrData(
  value: string,
  options: { allowAnyHttpUrl?: boolean } = {}
): ProviderImage | null {
  if (value.startsWith("data:image/")) {
    const stripped = stripDataUrl(value);
    return { kind: "base64", data: stripped.data, mime: stripped.mime };
  }
  if (/^https?:\/\//.test(value) && (options.allowAnyHttpUrl || isUsableImageUrl(value))) {
    return { kind: "url", url: value };
  }
  if (looksLikeBase64Image(value)) {
    const data = stripDataUrl(value).data;
    return { kind: "base64", data, mime: detectImageMime(data) };
  }
  return null;
}

function detectImageMime(base64: string): string {
  try {
    const sample = base64.slice(0, 64).padEnd(Math.ceil(Math.min(base64.length, 64) / 4) * 4, "=");
    const bytes = base64ToBytes(sample);
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return "image/png";
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  } catch {
    return "image/png";
  }
  return "image/png";
}

function isUsableImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();
    return (
      /\.(?:png|jpe?g|webp|gif|avif|bmp|tiff?)$/.test(pathname) ||
      url.searchParams.has("X-Amz-Signature") ||
      url.searchParams.has("response-content-type") ||
      url.searchParams.get("format")?.startsWith("image/") === true ||
      url.searchParams.get("content-type")?.startsWith("image/") === true
    );
  } catch {
    return false;
  }
}

function stripDataUrl(value: string): { data: string; mime: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(value.trim());
  if (!match) return { data: value.replace(/\s/g, ""), mime: "image/png" };
  return { mime: match[1], data: match[2].replace(/\s/g, "") };
}

function looksLikeBase64Image(value: string): boolean {
  const stripped = stripDataUrl(value).data;
  if (stripped.length < 32) return false;
  try {
    const bytes = base64ToBytes(stripped.slice(0, 80));
    return bytes.length > 0;
  } catch {
    return false;
  }
}

function dedupeImages(images: ProviderImage[]): ProviderImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key =
      image.kind === "url"
        ? image.url
        : image.kind === "base64"
          ? image.data.slice(0, 80)
          : String(image.bytes.byteLength);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 请求体只记键名与长度类元数据，不记录 prompt 全文。 */
function requestBodyShape(body: unknown): UnknownRecord {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { type: typeof body };
  const record = body as UnknownRecord;
  const shape: UnknownRecord = { keys: Object.keys(record).sort() };
  if (typeof record.model === "string") shape.model = record.model;
  if (typeof record.prompt === "string") shape.promptLength = record.prompt.length;
  if (typeof record.input === "string") shape.inputType = "string";
  if (Array.isArray(record.input)) shape.inputItems = record.input.length;
  if (Array.isArray(record.messages)) shape.messageCount = record.messages.length;
  if (Array.isArray(record.tools)) {
    shape.toolTypes = record.tools
      .filter((tool): tool is UnknownRecord => Boolean(tool) && typeof tool === "object")
      .map((tool) => stringValue(tool.type) ?? "unknown");
  }
  return shape;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function providerMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const record = json as UnknownRecord;
    const error = record.error as UnknownRecord | undefined;
    return stringValue(error?.message) ?? stringValue(record.message) ?? fallback;
  }
  return fallback;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
