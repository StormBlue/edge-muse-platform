import { apiFetch } from "@/api/client";

export type AnnouncementTargetAudience = "all" | "admins";
export type AnnouncementStatus = "draft" | "published" | "archived";

export type AnnouncementListItem = {
  id: string;
  title: string;
  contentPreview: string;
  targetAudience: AnnouncementTargetAudience;
  publishedAt: number;
  createdAt: number;
  isRead: boolean;
};

export type AnnouncementDetail = AnnouncementListItem & {
  content: string;
};

export type AnnouncementListResponse = {
  items: AnnouncementListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
};

export type RecentAnnouncementsResponse = {
  items: AnnouncementListItem[];
  hasMore: boolean;
  unreadCount: number;
};

export type SysadminAnnouncementItem = {
  id: string;
  title: string;
  content: string;
  contentPreview: string;
  targetAudience: AnnouncementTargetAudience;
  status: AnnouncementStatus;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type SysadminAnnouncementInput = {
  title: string;
  content: string;
  targetAudience: AnnouncementTargetAudience;
  status: AnnouncementStatus;
};

export type SysadminAnnouncementListResponse = {
  items: SysadminAnnouncementItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function getRecentAnnouncements() {
  return apiFetch<RecentAnnouncementsResponse>("/announcements/recent");
}

export async function listAnnouncements(input: { page: number; pageSize?: number }) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  return apiFetch<AnnouncementListResponse>(`/announcements?${params.toString()}`);
}

export async function getAnnouncementDetail(id: string) {
  const body = await apiFetch<{ item: AnnouncementDetail; unreadCount: number }>(
    `/announcements/${encodeURIComponent(id)}`
  );
  return body;
}

export async function markAnnouncementRead(id: string) {
  return apiFetch<{ unreadCount: number }>(`/announcements/${encodeURIComponent(id)}/read`, {
    method: "POST"
  });
}

export async function listSysadminAnnouncements(input: {
  page: number;
  pageSize?: number;
  status?: AnnouncementStatus | "";
  targetAudience?: AnnouncementTargetAudience | "";
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.targetAudience) params.set("targetAudience", input.targetAudience);
  if (input.q?.trim()) params.set("q", input.q.trim());
  return apiFetch<SysadminAnnouncementListResponse>(`/sysadmin/announcements?${params.toString()}`);
}

export async function createSysadminAnnouncement(input: SysadminAnnouncementInput) {
  const body = await apiFetch<{ item: SysadminAnnouncementItem }>("/sysadmin/announcements", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return body.item;
}

export async function updateSysadminAnnouncement(
  id: string,
  input: Partial<SysadminAnnouncementInput>
) {
  const body = await apiFetch<{ item: SysadminAnnouncementItem }>(
    `/sysadmin/announcements/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
  return body.item;
}

export async function deleteSysadminAnnouncement(id: string) {
  return apiFetch<{ ok: true }>(`/sysadmin/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}
