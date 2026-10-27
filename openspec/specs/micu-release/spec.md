<!-- docs-architect-meta {"schema_version":1,"id":"SPEC-micu-release","type":"product-spec","title":"Micu Release product specification","status":"active","owners":[],"sources":[],"update_when":["Observable micu-release behavior changes"],"relations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# Micu Release Product Specification

## Requirements

### Requirement `BR-micu-release-001`: 米醋计费与回归门禁

The system SHALL 使用与尺寸路由一致的配额倍数，失败退款以任务实际账本净扣款为准，且默认 CI 纳入所有顶层服务端测试文件。

#### Scenario `SC-micu-release-001`: 路由、历史价格与发布检查

- **WHEN** 米醋基础或 openai 模型选择 1K、2K/4K，或旧任务失败后退款
- **THEN** 1K 每张扣 1 单位、2K/4K 每张扣 2 单位；退款不超过实扣净额，重复调用不重复退款，未扣款不生成退款；其他渠道计费不变
- **AND** 测试发现自动覆盖 server/test/*.test.ts，失败非零退出，main 仅在 CI 全部通过后部署

### Requirement `BR-micu-release-002`: 米醋当前模型目录

The system SHALL expose only `gpt-image-2`, `gpt-image-2-openai`, `gpt-image-2.5-flare`, and `gpt-image-2.5-sunburst` as selectable Micu image models. Requests using `gpt-image-2.5-flare-openai` or `gpt-image-2.5-sunburst-openai` SHALL be accepted and rewritten to the unsuffixed model before generation. `gpt-image-2` SHALL be sent as `gpt-image-2-openai` only when the longest edge is at least 1600; a 1K request for `gpt-image-2-openai` SHALL be sent as `gpt-image-2`. Flare and Sunburst SHALL keep the selected model at every size. Unknown Micu model names submitted by a client SHALL be rejected. Quota SHALL remain 1 unit below that edge and 2 units at or above it, including Flare and Sunburst.

#### Scenario `SC-micu-release-002`: Route current and legacy Micu models

- **WHEN** a Micu generation uses Flare or Sunburst, including a legacy `-openai` id, at 1K or 2K/4K, or uses `gpt-image-2` at those sizes
- **THEN** Flare and Sunburst keep their unsuffixed model, `gpt-image-2` uses `gpt-image-2` below 1600 and `gpt-image-2-openai` at or above 1600, and the quota multiplier stays 1 or 2 by that same edge
- **AND** a model outside the current catalog and the two legacy aliases is rejected before quota is charged
