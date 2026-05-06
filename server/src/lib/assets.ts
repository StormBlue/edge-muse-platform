/**
 * Public R2 assets used by product-managed content such as prompt case thumbnails.
 */
import { sha256Hex } from "./crypto";
import { appError } from "./errors";
import { newId } from "./id";
import type { AppBindings } from "../types";

const allowedImageMime = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxPromptCaseImageSize = 8 * 1024 * 1024;
const defaultAssetsBaseUrl = "https://assets.pinkteck.com";

export type PublicAssetUpload = {
  url: string;
  key: string;
  mime: string;
  byteSize: number;
  sha256: string;
};

export async function putPromptCaseAsset(
  env: AppBindings,
  input: {
    bytes: Uint8Array;
    mime: string;
    filename?: string | null;
    category?: string | null;
  }
): Promise<PublicAssetUpload> {
  if (!allowedImageMime.has(input.mime)) {
    throw appError("VALIDATION_ERROR", "Unsupported image type");
  }
  if (input.bytes.byteLength === 0) {
    throw appError("VALIDATION_ERROR", "Image file is empty");
  }
  if (input.bytes.byteLength > maxPromptCaseImageSize) {
    throw appError("PAYLOAD_TOO_LARGE", "Image exceeds 8MB");
  }

  const sha = await sha256Hex(input.bytes);
  const key = buildPromptCaseAssetKey({
    category: input.category,
    id: newId("asset"),
    mime: input.mime,
    filename: input.filename
  });
  await env.ASSETS_R2.put(key, input.bytes, {
    httpMetadata: {
      contentType: input.mime,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: { sha256: sha }
  });

  return {
    url: `${assetsBaseUrl(env)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    key,
    mime: input.mime,
    byteSize: input.bytes.byteLength,
    sha256: sha
  };
}

function buildPromptCaseAssetKey(input: {
  category?: string | null;
  id: string;
  mime: string;
  filename?: string | null;
}): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const category = categoryPathSegment(input.category);
  const sourceName = input.filename ? `-${slugify(stripExtension(input.filename))}` : "";
  return `prompt-cases/${year}/${month}/${category}/${input.id}${sourceName}${extensionFromMime(input.mime)}`;
}

function assetsBaseUrl(env: AppBindings): string {
  return (env.ASSETS_PUBLIC_BASE_URL || defaultAssetsBaseUrl).replace(/\/+$/g, "");
}

function extensionFromMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".png";
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, "");
}

function categoryPathSegment(value?: string | null): string {
  const explicit: Record<string, string> = {
    人像与摄影: "portrait-photography",
    商品与广告: "product-advertising",
    海报与插画: "poster-illustration",
    角色与世界观: "character-worldbuilding",
    "UI 与社媒截图": "ui-social-screenshots",
    信息图与知识卡: "infographics-knowledge-cards",
    视频感关键帧: "cinematic-keyframes"
  };
  const trimmed = String(value ?? "").trim();
  return explicit[trimmed] ?? slugify(trimmed || "uncategorized");
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{ASCII}]/gu, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "untitled";
}
