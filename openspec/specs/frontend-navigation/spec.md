<!-- docs-architect-meta {"schema_version":1,"id":"SPEC-frontend-navigation","type":"product-spec","title":"Frontend Navigation product specification","status":"active","owners":[],"sources":[],"update_when":["Observable frontend-navigation behavior changes"],"relations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# Frontend Navigation Product Specification

## Requirements

### Requirement `BR-frontend-navigation-001`: Predictable navigation

List/detail and creation navigation SHALL keep the URL aligned with the visible context. Closing a detail opened from its list SHALL return through browser history; a direct detail link SHALL safely replace itself with the list. Late responses SHALL NOT reopen dismissed details or overwrite the selected session.

#### Scenario `SC-frontend-navigation-001`: Back and forward

- **WHEN** a user opens and closes a list detail, then uses browser back or forward
- **THEN** navigation follows the existing history without an added list/detail loop, and list context can be restored.

### Requirement `BR-frontend-navigation-002`: Accessible responsive workflows

Navigation, settings and primary management actions SHALL remain reachable across mobile H5, 1366x768, 1920x1080 and 3840x2160. Mobile navigation SHALL isolate focus while open, restore it on close, and reserve safe-area spacing. Profile and security settings SHALL link to each other and expose pending/error/success states.

#### Scenario `SC-frontend-navigation-002`: Mobile navigation

- **WHEN** the mobile drawer is closed with Escape
- **THEN** focus returns to its opener, hidden links cannot receive focus, and the page remains usable.

### Requirement `BR-frontend-navigation-003`: Verified releases

Develop and main pushes SHALL run CI with pinned tooling. Only a successful main push validation SHALL authorize its matching deployment, with stale main revisions rejected before migration and deployment.

#### Scenario `SC-frontend-navigation-003`: Failed validation

- **WHEN** CI fails for a main push
- **THEN** its production deployment does not run.
