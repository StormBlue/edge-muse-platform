# Delta Spec: micu-release

## ADDED Requirements

### Requirement `BR-micu-release-002`: 米醋当前模型目录

The system SHALL expose only `gpt-image-2`, `gpt-image-2-openai`, `gpt-image-2.5-flare`, and `gpt-image-2.5-sunburst` as selectable Micu image models. Requests using `gpt-image-2.5-flare-openai` or `gpt-image-2.5-sunburst-openai` SHALL be accepted and rewritten to the unsuffixed model before generation. `gpt-image-2` SHALL be sent as `gpt-image-2-openai` only when the longest edge is at least 1600; a 1K request for `gpt-image-2-openai` SHALL be sent as `gpt-image-2`. Flare and Sunburst SHALL keep the selected model at every size. Unknown Micu model names submitted by a client SHALL be rejected. Quota SHALL remain 1 unit below that edge and 2 units at or above it, including Flare and Sunburst.

#### Scenario `SC-micu-release-002`: Route current and legacy Micu models

- **WHEN** a Micu generation uses Flare or Sunburst, including a legacy `-openai` id, at 1K or 2K/4K, or uses `gpt-image-2` at those sizes
- **THEN** Flare and Sunburst keep their unsuffixed model, `gpt-image-2` uses `gpt-image-2` below 1600 and `gpt-image-2-openai` at or above 1600, and the quota multiplier stays 1 or 2 by that same edge
- **AND** a model outside the current catalog and the two legacy aliases is rejected before quota is charged
