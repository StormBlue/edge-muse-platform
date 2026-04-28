import type { LocationQuery } from "vue-router";
import { queryPositiveInt, type StringQuery } from "@/lib/routeQuery";

export function resolveUserSessionsRouteUserId(routeUserId: unknown, ownUserId?: string | null) {
  if (typeof routeUserId !== "string") return "";
  if (routeUserId === "_") return "";
  if (routeUserId === "me") return ownUserId ?? "";
  return routeUserId;
}

export function readUserSessionsRoutePage(query: LocationQuery) {
  return queryPositiveInt(query.page, 1);
}

export function readUserSessionsRouteSessionId(query: LocationQuery) {
  return typeof query.session === "string" ? query.session : null;
}

export function buildUserSessionsListQuery(input: {
  page: number;
  q: string;
  sessionId?: string | null;
}): StringQuery {
  const query: StringQuery = { page: String(sanitizeUserSessionsPage(input.page)) };
  const trimmedQ = input.q.trim();
  if (trimmedQ) query.q = trimmedQ;
  if (input.sessionId) query.session = input.sessionId;
  return query;
}

export function sanitizeUserSessionsPage(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function clampUserSessionsPageInput(value: string, currentPage: number, totalPages: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return currentPage;
  return Math.min(Math.max(Math.floor(parsed), 1), totalPages);
}
