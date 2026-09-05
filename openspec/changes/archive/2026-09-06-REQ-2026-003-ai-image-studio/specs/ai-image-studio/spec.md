# AI 图像创作行为增量

## ADDED Requirements

### Requirement `BR-ai-image-studio-001`: AC-1

系统 SHALL 满足：任务列表、取消和来源复用受本人权限约束；取消与预扣退还原子且幂等。

#### Scenario `SC-ai-image-studio-001`: Observable acceptance

- **WHEN** 用户执行任务查询、取消或引用其它任务图片
- **THEN** 任务列表、取消和来源复用受本人权限约束；取消与预扣退还原子且幂等。

### Requirement `BR-ai-image-studio-002`: AC-2

系统 SHALL 满足：跨页任务中心展示真实阶段、耗时、额度与取消结果；快速完成任务有通知且旧账号响应不能污染状态。

#### Scenario `SC-ai-image-studio-002`: Observable acceptance

- **WHEN** 用户执行提交任务后切换页面，期间任务完成或账号改变
- **THEN** 跨页任务中心展示真实阶段、耗时、额度与取消结果；快速完成任务有通知且旧账号响应不能污染状态。

### Requirement `BR-ai-image-studio-003`: AC-3

系统 SHALL 满足：自己的结果可沿用参数或用作参考图，在当前能力下编辑后显式提交；来源保留且支持并排对比。

#### Scenario `SC-ai-image-studio-003`: Observable acceptance

- **WHEN** 用户执行从自己的结果点击沿用参数或作为参考图
- **THEN** 自己的结果可沿用参数或用作参考图，在当前能力下编辑后显式提交；来源保留且支持并排对比。

### Requirement `BR-ai-image-studio-004`: AC-4

系统 SHALL 满足：AI 图像生成首屏直接可创作，案例可按需搜索、预览、应用，路由前进后退及旧响应不破坏选择。

#### Scenario `SC-ai-image-studio-004`: Observable acceptance

- **WHEN** 用户执行打开创作器、案例链接及浏览器前后导航
- **THEN** AI 图像生成首屏直接可创作，案例可按需搜索、预览、应用，路由前进后退及旧响应不破坏选择。

### Requirement `BR-ai-image-studio-005`: AC-5

系统 SHALL 满足：创作需求进入提示词或助手；助手建议可编辑、选择性采纳和撤销，不自动覆盖用户提示词。

#### Scenario `SC-ai-image-studio-005`: Observable acceptance

- **WHEN** 用户执行请求助手建议后修改输入并选择采纳
- **THEN** 创作需求进入提示词或助手；助手建议可编辑、选择性采纳和撤销，不自动覆盖用户提示词。

### Requirement `BR-ai-image-studio-006`: AC-6

系统 SHALL 满足：桌面与手机关键流程可操作、无裁切遮挡；已有门禁与必要负路径测试通过，文档同步。

#### Scenario `SC-ai-image-studio-006`: Observable acceptance

- **WHEN** 用户执行在手机及桌面执行核心创作流程
- **THEN** 桌面与手机关键流程可操作、无裁切遮挡；已有门禁与必要负路径测试通过，文档同步。
