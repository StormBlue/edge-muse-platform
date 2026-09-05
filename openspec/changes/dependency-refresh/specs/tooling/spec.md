# Delta Spec: tooling

## ADDED Requirements

### Requirement `BR-tooling-001`: Reproducible compatible tooling
The workspace SHALL pin pnpm and direct dependencies to exact stable versions, with compatibility exceptions documented in the upgrade evidence. Local Node SHALL use the same major version as CI.

#### Scenario `SC-tooling-001`: Validate an upgrade
- **WHEN** dependencies are installed with the committed frozen lockfile on Node 24
- **THEN** lint, type checking, existing frontend/backend tests, and production dry-run builds pass.
