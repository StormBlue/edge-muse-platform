# Delta Spec: image-models

## ADDED Requirements

### Requirement `BR-image-models-001`: Current GPT Image catalog

The system SHALL expose only `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst` for Micu images and the built-in Cubence images provider. Flare SHALL be the default for stale configuration. Automatic generation SHALL use the actually assigned key's supported model; manual selection SHALL reach the upstream unchanged at every size. Historical Micu 2/2.5 family IDs SHALL resolve to the corresponding 2.6 family without an `-openai` suffix; other unsupported client choices SHALL fail before quota charging. Quota and size limits SHALL remain unchanged. Reusing retired workspace model settings SHALL select automatic mode.

#### Scenario `SC-image-models-001`: Select or reuse an image model

- **WHEN** a user loads capabilities, selects Sunburst, leaves the model automatic, or reuses an old task
- **THEN** the UI offers only the two 2.6 models, a selected Sunburst remains Sunburst after key scheduling, automatic mode follows the assigned key with a Flare fallback, and retired replay settings fall back to automatic
- **AND** Micu remains 1/2 quota units by size and Cubence remains 1 unit per image
