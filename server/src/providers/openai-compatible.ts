/**
 * OpenAI 兼容生图：优先 `POST /v1/responses`（含 image tool），失败或 404/405/501 时回退
 * `images.generations` 或 `chat/completions`（图生图多模态），与 docs §3 一致。`baseUrl === "mock:"` 返回本地 SVG 便测试。
 */
import { bytesToBase64 } from "../lib/encoding";
import { logInfo, logWarn, urlSummary } from "../lib/log";
import type { GenerateRequest, GenerateResponse, ImageProvider } from "./types";
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
  "1024x1536",
  "1536x1024",
  "2048x2048",
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

  /** 入口：mock / chat 分支 + responses 主路 + 错误时降级 legacy */
  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    logInfo("provider.generate.started", {
      ...req.logContext,
      providerAdapter: this.id,
      mode: req.mode,
      model: req.model,
      size: req.size,
      baseUrl: urlSummary(req.baseUrl),
      referenceImageCount: req.referenceImages?.length ?? 0,
      messageCount: req.messages?.length ?? null
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
    if (req.mode === "chat") return this.chat(req);
    try {
      return await this.responses(req);
    } catch (error) {
      if (error instanceof ProviderError && [404, 405, 501].includes(error.status ?? 0)) {
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
    const messages = req.messages?.map((message) => ({
      role: message.role,
      content: message.content
    })) ?? [
      {
        role: "user",
        content:
          req.mode === "image2image"
            ? [
                { type: "text", text: req.prompt },
                ...(req.referenceImages ?? []).map((image) => ({
                  type: "image_url",
                  image_url: { url: `data:${image.mime};base64,${bytesToBase64(image.bytes)}` }
                }))
              ]
            : req.prompt
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
