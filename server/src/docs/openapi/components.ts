import { arrayOf, ref } from "./helpers";
import { captchaSchemas } from "./captchaSchemas";
import { contentSchemas } from "./contentSchemas";

export const components = {
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
    ...captchaSchemas,
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
      enum: ["image2image", "text2image"]
    },
    Task: {
      type: "object",
      required: ["id", "userId", "sessionId", "messageId", "status", "mode", "params", "queuedAt"],
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
    ...contentSchemas,
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
};
