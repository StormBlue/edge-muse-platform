import { toArrayBuffer } from "../../lib/encoding";
import { bytesToBase64 } from "../../lib/encoding";
import { logInfo, logWarn, urlSummary } from "../../lib/log";
import {
  effectiveMicuModel,
  isMicuHighResolutionSize,
  MICU_IMAGE_SIZE_PRESETS
} from "../micuPolicy";
import type { GenerateRequest, GenerateResponse, ImageProvider } from "../types";
import { ProviderError } from "../types";
import { mockGenerate, providerFetch } from "../openai-compatibleHelpers";
import { chatCompletion } from "./chat";
import { providerMultipartFetch } from "./multipart";
import { parsedCompatibleResponse } from "./response";

/**
 * 米醋当前代理形态：
 * - `/v1/responses` 实测不可用，直接跳过，避免每张图多一次 404。
 * - 文生图与图生图强制 `response_format=b64_json`，减少临时 URL 过期/下载失败。
 * - 图生图主路 `/v1/images/edits`，端点不可用/代理 503 时按测试页回落嵌图 chat/completions。
 * - 2K 单参考图保留米醋 `reference_image` 捷径；2K 多参考图走 chat 多模态，避免静默丢图。
 */
export class MicuImagesProvider implements ImageProvider {
  id = "micu_images";
  name = "Micu Images";
  supportedSizes = [...MICU_IMAGE_SIZE_PRESETS];
  supportedModes: ImageProvider["supportedModes"] = ["image2image", "text2image"];
  maxReferenceImages = 5;

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
        ...sizePayload(req.size),
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
    const referenceImages = req.referenceImages ?? [];
    if (!referenceImages.length)
      throw new ProviderError("PROVIDER_VALIDATION_ERROR", "Reference image required");
    if (isMicuHighResolutionSize(req.size)) {
      if (referenceImages.length === 1) return this.micuReferenceImage(req, referenceImages[0]);
      logInfo("provider.micu.high_resolution_multi_reference_chat", {
        ...req.logContext,
        providerAdapter: this.id,
        size: req.size,
        referenceImageCount: referenceImages.length
      });
      return this.micuChat(req);
    }
    const model = resolveMicuRequestModel(req, this.id);
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", req.prompt);
    if (shouldSendSize(req.size)) form.set("size", req.size);
    form.set("response_format", "b64_json");
    const imageFieldName = referenceImages.length > 1 ? "image[]" : "image";
    referenceImages.forEach((image, index) => {
      form.append(
        imageFieldName,
        new Blob([toArrayBuffer(image.bytes)], { type: image.mime }),
        fileNameForMime(image.mime, index)
      );
    });
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerMultipartFetch(`${baseUrl}/v1/images/edits`, req.apiKey, form, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.edits",
      mode: req.mode,
      model,
      size: req.size,
      referenceImageCount: referenceImages.length
    });
    return parsedCompatibleResponse(json, req.logContext, {
      providerAdapter: this.id,
      endpoint: "images.edits"
    });
  }

  private async micuChat(req: GenerateRequest): Promise<GenerateResponse> {
    return chatCompletion(req, this.id, resolveMicuRequestModel(req, this.id));
  }

  private async micuReferenceImage(
    req: GenerateRequest,
    referenceImage: NonNullable<GenerateRequest["referenceImages"]>[number]
  ): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const model = resolveMicuRequestModel(req, this.id);
    const json = await providerFetch(
      `${baseUrl}/v1/images/generations`,
      req.apiKey,
      {
        model,
        prompt: req.prompt,
        n: 1,
        ...sizePayload(req.size),
        reference_image: `data:${referenceImage.mime};base64,${bytesToBase64(referenceImage.bytes)}`,
        response_format: "b64_json"
      },
      {
        ...req.logContext,
        providerAdapter: this.id,
        endpoint: "images.generations.reference_image",
        mode: req.mode,
        model,
        size: req.size,
        referenceImageCount: req.referenceImages?.length ?? 0,
        requestedImageCount: 1
      }
    );
    return parsedCompatibleResponse(json, req.logContext, {
      providerAdapter: this.id,
      endpoint: "images.generations.reference_image"
    });
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

function fileNameForMime(mime: string, index: number): string {
  const suffix = index + 1;
  if (mime.includes("jpeg") || mime.includes("jpg")) return `image-${suffix}.jpg`;
  if (mime.includes("webp")) return `image-${suffix}.webp`;
  return `image-${suffix}.png`;
}

function shouldSendSize(size: string): boolean {
  return size !== "auto";
}

function sizePayload(size: string): { size?: string } {
  return shouldSendSize(size) ? { size } : {};
}
