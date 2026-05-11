import {
  arrayOf,
  authSecurity,
  commonErrors,
  csrfSecurity,
  forbiddenError,
  jsonResponse,
  pageParam,
  pageSizeParam,
  pathParam,
  providerError,
  rateLimitError,
  ref,
  requestJson,
  validationError
} from "../helpers";

export const assistantCaseAnnouncementPaths = {
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
          mode: { type: "string", enum: ["image2image", "text2image"] },
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
      summary: "分页读取用户侧已发布案例",
      description:
        "要求登录。只返回 `published` 案例的轻量列表项；列表不包含 `promptTemplate`，详情通过 `/api/prompt-cases/{id}` 按需读取。排序为 `featured desc, sortOrder asc, updatedAt desc, id asc`。cursor 与当前筛选条件绑定；筛选变化时旧 cursor 会被安全忽略并从第一页返回。",
      security: authSecurity,
      parameters: [
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 60 },
          required: false,
          description: "单页数量，默认 60，最大 100。"
        },
        {
          name: "cursor",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 1000 },
          required: false,
          description: "上一页返回的不透明游标。"
        },
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
          schema: { type: "string", enum: ["image2image", "text2image"] },
          required: false,
          description: "按可用模式筛选。"
        },
        {
          name: "size",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 40 },
          required: false,
          description: "按推荐尺寸筛选。"
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
          description: "按标题、摘要、分类或标签搜索。"
        }
      ],
      responses: {
        "200": jsonResponse("案例列表。", {
          type: "object",
          required: ["items", "pageInfo", "facets"],
          properties: {
            items: arrayOf(ref("PromptCaseListItem")),
            pageInfo: ref("PromptCasePageInfo"),
            facets: ref("PromptCaseFacets")
          },
          additionalProperties: false
        }),
        ...validationError,
        ...commonErrors
      }
    }
  },
  "/api/prompt-cases/{id}": {
    get: {
      tags: ["Prompt Cases"],
      operationId: "getPublicPromptCase",
      summary: "读取用户侧案例详情",
      description:
        "要求登录。只返回已发布案例的完整详情，包含 `promptTemplate`。传入 locale 时，案例语言不匹配返回 NOT_FOUND。",
      security: authSecurity,
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "案例 ID。"
        },
        {
          name: "locale",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["zh-CN", "en-US"] },
          description: "可选语言约束，不匹配时返回 404。"
        }
      ],
      responses: {
        "200": jsonResponse("案例详情。", {
          type: "object",
          required: ["item"],
          properties: { item: ref("PromptCase") },
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
