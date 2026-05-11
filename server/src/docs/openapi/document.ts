import { adminPaths } from "./adminPaths";
import { components } from "./components";
import type { OpenApiObject } from "./helpers";
import { publicPaths } from "./publicPaths";
import { sysadminPaths } from "./sysadminPaths";

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
  components,
  paths: {
    ...publicPaths,
    ...adminPaths,
    ...sysadminPaths
  }
};
