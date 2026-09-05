# AI 图像创作设计

## 范围与决策

创作器常驻，桌面采用输入与输出两栏，手机使用创作/结果标签。案例通过可访问对话框选择，不再阻断空白创作。助手位于输入栏内，所有建议需要显式采纳；需求字段用于补充主体、用途、风格与保留要素。生成始终由用户最后提交。

任务中心跨页面保留服务端任务快照，以真实阶段与耗时反馈执行进度；取消仅作用于尚可取消的排队任务，退额必须与取消条件绑定。任务列表、参考图与再创作来源都按登录用户校验。任务中心不切换工作台的会话。

结果提供沿用参数、作为参考图、并排对比；来源关系写入已有 params JSON，原图的任务归属保持不变。旧参数若不再受当前能力支持，明确提示用户重新选择。复用操作不会自动提交、不会消耗额度。

不开发草稿持久化、收藏或作品库、复杂运营指标、额外 CI 体系；本次仍执行已有验证并补充变更所需回归测试。

## 已阅读的一手参考（2026-09-06）

- [ComfyUI APP mode](https://docs.comfy.org/interface/app-mode)：输入/输出分区与手机标签；不引入节点编辑器。
- [ComfyUI Templates](https://docs.comfy.org/interface/features/template)：按需打开模板与使用前能力校验。
- [InvokeAI Gallery](https://github.com/invoke-ai/InvokeAI/blob/main/docs/src/content/docs/features/gallery.mdx)：Use Prompt、Use All、Remix 与 Send to Image to Image；复用参数不保证像素级复现。
- [InvokeAI Prompt Tools](https://github.com/invoke-ai/InvokeAI/blob/main/docs/src/content/docs/features/prompt-tools.md)：提示词旁的辅助工具位置；不照搬直接覆盖机制。
- [Adobe Firefly 样式参考](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/set-styles-for-image-generation.html)：参考图与能力相关设置；不模拟本平台服务商尚未支持的强度或局部编辑。

助手显式审阅和选择性采纳是根据本项目自动覆盖问题提出的设计，不宣称上述项目具有完全相同的实现。

## 交付与回退

M1：取消与额度、任务中心、受权限约束的来源能力。M2：新版创作器、需求/助手、再创作和对比。M3：边界与浏览器验证、文档同步归档。每个通过验证的里程碑提交并推送 develop；最终 main 合并沿用现有 CI 部署门禁。无新增表迁移，回退应用版本即可恢复前端入口，保留来源 JSON 的向后兼容性。
