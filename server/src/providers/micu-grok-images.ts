import { bytesToBase64 } from "../lib/encoding";
import { logInfo, urlSummary } from "../lib/log";
import type { GenerateRequest, GenerateResponse, ImageProvider } from "./types";
import { ProviderError } from "./types";
import {
  imageKindCounts,
  mockGenerate,
  parseProviderImages,
  payloadShape,
  providerFetch,
  stringValue
} from "./openai-compatibleHelpers";

const SUPPORTED_SIZES = [
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x2048",
  "2048x1152",
  "1152x2048"
];

const ASPECT_RATIOS: Record<string, number> = {
  "1:1": 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "3:2": 3 / 2,
  "2:3": 2 / 3
};

export class MicuGrokImagesProvider implements ImageProvider {
  id = "micu_grok_images";
  name = "Micu Grok Images";
  supportedSizes = SUPPORTED_SIZES;
  supportedModes: ImageProvider["supportedModes"] = ["image2image", "text2image"];
  maxReferenceImages = 1;

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

    const referenceImage = req.referenceImages?.[0];
    if (req.mode === "image2image" && !referenceImage) {
      throw new ProviderError("PROVIDER_VALIDATION_ERROR", "Reference image required");
    }

    const body: Record<string, unknown> = {
      model: req.model,
      prompt: req.prompt,
      n: 1,
      resolution: grokResolution(req.size),
      aspect_ratio: grokAspectRatio(req.size),
      response_format: "b64_json"
    };
    if (referenceImage) {
      body.reference_image = `data:${referenceImage.mime};base64,${bytesToBase64(
        referenceImage.bytes
      )}`;
    }

    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerFetch(`${baseUrl}/v1/images/generations`, req.apiKey, body, {
      ...req.logContext,
      providerAdapter: this.id,
      endpoint: "images.generations",
      mode: req.mode,
      model: req.model,
      size: req.size,
      referenceImageCount: req.referenceImages?.length ?? 0,
      requestedImageCount: 1
    });
    const images = parseProviderImages(json);
    const requestId = stringValue((json as Record<string, unknown>).id);
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
}

export function grokResolution(size: string): "1k" | "2k" {
  return maxEdgeForSize(size) >= 1600 ? "2k" : "1k";
}

export function grokAspectRatio(size: string): string {
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return "1:1";
  const ratio = Number(match[1]) / Number(match[2]);
  let best = "1:1";
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const [name, value] of Object.entries(ASPECT_RATIOS)) {
    const delta = Math.abs(ratio - value);
    if (delta < bestDelta) {
      best = name;
      bestDelta = delta;
    }
  }
  return best;
}

function maxEdgeForSize(size: string): number {
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return 0;
  return Math.max(Number(match[1]), Number(match[2]));
}
