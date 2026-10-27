# Delta Spec: image-persist

## ADDED Requirements

### Requirement `BR-image-persist-001`: 图片落库绑定重试

The system SHALL persist a generated image under one new R2 key. `R2.put` SHALL send `If-None-Match: *`. When that call throws an error whose message contains `Network connection lost`, the system SHALL retry the same key with exponential backoff and jitter, at most five attempts in total. A null result from the conditional put SHALL be treated as the object already being stored and SHALL continue to the database insert. The `image_objects` insert SHALL retry when the error is `Network connection lost`, `storage caused object to be reset`, or `reset because its code was updated`, using the same attempt limit and backoff. A unique conflict on `image_objects.id` or `image_objects.r2_key` SHALL be success when that row already exists. Any other error SHALL fail on the first attempt. This retry SHALL NOT call the image provider again.

#### Scenario `SC-image-persist-001`: Retry a disconnected R2 put without a second object

- **WHEN** the first `R2.put` for a new image throws `Network connection lost` and a later attempt either stores the object or returns null because the conditional write finds it already present
- **THEN** the platform keeps the same R2 key, inserts one `image_objects` row, and does not call the image provider again
- **AND** an unrelated R2 or D1 error fails without further attempts
