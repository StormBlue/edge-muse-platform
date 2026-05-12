import { ref } from "./helpers";

export const captchaSchemas = {
  CaptchaProvider: {
    type: "string",
    enum: ["tencent", "turnstile", "altcha", "disabled"]
  },
  PublicCaptchaConfig: {
    oneOf: [
      {
        type: "object",
        required: ["provider", "region", "appId"],
        properties: {
          provider: { type: "string", const: "tencent" },
          region: { type: "string", enum: ["domestic", "overseas"] },
          appId: { type: "string" }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider", "region", "siteKey"],
        properties: {
          provider: { type: "string", const: "turnstile" },
          region: { type: "string", enum: ["domestic", "overseas"] },
          siteKey: { type: "string" }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider", "region", "challengeUrl"],
        properties: {
          provider: { type: "string", const: "altcha" },
          region: { type: "string", enum: ["domestic", "overseas"] },
          challengeUrl: { type: "string", const: "/api/captcha/altcha/challenge" }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider", "region"],
        properties: {
          provider: { type: "string", const: "disabled" },
          region: { type: "string", enum: ["domestic", "overseas"] }
        },
        additionalProperties: false
      }
    ]
  },
  LoginCaptchaProof: {
    oneOf: [
      {
        type: "object",
        required: ["provider", "ticket", "randstr"],
        properties: {
          provider: { type: "string", const: "tencent" },
          ticket: { type: "string", minLength: 1 },
          randstr: { type: "string", minLength: 1 }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider", "token"],
        properties: {
          provider: { type: "string", const: "turnstile" },
          token: { type: "string", minLength: 1 }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider", "payload"],
        properties: {
          provider: { type: "string", const: "altcha" },
          payload: {
            type: "string",
            minLength: 1,
            maxLength: 4096,
            description: "ALTCHA Widget v3 返回的 base64 payload。"
          }
        },
        additionalProperties: false
      },
      {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { type: "string", const: "disabled" }
        },
        additionalProperties: false
      }
    ]
  },
  CaptchaSettings: {
    type: "object",
    required: [
      "domesticProvider",
      "overseasProvider",
      "altchaDifficulty",
      "source",
      "updatedBy",
      "updatedAt"
    ],
    properties: {
      domesticProvider: ref("CaptchaProvider"),
      overseasProvider: ref("CaptchaProvider"),
      altchaDifficulty: {
        type: "integer",
        minimum: 10000,
        maximum: 200000,
        description: "ALTCHA PoW 难度；越高浏览器求解越慢，Worker 校验成本基本不变。"
      },
      source: { type: "string", enum: ["database", "environment", "default"] },
      updatedBy: { type: "string", nullable: true },
      updatedAt: { type: "integer" }
    },
    additionalProperties: false
  }
};
