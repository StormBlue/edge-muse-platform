import {
  arrayOf,
  authSecurity,
  commonErrors,
  csrfSecurity,
  cursorParam,
  errorResponse,
  forbiddenError,
  jsonResponse,
  limitParam,
  okBody,
  pageParam,
  pageSizeParam,
  pathParam,
  payloadTooLargeError,
  ref,
  requestJson,
  requestMultipart,
  validationError
} from "../helpers";

export const sessionsHistoryImagePaths = {
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
          mode: { $ref: "#/components/schemas/GenerationMode", default: "image2image" },
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
        "要求登录和 CSRF。仅允许删除至少包含一个任务、且所有任务均为 `succeeded` 或 `failed` 的生成会话。写入 `deletedAt` 后普通列表和消息查询会过滤软删会话；sysadmin 会话审计仍可查看；不立即删除 R2 对象。",
      security: csrfSecurity,
      parameters: [pathParam("id", "会话 ID。")],
      responses: {
        "200": jsonResponse("删除成功。", okBody),
        ...validationError,
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
  }
};
