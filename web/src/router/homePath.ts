/**
 * 登录后的默认首页选择。
 *
 * 路由守卫调用这个纯函数，确保 A/B 实验分配能稳定影响普通用户首页。
 */
import type { GenerationExperience } from "@/stores/auth";

export type HomePathAuthState = {
  isSysadmin: boolean;
  generationExperience: Pick<GenerationExperience, "navTarget"> | null;
};

export function homePath(auth: HomePathAuthState) {
  return auth.isSysadmin
    ? "/sysadmin/dashboard"
    : (auth.generationExperience?.navTarget ?? "/workspace");
}
