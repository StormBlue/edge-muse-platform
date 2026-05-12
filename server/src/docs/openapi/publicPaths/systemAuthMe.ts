import {
  authSecurity,
  commonErrors,
  csrfSecurity,
  errorResponse,
  forbiddenError,
  jsonResponse,
  okBody,
  rateLimitError,
  ref,
  requestJson,
  validationError
} from "../helpers";

export const systemAuthMePaths = {
  "/api/health": {
    get: {
      tags: ["System"],
      operationId: "getHealth",
      summary: "服务健康检查",
      description:
        "无需登录。返回 Worker 是否可响应、服务名、当前环境和服务端时间戳。常用于本地开发、部署探活和监控。不会访问 D1/R2/KV。",
      responses: {
        "200": jsonResponse("服务可用。", {
          type: "object",
          required: ["ok", "service", "environment", "now"],
          properties: {
            ok: { type: "boolean", const: true },
            service: { type: "string", const: "edge-muse-platform" },
            environment: {
              type: "string",
              description: "当前 Worker 环境，如 `dev` 或 `production`。"
            },
            now: { type: "integer", description: "服务端当前 Unix epoch milliseconds。" }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/config": {
    get: {
      tags: ["System"],
      operationId: "getPublicConfig",
      summary: "读取前端公开配置",
      description:
        "无需登录。返回当前地区登录验证码的公开配置；dev 环境默认返回 `provider=disabled`，但 sysadmin 在系统设置保存的验证码配置会生效。不得在该接口返回任何服务端密钥或内部配置。",
      responses: {
        "200": jsonResponse("公开配置。", {
          type: "object",
          required: ["captcha", "turnstileSiteKey"],
          properties: {
            captcha: ref("PublicCaptchaConfig"),
            turnstileSiteKey: {
              type: "string",
              nullable: true,
              description:
                "兼容旧前端的 Cloudflare Turnstile site key；当前 provider 不是 Turnstile 时为 `null`。"
            }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/captcha/altcha/challenge": {
    get: {
      tags: ["System"],
      operationId: "createAltchaChallenge",
      summary: "签发 ALTCHA challenge",
      description:
        "无需登录。仅在登录验证码 provider 为 `altcha` 时由 ALTCHA Widget 调用。接口带匿名限流；Worker 使用 Web Crypto 生成 signed SHA-256 challenge；浏览器完成 PoW，Worker 登录时只做常数次签名/hash 校验和 replay 消费。",
      responses: {
        "200": jsonResponse("ALTCHA Widget v3 原生 challenge。", {
          type: "object",
          required: ["parameters", "signature"],
          properties: {
            parameters: {
              type: "object",
              required: [
                "algorithm",
                "cost",
                "data",
                "expiresAt",
                "keyLength",
                "keyPrefix",
                "nonce",
                "salt"
              ],
              properties: {
                algorithm: { type: "string", const: "SHA-256" },
                cost: { type: "integer", const: 1 },
                data: {
                  type: "object",
                  required: ["difficulty"],
                  properties: {
                    difficulty: { type: "integer", minimum: 10000, maximum: 200000 }
                  },
                  additionalProperties: false
                },
                expiresAt: { type: "integer", description: "Unix epoch seconds。" },
                keyLength: { type: "integer", const: 32 },
                keyPrefix: { type: "string" },
                nonce: { type: "string" },
                salt: { type: "string" }
              },
              additionalProperties: false
            },
            signature: { type: "string" }
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...rateLimitError,
        "500": commonErrors["500"]
      }
    }
  },
  "/api/openapi.json": {
    get: {
      tags: ["System"],
      operationId: "getOpenApiDocument",
      summary: "读取 OpenAPI 3.1 文档",
      description:
        "返回本文件所描述的 OpenAPI JSON。dev 环境可直接访问；production 环境要求 sysadmin 登录，避免公开暴露内部管理接口清单。",
      responses: {
        "200": jsonResponse("OpenAPI 3.1 JSON。", {
          type: "object",
          required: ["openapi", "info", "paths"],
          additionalProperties: true
        }),
        ...commonErrors,
        ...forbiddenError
      }
    }
  },
  "/api/docs": {
    get: {
      tags: ["System"],
      operationId: "getApiReference",
      summary: "打开 Scalar API Reference 页面",
      description:
        "返回 HTML 文档页，页面会读取 `/api/openapi.json` 渲染交互式 API Reference。dev 环境可直接访问；production 环境要求 sysadmin 登录。",
      responses: {
        "200": {
          description: "HTML API Reference 页面。",
          content: {
            "text/html": { schema: { type: "string" } }
          }
        },
        ...commonErrors,
        ...forbiddenError
      }
    }
  },
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      operationId: "login",
      summary: "用户名/邮箱登录",
      description:
        "用用户名或邮箱加密码登录。成功后设置 `em_access`、`em_refresh`、`em_csrf` 三枚 Cookie，并在响应体返回 `csrfToken`，前端后续写请求需要将其放入 `X-CSRF-Token`。该接口不要求 CSRF；验证码 provider 是否必需由地区和 sysadmin 配置决定。",
      requestBody: requestJson("登录凭据。`email` 字段实际接受用户名或邮箱。", {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", minLength: 1, description: "用户名或邮箱。" },
          password: { type: "string", minLength: 8 },
          captcha: ref("LoginCaptchaProof"),
          turnstileToken: {
            type: "string",
            description: "兼容旧前端的 Turnstile 客户端 token；推荐使用 `captcha`。"
          }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse(
          "登录成功，返回用户启动数据并设置认证 Cookie。",
          ref("BootstrapResponse")
        ),
        ...validationError,
        "401": errorResponse("用户名/邮箱不存在或密码错误。code 为 `UNAUTHORIZED`。"),
        "403": errorResponse("验证码校验失败或用户被禁用。code 为 `FORBIDDEN`。"),
        ...rateLimitError,
        "500": commonErrors["500"]
      }
    }
  },
  "/api/auth/logout": {
    post: {
      tags: ["Auth"],
      operationId: "logout",
      summary: "登出当前账号",
      description:
        "要求登录和 CSRF。服务端会把当前 access token 的 jti 写入 KV 黑名单，并清理认证 Cookie。即使 access token 已过期，也会尽量清理客户端 Cookie。",
      security: csrfSecurity,
      responses: {
        "200": jsonResponse("登出成功。", okBody),
        ...commonErrors,
        ...forbiddenError
      }
    }
  },
  "/api/auth/refresh": {
    post: {
      tags: ["Auth"],
      operationId: "refreshAuth",
      summary: "刷新登录态",
      description:
        "使用 httpOnly `em_refresh` Cookie 刷新整组 access/refresh/csrf token，并返回新的 `csrfToken`。该接口不要求 CSRF，因为旧 CSRF 可能已失效。",
      responses: {
        "200": jsonResponse(
          "刷新成功，返回新的用户启动数据并轮换 Cookie。",
          ref("BootstrapResponse")
        ),
        "401": errorResponse("refresh cookie 缺失、过期、伪造，或用户不存在/已禁用。"),
        "500": commonErrors["500"]
      }
    }
  },
  "/api/auth/password/change": {
    post: {
      tags: ["Auth"],
      operationId: "changePassword",
      summary: "当前用户修改密码",
      description: "要求登录和 CSRF。校验旧密码后写入新密码哈希；不会在响应或日志中输出明文密码。",
      security: csrfSecurity,
      requestBody: requestJson("旧密码和新密码。", {
        type: "object",
        required: ["oldPassword", "newPassword"],
        properties: {
          oldPassword: { type: "string", minLength: 1 },
          newPassword: { type: "string", minLength: 8 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("密码修改成功。", okBody),
        ...validationError,
        "401": errorResponse("未登录或旧密码错误。"),
        ...forbiddenError,
        "404": commonErrors["404"],
        "500": commonErrors["500"]
      }
    }
  },
  "/api/me": {
    get: {
      tags: ["Me"],
      operationId: "getMe",
      summary: "读取当前用户启动数据",
      description:
        "要求登录。返回当前 active 用户、实时配额、provider 能力、生成入口配置和提示词助手开关。前端首屏、路由守卫和刷新登录态后会调用。",
      security: authSecurity,
      responses: {
        "200": jsonResponse("当前用户启动数据。", ref("BootstrapResponse")),
        ...commonErrors
      }
    },
    patch: {
      tags: ["Me"],
      operationId: "updateMe",
      summary: "修改当前用户昵称",
      description:
        "要求登录和 CSRF。仅允许修改展示昵称；响应会返回合并后的用户数据及刷新后的配额/能力快照。",
      security: csrfSecurity,
      requestBody: requestJson("新的展示昵称。", {
        type: "object",
        required: ["nickname"],
        properties: {
          nickname: { type: "string", minLength: 1, maxLength: 40 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("昵称已更新。", ref("BootstrapResponse")),
        ...validationError,
        ...commonErrors,
        ...forbiddenError
      }
    }
  }
};
