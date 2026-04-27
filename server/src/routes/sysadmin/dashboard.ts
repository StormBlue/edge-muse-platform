import type { SysadminRouter } from "./common";

export function registerSysadminDashboardRoutes(sysadminRoutes: SysadminRouter) {
  // 运营看板：KV 缓存 60s，聚合用户角色数、任务状态数、30 日趋势、Top 用户、按 provider 任务量。
  sysadminRoutes.get("/dashboard/stats", async (c) => {
    const cached = await c.env.KV.get("dashboard:stats");
    if (cached) return c.json(JSON.parse(cached));
    const userCounts = await c.env.DB.prepare(
      "SELECT role, COUNT(*) count FROM users GROUP BY role"
    ).all();
    const taskCounts = await c.env.DB.prepare(
      "SELECT status, COUNT(*) count FROM tasks GROUP BY status"
    ).all();
    const trend = await c.env.DB.prepare(
      `SELECT CAST((queued_at / 86400000) AS INTEGER) day, COUNT(*) count
       FROM tasks
       WHERE queued_at > ?1
       GROUP BY day
       ORDER BY day`
    )
      .bind(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .all();
    const topUsers = await c.env.DB.prepare(
      `SELECT users.id, users.email, users.nickname, COUNT(tasks.id) task_count
       FROM users
       LEFT JOIN tasks ON tasks.user_id = users.id
       GROUP BY users.id
       ORDER BY task_count DESC
       LIMIT 10`
    ).all();
    const providerCounts = await c.env.DB.prepare(
      `SELECT providers.name, COUNT(tasks.id) count
       FROM tasks
       LEFT JOIN provider_keys ON provider_keys.id = tasks.provider_key_id
       LEFT JOIN providers ON providers.id = provider_keys.provider_id
       GROUP BY providers.id
       ORDER BY count DESC`
    ).all();
    const body = {
      userCounts: userCounts.results,
      taskCounts: taskCounts.results,
      trend: trend.results,
      topUsers: topUsers.results,
      providerCounts: providerCounts.results
    };
    await c.env.KV.put("dashboard:stats", JSON.stringify(body), { expirationTtl: 60 });
    return c.json(body);
  });
}
