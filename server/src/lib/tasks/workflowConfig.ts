/**
 * 生图 Workflow 不允许平台自动重试 provider 调用；用户需要显式点击 retry 才能新建任务并重新扣额度。
 */
export const GENERATE_WORKFLOW_STEP_CONFIG = {
  retries: {
    limit: 0,
    delay: 0,
    backoff: "constant"
  },
  timeout: "10 minutes"
} as const;
