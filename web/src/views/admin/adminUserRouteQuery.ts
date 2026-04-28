import type { LocationQuery } from "vue-router";
import { queryPositiveInt, queryString, type StringQuery } from "@/lib/routeQuery";

export function readAdminUsersRoutePage(query: LocationQuery) {
  return queryPositiveInt(query.page, 1);
}

export function readAdminUsersRouteStatus(query: LocationQuery): "" | "active" | "disabled" {
  const value = queryString(query.status);
  return value === "active" || value === "disabled" ? value : "";
}

export function readAdminUsersRouteRole(query: LocationQuery): "" | "admin" | "user" {
  const value = queryString(query.role);
  return value === "admin" || value === "user" ? value : "";
}

export function buildAdminUsersListQuery(input: {
  isSysadmin: boolean;
  page: number;
  q: string;
  role: "" | "admin" | "user";
  status: "" | "active" | "disabled";
}): StringQuery {
  const query: StringQuery = { page: String(sanitizeAdminUsersPage(input.page)) };
  const trimmedQ = input.q.trim();
  if (trimmedQ) query.q = trimmedQ;
  if (input.status) query.status = input.status;
  if (input.isSysadmin && input.role) query.role = input.role;
  return query;
}

export function sanitizeAdminUsersPage(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function clampAdminUsersPageInput(value: string, currentPage: number, totalPages: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return currentPage;
  return Math.min(sanitizeAdminUsersPage(parsed), totalPages);
}
