import {
  authSecurity,
  commonErrors,
  csrfSecurity,
  emptyResponse,
  forbiddenError,
  jsonResponse,
  okBody,
  pathParam,
  providerError,
  quotaError,
  rateLimitError,
  ref,
  requestJson,
  validationError
} from "../helpers";

const taskSummarySchema = {
  type: "object",
  required: [
    "id",
    "sessionId",
    "messageId",
    "title",
    "status",
    "phase",
    "prompt",
    "params",
    "queuedAt",
    "startedAt",
    "finishedAt",
    "canCancel",
    "images",
    "referenceImages",
    "quota"
  ],
  properties: {
    id: { type: "string" },
    sessionId: { type: "string" },
    messageId: { type: "string" },
    title: { type: "string" },
    status: ref("TaskStatus"),
    phase: {
      type: "string",
      enum: ["queued", "starting", "generating", "succeeded", "failed", "cancelled"]
    },
    prompt: { type: "string" },
    params: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        mode: ref("GenerationMode"),
        size: { type: "string" },
        n: { type: "integer" },
        model: { type: "string" },
        generationTargetId: { type: "string" },
        referenceImageIds: { type: "array", items: { type: "string" } },
        sourceTaskId: { type: "string" },
        sourceImageId: { type: "string" }
      },
      additionalProperties: false
    },
    queuedAt: { type: "integer", description: "Unix 毫秒时间戳。" },
    startedAt: { type: "integer", nullable: true },
    finishedAt: { type: "integer", nullable: true },
    errorCode: { type: "string", nullable: true },
    errorMessage: { type: "string", nullable: true },
    retryOf: { type: "string", nullable: true },
    canCancel: {
      type: "boolean",
      description: "响应时尚未被执行器认领；取消请求仍可能因并发启动而失败。"
    },
    images: { type: "array", items: ref("ImageAttachment") },
    referenceImages: { type: "array", items: ref("ImageAttachment") },
    quota: {
      type: "object",
      required: ["precharged", "refunded", "consumed"],
      properties: {
        precharged: { type: "integer", description: "账本实际预扣张数；sysadmin 无扣费时为 0。" },
        refunded: { type: "integer", description: "账本实际退还张数。" },
        consumed: {
          type: "integer",
          description: "预扣减已退款的净额；任务进行中包含冻结的预扣额度，不代表最终消耗。"
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

export const generationTaskPaths = {
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
          generationTargetId: {
            type: "string",
            enum: ["default", "micu_grok"],
            default: "default",
            description:
              "生成目标。`default` 使用账号当前 provider key group；`micu_grok` 为米醋 Grok 图像实验能力，仅 sysadmin 或获授权 admin 可用。"
          },
          mode: { $ref: "#/components/schemas/GenerationMode", default: "image2image" },
          size: {
            type: "string",
            default: "auto",
            description:
              "`auto` 表示不向上游传递尺寸；也可传尺寸预设或自定义 `{width}x{height}`，并受 provider supportedSizes 限制。内置白名单含 auto、1024x1024、1024x1536、1536x1024、2048x2048、2880x2880、3840x2160、2160x3840。"
          },
          n: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            default: 1,
            description:
              "请求张数；sysadmin 最多 200，admin/user 按账号 `maxImagesPerGeneration` 限制，最高可配置 20。"
          },
          model: {
            type: "string",
            description: "可选模型覆盖；通常使用 provider key 的默认模型。"
          },
          referenceImageIds: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
            description:
              "图生图参考图 ID。允许本人未删除的上传图或生成结果；仅 `mode=image2image` 使用，服务端会去重并校验归属。"
          },
          sourceTaskId: { type: "string", description: "可选再创作来源任务，必须属于本人且可见。" },
          sourceImageId: {
            type: "string",
            description: "可选来源生成图片，必须属于 sourceTaskId；不代替 referenceImageIds。"
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
  "/api/tasks": {
    get: {
      tags: ["Generation"],
      operationId: "listMyTasks",
      summary: "读取本人的进行中或最近任务",
      description:
        "按排队时间和 ID 倒序分页，排除已删除会话或消息。返回真实阶段与实际配额流水汇总，不包含 provider 密钥或原始响应。",
      security: authSecurity,
      parameters: [
        {
          name: "scope",
          in: "query",
          schema: { type: "string", enum: ["active", "recent"], default: "recent" }
        },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 50, default: 20 }
        },
        {
          name: "cursor",
          in: "query",
          schema: { type: "string" },
          description: "上一页返回的 nextCursor。"
        }
      ],
      responses: {
        "200": jsonResponse("任务列表。", {
          type: "object",
          required: ["items", "activeCount", "nextCursor"],
          properties: {
            items: { type: "array", items: taskSummarySchema },
            activeCount: { type: "integer" },
            nextCursor: { type: "string", nullable: true }
          },
          additionalProperties: false
        }),
        ...validationError,
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
          properties: {
            task: ref("Task"),
            summary: {
              ...taskSummarySchema,
              nullable: true,
              description: "精简任务视图。会话或消息已删除时为 null，task 字段保持原有兼容行为。"
            }
          },
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
        "要求登录和 CSRF。只有尚未被执行器认领为 running 的 queued 任务可取消。任务状态、消息状态和账本剩余预扣额度退款在同一 D1 事务中提交，再推送 task.update。重复取消已取消任务返回成功且不会再次退款；并发启动获胜时返回校验错误。",
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
  }
};
