import { describe, expect, it } from "vitest";
import {
  routeAccessDecision,
  shouldBootstrapRoute,
  type RouteAccessAuthState,
  type RouteAccessTarget
} from "./routeGuard";

const guest: RouteAccessAuthState = {
  loaded: true,
  isAuthenticated: false,
  isAdmin: false,
  isSysadmin: false,
  generationEntry: null
};

const user: RouteAccessAuthState = {
  loaded: true,
  isAuthenticated: true,
  isAdmin: false,
  isSysadmin: false,
  generationEntry: { navTarget: "/ai-image", showWorkspace: false, showAiImage: true }
};

const admin: RouteAccessAuthState = {
  ...user,
  isAdmin: true,
  generationEntry: { navTarget: "/workspace", showWorkspace: true, showAiImage: true }
};

const sysadmin: RouteAccessAuthState = {
  ...admin,
  isSysadmin: true
};

describe("route guard decisions", () => {
  it("bootstraps protected routes and public routes with a session hint", () => {
    expect(shouldBootstrapRoute(route("/workspace"), { ...guest, loaded: false }, false)).toBe(
      true
    );
    expect(
      shouldBootstrapRoute(route("/login", { public: true }), { ...guest, loaded: false }, true)
    ).toBe(true);
    expect(
      shouldBootstrapRoute(route("/login", { public: true }), { ...guest, loaded: false }, false)
    ).toBe(false);
  });

  it("redirects unauthenticated protected routes to login with the original target", () => {
    expect(routeAccessDecision(route("/ai-image", {}, "/ai-image?case=1"), guest)).toBe(
      "/login?redirect=%2Fai-image%3Fcase%3D1"
    );
  });

  it("uses the configured generation entry target as the regular user home", () => {
    expect(routeAccessDecision(route("/"), user)).toBe("/ai-image");
    expect(routeAccessDecision(route("/login", { public: true }), user)).toBe("/ai-image");
  });

  it("redirects regular users away from disabled generation pages", () => {
    expect(routeAccessDecision(route("/workspace"), user)).toBe("/ai-image");
    expect(routeAccessDecision(route("/workspace/s/ses_1"), user)).toBe("/ai-image");
    expect(routeAccessDecision(route("/ai-image"), user)).toBe(true);
  });

  it("sends sysadmin users to the system dashboard", () => {
    expect(routeAccessDecision(route("/"), sysadmin)).toBe("/sysadmin/dashboard");
  });

  it("enforces admin and sysadmin role requirements", () => {
    expect(routeAccessDecision(route("/admin/users", { role: "admin" }), user)).toBe("/403");
    expect(routeAccessDecision(route("/admin/users", { role: "admin" }), admin)).toBe(true);
    expect(routeAccessDecision(route("/sysadmin/keys", { role: "sysadmin" }), admin)).toBe("/403");
    expect(routeAccessDecision(route("/sysadmin/keys", { role: "sysadmin" }), sysadmin)).toBe(true);
  });
});

function route(
  path: string,
  meta: RouteAccessTarget["meta"] = {},
  fullPath = path
): RouteAccessTarget {
  return { path, fullPath, meta };
}
