<!-- docs-architect-meta {"schema_version":1,"id":"REQ-2026-009","type":"requirement","title":"Fix responsive announcement dialog layout","status":"done","owners":[],"origin":{"kind":"request","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/request.md"},"approval":{"kind":"request-record","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/request.md"},"sources":[],"update_when":["Scope, acceptance, risk, implementation, evidence, or documentation disposition changes"],"relations":[],"dependencies":[],"acceptance":[{"id":"AC-1","text":"Announcement dialogs fit desktop and narrow viewports; titles wrap, body scrolls without horizontal overflow, closing controls remain visible and code blocks render safely.","status":"passed","evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/checks.txt","description":"Observed regression, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/browser.txt","description":"Responsive light/dark browser rendering, keyboard scroll and close actions"}]}],"evidence":[{"kind":"command","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/checks.txt","description":"Observed regression, typecheck, lint, build and integrated review"},{"kind":"log","ref":"openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/browser.txt","description":"Responsive light/dark browser rendering, keyboard scroll and close actions"}],"affected_code":["web/src/components/announcements/AnnouncementBell.vue","web/src/components/announcements/AnnouncementMarkdown.vue","web/src/components/announcements/AnnouncementMarkdown.test.ts"],"affected_docs":["docs/FRONTEND.md"],"open_questions":[],"documentation_disposition":"updated","no_doc_change_scope":[],"no_doc_change_reason":null,"slug":"announcement-dialog-layout","complexity":"small","risk":{"level":"low","drivers":["ux-accessibility"]},"retention":"summary","domains":["announcements"],"spec_baselines":{"announcements":null},"ephemeral_artifacts":[],"created_at":"2026-11-11T10:01:55+08:00","updated_at":"2026-11-11T10:13:53+08:00","status_changed_at":"2026-11-11T10:13:53+08:00","completed_at":"2026-11-11T10:13:53+08:00","archived_at":"2026-11-11T10:13:53+08:00","status_history":[{"status":"accepted","at":"2026-11-11T10:01:55+08:00","reason":"Change created"},{"status":"verifying","at":"2026-11-11T02:13:38.532067+00:00","reason":"Implementation, browser validation and integrated review passed"},{"status":"done","at":"2026-11-11T10:13:53+08:00","reason":"Close completed"}],"verified_at":"2026-11-11T02:13:19.422658+00:00","verified_against":"sha256:ab5120152a7f3f5e5932795b6ba556f8b52c03aa4df68958cdd2fc86363f8462@openspec/changes/archive/2026-11-11-REQ-2026-009-announcement-dialog-layout/evidence/revision.json"} -->

# REQ-2026-009: Fix responsive announcement dialog layout

## Need

用户截图中的公告正文被横向裁切、标题不完整、滚动区焦点框影响阅读。用户明确要求修正并优化公告弹窗样式。

## Scope

- Keep dialog size within the viewport, wrap titles, isolate native body scrolling and keep header/close actions visible.
- Apply announcement-specific Portal overrides without changing shared dialog or scrolling primitives.
- Improve Markdown table headings and paragraph spacing; register plaintext highlighting so ordinary code fences cannot blank the article.
- Preserve all existing model-upgrade work. No production data, announcement text or deployment changes.

## Acceptance Criteria

- [x] `AC-1` - Desktop, narrow screens, dark theme, long content, code fences and close actions are verified.

## Documentation Disposition

- Result: updated
- Affected docs: `docs/FRONTEND.md`

## History

- 2026-11-11T02:11:06.903494+00:00 - Implementation and responsive browser validation completed.

- 2026-11-11T10:13:53+08:00 - Close completed; requirement archived.
