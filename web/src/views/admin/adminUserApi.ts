import { apiFetch } from "@/api/client";
import type {
  AdminUser,
  ProviderKeyRow,
  QuotaSnapshot,
  QuotaTransaction,
  UsageResponse
} from "./adminUserTypes";

export async function fetchAdminUsers(input: {
  isSysadmin: boolean;
  page: number;
  pageSize: number;
  q: string;
  role: "" | "admin" | "user";
  status: "" | "active" | "disabled";
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize)
  });
  const trimmedQ = input.q.trim();
  if (trimmedQ) params.set("q", trimmedQ);
  if (input.status) params.set("status", input.status);
  if (input.isSysadmin && input.role) params.set("role", input.role);
  return apiFetch<{
    items: AdminUser[];
    page: number;
    pageSize: number;
    total: number;
  }>(`/admin/users${params.size ? `?${params.toString()}` : ""}`);
}

export function fetchAdminProviderKeys() {
  return apiFetch<{ items: ProviderKeyRow[] }>("/admin/provider-keys");
}

export function fetchAdminUserQuota(userId: string, cursor: number | null) {
  const params = new URLSearchParams({ limit: "10" });
  if (cursor) params.set("cursor", String(cursor));
  return apiFetch<{
    quota: QuotaSnapshot;
    transactions: QuotaTransaction[];
    nextCursor: number | null;
  }>(`/admin/users/${userId}/quota?${params.toString()}`);
}

export function fetchAdminUserUsage(userId: string) {
  return apiFetch<UsageResponse>(`/admin/users/${userId}/usage`);
}
