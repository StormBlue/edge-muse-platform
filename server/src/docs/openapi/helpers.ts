export type OpenApiObject = Record<string, unknown>;

const jsonContent = (schema: OpenApiObject) => ({
  "application/json": { schema }
});
export const jsonResponse = (description: string, schema: OpenApiObject) => ({
  description,
  content: jsonContent(schema)
});

export const emptyResponse = (description: string) => ({ description });

export const requestJson = (description: string, schema: OpenApiObject, required = true) => ({
  required,
  description,
  content: jsonContent(schema)
});

export const requestMultipart = (description: string, schema: OpenApiObject) => ({
  required: true,
  description,
  content: {
    "multipart/form-data": { schema }
  }
});

export const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const arrayOf = (schema: OpenApiObject) => ({ type: "array", items: schema });

export const pageParam = {
  name: "page",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, default: 1 },
  description: "页码，从 1 开始；非法数字按接口默认值处理。"
};

export const pageSizeParam = (defaultValue: number, max: number) => ({
  name: "pageSize",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: max, default: defaultValue },
  description: `每页数量，最小 1，最大 ${max}。`
});

export const cursorParam = {
  name: "cursor",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 0, default: 0 },
  description: "向历史方向翻页的游标。传 0 或省略表示第一页。"
};

export const limitParam = (defaultValue = 20, max = 50) => ({
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: max, default: defaultValue },
  description: `本页最大返回数量，服务端会裁剪到 ${max} 以内。`
});

export const pathParam = (name: string, description: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", minLength: 1 },
  description
});

export const authSecurity = [{ accessCookie: [] }, { bearerAuth: [] }];
export const csrfSecurity = [...authSecurity, { csrfHeader: [] }];
export const adminSecurity = authSecurity;
export const sysadminSecurity = authSecurity;

export const errorResponse = (description: string) =>
  jsonResponse(description, ref("ApiErrorBody"));

export const commonErrors = {
  "401": errorResponse(
    "未登录、access token 缺失/过期/被吊销，或 Cookie/Bearer Token 无效。响应体 code 通常为 `UNAUTHORIZED`。"
  ),
  "404": errorResponse(
    "资源不存在，或当前用户无权访问时按不存在处理。响应体 code 为 `NOT_FOUND`。"
  ),
  "500": errorResponse("未预期服务端错误。响应体 code 为 `INTERNAL`，不会暴露堆栈。")
};

export const validationError = {
  "400": errorResponse(
    "请求参数、查询参数或 JSON body 未通过校验。响应体 code 为 `VALIDATION_ERROR`，details 可能包含 Zod flatten 结果。"
  )
};

export const forbiddenError = {
  "403": errorResponse(
    "权限不足、账号被禁用、CSRF token 缺失/不匹配，或业务策略禁止本操作。响应体 code 为 `FORBIDDEN`。"
  )
};

export const rateLimitError = {
  "429": errorResponse("触发限流策略。响应体 code 为 `RATE_LIMITED`。")
};

export const quotaError = {
  "402": errorResponse("配额不足或管理员分配超出自身剩余额度。响应体 code 为 `QUOTA_EXCEEDED`。")
};

export const payloadTooLargeError = {
  "413": errorResponse("上传内容超过服务端限制。响应体 code 为 `PAYLOAD_TOO_LARGE`。")
};

export const providerError = {
  "502": errorResponse("上游 provider 调用失败或返回不可用数据。响应体 code 为 `PROVIDER_ERROR`。")
};

export const okBody = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean", const: true } },
  additionalProperties: false
};
