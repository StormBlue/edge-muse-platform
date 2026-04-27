import { hasColumn, type SysadminRouter } from "./common";

export function registerSysadminUserRoutes(sysadminRoutes: SysadminRouter) {
  // 全站用户搜索（限 200 条）：兼容无 username 列的旧库用 id 搜。
  sysadminRoutes.get("/users", async (c) => {
    const q = c.req.query("q")?.trim();
    const hasUsername = await hasColumn(c.env, "users", "username");
    const conditions: string[] = [];
    const binds: unknown[] = [];
    if (q) {
      binds.push(`%${q}%`);
      const searchIndex = binds.length;
      conditions.push(
        hasUsername
          ? `(email LIKE ?${searchIndex} OR username LIKE ?${searchIndex} OR nickname LIKE ?${searchIndex})`
          : `(email LIKE ?${searchIndex} OR nickname LIKE ?${searchIndex} OR id LIKE ?${searchIndex})`
      );
    }
    const statement = c.env.DB.prepare(
      `SELECT id,
         email,
         ${hasUsername ? "username" : "NULL"} AS username,
         nickname,
         role,
         status
       FROM users
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 200`
    );
    const rows = binds.length
      ? await statement.bind(...binds).all<{
          id: string;
          email: string | null;
          username: string | null;
          nickname: string | null;
          role: "sysadmin" | "admin" | "user";
          status: "active" | "disabled";
        }>()
      : await statement.all<{
          id: string;
          email: string | null;
          username: string | null;
          nickname: string | null;
          role: "sysadmin" | "admin" | "user";
          status: "active" | "disabled";
        }>();
    return c.json({ items: rows.results });
  });
}
