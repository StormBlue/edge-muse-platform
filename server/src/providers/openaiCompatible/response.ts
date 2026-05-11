import { logInfo } from "../../lib/log";
import type { GenerateResponse, ProviderLogContext } from "../types";
import {
  imageKindCounts,
  parseProviderImages,
  payloadShape,
  stringValue
} from "../openai-compatibleHelpers";
import type { UnknownRecord } from "./constants";

export function parsedCompatibleResponse(
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
