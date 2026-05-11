import { toArrayBuffer } from "../../lib/encoding";
import { logInfo, logWarn, urlSummary } from "../../lib/log";
import { effectiveMicuModel } from "../micuPolicy";
import type { GenerateRequest, GenerateResponse, ImageProvider } from "../types";
import { ProviderError } from "../types";
import { mockGenerate, providerFetch } from "../openai-compatibleHelpers";
import { DEFAULT_SIZES } from "./constants";
import { chatCompletion } from "./chat";
import { providerMultipartFetch } from "./multipart";
import { parsedCompatibleResponse } from "./response";

/**
 * 米醋当前代理形态：
 * - `/v1/responses` 实测不可用，直接跳过，避免每张图多一次 404。
 * - 文生图与单参考图图生图强制 `response_format=b64_json`，减少临时 URL 过期/下载失败。
 * - 图生图主路 `/v1/images/edits`，端点不可用/代理 503 时按测试页回落嵌图 chat/completions。
 */
export class MicuImagesProvider implements ImageProvider {
  id = "micu_images";
  name = "Micu Images";
  supportedSizes = DEFAULT_SIZES;
  supportedModes: ImageProvider["supportedModes"] = ["image2image", "text2image"];
  maxReferenceImages = 1;

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

function fileNameForMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "image.jpg";
  if (mime.includes("webp")) return "image.webp";
  return "image.png";
}
