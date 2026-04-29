/**
 * 登录后的默认首页选择。
 *
 * 路由守卫调用这个纯函数，确保生成入口开关能稳定影响普通用户首页。
 */
import type { GenerationEntry } from "@/api/generation";

export type HomePathAuthState = {
  isSysadmin: boolean;
  generationEntry: Pick<GenerationEntry, "navTarget"> | null;
};

export function homePath(auth: HomePathAuthState) {
  return auth.isSysadmin
    ? "/sysadmin/dashboard"
    : (auth.generationEntry?.navTarget ?? "/workspace");
}
