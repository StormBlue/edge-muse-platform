import {
  adminSecurity,
  arrayOf,
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
  providerError,
  quotaError,
  ref,
  requestJson,
  sysadminSecurity,
  validationError
} from "./helpers";

export const adminPaths = {
  "/api/admin/provider-keys": {
    get: {
      tags: ["Admin"],
      operationId: "listAssignableProviderKeys",
      summary: "读取可分配 provider key",
      description:
        "要求 admin 或 sysadmin 登录。保留给历史页面兼容；生成分配以 provider key group 为准。响应永不包含明文或密文 API key。",
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
        "要求 admin 或 sysadmin 登录。admin 只能查看自己创建的普通用户；sysadmin 可查看 admin/user，并可按 role 过滤。返回配额、分配 key group、并发上限、生成次数和最近生成时间。",
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
        "要求 admin 或 sysadmin 登录和 CSRF。admin 只能创建普通用户，且初始配额不能超过自身剩余配额；普通用户继承创建者 key group。sysadmin 可创建 admin 或 user，并可指定 provider key group、授予无限配额 (`quota=null`)。",
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
          providerKeyGroupId: {
            type: "string",
            nullable: true,
            description: "仅 sysadmin 可指定；admin 创建普通用户时固定继承创建者 group。"
          },
          maxConcurrentTasks: {
            type: "integer",
            minimum: 1,
            maximum: 15,
            description: "admin 最大 15，普通 user 最大 10。"
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
        "要求 admin 或 sysadmin 登录和 CSRF。admin 只能编辑下属普通用户的昵称、状态和最大同时任务数；sysadmin 可覆盖总配额、重置密码、改绑 provider key group。注意这里的 `quota` 是覆盖总配额，不是追加。",
      security: csrfSecurity,
      parameters: [pathParam("id", "目标用户 ID。")],
      requestBody: requestJson("要更新的字段。", {
        type: "object",
        properties: {
          nickname: { type: "string", minLength: 1, maxLength: 40 },
          status: { type: "string", enum: ["active", "disabled"] },
          providerKeyGroupId: { type: "string", nullable: true },
          maxConcurrentTasks: {
            type: "integer",
            minimum: 1,
            maximum: 15,
            description:
              "admin 最大 15，普通 user 最大 10；普通 admin 只能编辑下属 user，因此最大 10。"
          },
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
          maxConcurrency: { type: "integer", minimum: 1, maximum: 100, default: 1 },
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
        "要求 sysadmin 登录和 CSRF。可改 provider、label、model、明文 apiKey、配额、归属 admin、启用状态。传入新 apiKey 时会重新加密并刷新 keyHint；响应不返回密钥。若某 key 是分组里最后一个启用且未删除的成员，则不能停用。",
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
          maxConcurrency: { type: "integer", minimum: 1, maximum: 100 },
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
      description:
        "要求 sysadmin 登录和 CSRF。将 key 禁用并写入 deletedAt；不会返回明文/密文。已添加到未删除 key group 的密钥不能直接删除，需先从分组移除。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key ID。")],
      responses: {
        "200": jsonResponse("密钥已软删。", okBody),
        ...validationError,
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
  },
  "/api/sysadmin/provider-key-groups": {
    get: {
      tags: ["Sysadmin"],
      operationId: "listProviderKeyGroups",
      summary: "读取 provider key group 列表",
      description:
        "要求 sysadmin 登录。返回未软删 key group 及成员，成员按 sortOrder 排序，用于生成调度配置。",
      security: sysadminSecurity,
      responses: {
        "200": jsonResponse("key group 列表。", {
          type: "object",
          required: ["items"],
          properties: { items: arrayOf(ref("ProviderKeyGroup")) },
          additionalProperties: false
        }),
        ...forbiddenError,
        ...commonErrors
      }
    },
    post: {
      tags: ["Sysadmin"],
      operationId: "createProviderKeyGroup",
      summary: "创建 provider key group",
      description:
        "要求 sysadmin 登录和 CSRF。创建一个同 provider 的 key group；成员 key 必须属于同一 provider。",
      security: csrfSecurity,
      requestBody: requestJson("key group。", {
        type: "object",
        required: ["providerId", "name"],
        properties: {
          providerId: { type: "string" },
          name: { type: "string", minLength: 1 },
          description: { type: "string", nullable: true },
          enabled: { type: "boolean", default: true },
          keyIds: arrayOf({ type: "string" })
        },
        additionalProperties: false
      }),
      responses: {
        "201": jsonResponse("key group 已创建。", {
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
  "/api/sysadmin/provider-key-groups/{id}": {
    get: {
      tags: ["Sysadmin"],
      operationId: "getProviderKeyGroup",
      summary: "读取 provider key group 详情",
      security: sysadminSecurity,
      parameters: [pathParam("id", "provider key group ID。")],
      responses: {
        "200": jsonResponse("key group 详情。", ref("ProviderKeyGroup")),
        ...forbiddenError,
        ...commonErrors
      }
    },
    patch: {
      tags: ["Sysadmin"],
      operationId: "updateProviderKeyGroup",
      summary: "更新 provider key group",
      description:
        "要求 sysadmin 登录和 CSRF。可更新名称、描述、启用状态或 provider；换 provider 时必须同步提交同 provider 成员。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key group ID。")],
      requestBody: requestJson("key group 补丁。", {
        type: "object",
        properties: {
          providerId: { type: "string" },
          name: { type: "string", minLength: 1 },
          description: { type: "string", nullable: true },
          enabled: { type: "boolean" },
          keyIds: arrayOf({ type: "string" })
        },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("key group 已更新。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    },
    delete: {
      tags: ["Sysadmin"],
      operationId: "deleteProviderKeyGroup",
      summary: "软删除 provider key group",
      description: "要求 sysadmin 登录和 CSRF。软删除并禁用 group，保留历史任务引用。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key group ID。")],
      responses: {
        "200": jsonResponse("key group 已软删。", okBody),
        ...forbiddenError,
        ...commonErrors
      }
    }
  },
  "/api/sysadmin/provider-key-groups/{id}/members": {
    put: {
      tags: ["Sysadmin"],
      operationId: "replaceProviderKeyGroupMembers",
      summary: "保存 provider key group 成员排序",
      description:
        "要求 sysadmin 登录和 CSRF。整体替换成员列表，数组顺序即调度优先级；所有 key 必须属于 group provider。",
      security: csrfSecurity,
      parameters: [pathParam("id", "provider key group ID。")],
      requestBody: requestJson("排序后的 key ID 列表。", {
        type: "object",
        required: ["keyIds"],
        properties: { keyIds: arrayOf({ type: "string" }) },
        additionalProperties: false
      }),
      responses: {
        "200": jsonResponse("成员已保存。", okBody),
        ...validationError,
        ...forbiddenError,
        ...commonErrors
      }
    }
  }
};
