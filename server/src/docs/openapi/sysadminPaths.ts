import {
  arrayOf,
  commonErrors,
  csrfSecurity,
  forbiddenError,
  jsonResponse,
  okBody,
  pageParam,
  pageSizeParam,
  pathParam,
  ref,
  requestJson,
  sysadminSecurity,
  validationError
} from "./helpers";

export const sysadminPaths = {
  "/api/sysadmin/admins": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listTenantAdmins",
      summary: "读取租户管理员列表",
      description:
        "要求 sysadmin 登录。返回 role=admin 的管理员账号、状态、绑定 provider key group、并发上限和配额池信息；不返回密码哈希。",
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
        "要求 sysadmin 登录和 CSRF。创建 role=admin 账号、初始配额行，并分配 provider key group。邮箱可选，省略时服务端生成占位邮箱。",
      security: csrfSecurity,
      requestBody: requestJson("管理员账号信息。", {
        type: "object",
        required: ["username", "password", "nickname", "providerKeyGroupId", "quota"],
        properties: {
          email: { type: "string", format: "email", nullable: true },
          username: { type: "string", minLength: 3, maxLength: 40 },
          password: { type: "string", minLength: 8 },
          nickname: { type: "string", minLength: 1 },
          providerKeyGroupId: { type: "string", minLength: 1 },
          maxConcurrentTasks: { type: "integer", minimum: 1, maximum: 15, default: 10 },
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
        "要求 sysadmin 登录和 CSRF。可更新昵称、状态、provider key group、最大同时任务数、总配额和密码。改绑 group 时，会同步该管理员及其下属用户的 providerKeyGroupId。",
      security: csrfSecurity,
      parameters: [pathParam("id", "管理员用户 ID。")],
      requestBody: requestJson("管理员补丁。", {
        type: "object",
        properties: {
          nickname: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["active", "disabled"] },
          providerKeyGroupId: { type: "string", minLength: 1 },
          maxConcurrentTasks: { type: "integer", minimum: 1, maximum: 15 },
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
        "要求 sysadmin 登录。`id=me` 表示当前 sysadmin，`id=_` 表示全站会话；否则按指定 userId 筛选。返回会话、所属用户摘要、成功图片数和分页信息；包含用户已软删除的会话，`deletedAt` 非空表示普通历史已隐藏。",
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
                    imageCount: { type: "integer" },
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
        "要求 sysadmin 登录。返回当前 sysadmin 的 preferredProviderKeyId、提示词助手模型设置、登录验证码设置和可选项。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("sysadmin 偏好。", {
          type: "object",
          required: [
            "preferredProviderKeyId",
            "promptAssistantModel",
            "promptAssistantModelOptions",
            "captcha",
            "captchaProviderOptions"
          ],
          properties: {
            preferredProviderKeyId: { type: "string", nullable: true },
            promptAssistantModel: { type: "object", additionalProperties: true },
            promptAssistantModelOptions: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            captcha: ref("CaptchaSettings"),
            captchaProviderOptions: {
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
        "要求 sysadmin 登录和 CSRF。至少提供 `preferredProviderKeyId`、`promptAssistantModel` 或 `captcha` 之一；设置 provider key 时必须是可分配 key。ALTCHA 难度可按国内/国外分别配置；旧字段 `captcha.altchaDifficulty` 仍兼容并会同时作用于两个地区。",
      security: csrfSecurity,
      requestBody: requestJson("sysadmin 偏好补丁。", {
        type: "object",
        properties: {
          preferredProviderKeyId: { type: "string", nullable: true },
          promptAssistantModel: { type: "object", additionalProperties: true },
          captcha: {
            type: "object",
            required: ["domesticProvider", "overseasProvider"],
            properties: {
              domesticProvider: ref("CaptchaProvider"),
              overseasProvider: ref("CaptchaProvider"),
              domesticAltchaDifficulty: { type: "integer", minimum: 10000, maximum: 200000 },
              overseasAltchaDifficulty: { type: "integer", minimum: 10000, maximum: 200000 },
              altchaDifficulty: {
                type: "integer",
                minimum: 10000,
                maximum: 200000,
                deprecated: true
              }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("偏好已更新。", {
          type: "object",
          required: ["ok", "preferredProviderKeyId", "promptAssistantModel", "captcha"],
          properties: {
            ok: { type: "boolean", const: true },
            preferredProviderKeyId: { type: "string", nullable: true },
            promptAssistantModel: { type: "object", additionalProperties: true },
            captcha: ref("CaptchaSettings")
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
          schema: { type: "string", enum: ["image2image", "text2image"] },
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
            items: { type: "string", enum: ["image2image", "text2image"] }
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
};
