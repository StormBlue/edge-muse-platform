<!-- docs-architect-meta {"schema_version":1,"id":"SPEC-micu-release","type":"product-spec","title":"Micu Release product specification","status":"active","owners":[],"sources":[],"update_when":["Observable micu-release behavior changes"],"relations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# Micu Release Product Specification

## Requirements

### Requirement `BR-micu-release-001`: 米醋计费与回归门禁

The system SHALL 使用与尺寸路由一致的配额倍数，失败退款以任务实际账本净扣款为准，且默认 CI 纳入所有顶层服务端测试文件。

#### Scenario `SC-micu-release-001`: 路由、历史价格与发布检查

- **WHEN** 米醋基础或 openai 模型选择 1K、2K/4K，或旧任务失败后退款
- **THEN** 1K 每张扣 1 单位、2K/4K 每张扣 2 单位；退款不超过实扣净额，重复调用不重复退款，未扣款不生成退款；其他渠道计费不变
- **AND** 测试发现自动覆盖 server/test/*.test.ts，失败非零退出，main 仅在 CI 全部通过后部署
