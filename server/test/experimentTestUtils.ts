import { getDb } from "../src/db/client";
import { users } from "../src/db/schema";
import type { D1TestContext } from "./d1TestUtils";
import type { AuthUser } from "../src/types";

export async function seedExperimentUsers(ctx: D1TestContext) {
  await getDb(ctx.env)
    .insert(users)
    .values([
      {
        id: "sys_1",
        email: "sys@example.com",
        username: "sys",
        passwordHash: "hash",
        nickname: "Sysadmin",
        role: "sysadmin",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "adm_1",
        email: "admin@example.com",
        username: "admin",
        passwordHash: "hash",
        nickname: "Admin",
        role: "admin",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "usr_1",
        email: "user1@example.com",
        username: "user1",
        passwordHash: "hash",
        nickname: "User 1",
        role: "user",
        createdBy: "adm_1",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: "usr_2",
        email: "user2@example.com",
        username: "user2",
        passwordHash: "hash",
        nickname: "User 2",
        role: "user",
        createdBy: "adm_1",
        status: "active",
        createdAt: 1,
        updatedAt: 1
      }
    ]);
}

export function authUser(id: "usr_1" | "usr_2"): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    username: id,
    nickname: id,
    role: "user",
    status: "active"
  };
}

export function sysadminUser(): AuthUser {
  return {
    id: "sys_1",
    email: "sys@example.com",
    username: "sys",
    nickname: "Sysadmin",
    role: "sysadmin",
    status: "active"
  };
}
