<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-003","type":"requirement","title":"AI 图像创作重构与任务再创作","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"任务列表、取消和来源复用受本人权限约束；取消与预扣退还原子且幂等。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m1-server.txt","description":"Observed server permission, quota and concurrency acceptance"}]},{"id":"AC-2","text":"跨页任务中心展示真实阶段、耗时、额度与取消结果；快速完成任务有通知且旧账号响应不能污染状态。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}]},{"id":"AC-3","text":"自己的结果可沿用参数或用作参考图，在当前能力下编辑后显式提交；来源保留且支持并排对比。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}]},{"id":"AC-4","text":"AI 图像生成首屏直接可创作，案例可按需搜索、预览、应用，路由前进后退及旧响应不破坏选择。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}]},{"id":"AC-5","text":"创作需求进入提示词或助手；助手建议可编辑、选择性采纳和撤销，不自动覆盖用户提示词。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}]},{"id":"AC-6","text":"桌面与手机关键流程可操作、无裁切遮挡；已有门禁与必要负路径测试通过，文档同步。","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m1-server.txt","description":"Observed server permission, quota and concurrency acceptance"},{"kind":"command","ref":"openspec/changes/archive/2026-09-06-REQ-2026-003-ai-image-studio/evidence/m2-studio.txt","description":"Observed frontend gates, Chromium workflows, integrated review and documentation sync"}],"affected_code":[],"affected_docs":["ARCHITECTURE.md","docs/FRONTEND.md","docs/USER_GUIDE.md","docs/API.md","docs/RELIABILITY.md","docs/EXPERIMENTS.md","docs/QUALITY_SCORE.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"ai-image-studio","complexity":"large","risk":{"level":"high","drivers":["money-entitlement","concurrency","security-privacy","ux-accessibility"]},"retention":"summary","domains":["ai-image-studio"],"spec_baselines":{"ai-image-studio":null},"ephemeral_artifacts":[],"created_at":"2026-09-06T04:01:41+08:00","updated_at":"2026-09-06T04:56:56+08:00","status_changed_at":"2026-09-06T04:56:56+08:00","completed_at":"2026-09-06T04:56:56+08:00","archived_at":"2026-09-06T04:56:56+08:00","status_history":[{"status":"accepted","at":"2026-09-06T04:01:41+08:00","reason":"Change created"},{"status":"in_progress","at":"2026-09-05T20:23:45.297Z","reason":"User-authorized development on develop; implementation underway"},{"status":"verifying","at":"2026-09-05T20:54:39Z","reason":"Implementation milestones pushed; aggregate checks, browser acceptance and independent review passed"},{"status":"done","at":"2026-09-06T04:56:56+08:00","reason":"Close completed"}],"verified_at":"2026-09-05T20:54:39Z","verified_against":"9c469300d3bb179aef61a898b42b5bfa299b1038"} -->

# REQ-2026-003: AI 图像创作重构与任务再创作

## Need

提高创作、等待、调整结果之间的衔接效率；修复现有取消未退额、助手自动覆盖等实际问题。

## Scope

- 任务中心、真实阶段/耗时、通知、排队取消和账本额度反馈。
- 结果沿用参数、用作参考、来源关系与并排对比，兼容工作台/历史入口。
- AI 创作器常驻、案例选择器、结构化创作需求、助手建议审阅与选择性采纳。
- 中文关键逻辑注释、必要回归与跨视口验证；按里程碑推送 develop，最终合并推送 main。
- 不包含草稿持久化、收藏/作品库、复杂运营、额外 CI 平台。

## Acceptance Criteria

- [x] `AC-1` - 任务列表、取消和来源复用受本人权限约束；取消与预扣退还原子且幂等。
- [x] `AC-2` - 跨页任务中心展示真实阶段、耗时、额度与取消结果；快速完成任务有通知且旧账号响应不能污染状态。
- [x] `AC-3` - 自己的结果可沿用参数或用作参考图，在当前能力下编辑后显式提交；来源保留且支持并排对比。
- [x] `AC-4` - AI 图像生成首屏直接可创作，案例可按需搜索、预览、应用，路由前进后退及旧响应不破坏选择。
- [x] `AC-5` - 创作需求进入提示词或助手；助手建议可编辑、选择性采纳和撤销，不自动覆盖用户提示词。
- [x] `AC-6` - 桌面与手机关键流程可操作、无裁切遮挡；已有门禁与必要负路径测试通过，文档同步。

## Documentation Disposition

- Result: updated
- Affected docs: `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/USER_GUIDE.md`, `docs/API.md`, `docs/RELIABILITY.md`, `docs/EXPERIMENTS.md`, `docs/QUALITY_SCORE.md`

## History

- 2026-09-06T04:01:41+08:00 - 用户明确授权此范围及 develop/main 交付。
- 2026-09-05T20:23:45.297Z - 一手调研完成，设计与并发/权限边界形成实现依据。

- 2026-09-06T04:56:56+08:00 - Close completed; requirement archived.
