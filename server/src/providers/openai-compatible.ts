/**
 * OpenAI 兼容生图：优先 `POST /v1/responses`（含 image tool），失败或 404/405/501 时回退
 * `images.generations` 或 `chat/completions`（图生图多模态），与 docs §3 一致。`baseUrl === "mock:"` 返回本地 SVG 便测试。
 */
import { bytesToBase64, toArrayBuffer } from "../lib/encoding";
import { logInfo, logWarn, urlSummary } from "../lib/log";
import { effectiveMicuModel } from "./micuPolicy";
import type { GenerateRequest, GenerateResponse, ImageProvider, ProviderLogContext } from "./types";
import { ProviderError } from "./types";
import {
  extractText,
  imageKindCounts,
  mockGenerate,
  parseProviderImages,
  payloadShape,
  providerFetch,
  stringValue
} from "./openai-compatibleHelpers";

export { parseProviderImages } from "./openai-compatibleHelpers";

const DEFAULT_SIZES = [
  "1024x1024",
  "1280x720",
  "720x1280",
  "1024x1536",
  "1536x1024",
  "1920x1088",
  "1088x1920",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "2880x2880",
  "3840x2160",
  "2160x3840",
  "auto"
];

type UnknownRecord = Record<string, unknown>;

/**
 * gpt-image-2 等：统一解析 Responses/Legacy/Chat 多种 JSON 响型为 `ProviderImage[]`。
 */
export class OpenAICompatibleProvider implements ImageProvider {
  id = "openai_compatible";
  name = "OpenAI Compatible";
  supportedSizes = DEFAULT_SIZES;
  supportedModes: ImageProvider["supportedModes"] = ["image2image", "text2image"];

  /** 以 GET /v1/models 探测密钥是否可用 */
  async health(req: Pick<GenerateRequest, "apiKey" | "baseUrl" | "model">): Promise<boolean> {
    const startedAt = Date.now();
    logInfo("provider.health.started", {
      providerAdapter: this.id,
      baseUrl: urlSummary(req.baseUrl),
      model: req.model
    });
    const response = await fetch(`${req.baseUrl.replace(/\/$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${req.apiKey}` }
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
  }

  /** 入口：mock 分支 + responses 主路 + 错误时降级 legacy */
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
    if (req.baseUrl === "mock:") {
      const response = mockGenerate(req);
      logInfo("provider.generate.mock_finished", {
        ...req.logContext,
        providerAdapter: this.id,
        requestId: response.requestId,
        imageCount: response.images.length
      });
      return response;
    }
    try {
      return await this.responses(req);
    } catch (error) {
      if (error instanceof ProviderError && [404, 405, 501, 503].includes(error.status ?? 0)) {
        logWarn("provider.generate.responses_fallback", {
          ...req.logContext,
          providerAdapter: this.id,
          status: error.status,
          code: error.code,
          fallbackEndpoint: req.mode === "image2image" ? "chat.completions" : "images.generations"
        });
        return req.mode === "image2image" ? this.chat(req) : this.legacyImage(req);
      }
      throw error;
    }
  }

  /** Responses API（/v1/responses），文生图与图生图多模态 input */
  private async responses(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const body =
      req.mode === "image2image"
        ? {
            model: req.model,
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: req.prompt },
                  ...(req.referenceImages ?? []).map((image) => ({
                    type: "input_image",
                    image_url: `data:${image.mime};base64,${bytesToBase64(image.bytes)}`
                  }))
                ]
              }
            ],
            tools: [{ type: "image_generation", size: req.size }]
          }
        : {
            model: req.model,
            input: req.prompt,
            tools: [{ type: "image_generation", size: req.size }]
          };
    const json = await providerFetch(`${baseUrl}/v1/responses`, req.apiKey, body, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "responses",
      mode: req.mode,
      model: req.model,
      size: req.size,
      referenceImageCount: req.referenceImages?.length ?? 0
    });
    const images = parseProviderImages(json);
    const requestId = stringValue((json as UnknownRecord).id);
    logInfo("provider.response.parsed", {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "responses",
      requestId: requestId ?? null,
      imageCount: images.length,
      imageKinds: imageKindCounts(images),
      payloadShape: payloadShape(json)
    });
    return {
      requestId,
      images,
      raw: json
    };
  }

  /** 回退：POST /v1/images/generations（仅文生图路径） */
  private async legacyImage(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerFetch(
      `${baseUrl}/v1/images/generations`,
      req.apiKey,
      {
        model: req.model,
        prompt: req.prompt,
        n: 1,
        size: req.size,
        response_format: "b64_json"
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
    const images = parseProviderImages(json);
    const requestId = stringValue((json as UnknownRecord).id);
    logInfo("provider.response.parsed", {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.generations",
      requestId: requestId ?? null,
      imageCount: images.length,
      imageKinds: imageKindCounts(images),
      payloadShape: payloadShape(json)
    });
    return {
      requestId,
      images,
      raw: json
    };
  }

  /** Chat Completions：对话式或图生图回退时走 messages */
  private async chat(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const messages = [
      {
        role: "user",
        content: chatContentForRequest(req, req.prompt)
      }
    ];
    const json = await providerFetch(
      `${baseUrl}/v1/chat/completions`,
      req.apiKey,
      {
        model: req.model,
        messages
      },
      {
        ...req.logContext,
        providerAdapter: this.id,
        endpoint: "chat.completions",
        mode: req.mode,
        model: req.model,
        size: req.size,
        messageCount: messages.length,
        referenceImageCount: req.referenceImages?.length ?? 0
      }
    );
    const text = extractText(json);
    const images = parseProviderImages(json);
    const requestId = stringValue((json as UnknownRecord).id);
    logInfo("provider.response.parsed", {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "chat.completions",
      requestId: requestId ?? null,
      imageCount: images.length,
      imageKinds: imageKindCounts(images),
      textLength: text?.length ?? 0,
      payloadShape: payloadShape(json)
    });
    return {
      requestId,
      images,
      text,
      raw: json
    };
  }
}

/**
 * 米醋当前代理形态：
 * - `/v1/responses` 实测不可用，直接跳过，避免每张图多一次 404。
 * - 文生图与单参考图图生图强制 `response_format=b64_json`，减少临时 URL 过期/下载失败。
 * - 图生图主路 `/v1/images/edits`，端点不可用/代理 503 时按测试页回落嵌图 chat/completions。
 */
export class MicuImagesProvider extends OpenAICompatibleProvider {
  id = "micu_images";
  name = "Micu Images";
  supportedSizes = DEFAULT_SIZES;
  supportedModes: ImageProvider["supportedModes"] = ["image2image", "text2image"];
  maxReferenceImages = 1;

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
    if (req.baseUrl === "mock:") {
      const response = mockGenerate(req);
      logInfo("provider.generate.mock_finished", {
        ...req.logContext,
        providerAdapter: this.id,
        requestId: response.requestId,
        imageCount: response.images.length
      });
      return response;
    }
    if (req.mode === "text2image") return this.micuImage(req);
    try {
      return await this.micuEdit(req);
    } catch (error) {
      if (error instanceof ProviderError && [0, 404, 405, 501, 503].includes(error.status ?? 0)) {
        logWarn("provider.generate.edits_fallback", {
          ...req.logContext,
          providerAdapter: this.id,
          status: error.status,
          code: error.code,
          fallbackEndpoint: "chat.completions"
        });
        return this.micuChat(req);
      }
      throw error;
    }
  }

  private async micuImage(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const model = resolveMicuRequestModel(req, this.id);
    const json = await providerFetch(
      `${baseUrl}/v1/images/generations`,
      req.apiKey,
      {
        model,
        prompt: req.prompt,
        n: 1,
        size: req.size,
        response_format: "b64_json"
      },
      {
        ...req.logContext,
        providerAdapter: this.id,
        endpoint: "images.generations",
        mode: req.mode,
        model,
        size: req.size,
        requestedImageCount: 1
      }
    );
    return parsedCompatibleResponse(json, req.logContext, {
      providerAdapter: this.id,
      endpoint: "images.generations"
    });
  }

  private async micuEdit(req: GenerateRequest): Promise<GenerateResponse> {
    const referenceImage = req.referenceImages?.[0];
    if (!referenceImage)
      throw new ProviderError("PROVIDER_VALIDATION_ERROR", "Reference image required");
    const model = resolveMicuRequestModel(req, this.id);
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", req.prompt);
    form.set("size", req.size);
    form.set("response_format", "b64_json");
    form.set(
      "image",
      new Blob([toArrayBuffer(referenceImage.bytes)], { type: referenceImage.mime }),
      fileNameForMime(referenceImage.mime)
    );
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerMultipartFetch(`${baseUrl}/v1/images/edits`, req.apiKey, form, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.edits",
      mode: req.mode,
      model,
      size: req.size,
      referenceImageCount: req.referenceImages?.length ?? 0
    });
    return parsedCompatibleResponse(json, req.logContext, {
      providerAdapter: this.id,
      endpoint: "images.edits"
    });
  }

  private async micuChat(req: GenerateRequest): Promise<GenerateResponse> {
    return chatCompletion(req, this.id, resolveMicuRequestModel(req, this.id));
  }
}

async function providerMultipartFetch(
  url: string,
  apiKey: string,
  body: FormData,
  logContext: ProviderLogContext & {
    providerAdapter: string;
    endpoint: string;
    mode?: string;
    model?: string;
    size?: string;
    referenceImageCount?: number;
  }
): Promise<unknown> {
  const startedAt = Date.now();
  logInfo("provider.fetch.started", {
    ...logContext,
    url: urlSummary(url),
    requestBodyChars: null,
    requestBodyShape: { keys: [...body.keys()].sort() }
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      },
      body
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
    throw new ProviderError(
      "PROVIDER_FETCH_ERROR",
      error instanceof Error ? error.message : "Provider failed"
    );
  }
}

function resolveMicuRequestModel(req: GenerateRequest, providerAdapter: string): string {
  const model = effectiveMicuModel(req.model, req.size);
  if (model !== req.model) {
    logInfo("provider.micu.model_upgraded", {
      ...req.logContext,
      providerAdapter,
      requestedModel: req.model,
      effectiveModel: model,
      size: req.size
    });
  }
  return model;
}

function parsedCompatibleResponse(
  json: unknown,
  logContext: ProviderLogContext | undefined,
  fields: { providerAdapter: string; endpoint: string }
): GenerateResponse {
  const images = parseProviderImages(json);
  const requestId = stringValue((json as UnknownRecord).id);
  logInfo("provider.response.parsed", {
    ...logContext,
    ...fields,
    requestId: requestId ?? null,
    imageCount: images.length,
    imageKinds: imageKindCounts(images),
    payloadShape: payloadShape(json)
  });
  return {
    requestId,
    images,
    raw: json
  };
}

async function chatCompletion(
  req: GenerateRequest,
  providerAdapter: string,
  model = req.model
): Promise<GenerateResponse> {
  const baseUrl = req.baseUrl.replace(/\/$/, "");
  const messages = [
    {
      role: "user",
      content: chatContentForRequest(req, chatPromptForRequest(req))
    }
  ];
  const json = await providerFetch(
    `${baseUrl}/v1/chat/completions`,
    req.apiKey,
    {
      model,
      messages
    },
    {
      ...req.logContext,
      providerAdapter,
      endpoint: "chat.completions",
      mode: req.mode,
      model,
      size: req.size,
      messageCount: messages.length,
      referenceImageCount: req.referenceImages?.length ?? 0
    }
  );
  const response = parsedCompatibleResponse(json, req.logContext, {
    providerAdapter,
    endpoint: "chat.completions"
  });
  return {
    ...response,
    text: extractText(json)
  };
}

function imageToImageChatPrompt(prompt: string, size: string, referenceImageCount: number): string {
  const sizeMatch = /^(\d+)x(\d+)$/i.exec(size);
  const sizeSuffix = sizeMatch ? ` At exactly ${sizeMatch[1]}x${sizeMatch[2]} pixels.` : "";
  if (referenceImageCount <= 1) {
    return `Edit the attached image as described.${sizeSuffix}\n\nInstruction:\n${prompt}`;
  }
  return `Attached are ${referenceImageCount} reference images. Treat them as visual context/inspiration for the instruction below. Output ONE image per the instruction.${sizeSuffix} Do NOT collage, tile, montage, or arrange the input images side-by-side unless the instruction explicitly asks for that.\n\nInstruction:\n${prompt}`;
}

function chatPromptForRequest(req: GenerateRequest): string {
  if (req.mode !== "image2image") return req.prompt;
  return imageToImageChatPrompt(req.prompt, req.size, req.referenceImages?.length ?? 0);
}

function chatContentForRequest(req: GenerateRequest, prompt: string) {
  if (req.mode !== "image2image") return prompt;
  return [
    { type: "text", text: prompt },
    ...(req.referenceImages ?? []).map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${bytesToBase64(image.bytes)}` }
    }))
  ];
}

function fileNameForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "image.jpg";
  if (mime.includes("webp")) return "image.webp";
  return "image.png";
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
