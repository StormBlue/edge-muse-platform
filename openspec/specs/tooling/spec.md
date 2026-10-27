<!-- docs-architect-meta {"schema_version":1,"id":"SPEC-tooling","type":"product-spec","title":"Tooling product specification","status":"active","owners":[],"sources":[],"update_when":["Observable tooling behavior changes"],"relations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# Tooling Product Specification

## Requirements

### Requirement `BR-tooling-001`: Reproducible compatible tooling

The workspace SHALL pin pnpm and direct dependencies to exact stable versions. When the newest release is a different major, or a peer dependency rejects it, the pin SHALL stay on the newest stable release those constraints accept. Those exceptions SHALL be recorded in the upgrade evidence. Local Node SHALL use the same major version as CI.

#### Scenario `SC-tooling-001`: Validate an upgrade

- **WHEN** dependencies are installed with the committed frozen lockfile on Node 24
- **THEN** lint, type checking, existing frontend/backend tests, and production dry-run builds pass.
