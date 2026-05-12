import { logWarn } from "../log";
import type { AppBindings } from "../../types";

const TENCENT_CAPTCHA_ENDPOINT = "https://captcha.tencentcloudapi.com/";
const TENCENT_CAPTCHA_HOST = "captcha.tencentcloudapi.com";
const TENCENT_CAPTCHA_SERVICE = "captcha";
const TENCENT_CAPTCHA_ACTION = "DescribeCaptchaResult";
const TENCENT_CAPTCHA_VERSION = "2019-07-22";
const TENCENT_CAPTCHA_TYPE = 9;
const SIGN_ALGORITHM = "TC3-HMAC-SHA256";
const UTF8 = new TextEncoder();

type TencentCaptchaResponse = {
  Response?: {
    CaptchaCode?: number;
    CaptchaMsg?: string;
    EvilLevel?: number;
    GetCaptchaTime?: number;
    EvilBitmap?: number;
    SubmitCaptchaTime?: number;
    DeviceRiskCategory?: string;
    Score?: number;
    RequestId?: string;
    Error?: {
      Code?: string;
      Message?: string;
    };
  };
};

export type TencentCaptchaVerificationInput = {
  ticket: string;
  randstr: string;
  ip?: string;
};

export async function verifyTencentCaptcha(
  env: AppBindings,
  input: TencentCaptchaVerificationInput
): Promise<boolean> {
  const captchaAppId = Number(env.TENCENT_CAPTCHA_APP_ID);
  const appSecretKey = env.TENCENT_CAPTCHA_APP_SECRET_KEY?.trim();
  const secretId = env.TENCENTCLOUD_SECRET_ID?.trim();
  const secretKey = env.TENCENTCLOUD_SECRET_KEY?.trim();
  if (!Number.isFinite(captchaAppId) || !appSecretKey || !secretId || !secretKey) {
    logWarn("captcha.tencent_missing_config", {
      hasCaptchaAppId: Boolean(env.TENCENT_CAPTCHA_APP_ID),
      hasAppSecretKey: Boolean(appSecretKey),
      hasSecretId: Boolean(secretId),
      hasSecretKey: Boolean(secretKey)
    });
    return false;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    CaptchaType: TENCENT_CAPTCHA_TYPE,
    Ticket: input.ticket,
    UserIp: input.ip ?? "",
    Randstr: input.randstr,
    CaptchaAppId: captchaAppId,
    AppSecretKey: appSecretKey
  });
  const authorization = await signTencentCloudRequest({
    payload,
    timestamp,
    secretId,
    secretKey
  });
  try {
    const response = await fetch(TENCENT_CAPTCHA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        Host: TENCENT_CAPTCHA_HOST,
        "X-TC-Action": TENCENT_CAPTCHA_ACTION,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": TENCENT_CAPTCHA_VERSION,
        "X-TC-Region": env.TENCENTCLOUD_CAPTCHA_REGION?.trim() || "ap-guangzhou"
      },
      body: payload
    });

    const body = (await response.json().catch(() => ({}))) as TencentCaptchaResponse;
    const result = body.Response;
    const success = response.ok && result?.CaptchaCode === 1;
    if (!success) {
      logWarn("captcha.tencent_verify_failed", {
        status: response.status,
        captchaCode: result?.CaptchaCode,
        captchaMsg: result?.CaptchaMsg,
        requestId: result?.RequestId,
        errorCode: result?.Error?.Code,
        errorMessage: result?.Error?.Message
      });
    }
    return success;
  } catch (error) {
    logWarn("captcha.tencent_verify_error", {
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

type SignTencentCloudRequestInput = {
  payload: string;
  timestamp: number;
  secretId: string;
  secretKey: string;
};

export async function signTencentCloudRequest(input: SignTencentCloudRequestInput) {
  const date = utcDate(input.timestamp);
  const canonicalHeaders = [
    "content-type:application/json; charset=utf-8",
    `host:${TENCENT_CAPTCHA_HOST}`
  ].join("\n");
  const signedHeaders = "content-type;host";
  const hashedPayload = await sha256Hex(input.payload);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    hashedPayload
  ].join("\n");
  const credentialScope = `${date}/${TENCENT_CAPTCHA_SERVICE}/tc3_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    SIGN_ALGORITHM,
    String(input.timestamp),
    credentialScope,
    hashedCanonicalRequest
  ].join("\n");
  const secretDate = await hmac(`TC3${input.secretKey}`, date);
  const secretService = await hmac(secretDate, TENCENT_CAPTCHA_SERVICE);
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = toHex(await hmac(secretSigning, stringToSign));

  return [
    `${SIGN_ALGORITHM} Credential=${input.secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(", ");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", UTF8.encode(value));
  return toHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array | string, value: string) {
  const keyBytes = typeof key === "string" ? UTF8.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = UTF8.encode(value);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(signature);
}

function utcDate(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
