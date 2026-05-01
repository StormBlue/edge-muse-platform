type OpenApiObject = Record<string, unknown>;

const jsonContent = (schema: OpenApiObject) => ({
  "application/json": { schema }
});

const jsonResponse = (description: string, schema: OpenApiObject) => ({
  description,
  content: jsonContent(schema)
});

const emptyResponse = (description: string) => ({ description });

const requestJson = (description: string, schema: OpenApiObject, required = true) => ({
  required,
  description,
  content: jsonContent(schema)
});

const requestMultipart = (description: string, schema: OpenApiObject) => ({
  required: true,
  description,
  content: {
    "multipart/form-data": { schema }
  }
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const arrayOf = (schema: OpenApiObject) => ({ type: "array", items: schema });

const pageParam = {
  name: "page",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, default: 1 },
  description: "页码，从 1 开始；非法数字按接口默认值处理。"
};

const pageSizeParam = (defaultValue: number, max: number) => ({
  name: "pageSize",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: max, default: defaultValue },
  description: `每页数量，最小 1，最大 ${max}。`
});

const cursorParam = {
  name: "cursor",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 0, default: 0 },
  description: "向历史方向翻页的游标。传 0 或省略表示第一页。"
};

const limitParam = (defaultValue = 20, max = 50) => ({
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: max, default: defaultValue },
  description: `本页最大返回数量，服务端会裁剪到 ${max} 以内。`
});

const pathParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
  description
});

const authSecurity = [{ accessCookie: [] }, { bearerAuth: [] }];
const csrfSecurity = [...authSecurity, { csrfHeader: [] }];
const adminSecurity = authSecurity;
const sysadminSecurity = authSecurity;

const errorResponse = (description: string) => jsonResponse(description, ref("ApiErrorBody"));

const commonErrors = {
  "401": errorResponse(
    "未登录、access token 缺失/过期/被吊销，或 Cookie/Bearer Token 无效。响应体 code 通常为 `UNAUTHORIZED`。"
  ),
  "404": errorResponse(
    "资源不存在，或当前用户无权访问时按不存在处理。响应体 code 为 `NOT_FOUND`。"
  ),
  "500": errorResponse("未预期服务端错误。响应体 code 为 `INTERNAL`，不会暴露堆栈。")
};

const validationError = {
  "400": errorResponse(
    "请求参数、查询参数或 JSON body 未通过校验。响应体 code 为 `VALIDATION_ERROR`，details 可能包含 Zod flatten 结果。"
  )
};

const forbiddenError = {
  "403": errorResponse(
    "权限不足、账号被禁用、CSRF token 缺失/不匹配，或业务策略禁止本操作。响应体 code 为 `FORBIDDEN`。"
  )
};

const rateLimitError = {
  "429": errorResponse("触发限流策略。响应体 code 为 `RATE_LIMITED`。")
};

const quotaError = {
  "402": errorResponse("配额不足或管理员分配超出自身剩余额度。响应体 code 为 `QUOTA_EXCEEDED`。")
};

const payloadTooLargeError = {
  "413": errorResponse("上传内容超过服务端限制。响应体 code 为 `PAYLOAD_TOO_LARGE`。")
};

const providerError = {
  "502": errorResponse("上游 provider 调用失败或返回不可用数据。响应体 code 为 `PROVIDER_ERROR`。")
};

const okBody = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean", const: true } },
  additionalProperties: false
};

export const openApiDocument: OpenApiObject = {
  openapi: "3.1.0",
  info: {
    title: "Edge Muse Platform API",
    version: "0.1.0",
    description:
      "Edge Muse Platform 的 Worker REST API。所有时间戳均为 Unix epoch milliseconds。除登录、刷新、健康检查、配置和本地文档端点外，业务接口默认要求登录；非 GET/HEAD/OPTIONS 请求还要求 `X-CSRF-Token` 与 `em_csrf` Cookie 完全一致。"
  },
  servers: [
    { url: "http://localhost:8787", description: "Local Wrangler dev server" },
    { url: "/", description: "Same-origin deployment" }
  ],
  tags: [
    { name: "System", description: "健康检查、公共配置和 API 文档元数据。" },
    { name: "Auth", description: "登录、登出、刷新登录态和修改密码。" },
    { name: "Me", description: "当前登录用户、配额、provider 能力和个人资料。" },
    { name: "Generation", description: "异步图片生成任务、任务状态、取消、重试和 WebSocket。" },
    { name: "Sessions", description: "工作台会话和消息。" },
    { name: "History", description: "历史生成记录列表与详情。" },
    { name: "Images", description: "参考图上传和私有图片代理。" },
    { name: "Prompt Assistant", description: "AI 提示词助手。" },
    { name: "Prompt Cases", description: "用户侧提示词案例库。" },
    { name: "Announcements", description: "用户侧公告中心。" },
    { name: "Admin", description: "租户管理员和 sysadmin 共用的下级用户管理接口。" },
    { name: "Sysadmin", description: "系统管理员全局配置、密钥、公告、案例和审计接口。" }
  ],
  components: {
    securitySchemes: {
      accessCookie: {
        type: "apiKey",
        in: "cookie",
        name: "em_access",
        description: "登录/刷新后服务端设置的 httpOnly access cookie，有效期约 15 分钟。"
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "可选 Bearer access token。服务端优先读取 Authorization Bearer，再回退到 `em_access` Cookie。"
      },
      csrfHeader: {
        type: "apiKey",
        in: "header",
        name: "X-CSRF-Token",
        description: "非安全方法必须携带，值必须与非 httpOnly Cookie `em_csrf` 完全一致。"
      }
    },
    schemas: {
      ApiErrorCode: {
        type: "string",
        enum: [
          "UNAUTHORIZED",
          "FORBIDDEN",
          "CONFLICT",
          "QUOTA_EXCEEDED",
          "PROVIDER_ERROR",
          "PAYLOAD_TOO_LARGE",
          "RATE_LIMITED",
          "VALIDATION_ERROR",
          "NOT_FOUND",
          "INTERNAL"
        ]
      },
      ApiErrorBody: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: ref("ApiErrorCode"),
              message: { type: "string", description: "面向客户端的简短错误说明。" },
              details: {
                description:
                  "可选结构化错误详情。校验错误通常是 Zod flatten 结果；业务错误可能携带冲突任务等上下文。"
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      },
      UserRole: { type: "string", enum: ["sysadmin", "admin", "user"] },
      UserStatus: { type: "string", enum: ["active", "disabled"] },
      AuthUser: {
        type: "object",
        required: ["id", "email", "username", "nickname", "role", "status"],
        properties: {
          id: { type: "string", description: "用户 ID，前缀通常为 `sys`、`adm` 或 `usr`。" },
          email: {
            type: "string",
            nullable: true,
            description: "邮箱；未填写时可能是系统生成占位邮箱。"
          },
          username: { type: "string", nullable: true, description: "登录用户名。" },
          nickname: { type: "string", nullable: true, description: "展示昵称。" },
          role: ref("UserRole"),
          status: ref("UserStatus"),
          preferredProviderKeyId: {
            type: "string",
            nullable: true,
            description: "优先使用的 provider key ID。"
          }
        },
        additionalProperties: true
      },
      QuotaSnapshot: {
        type: "object",
        required: ["allocatedQuota", "usedQuota", "remainingQuota"],
        properties: {
          allocatedQuota: { type: "integer", nullable: true, description: "`null` 表示无限配额。" },
          usedQuota: { type: "integer", minimum: 0, description: "已消耗张数。" },
          remainingQuota: {
            type: "integer",
            nullable: true,
            minimum: 0,
            description: "`null` 表示无限剩余。"
          }
        },
        additionalProperties: false
      },
      ProviderCapabilities: {
        type: "object",
        description: "当前用户可用 provider 能力快照；字段随 provider catalog 扩展。",
        additionalProperties: true
      },
      GenerationEntry: {
        type: "object",
        required: ["navTarget", "showWorkspace", "showAiImage"],
        properties: {
          navTarget: { type: "string", enum: ["/workspace", "/ai-image"] },
          showWorkspace: { type: "boolean" },
          showAiImage: { type: "boolean" }
        },
        additionalProperties: false
      },
      BootstrapResponse: {
        type: "object",
        required: [
          "user",
          "quota",
          "providerCapabilities",
          "generationEntry",
          "promptAssistantEnabled"
        ],
        properties: {
          user: ref("AuthUser"),
          csrfToken: {
            type: "string",
            description: "仅登录/刷新响应返回；后续写请求需放入 `X-CSRF-Token`。"
          },
          quota: ref("QuotaSnapshot"),
          providerCapabilities: ref("ProviderCapabilities"),
          generationEntry: ref("GenerationEntry"),
          promptAssistantEnabled: { type: "boolean" }
        },
        additionalProperties: false
      },
      ImageAttachment: {
        type: "object",
        required: ["id", "url", "mime", "byteSize"],
        properties: {
          id: { type: "string" },
          url: { type: "string", description: "私有图片代理 URL，通常为 `/api/i/{id}`。" },
          mime: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
          width: { type: "integer", nullable: true },
          height: { type: "integer", nullable: true },
          byteSize: { type: "integer", minimum: 0 },
          taskId: { type: "string", nullable: true },
          sessionId: { type: "string", nullable: true },
          messageId: { type: "string", nullable: true },
          prompt: { type: "string", nullable: true },
          isReference: { type: "boolean", nullable: true }
        },
        additionalProperties: true
      },
      TaskStatus: {
        type: "string",
        enum: ["queued", "running", "succeeded", "failed", "cancelled"]
      },
      GenerationMode: {
        type: "string",
        enum: ["text2image", "image2image", "chat"]
      },
      Task: {
        type: "object",
        required: [
          "id",
          "userId",
          "sessionId",
          "messageId",
          "status",
          "mode",
          "params",
          "queuedAt"
        ],
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          sessionId: { type: "string" },
          messageId: { type: "string" },
          providerKeyId: { type: "string", nullable: true },
          status: ref("TaskStatus"),
          mode: ref("GenerationMode"),
          params: { description: "任务创建时的生成参数 JSON 字符串或已解析对象，取决于具体接口。" },
          retryOf: { type: "string", nullable: true },
          errorCode: { type: "string", nullable: true },
          errorMsg: { type: "string", nullable: true },
          queuedAt: { type: "integer" },
          startedAt: { type: "integer", nullable: true },
          finishedAt: { type: "integer", nullable: true }
        },
        additionalProperties: true
      },
      SessionSettings: {
        type: "object",
        required: ["size", "n"],
        properties: {
          size: { type: "string", description: "尺寸预设或 `{width}x{height}`。" },
          n: {
            type: "integer",
            minimum: 1,
            maximum: 4,
            description: "请求生成张数；非 sysadmin 会按策略压到 1。"
          }
        },
        additionalProperties: true
      },
      Session: {
        type: "object",
        required: ["id", "userId", "title", "mode", "settings", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          title: { type: "string" },
          mode: ref("GenerationMode"),
          providerKeyId: { type: "string", nullable: true },
          settings: ref("SessionSettings"),
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" },
          lastMessageAt: { type: "integer", nullable: true },
          archived: { type: "boolean" },
          deletedAt: { type: "integer", nullable: true },
          taskCount: { type: "integer", minimum: 0 }
        },
        additionalProperties: true
      },
      Message: {
        type: "object",
        required: ["id", "sessionId", "role", "attachments", "status", "createdAt"],
        properties: {
          id: { type: "string" },
          sessionId: { type: "string" },
          role: { type: "string", enum: ["user", "assistant", "system"] },
          prompt: { type: "string", nullable: true },
          referenceImageIds: arrayOf({ type: "string" }),
          referenceImages: arrayOf(ref("ImageAttachment")),
          attachments: arrayOf(ref("ImageAttachment")),
          taskId: { type: "string", nullable: true },
          status: { type: "string" },
          error: {
            nullable: true,
            oneOf: [
              { type: "null" },
              {
                type: "object",
                required: ["code", "message"],
                properties: { code: { type: "string" }, message: { type: "string" } }
              }
            ]
          },
          createdAt: { type: "integer" },
          deletedAt: { type: "integer", nullable: true },
          task: { nullable: true, oneOf: [{ type: "null" }, ref("Task")] }
        },
        additionalProperties: true
      },
      PromptCase: {
        type: "object",
        required: [
          "id",
          "title",
          "category",
          "modes",
          "recommendedSize",
          "tags",
          "promptTemplate",
          "promptSummary",
          "sourceLicense",
          "status",
          "featured",
          "sortOrder",
          "locale",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          category: { type: "string" },
          modes: arrayOf({ type: "string", enum: ["text2image", "image2image"] }),
          recommendedSize: { type: "string" },
          tags: arrayOf({ type: "string" }),
          promptTemplate: { type: "string" },
          promptSummary: { type: "string" },
          thumbnailUrl: { type: "string", nullable: true },
          sourceUrl: { type: "string", nullable: true },
          sourceAuthor: { type: "string", nullable: true },
          sourceLicense: { type: "string", enum: ["CC BY 4.0", "original", "internal"] },
          sourceRepo: { type: "string", nullable: true },
          popularity: { type: "object", additionalProperties: true },
          status: { type: "string", enum: ["draft", "published", "hidden", "archived"] },
          featured: { type: "boolean" },
          sortOrder: { type: "integer" },
          locale: { type: "string", enum: ["zh-CN", "en-US"] },
          createdBy: { type: "string", nullable: true },
          updatedBy: { type: "string", nullable: true },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" }
        },
        additionalProperties: false
      },
      PromptCaseInput: {
        type: "object",
        required: [
          "title",
          "category",
          "modes",
          "recommendedSize",
          "promptTemplate",
          "promptSummary"
        ],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          category: { type: "string", minLength: 1, maxLength: 120 },
          modes: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: { type: "string", enum: ["text2image", "image2image"] }
          },
          recommendedSize: { type: "string", minLength: 1, maxLength: 40 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 40 },
            default: []
          },
          promptTemplate: { type: "string", minLength: 1, maxLength: 4000 },
          promptSummary: { type: "string", minLength: 1, maxLength: 800 },
          thumbnailUrl: { type: "string", nullable: true, maxLength: 1000 },
          sourceUrl: { type: "string", nullable: true, maxLength: 1000 },
          sourceAuthor: { type: "string", nullable: true, maxLength: 1000 },
          sourceLicense: {
            type: "string",
            enum: ["CC BY 4.0", "original", "internal"],
            default: "internal"
          },
          sourceRepo: { type: "string", nullable: true, maxLength: 1000 },
          popularity: { type: "object", additionalProperties: true, default: {} },
          status: {
            type: "string",
            enum: ["draft", "published", "hidden", "archived"],
            default: "draft"
          },
          featured: { type: "boolean", default: false },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000000, default: 0 },
          locale: { type: "string", enum: ["zh-CN", "en-US"], default: "zh-CN" }
        },
        additionalProperties: false
      },
      Announcement: {
        type: "object",
        required: ["id", "title", "contentPreview", "targetAudience", "createdAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          content: { type: "string", description: "详情或 sysadmin 列表中返回完整正文。" },
          contentPreview: { type: "string" },
          targetAudience: { type: "string", enum: ["all", "admins"] },
          status: { type: "string", enum: ["draft", "published", "archived"] },
          publishedAt: { type: "integer", nullable: true },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" },
          isRead: { type: "boolean" },
          createdBy: { type: "string", nullable: true },
          updatedBy: { type: "string", nullable: true }
        },
        additionalProperties: true
      },
      AdminUser: {
        type: "object",
        required: ["id", "email", "username", "nickname", "role", "status"],
        properties: {
          id: { type: "string" },
          email: { type: "string", nullable: true },
          username: { type: "string", nullable: true },
          nickname: { type: "string", nullable: true },
          role: ref("UserRole"),
          status: ref("UserStatus"),
          preferredProviderKeyId: { type: "string", nullable: true },
          allocatedQuota: { type: "integer", nullable: true },
          usedQuota: { type: "integer", nullable: true },
          providerKeyId: { type: "string", nullable: true },
          generationCount: { type: "integer", nullable: true },
          lastLoginAt: { type: "integer", nullable: true },
          lastGenerationAt: { type: "integer", nullable: true },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" }
        },
        additionalProperties: true
      },
      QuotaTransaction: {
        type: "object",
        required: ["id", "userId", "delta", "reason", "createdAt"],
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          delta: { type: "integer", description: "正数表示增加/退还，负数表示消耗。" },
          reason: { type: "string", enum: ["admin_grant", "task_charge", "task_refund"] },
          operatorId: { type: "string", nullable: true },
          taskId: { type: "string", nullable: true },
          createdAt: { type: "integer" }
        },
        additionalProperties: true
      },
      ProviderKeySummary: {
        type: "object",
        required: ["id", "label", "keyHint", "enabled"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          keyHint: { type: "string", description: "密钥末 4 位；永不返回明文。" },
          enabled: { type: "boolean" },
          providerId: { type: "string" },
          model: { type: "string" },
          allocatedQuota: { type: "integer", nullable: true },
          usedQuota: { type: "integer", nullable: true },
          ownerAdminId: { type: "string", nullable: true },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" }
        },
        additionalProperties: true
      },
      Provider: {
        type: "object",
        required: [
          "id",
          "name",
          "baseUrl",
          "defaultModel",
          "requestFormat",
          "supportedSizes",
          "enabled"
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          baseUrl: { type: "string" },
          defaultModel: { type: "string" },
          requestFormat: { type: "string" },
          supportedSizes: arrayOf({ type: "string" }),
          enabled: { type: "boolean" },
          builtIn: { type: "boolean" },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" },
          deletedAt: { type: "integer", nullable: true }
        },
        additionalProperties: true
      },
      GenerationEventInput: {
        type: "object",
        required: ["eventName", "route"],
        properties: {
          eventName: {
            type: "string",
            enum: [
              "entry_exposed",
              "page_opened",
              "prompt_case_selected",
              "assistant_started",
              "assistant_prompt_filled",
              "history_returned"
            ]
          },
          route: { type: "string", enum: ["/workspace", "/ai-image"] },
          caseId: { type: "string", maxLength: 120 },
          metadata: { type: "object", additionalProperties: true, default: {} }
        },
        additionalProperties: false
      },
      GenerationEventAttachment: {
        type: "object",
        properties: {
          route: { type: "string", enum: ["/workspace", "/ai-image"] },
          caseId: { type: "string", maxLength: 120 },
          metadata: { type: "object", additionalProperties: true, default: {} }
        },
        required: ["route"],
        additionalProperties: false
      }
    }
  },
  paths: {}
};

openApiDocument.paths = {
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
        "无需登录。当前仅返回 Turnstile site key；dev 环境通常为 `null`。不得在该接口返回任何服务端密钥或内部配置。",
      responses: {
        "200": jsonResponse("公开配置。", {
          type: "object",
          required: ["turnstileSiteKey"],
          properties: {
            turnstileSiteKey: {
              type: "string",
              nullable: true,
              description:
                "Cloudflare Turnstile site key；`null` 表示当前环境不启用前端 Turnstile。"
            }
          },
          additionalProperties: false
        }),
        ...commonErrors
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
        "用用户名或邮箱加密码登录。成功后设置 `em_access`、`em_refresh`、`em_csrf` 三枚 Cookie，并在响应体返回 `csrfToken`，前端后续写请求需要将其放入 `X-CSRF-Token`。该接口不要求 CSRF；Turnstile 是否必需由环境配置决定。",
      requestBody: requestJson("登录凭据。`email` 字段实际接受用户名或邮箱。", {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", minLength: 1, description: "用户名或邮箱。" },
          password: { type: "string", minLength: 8 },
          turnstileToken: {
            type: "string",
            description: "Turnstile 客户端 token；dev 环境通常可省略。"
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
        "403": errorResponse("Turnstile 校验失败或用户被禁用。code 为 `FORBIDDEN`。"),
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
  },
  "/api/generate": {
    post: {
      tags: ["Generation"],
      operationId: "createGenerateTask",
      summary: "创建异步图片生成任务",
      description:
        "要求登录、CSRF 和限流。服务端先校验生成入口是否开放、provider 能力、参考图归属和配额，再写入会话/消息/任务并预扣配额，随后通过 Workflow 或 waitUntil 后台执行。HTTP 不等待上游完成，成功返回 202 与 WebSocket 地址。",
      security: csrfSecurity,
      requestBody: requestJson("生成参数。图生图必须提供至少一个 `referenceImageIds`。", {
        type: "object",
        required: ["prompt"],
        properties: {
          sessionId: {
            type: "string",
            description: "已有会话 ID；空字符串会被视为未传并创建新会话。"
          },
          title: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "新会话标题；省略时服务端自动生成。"
          },
          prompt: { type: "string", minLength: 1, maxLength: 4000 },
          mode: { $ref: "#/components/schemas/GenerationMode", default: "text2image" },
          size: {
            type: "string",
            default: "1024x1024",
            description:
              "尺寸预设或自定义 `{width}x{height}`；还会受 provider supportedSizes 限制。内置白名单含 1024x1024、1024x1536、1536x1024、2048x2048、2880x2880、3840x2160、2160x3840、auto。"
          },
          n: {
            type: "integer",
            minimum: 1,
            maximum: 4,
            default: 1,
            description: "请求张数；非 sysadmin 角色会按策略压到 1。"
          },
          model: {
            type: "string",
            description: "可选模型覆盖；通常使用 provider key 的默认模型。"
          },
          referenceImageIds: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
            description: "图生图参考图 ID。仅 `mode=image2image` 使用，服务端会去重并校验归属。"
          },
          generationEvent: ref("GenerationEventAttachment")
        },
        additionalProperties: false
      }),
      responses: {
        "202": jsonResponse("任务已创建并进入队列。", {
          type: "object",
          required: ["taskId", "sessionId", "messageId", "title", "wsUrl"],
          properties: {
            taskId: { type: "string" },
            sessionId: { type: "string" },
            messageId: { type: "string" },
            title: { type: "string" },
            wsUrl: { type: "string", description: "连接任务事件的 WebSocket URL，无 `/api` 前缀。" }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...quotaError,
        ...forbiddenError,
        ...rateLimitError,
        ...providerError,
        ...commonErrors
      }
    }
  },
  "/api/tasks/{id}": {
    get: {
      tags: ["Generation"],
      operationId: "getTask",
      summary: "读取单个任务状态",
      description: "要求登录。只能读取当前用户有权访问的任务；sysadmin 仍通过权限函数校验。",
      security: authSecurity,
      parameters: [pathParam("id", "任务 ID。")],
      responses: {
        "200": jsonResponse("任务详情。", {
          type: "object",
          required: ["task"],
          properties: { task: ref("Task") },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/tasks/{id}/cancel": {
    post: {
      tags: ["Generation"],
      operationId: "cancelTask",
      summary: "取消排队中的任务",
      description:
        "要求登录和 CSRF。只有 `queued` 状态的任务可取消；取消成功会把任务状态写为 `cancelled` 并向已连接 WebSocket 推送 `task.update`。",
      security: csrfSecurity,
      parameters: [pathParam("id", "任务 ID。")],
      responses: {
        "200": jsonResponse("任务已取消。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/tasks/{id}/retry": {
    post: {
      tags: ["Generation"],
      operationId: "retryTask",
      summary: "重试失败任务",
      description:
        "要求登录和 CSRF。只有 `failed` 状态任务可重试；服务端使用旧任务 params 创建一条新任务，并在 `retryOf` 中记录血缘。",
      security: csrfSecurity,
      parameters: [pathParam("id", "源失败任务 ID。")],
      requestBody: requestJson(
        "可选生成入口事件。空对象 `{}` 合法；传入 generationEvent 时会记录重试提交事件。",
        {
          type: "object",
          properties: { generationEvent: ref("GenerationEventAttachment") },
          additionalProperties: false
        },
        false
      ),
      responses: {
        "202": jsonResponse("重试任务已创建。", {
          type: "object",
          required: ["taskId", "sessionId", "messageId", "title"],
          properties: {
            taskId: { type: "string" },
            sessionId: { type: "string" },
            messageId: { type: "string" },
            title: { type: "string" }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...quotaError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/ws/task/{id}": {
    get: {
      tags: ["Generation"],
      operationId: "connectTaskWebSocket",
      summary: "连接任务 WebSocket",
      description:
        "要求登录。HTTP Upgrade 到 WebSocket 后交给 Durable Object TaskRoom，用于接收 `task.update`、`task.image`、`task.done`、`task.failed` 等任务事件。该路径没有 `/api` 前缀，是 `POST /api/generate` 返回的正式地址。",
      security: authSecurity,
      parameters: [pathParam("id", "任务 ID。")],
      responses: {
        "101": { description: "WebSocket upgrade 成功。" },
        "426": {
          description: "请求没有 `Upgrade: websocket`，服务端返回纯文本 `Expected websocket`。"
        },
        ...commonErrors
      }
    }
  },
  "/api/ws/task/{id}": {
    get: {
      tags: ["Generation"],
      operationId: "connectTaskWebSocketApiCompatibility",
      summary: "兼容的任务 WebSocket 路径",
      description:
        "当前 `generateRoutes` 也在 `/api/ws/task/{id}` 暴露同一 handler。前端应优先使用返回的 `/ws/task/{id}`；该路径仅作为现有挂载兼容说明。",
      security: authSecurity,
      parameters: [pathParam("id", "任务 ID。")],
      responses: {
        "101": { description: "WebSocket upgrade 成功。" },
        "426": { description: "请求没有 `Upgrade: websocket`。" },
        ...commonErrors
      }
    }
  },
  "/api/generation/events": {
    post: {
      tags: ["Generation"],
      operationId: "recordGenerationEvent",
      summary: "记录生成入口漏斗事件",
      description:
        "要求登录、CSRF 和限流。只记录页面与漏斗事件，不做 A/B 分配；metadata 会被服务端清洗后写入 D1。",
      security: csrfSecurity,
      requestBody: requestJson("客户端生成入口事件。", ref("GenerationEventInput")),
      responses: {
        "204": emptyResponse("事件已记录，无响应体。"),
        ...validationError,
        ...forbiddenError,
        ...rateLimitError,
        ...commonErrors
      }
    }
  },
  "/api/sessions": {
    get: {
      tags: ["Sessions"],
      operationId: "listSessions",
      summary: "分页读取当前用户会话列表",
      description:
        "要求登录。按 `lastMessageAt` 倒序返回未软删会话；支持标题搜索和 cursor 翻页。返回的 `settings` 已从 JSON 字符串解析。",
      security: authSecurity,
      parameters: [
        limitParam(),
        cursorParam,
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "按会话标题模糊搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("会话列表。", {
          type: "object",
          required: ["items", "nextCursor"],
          properties: {
            items: arrayOf(ref("Session")),
            nextCursor: {
              type: "integer",
              nullable: true,
              description: "下一页 cursor；`null` 表示没有更多。"
            }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    },
    post: {
      tags: ["Sessions"],
      operationId: "createSession",
      summary: "手动创建会话",
      description:
        "要求登录和 CSRF。创建空会话行，标题省略时用服务端默认标题；`settings.n` 会按角色策略校验。",
      security: csrfSecurity,
      requestBody: requestJson("会话初始信息。", {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 80 },
          mode: { $ref: "#/components/schemas/GenerationMode", default: "text2image" },
          settings: {
            $ref: "#/components/schemas/SessionSettings",
            default: { size: "1024x1024", n: 1 }
          }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("会话已创建。", {
          type: "object",
          required: ["session"],
          properties: { session: ref("Session") },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sessions/active-generation": {
    get: {
      tags: ["Sessions"],
      operationId: "getActiveGeneration",
      summary: "读取当前用户活跃生成任务",
      description:
        "要求登录。非 sysadmin 单活跃策略下用于刷新页面后恢复正在生成的任务；sysadmin 或多任务角色直接返回 `{ active: null }`。",
      security: authSecurity,
      responses: {
        "200": jsonResponse("活跃任务或 null。", {
          type: "object",
          required: ["active"],
          properties: {
            active: { nullable: true, oneOf: [{ type: "null" }, ref("Task")] }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/sessions/{id}": {
    get: {
      tags: ["Sessions"],
      operationId: "getSession",
      summary: "读取单个会话元数据",
      description: "要求登录。只能读取当前用户有权访问且未软删的会话；`settings` 已解析为对象。",
      security: authSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("会话详情。", {
          type: "object",
          required: ["session"],
          properties: { session: ref("Session") },
          additionalProperties: false
        }),
        ...commonErrors
      }
    },
    patch: {
      tags: ["Sessions"],
      operationId: "updateSession",
      summary: "更新会话元数据",
      description:
        "要求登录和 CSRF。可更新标题、settings、归档状态。会话已有任务后标题会被锁定，避免与首条生成摘要不一致。",
      security: csrfSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      requestBody: requestJson("要修改的字段；至少一个字段应有业务意义。", {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 80 },
          settings: ref("SessionSettings"),
          archived: { type: "boolean" }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("更新成功。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    delete: {
      tags: ["Sessions"],
      operationId: "deleteSession",
      summary: "软删除会话",
      description:
        "要求登录和 CSRF。写入 `deletedAt`，列表和消息查询会过滤软删会话；不立即删除 R2 对象。",
      security: csrfSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("删除成功。", okBody),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sessions/{id}/messages": {
    get: {
      tags: ["Sessions"],
      operationId: "listSessionMessages",
      summary: "分页读取会话消息",
      description:
        "要求登录。按 createdAt 倒序拉取一页后在响应中反转为时间正序；附件和参考图均已解析，并补齐私有图片代理 URL。",
      security: authSecurity,
      parameters: [pathParam("id", "会话 ID。"), limitParam(), cursorParam],
      responses: {
        "200": jsonResponse("消息列表。", {
          type: "object",
          required: ["items", "nextCursor"],
          properties: {
            items: arrayOf(ref("Message")),
            nextCursor: { type: "integer", nullable: true }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/sessions/{sessionId}/messages/{messageId}": {
    delete: {
      tags: ["Sessions"],
      operationId: "deleteSessionMessage",
      summary: "软删除单条消息",
      description:
        "要求登录和 CSRF。软删消息，并软删该消息附件中当前用户拥有的 image_objects，避免删除消息后继续泄露引用。",
      security: csrfSecurity,
      parameters: [pathParam("sessionId", "会话 ID。"), pathParam("messageId", "消息 ID。")],
      responses: {
        "200": jsonResponse("消息删除成功。", okBody),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/history": {
    get: {
      tags: ["History"],
      operationId: "listHistory",
      summary: "分页读取历史生成会话",
      description:
        "要求登录。按当前用户筛选未软删会话，聚合任务数、请求张数、实际图片数、封面图和会话状态。支持标题/消息 prompt 搜索。",
      security: authSecurity,
      parameters: [
        pageParam,
        pageSizeParam(12, 50),
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "按会话标题或消息 prompt 模糊搜索。"
        },
        {
          name: "order",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["recent", "oldest", "task_count"], default: "recent" },
          description: "排序方式：最近更新、最早创建、任务数。"
        }
      ],
      responses: {
        "200": jsonResponse("历史列表。", {
          type: "object",
          required: ["items", "page", "pageSize", "total"],
          properties: {
            items: arrayOf({
              allOf: [
                ref("Session"),
                {
                  type: "object",
                  properties: {
                    requestedImageCount: { type: "integer" },
                    imageCount: { type: "integer" },
                    status: { type: "string", nullable: true },
                    coverImage: {
                      nullable: true,
                      oneOf: [{ type: "null" }, ref("ImageAttachment")]
                    }
                  }
                }
              ]
            }),
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/history/{id}": {
    get: {
      tags: ["History"],
      operationId: "getHistoryDetail",
      summary: "读取历史会话详情",
      description:
        "要求登录。返回会话元数据和最多 200 条正序消息；合并 D1 持久化生成图和参考图，适合历史详情页回放。",
      security: authSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("历史详情。", {
          type: "object",
          required: ["session", "messages"],
          properties: {
            session: ref("Session"),
            messages: arrayOf(ref("Message"))
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/uploads": {
    post: {
      tags: ["Images"],
      operationId: "uploadReferenceImages",
      summary: "上传图生图参考图",
      description:
        "要求登录和 CSRF。multipart/form-data 字段名必须为 `files`，最多 5 个文件；支持 PNG/JPEG/WebP，单文件最大 10MB。任一文件不合法时整次请求失败，不返回部分成功。",
      security: csrfSecurity,
      requestBody: requestMultipart("参考图文件。", {
        type: "object",
        required: ["files"],
        properties: {
          files: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", format: "binary" },
            description: "一个或多个同名 `files` 字段。"
          }
        }
      }),
      responses: {
        "201": jsonResponse("上传成功，返回可用于 `/api/generate` 的参考图 ID。", {
          type: "object",
          required: ["images"],
          properties: { images: arrayOf(ref("ImageAttachment")) },
          additionalProperties: false
        }),
        ...validationError,
        ...payloadTooLargeError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/i/{id}": {
    get: {
      tags: ["Images"],
      operationId: "getPrivateImage",
      summary: "读取私有图片对象",
      description:
        "要求登录。先校验当前用户是否有权访问 image_object，再从 R2 流式返回图片；响应带 `Cache-Control: private` 与 `Vary: Authorization, Cookie`，避免跨用户共享缓存。",
      security: authSecurity,
      parameters: [pathParam("id", "图片对象 ID。")],
      responses: {
        "200": {
          description: "图片二进制流。Content-Type 与图片 mime 一致。",
          content: {
            "image/png": { schema: { type: "string", format: "binary" } },
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/webp": { schema: { type: "string", format: "binary" } }
          }
        },
        "404": errorResponse("图片元数据不存在、无权访问，或 D1 有记录但 R2 对象缺失。"),
        "401": commonErrors["401"],
        "500": commonErrors["500"]
      }
    }
  },
  "/api/prompt-assistant/turn": {
    post: {
      tags: ["Prompt Assistant"],
      operationId: "runPromptAssistantTurn",
      summary: "执行一轮提示词助手对话",
      description:
        "要求登录、CSRF 和每日限流。仅支持文生图/图生图场景；服务端日志只记录长度、模式、轮次和降级状态，不记录完整 prompt。功能被禁用时返回 403。",
      security: csrfSecurity,
      requestBody: requestJson("提示词助手输入。", {
        type: "object",
        required: ["mode", "messages", "turnIndex"],
        properties: {
          mode: { type: "string", enum: ["text2image", "image2image"] },
          locale: { type: "string", enum: ["zh-CN", "en-US"], default: "zh-CN" },
          forceFinalize: { type: "boolean", default: false },
          messages: {
            type: "array",
            maxItems: 16,
            items: {
              type: "object",
              required: ["role", "content"],
              properties: {
                role: { type: "string", enum: ["user", "assistant"] },
                content: { type: "string", minLength: 1, maxLength: 1500 }
              },
              additionalProperties: false
            }
          },
          turnIndex: { type: "integer", minimum: 0, maximum: 7 },
          caseId: { type: "string", maxLength: 120 },
          caseTitle: { type: "string", maxLength: 120 },
          casePromptSummary: { type: "string", maxLength: 1000 },
          casePromptTemplate: { type: "string", maxLength: 4000 },
          caseCategory: { type: "string", maxLength: 120 },
          caseTags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 40 } },
          caseRecommendedSize: { type: "string", maxLength: 40 },
          provider: {
            type: "object",
            properties: {
              model: { type: "string", maxLength: 120 },
              supportedSizes: {
                type: "array",
                maxItems: 20,
                items: { type: "string", maxLength: 40 }
              },
              maxReferenceImages: { type: "integer", nullable: true, minimum: 0, maximum: 10 }
            },
            additionalProperties: false
          },
          referenceBrief: { type: "string", maxLength: 1000 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("助手输出。", {
          type: "object",
          required: [
            "assistantMessage",
            "readiness",
            "brief",
            "finalPrompt",
            "recommendedSize",
            "warnings",
            "degraded",
            "model"
          ],
          properties: {
            assistantMessage: { type: "string", maxLength: 1500 },
            readiness: { type: "string", enum: ["collecting", "ready"] },
            brief: {
              type: "object",
              properties: {
                useCase: { type: "string" },
                subject: { type: "string" },
                style: { type: "string" },
                scene: { type: "string" },
                composition: { type: "string" },
                constraints: { type: "array", items: { type: "string" } }
              },
              additionalProperties: false
            },
            finalPrompt: { type: "string", nullable: true, maxLength: 1500 },
            recommendedSize: { type: "string", maxLength: 40 },
            warnings: { type: "array", items: { type: "string" } },
            degraded: { type: "boolean", description: "是否使用降级逻辑。" },
            model: {
              type: "string",
              nullable: true,
              description: "实际使用的助手模型；降级且无可用模型时为 null。"
            }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...rateLimitError,
        ...providerError,
        ...commonErrors
      }
    }
  },
  "/api/prompt-cases": {
    get: {
      tags: ["Prompt Cases"],
      operationId: "listPublicPromptCases",
      summary: "读取用户侧已发布案例",
      description:
        "要求登录。只返回 `published` 案例，完整 promptTemplate 会返回给前端用于回填，但不会写入日志。",
      security: authSecurity,
      parameters: [
        {
          name: "category",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 120 },
          required: false,
          description: "按分类精确筛选。"
        },
        {
          name: "mode",
          in: "query",
          schema: { type: "string", enum: ["text2image", "image2image"] },
          required: false,
          description: "按可用模式筛选。"
        },
        {
          name: "locale",
          in: "query",
          schema: { type: "string", enum: ["zh-CN", "en-US"], default: "zh-CN" },
          required: false,
          description: "案例语言。"
        },
        {
          name: "featured",
          in: "query",
          schema: { type: "string", enum: ["0", "1"] },
          required: false,
          description: "是否只看精选。"
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 120 },
          required: false,
          description: "按标题或摘要搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("案例列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("PromptCase")) },
          additionalProperties: false
        }),
        ...validationError,
        ...commonErrors
      }
    }
  },
  "/api/announcements/recent": {
    get: {
      tags: ["Announcements"],
      operationId: "listRecentAnnouncements",
      summary: "读取最近公告摘要",
      description:
        "要求登录。返回当前用户可见公告中最多 5 条最近公告、是否还有更多、以及未读数量；用于导航栏/首页提示。",
      security: authSecurity,
      responses: {
        "200": jsonResponse("最近公告。", {
          type: "object",
          required: ["items", "hasMore", "unreadCount"],
          properties: {
            items: arrayOf(ref("Announcement")),
            hasMore: { type: "boolean" },
            unreadCount: { type: "integer", minimum: 0 }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/announcements": {
    get: {
      tags: ["Announcements"],
      operationId: "listAnnouncements",
      summary: "分页读取当前用户公告",
      description:
        "要求登录。只返回当前用户角色可见且已发布的公告，并带每条公告的已读状态和整体未读数量。",
      security: authSecurity,
      parameters: [pageParam, pageSizeParam(10, 30)],
      responses: {
        "200": jsonResponse("公告分页结果。", {
          type: "object",
          required: ["items", "page", "pageSize", "total", "totalPages", "unreadCount"],
          properties: {
            items: arrayOf(ref("Announcement")),
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
            unreadCount: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...commonErrors
      }
    }
  },
  "/api/announcements/{id}": {
    get: {
      tags: ["Announcements"],
      operationId: "getAnnouncement",
      summary: "读取公告详情",
      description: "要求登录。只允许读取当前用户可见的已发布公告；返回完整正文和当前未读数量。",
      security: authSecurity,
      parameters: [pathParam("id", "公告 ID。")],
      responses: {
        "200": jsonResponse("公告详情。", {
          type: "object",
          required: ["item", "unreadCount"],
          properties: {
            item: ref("Announcement"),
            unreadCount: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...commonErrors
      }
    }
  },
  "/api/announcements/{id}/read": {
    post: {
      tags: ["Announcements"],
      operationId: "markAnnouncementRead",
      summary: "标记公告已读",
      description:
        "要求登录和 CSRF。先确认公告对当前用户可见，再 upsert 读取记录并返回最新未读数量。",
      security: csrfSecurity,
      parameters: [pathParam("id", "公告 ID。")],
      responses: {
        "200": jsonResponse("已读状态已更新。", {
          type: "object",
          required: ["unreadCount"],
          properties: { unreadCount: { type: "integer", minimum: 0 } },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  }
};

Object.assign(openApiDocument.paths as OpenApiObject, {
  "/api/admin/provider-keys": {
    get: {
      tags: ["Admin"],
      operationId: "listAssignableProviderKeys",
      summary: "读取可分配 provider key",
      description:
        "要求 admin 或 sysadmin 登录。sysadmin 返回所有启用且可分配的内置 provider key；admin 只返回分配给自己的启用 key。响应永不包含明文或密文 API key，只返回 label、keyHint 和 enabled。",
      security: adminSecurity,
      responses: {
        "200": jsonResponse("可分配密钥列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("ProviderKeySummary")) },
          additionalProperties: false
        }),
        ...commonErrors,
        ...forbiddenError
      }
    }
  },
  "/api/admin/users": {
    get: {
      tags: ["Admin"],
      operationId: "listAdminUsers",
      summary: "分页读取用户管理列表",
      description:
        "要求 admin 或 sysadmin 登录。admin 只能查看自己创建的普通用户；sysadmin 可查看 admin/user，并可按 role 过滤。返回配额、分配 key、生成次数和最近生成时间。",
      security: adminSecurity,
      parameters: [
        pageParam,
        pageSizeParam(20, 100),
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "按邮箱、用户名或昵称模糊搜索。"
        },
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["active", "disabled"] },
          description: "按账号状态过滤。"
        },
        {
          name: "role",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["admin", "user"] },
          description: "仅 sysadmin 有效；普通 admin 固定只能看 `user`。"
        }
      ],
      responses: {
        "200": jsonResponse("用户分页结果。", {
          type: "object",
          required: ["items", "page", "pageSize", "total"],
          properties: {
            items: arrayOf(ref("AdminUser")),
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...commonErrors,
        ...forbiddenError
      }
    },
    post: {
      tags: ["Admin"],
      operationId: "createManagedUser",
      summary: "创建下级用户或管理员",
      description:
        "要求 admin 或 sysadmin 登录和 CSRF。admin 只能创建普通用户，且初始配额不能超过自身剩余配额；sysadmin 可创建 admin 或 user，并可授予无限配额 (`quota=null`)。创建时会写 users、quotas，并在需要时绑定 provider key。",
      security: csrfSecurity,
      requestBody: requestJson("新用户信息。", {
        type: "object",
        required: ["username", "password", "nickname"],
        properties: {
          email: {
            type: "string",
            format: "email",
            nullable: true,
            description: "可省略；服务端会生成占位邮箱。"
          },
          username: { type: "string", minLength: 3, maxLength: 40 },
          password: { type: "string", minLength: 8 },
          nickname: { type: "string", minLength: 1, maxLength: 40 },
          role: { type: "string", enum: ["admin", "user"], default: "user" },
          providerKeyId: {
            type: "string",
            nullable: true,
            description: "admin 账号必须绑定可分配 provider key；普通 user 默认继承创建者 key。"
          },
          quota: {
            type: "integer",
            nullable: true,
            minimum: 0,
            default: 0,
            description: "`null` 表示无限配额，仅 sysadmin 可用。"
          }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("用户已创建。", {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
          additionalProperties: false
        }),
        ...validationError,
        ...quotaError,
        ...forbiddenError,
        "409": errorResponse(
          "用户名或邮箱已存在时可能返回冲突错误；当前实现多数场景返回 `VALIDATION_ERROR`。"
        ),
        ...commonErrors
      }
    }
  },
  "/api/admin/users/{id}": {
    patch: {
      tags: ["Admin"],
      operationId: "updateManagedUser",
      summary: "编辑下级用户",
      description:
        "要求 admin 或 sysadmin 登录和 CSRF。非 sysadmin 只能改昵称/状态，不能改 provider key、总配额或密码；sysadmin 可覆盖总配额、重置密码、改绑 provider key。注意这里的 `quota` 是覆盖总配额，不是追加。",
      security: csrfSecurity,
      parameters: [pathParam("id", "目标用户 ID。")],
      requestBody: requestJson("要更新的字段。", {
        type: "object",
        properties: {
          nickname: { type: "string", minLength: 1, maxLength: 40 },
          status: { type: "string", enum: ["active", "disabled"] },
          providerKeyId: { type: "string", nullable: true },
          quota: {
            type: "integer",
            nullable: true,
            minimum: 0,
            description: "覆盖 allocatedQuota；`null` 表示无限。"
          },
          password: { type: "string", minLength: 8 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("用户已更新。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/admin/users/{id}/quota": {
    get: {
      tags: ["Admin"],
      operationId: "getManagedUserQuota",
      summary: "读取用户配额快照和流水",
      description:
        "要求 admin 或 sysadmin 登录。返回目标用户当前配额快照、最近配额流水，以及向更早流水翻页的 cursor。admin 只能读取自己管辖的下级用户。",
      security: adminSecurity,
      parameters: [pathParam("id", "目标用户 ID。"), limitParam(), cursorParam],
      responses: {
        "200": jsonResponse("配额快照与流水。", {
          type: "object",
          required: ["quota", "transactions", "nextCursor"],
          properties: {
            quota: ref("QuotaSnapshot"),
            transactions: arrayOf(ref("QuotaTransaction")),
            nextCursor: { type: "integer", nullable: true }
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Admin"],
      operationId: "grantManagedUserQuota",
      summary: "给用户追加配额",
      description:
        "要求 admin 或 sysadmin 登录和 CSRF。该接口是追加配额：在现有 `allocatedQuota` 上累加 `amount`，写入 `admin_grant` 流水；若目标原本是无限配额则保持无限。非 sysadmin 会从自身 `allocatedQuota` 中扣减同等数量，且不能超过自身剩余额度。",
      security: csrfSecurity,
      parameters: [pathParam("id", "目标用户 ID。")],
      requestBody: requestJson("追加配额张数。", {
        type: "object",
        required: ["amount"],
        properties: {
          amount: { type: "integer", minimum: 1, maximum: 1000000 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("追加成功后的目标用户配额快照。", {
          type: "object",
          required: ["quota"],
          properties: { quota: ref("QuotaSnapshot") },
          additionalProperties: false
        }),
        ...validationError,
        ...quotaError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/admin/users/{id}/usage": {
    get: {
      tags: ["Admin"],
      operationId: "getManagedUserUsage",
      summary: "读取用户生成用量统计",
      description:
        "要求 admin 或 sysadmin 登录。返回目标用户按任务状态/模式聚合的统计、最近 30 日每日任务趋势和任务总数。",
      security: adminSecurity,
      parameters: [pathParam("id", "目标用户 ID。")],
      responses: {
        "200": jsonResponse("用户用量统计。", {
          type: "object",
          required: ["stats", "trend", "total"],
          properties: {
            stats: arrayOf({
              type: "object",
              required: ["status", "mode", "count"],
              properties: {
                status: { type: "string" },
                mode: { type: "string" },
                count: { type: "integer" }
              }
            }),
            trend: arrayOf({
              type: "object",
              required: ["day", "count"],
              properties: {
                day: { type: "integer", description: "按 UTC epoch day 聚合。" },
                count: { type: "integer" }
              }
            }),
            total: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/admin/users/{id}/password": {
    post: {
      tags: ["Admin"],
      operationId: "resetManagedUserPassword",
      summary: "重置下级用户密码",
      description:
        "要求 admin 或 sysadmin 登录和 CSRF。写入新密码哈希；系统管理员账号不能在此接口重置。当前路由本身允许 admin 角色进入，但权限边界仍由管辖范围校验控制。",
      security: csrfSecurity,
      parameters: [pathParam("id", "目标用户 ID。")],
      requestBody: requestJson("新密码。", {
        type: "object",
        required: ["password"],
        properties: { password: { type: "string", minLength: 8 } },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("密码已重置。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/providers": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listProviders",
      summary: "读取 provider 定义",
      description:
        "要求 sysadmin 登录。确保内置 provider 已存在后，返回未软删 provider 定义；`supportedSizes` 已从 JSON 字符串解析，`builtIn` 标识内置项。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("provider 列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("Provider")) },
          additionalProperties: false
        }),
        ...commonErrors,
        ...forbiddenError
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createProvider",
      summary: "创建 provider 定义",
      description:
        "要求 sysadmin 登录和 CSRF。创建一个上游 provider 元数据行。当前产品主要依赖内置 provider catalog；该接口保留给运维扩展和历史兼容。",
      security: csrfSecurity,
      requestBody: requestJson("provider 定义。", {
        type: "object",
        required: ["name", "baseUrl"],
        properties: {
          name: { type: "string", minLength: 1 },
          baseUrl: { type: "string", minLength: 1 },
          defaultModel: { type: "string", minLength: 1, default: "gpt-image-2" },
          requestFormat: { type: "string", default: "openai_compatible" },
          supportedSizes: {
            type: "array",
            items: { type: "string" },
            default: ["1024x1024", "1024x1536", "1536x1024", "auto"]
          },
          enabled: { type: "boolean", default: true }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("provider 已创建。", {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/providers/{id}": {
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateProvider",
      summary: "更新 provider 定义",
      description:
        "要求 sysadmin 登录和 CSRF。部分更新 provider；`supportedSizes` 如果传入会整体替换并序列化保存。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider ID。")],
      requestBody: requestJson("provider 补丁。", {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          baseUrl: { type: "string", minLength: 1 },
          defaultModel: { type: "string", minLength: 1 },
          requestFormat: { type: "string" },
          supportedSizes: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("provider 已更新。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    delete: {
      tags: ["Sysadmin"],
      operationId: "deleteProvider",
      summary: "软删除 provider",
      description:
        "要求 sysadmin 登录和 CSRF。内置 provider 不能删除；非内置 provider 会软删并禁用/软删其下属 provider key，避免任务继续指向已弃用上游。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider ID。")],
      responses: {
        "200": jsonResponse("provider 已软删。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/providers/{id}/test": {
    post: {
      tags: ["Sysadmin"],
      operationId: "testProvider",
      summary: "测试 provider 基础连通性",
      description:
        '要求 sysadmin 登录和 CSRF。当前实现只把 `baseUrl === "mock:"` 视为本地可通过，主要用于 UI 烟测和历史兼容。',
      security: csrfSecurity,
      parameters: [pathParam("id", "provider ID。")],
      responses: {
        "200": jsonResponse("测试结果。", {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/provider-keys": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listProviderKeys",
      summary: "读取 provider key 列表",
      description:
        "要求 sysadmin 登录。返回未软删 provider key；默认只返回可分配 provider 对应的 key，传 `includeUnsupported=1` 可包含历史/不再支持 provider。响应会剔除 encryptedKey，永不返回明文。",
      security: sysadminSecurity,
      parameters: [
        {
          name: "includeUnsupported",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["0", "1"], default: "0" },
          description: "是否包含不再支持或不可分配 provider 的历史 key。"
        }
      ],
      responses: {
        "200": jsonResponse("provider key 列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("ProviderKeySummary")) },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createProviderKey",
      summary: "创建 provider key",
      description:
        "要求 sysadmin 登录和 CSRF。提交明文 `apiKey` 后服务端立即加密存储，只返回新 key ID 和末四位 `keyHint`。只能创建产品明确支持且可分配的内置 provider key。",
      security: csrfSecurity,
      requestBody: requestJson("新密钥。", {
        type: "object",
        required: ["providerId", "label", "model", "apiKey"],
        properties: {
          providerId: { type: "string" },
          label: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          apiKey: {
            type: "string",
            minLength: 1,
            description: "仅请求体提交；响应、日志和列表都不返回明文。"
          },
          allocatedQuota: { type: "integer", nullable: true, minimum: 0 },
          ownerAdminId: {
            type: "string",
            nullable: true,
            description: "可选；创建后同步分配给该管理员。"
          },
          enabled: { type: "boolean", default: true }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("密钥已创建。", {
          type: "object",
          required: ["id", "keyHint"],
          properties: {
            id: { type: "string" },
            keyHint: { type: "string", description: "明文 key 末 4 位。" }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/provider-keys/{id}": {
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateProviderKey",
      summary: "更新 provider key",
      description:
        "要求 sysadmin 登录和 CSRF。可改 provider、label、model、明文 apiKey、配额、归属 admin、启用状态。传入新 apiKey 时会重新加密并刷新 keyHint；响应不返回密钥。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key ID。")],
      requestBody: requestJson("provider key 补丁。", {
        type: "object",
        properties: {
          providerId: { type: "string" },
          label: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          apiKey: { type: "string", minLength: 1 },
          allocatedQuota: { type: "integer", nullable: true, minimum: 0 },
          ownerAdminId: { type: "string", nullable: true },
          enabled: { type: "boolean" }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("密钥已更新。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    delete: {
      tags: ["Sysadmin"],
      operationId: "deleteProviderKey",
      summary: "软删除 provider key",
      description: "要求 sysadmin 登录和 CSRF。将 key 禁用并写入 deletedAt；不会返回明文/密文。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key ID。")],
      responses: {
        "200": jsonResponse("密钥已软删。", okBody),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/provider-keys/{id}/test": {
    post: {
      tags: ["Sysadmin"],
      operationId: "testProviderKey",
      summary: "测试 provider key 连通性",
      description:
        "要求 sysadmin 登录和 CSRF。服务端解密 key 后调用对应 provider adapter 的 health 方法；`mock:` baseUrl 直接返回 ok。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key ID。")],
      responses: {
        "200": jsonResponse("测试结果。", {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
          additionalProperties: false
        }),
        ...providerError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  }
});

Object.assign(openApiDocument.paths as OpenApiObject, {
  "/api/sysadmin/admins": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listTenantAdmins",
      summary: "读取租户管理员列表",
      description:
        "要求 sysadmin 登录。返回 role=admin 的管理员账号、状态、绑定 provider key 和配额池信息；不返回密码哈希。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("管理员列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("AdminUser")) },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createTenantAdmin",
      summary: "创建租户管理员",
      description:
        "要求 sysadmin 登录和 CSRF。创建 role=admin 账号、初始配额行，并绑定 provider key。邮箱可选，省略时服务端生成占位邮箱。",
      security: csrfSecurity,
      requestBody: requestJson("管理员账号信息。", {
        type: "object",
        required: ["username", "password", "nickname", "providerKeyId", "quota"],
        properties: {
          email: { type: "string", format: "email", nullable: true },
          username: { type: "string", minLength: 3, maxLength: 40 },
          password: { type: "string", minLength: 8 },
          nickname: { type: "string", minLength: 1 },
          providerKeyId: { type: "string", minLength: 1 },
          quota: {
            type: "integer",
            nullable: true,
            minimum: 0,
            description: "`null` 表示无限配额池。"
          }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("管理员已创建。", {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/admins/{id}": {
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateTenantAdmin",
      summary: "编辑租户管理员",
      description:
        "要求 sysadmin 登录和 CSRF。可更新昵称、状态、provider key、总配额和密码。改绑 provider key 时，会同步该管理员及其下属用户的 preferredProviderKeyId 与 user_provider_keys 绑定。",
      security: csrfSecurity,
      parameters: [pathParam("id", "管理员用户 ID。")],
      requestBody: requestJson("管理员补丁。", {
        type: "object",
        properties: {
          nickname: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["active", "disabled"] },
          providerKeyId: { type: "string", minLength: 1 },
          quota: {
            type: "integer",
            nullable: true,
            minimum: 0,
            description: "覆盖管理员配额池；`null` 表示无限。"
          },
          password: { type: "string", minLength: 8 }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("管理员已更新。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/dashboard/stats": {
    get: {
      tags: ["Sysadmin"],
      operationId: "getDashboardStats",
      summary: "读取运营看板统计",
      description:
        "要求 sysadmin 登录。聚合用户角色数、任务状态数、30 日趋势、Top 用户和按 provider 任务量；结果在 KV 中缓存 60 秒。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("运营看板统计。", {
          type: "object",
          required: ["userCounts", "taskCounts", "trend", "topUsers", "providerCounts"],
          properties: {
            userCounts: arrayOf({ type: "object", additionalProperties: true }),
            taskCounts: arrayOf({ type: "object", additionalProperties: true }),
            trend: arrayOf({ type: "object", additionalProperties: true }),
            topUsers: arrayOf({ type: "object", additionalProperties: true }),
            providerCounts: arrayOf({ type: "object", additionalProperties: true })
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/users": {
    get: {
      tags: ["Sysadmin"],
      operationId: "searchAllUsers",
      summary: "搜索全站用户",
      description:
        "要求 sysadmin 登录。最多返回 200 条用户，用于会话审计筛选器；兼容旧库无 username 列的场景。",
      security: sysadminSecurity,
      parameters: [
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "按邮箱、用户名、昵称或旧库中的 ID 模糊搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("用户选项列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("AuthUser")) },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/users/{id}/sessions": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listAuditSessions",
      summary: "按用户读取会话审计列表",
      description:
        "要求 sysadmin 登录。`id=me` 表示当前 sysadmin，`id=_` 表示全站会话；否则按指定 userId 筛选。返回会话、所属用户摘要、成功图片数和分页信息。",
      security: sysadminSecurity,
      parameters: [
        pathParam("id", "用户 ID；特殊值 `me` 和 `_` 分别代表当前 sysadmin 与全站。"),
        pageParam,
        pageSizeParam(12, 50),
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "按会话标题或消息 prompt 搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("审计会话分页结果。", {
          type: "object",
          required: ["items", "page", "pageSize", "total"],
          properties: {
            items: arrayOf({
              allOf: [
                ref("Session"),
                {
                  type: "object",
                  properties: {
                    user: ref("AuthUser"),
                    taskCount: { type: "integer" },
                    imageCount: { type: "integer" }
                  }
                }
              ]
            }),
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/sessions/{id}/detail": {
    get: {
      tags: ["Sysadmin"],
      operationId: "getAuditSessionDetail",
      summary: "读取会话深度审计详情",
      description:
        "要求 sysadmin 登录。返回任意会话的元数据和最多 200 条消息，合并生成图、参考图、任务参数、错误信息、provider 原始失败摘要和生成耗时。",
      security: sysadminSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("会话审计详情。", {
          type: "object",
          required: ["session", "messages"],
          properties: {
            session: ref("Session"),
            messages: arrayOf(ref("Message"))
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/sessions/{id}/messages": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listRawAuditSessionMessages",
      summary: "读取会话原始消息行",
      description:
        "要求 sysadmin 登录。返回较少加工的 message 行，attachments 和 referenceImageIds 会从 JSON 字符串解析；用于与 detail 接口对照排障。",
      security: sysadminSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("消息行列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("Message")) },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/preferences": {
    get: {
      tags: ["Sysadmin"],
      operationId: "getSysadminPreferences",
      summary: "读取当前 sysadmin 偏好",
      description:
        "要求 sysadmin 登录。返回当前 sysadmin 的 preferredProviderKeyId、提示词助手模型设置和可选模型列表。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("sysadmin 偏好。", {
          type: "object",
          required: [
            "preferredProviderKeyId",
            "promptAssistantModel",
            "promptAssistantModelOptions"
          ],
          properties: {
            preferredProviderKeyId: { type: "string", nullable: true },
            promptAssistantModel: { type: "object", additionalProperties: true },
            promptAssistantModelOptions: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            }
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateSysadminPreferences",
      summary: "更新当前 sysadmin 偏好",
      description:
        "要求 sysadmin 登录和 CSRF。至少提供 `preferredProviderKeyId` 或 `promptAssistantModel` 之一；设置 provider key 时必须是可分配 key。",
      security: csrfSecurity,
      requestBody: requestJson("sysadmin 偏好补丁。", {
        type: "object",
        properties: {
          preferredProviderKeyId: { type: "string", nullable: true },
          promptAssistantModel: { type: "object", additionalProperties: true }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("偏好已更新。", {
          type: "object",
          required: ["ok", "preferredProviderKeyId", "promptAssistantModel"],
          properties: {
            ok: { type: "boolean", const: true },
            preferredProviderKeyId: { type: "string", nullable: true },
            promptAssistantModel: { type: "object", additionalProperties: true }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/generation-entry": {
    get: {
      tags: ["Sysadmin"],
      operationId: "getGenerationEntrySettings",
      summary: "读取生成入口设置和用量",
      description:
        "要求 sysadmin 登录。返回生成入口开关、统计窗口和窗口内 `/workspace`、`/ai-image` 的 submitted/succeeded/failed 指标。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("生成入口设置和用量。", {
          type: "object",
          required: ["settings", "usageWindow", "pageUsage"],
          properties: {
            settings: {
              type: "object",
              allOf: [ref("GenerationEntry")],
              additionalProperties: true
            },
            usageWindow: {
              type: "object",
              required: ["since", "until", "days"],
              properties: {
                since: { type: "integer" },
                until: { type: "integer" },
                days: { type: "integer" }
              }
            },
            pageUsage: arrayOf({
              type: "object",
              required: ["route", "submitted", "succeeded", "failed"],
              properties: {
                route: { type: "string", enum: ["/workspace", "/ai-image"] },
                submitted: { type: "integer" },
                succeeded: { type: "integer" },
                failed: { type: "integer" }
              }
            })
          },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateGenerationEntrySettings",
      summary: "更新生成入口开关",
      description:
        "要求 sysadmin 登录和 CSRF。必须至少保留一个生成入口开启；否则返回校验错误。用于控制用户导航和生成入口 A/B。",
      security: csrfSecurity,
      requestBody: requestJson("生成入口开关。", {
        type: "object",
        required: ["showWorkspace", "showAiImage"],
        properties: {
          showWorkspace: { type: "boolean" },
          showAiImage: { type: "boolean" }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("设置已更新。", {
          type: "object",
          required: ["settings"],
          properties: { settings: { type: "object", additionalProperties: true } },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/prompt-cases": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listSysadminPromptCases",
      summary: "读取案例库管理列表",
      description:
        "要求 sysadmin 登录。返回草稿、发布、隐藏等状态的案例；默认不含 archived，传 `includeArchived=1` 可包含归档项。",
      security: sysadminSecurity,
      parameters: [
        {
          name: "category",
          in: "query",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 120 },
          description: "按分类过滤。"
        },
        {
          name: "mode",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["text2image", "image2image"] },
          description: "按模式过滤。"
        },
        {
          name: "locale",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["zh-CN", "en-US"] },
          description: "按语言过滤。"
        },
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["draft", "published", "hidden", "archived"] },
          description: "按状态过滤。"
        },
        {
          name: "featured",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["0", "1"] },
          description: "按精选状态过滤。"
        },
        {
          name: "includeArchived",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["0", "1"] },
          description: "是否包含归档案例。"
        },
        {
          name: "search",
          in: "query",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 120 },
          description: "按标题或摘要搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("案例列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("PromptCase")) },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createPromptCase",
      summary: "创建案例",
      description:
        "要求 sysadmin 登录和 CSRF。创建 AI 图像生成页展示案例；若状态为 published，服务端会校验外部来源归因字段是否完整。",
      security: csrfSecurity,
      requestBody: requestJson("案例内容。", ref("PromptCaseInput")),
      responses: {
        "201": jsonResponse("案例已创建。", {
          type: "object",
          required: ["item"],
          properties: { item: ref("PromptCase") },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/prompt-cases/bulk": {
    post: {
      tags: ["Sysadmin"],
      operationId: "bulkUpdatePromptCases",
      summary: "批量更新案例",
      description:
        "要求 sysadmin 登录和 CSRF。一次最多更新 100 个案例；patch 至少包含 category、status、featured 之一。",
      security: csrfSecurity,
      requestBody: requestJson("批量更新参数。", {
        type: "object",
        required: ["ids", "patch"],
        properties: {
          ids: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { type: "string", minLength: 1, maxLength: 80 }
          },
          patch: {
            type: "object",
            properties: {
              category: { type: "string", minLength: 1, maxLength: 120 },
              status: { type: "string", enum: ["draft", "published", "hidden", "archived"] },
              featured: { type: "boolean" }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("批量更新后的案例列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("PromptCase")) },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/prompt-cases/{id}": {
    patch: {
      tags: ["Sysadmin"],
      operationId: "updatePromptCase",
      summary: "更新案例",
      description:
        "要求 sysadmin 登录和 CSRF。部分更新案例；patch 不能为空。更新为 published 时同样会校验来源归因。",
      security: csrfSecurity,
      parameters: [pathParam("id", "案例 ID。")],
      requestBody: requestJson("案例补丁。", {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          category: { type: "string", minLength: 1, maxLength: 120 },
          modes: {
            type: "array",
            minItems: 1,
            items: { type: "string", enum: ["text2image", "image2image"] }
          },
          recommendedSize: { type: "string", minLength: 1, maxLength: 40 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", minLength: 1, maxLength: 40 }
          },
          promptTemplate: { type: "string", minLength: 1, maxLength: 4000 },
          promptSummary: { type: "string", minLength: 1, maxLength: 800 },
          thumbnailUrl: { type: "string", nullable: true, maxLength: 1000 },
          sourceUrl: { type: "string", nullable: true, maxLength: 1000 },
          sourceAuthor: { type: "string", nullable: true, maxLength: 1000 },
          sourceLicense: { type: "string", enum: ["CC BY 4.0", "original", "internal"] },
          sourceRepo: { type: "string", nullable: true, maxLength: 1000 },
          popularity: { type: "object", additionalProperties: true },
          status: { type: "string", enum: ["draft", "published", "hidden", "archived"] },
          featured: { type: "boolean" },
          sortOrder: { type: "integer", minimum: 0, maximum: 1000000 },
          locale: { type: "string", enum: ["zh-CN", "en-US"] }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("更新后的案例。", {
          type: "object",
          required: ["item"],
          properties: { item: ref("PromptCase") },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/prompt-cases/import": {
    post: {
      tags: ["Sysadmin"],
      operationId: "importPromptCases",
      summary: "批量导入案例",
      description:
        "要求 sysadmin 登录和 CSRF。一次导入 1-100 个案例，写入 import 记录，返回成功导入项和逐项错误；不会把完整 prompt 写入 audit payload。",
      security: csrfSecurity,
      requestBody: requestJson("导入批次。", {
        type: "object",
        required: ["cases"],
        properties: {
          source: { type: "string", minLength: 1, maxLength: 80, default: "manual" },
          sourceUrl: { type: "string", nullable: true, maxLength: 1000 },
          cases: { type: "array", minItems: 1, maxItems: 100, items: ref("PromptCaseInput") }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("导入结果。", {
          type: "object",
          required: ["importId", "imported", "errors"],
          properties: {
            importId: { type: "string" },
            imported: arrayOf(ref("PromptCase")),
            errors: arrayOf({ type: "object", additionalProperties: true })
          },
          additionalProperties: true
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/announcements": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listSysadminAnnouncements",
      summary: "分页读取公告管理列表",
      description:
        "要求 sysadmin 登录。可按状态、目标受众和关键词筛选，返回包含完整 content 的公告管理 DTO。",
      security: sysadminSecurity,
      parameters: [
        pageParam,
        pageSizeParam(20, 50),
        {
          name: "status",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["draft", "published", "archived"] },
          description: "公告状态。"
        },
        {
          name: "targetAudience",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["all", "admins"] },
          description: "目标受众。"
        },
        {
          name: "q",
          in: "query",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 120 },
          description: "标题或正文关键词。"
        }
      ],
      responses: {
        "200": jsonResponse("公告分页结果。", {
          type: "object",
          required: ["items", "page", "pageSize", "total", "totalPages"],
          properties: {
            items: arrayOf(ref("Announcement")),
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" }
          },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createAnnouncement",
      summary: "创建公告",
      description:
        "要求 sysadmin 登录和 CSRF。创建公告；status 默认为 published，published 时服务端设置 publishedAt。",
      security: csrfSecurity,
      requestBody: requestJson("公告内容。", {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          content: { type: "string", minLength: 1, maxLength: 20000 },
          targetAudience: { type: "string", enum: ["all", "admins"], default: "all" },
          status: { type: "string", enum: ["draft", "published", "archived"], default: "published" }
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("公告已创建。", {
          type: "object",
          required: ["item"],
          properties: { item: ref("Announcement") },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/announcements/{id}": {
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateAnnouncement",
      summary: "更新公告",
      description:
        "要求 sysadmin 登录和 CSRF。patch 至少包含一个字段；状态切换会更新发布相关字段，返回更新后的公告。",
      security: csrfSecurity,
      parameters: [pathParam("id", "公告 ID。")],
      requestBody: requestJson("公告补丁。", {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1, maxLength: 120 },
          content: { type: "string", minLength: 1, maxLength: 20000 },
          targetAudience: { type: "string", enum: ["all", "admins"] },
          status: { type: "string", enum: ["draft", "published", "archived"] }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("更新后的公告。", {
          type: "object",
          required: ["item"],
          properties: { item: ref("Announcement") },
          additionalProperties: false
        }),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    delete: {
      tags: ["Sysadmin"],
      operationId: "deleteAnnouncement",
      summary: "删除公告",
      description: "要求 sysadmin 登录和 CSRF。按领域逻辑删除或归档公告记录，并写审计日志。",
      security: csrfSecurity,
      parameters: [pathParam("id", "公告 ID。")],
      responses: {
        "200": jsonResponse("公告已删除。", okBody),
        ...forbiddenError,
        ...commonErrors
      }
    }
  }
});
