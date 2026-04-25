import { base64ToBytes, bytesToBase64 } from "../lib/encoding";
import type { GenerateRequest, GenerateResponse, ImageProvider, ProviderImage } from "./types";
import { ProviderError } from "./types";

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

export class OpenAICompatibleProvider implements ImageProvider {
  id = "openai_compatible";
  name = "OpenAI Compatible";
  supportedSizes = DEFAULT_SIZES;

  async health(req: Pick<GenerateRequest, "apiKey" | "baseUrl" | "model">): Promise<boolean> {
    const response = await fetch(`${req.baseUrl.replace(/\/$/, "")}/v1/models`, {
      headers: { Authorization: `Bearer ${req.apiKey}` }
    });
    return response.ok;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    if (req.baseUrl === "mock:") return mockGenerate(req);
    if (req.mode === "chat") return this.chat(req);
    try {
      return await this.responses(req);
    } catch (error) {
      if (error instanceof ProviderError && [404, 405, 501].includes(error.status ?? 0)) {
        return req.mode === "image2image" ? this.chat(req) : this.legacyImage(req);
      }
      throw error;
    }
  }

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
    const json = await providerFetch(`${baseUrl}/v1/responses`, req.apiKey, body);
    return {
      requestId: stringValue((json as UnknownRecord).id),
      images: parseProviderImages(json),
      raw: json
    };
  }

  private async legacyImage(req: GenerateRequest): Promise<GenerateResponse> {
    const baseUrl = req.baseUrl.replace(/\/$/, "");
    const json = await providerFetch(`${baseUrl}/v1/images/generations`, req.apiKey, {
      model: req.model,
      prompt: req.prompt,
      n: 1,
      size: req.size
    });
    return {
      requestId: stringValue((json as UnknownRecord).id),
      images: parseProviderImages(json),
      raw: json
    };
  }

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
    const json = await providerFetch(`${baseUrl}/v1/chat/completions`, req.apiKey, {
      model: req.model,
      messages
    });
    const text = extractText(json);
    return {
      requestId: stringValue((json as UnknownRecord).id),
      images: parseProviderImages(json),
      text,
      raw: json
    };
  }
}

async function providerFetch(url: string, apiKey: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 95_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseText = await response.text();
    const json = tryJson(responseText);
    if (!response.ok) {
      throw new ProviderError("PROVIDER_HTTP_ERROR", providerMessage(json, responseText), {
        status: response.status,
        body: json ?? responseText
      });
    }
    return json ?? {};
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      "PROVIDER_FETCH_ERROR",
      error instanceof Error ? error.message : "Provider failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

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
    const b64 = stringValue(record.b64_json) ?? stringValue(record.result);
    if (b64 && looksLikeBase64Image(b64)) {
      images.push({ kind: "base64", data: stripDataUrl(b64).data, mime: stripDataUrl(b64).mime });
    }
    const imageUrl = stringValue(record.image_url) ?? stringValue(record.url);
    if (imageUrl) {
      const parsed = imageFromUrlOrData(imageUrl);
      if (parsed) images.push(parsed);
    }
    const markdownContent = stringValue(record.content);
    if (markdownContent) {
      for (const image of extractImagesFromText(markdownContent)) images.push(image);
    }
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

function extractImagesFromText(text: string): ProviderImage[] {
  const images: ProviderImage[] = [];
  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/gi,
    /!\[[^\]]*]\(([^)]+)\)/g,
    /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g,
    /(https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?)/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const image = imageFromUrlOrData(match[1]);
      if (image) images.push(image);
    }
  }
  return images;
}

function imageFromUrlOrData(value: string): ProviderImage | null {
  if (value.startsWith("data:image/")) {
    const stripped = stripDataUrl(value);
    return { kind: "base64", data: stripped.data, mime: stripped.mime };
  }
  if (/^https?:\/\//.test(value)) return { kind: "url", url: value };
  if (looksLikeBase64Image(value))
    return { kind: "base64", data: stripDataUrl(value).data, mime: "image/png" };
  return null;
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

function extractText(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const record = json as UnknownRecord;
  const choices = record.choices;
  if (!Array.isArray(choices)) return undefined;
  const first = choices[0] as UnknownRecord | undefined;
  const message = first?.message as UnknownRecord | undefined;
  return stringValue(message?.content);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mockGenerate(req: GenerateRequest): GenerateResponse {
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
