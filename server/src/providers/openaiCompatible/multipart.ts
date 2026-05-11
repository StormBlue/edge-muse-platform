import { logInfo, logWarn, urlSummary } from "../../lib/log";
import type { ProviderLogContext } from "../types";
import { ProviderError } from "../types";
import { payloadShape, stringValue } from "../openai-compatibleHelpers";
import type { UnknownRecord } from "./constants";

export async function providerMultipartFetch(
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
