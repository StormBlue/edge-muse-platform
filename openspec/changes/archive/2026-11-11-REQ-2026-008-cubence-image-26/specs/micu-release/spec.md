# Delta Spec: micu-release

## MODIFIED Requirements

### Requirement `BR-micu-release-002`: 米醋当前模型目录

The system SHALL expose only `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst` as selectable Micu image models. Historical `gpt-image-2` and `gpt-image-2-openai` SHALL map to 2.6 Flare. Historical 2.5 Flare/Sunburst IDs, including their `-openai` aliases, SHALL map to the matching 2.6 family. All sizes SHALL keep the selected 2.6 model without an `-openai` suffix. Unknown client model names SHALL be rejected before quota is charged. Automatic mode SHALL follow the actually assigned key's model with Flare as fallback for stale configuration; explicit model selection SHALL be retained. Quota SHALL remain 1 unit below a longest edge of 1600 and 2 units at or above it.

#### Scenario `SC-micu-release-002`: Route current and legacy Micu models

- **WHEN** a Micu generation selects either 2.6 model, uses automatic mode, or reuses historical 2/2.5 settings
- **THEN** only 2.6 Flare/Sunburst is sent upstream, the selected family is preserved at every size, and automatic mode resolves the assigned key at runtime
- **AND** the quota multiplier stays 1 or 2 by size; unknown client model names fail before charging
