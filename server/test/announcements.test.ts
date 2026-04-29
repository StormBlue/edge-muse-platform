import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  countUnreadAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  getPublicAnnouncementDetail,
  listPublicAnnouncements,
  listSysadminAnnouncements,
  markAnnouncementRead,
  updateAnnouncement
} from "../src/lib/announcements";
import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import { createD1TestContext, type D1TestContext } from "./d1TestUtils";
import type { AuthUser } from "../src/types";

describe("announcements", () => {
  let ctx: D1TestContext;
  const sysadmin = user({ id: "usr_sysadmin", role: "sysadmin" });
  const admin = user({ id: "usr_admin", role: "admin" });
  const regular = user({ id: "usr_regular", role: "user" });

  beforeEach(async () => {
    ctx = await createD1TestContext();
    await insertUser(ctx, sysadmin);
    await insertUser(ctx, admin);
    await insertUser(ctx, regular);
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("filters public announcements by target audience and read state", async () => {
    const allUsers = await createAnnouncement(ctx.env, sysadmin.id, {
      title: "全员公告",
      content: "所有用户都能看到",
      targetAudience: "all",
      status: "published"
    });
    const adminsOnly = await createAnnouncement(ctx.env, sysadmin.id, {
      title: "管理员公告",
      content: "仅管理员与系统管理员可见",
      targetAudience: "admins",
      status: "published"
    });
    await createAnnouncement(ctx.env, sysadmin.id, {
      title: "草稿公告",
      content: "还不能被用户看到",
      targetAudience: "all",
      status: "draft"
    });

    const regularList = await listPublicAnnouncements(ctx.env, regular);
    expect(regularList.items.map((item) => item.title)).toEqual(["全员公告"]);
    expect(regularList.unreadCount).toBe(1);

    const adminList = await listPublicAnnouncements(ctx.env, admin);
    expect(adminList.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["全员公告", "管理员公告"])
    );
    expect(adminList.unreadCount).toBe(2);

    await expect(
      getPublicAnnouncementDetail(ctx.env, regular, adminsOnly.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await markAnnouncementRead(ctx.env, admin.id, allUsers.id);
    expect(await countUnreadAnnouncements(ctx.env, admin)).toBe(1);

    const adminAfterRead = await listPublicAnnouncements(ctx.env, admin);
    expect(adminAfterRead.items.find((item) => item.id === allUsers.id)?.isRead).toBe(true);
  });

  it("lets sysadmin create, publish, filter, and archive announcements", async () => {
    const draft = await createAnnouncement(ctx.env, sysadmin.id, {
      title: "维护预告",
      content: "今晚 22:00 维护",
      targetAudience: "all",
      status: "draft"
    });

    expect(draft.status).toBe("draft");
    expect(draft.publishedAt).toBeNull();

    const published = await updateAnnouncement(ctx.env, sysadmin.id, draft.id, {
      title: "管理员维护预告",
      targetAudience: "admins",
      status: "published"
    });

    expect(published).toMatchObject({
      title: "管理员维护预告",
      targetAudience: "admins",
      status: "published"
    });
    expect(published.publishedAt).toEqual(expect.any(Number));

    const filtered = await listSysadminAnnouncements(ctx.env, {
      status: "published",
      targetAudience: "admins",
      q: "维护"
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].id).toBe(draft.id);

    await deleteAnnouncement(ctx.env, sysadmin.id, draft.id);

    const afterDelete = await listSysadminAnnouncements(ctx.env);
    expect(afterDelete.items).toHaveLength(0);
  });
});

async function insertUser(ctx: D1TestContext, input: AuthUser) {
  await getDb(ctx.env).insert(users).values({
    id: input.id,
    email: input.email,
    username: input.username,
    passwordHash: "hash",
    nickname: input.nickname,
    role: input.role,
    status: input.status,
    preferredProviderKeyId: input.preferredProviderKeyId,
    createdAt: 1,
    updatedAt: 1
  });
}

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  const id = overrides.id ?? "usr_1";
  return {
    id,
    email: `${id}@example.com`,
    username: id,
    nickname: "User",
    role: "user",
    status: "active",
    preferredProviderKeyId: null,
    ...overrides
  };
}
