<!-- docs-architect-meta {"schema_version":1,"id":"SPEC-announcements","type":"product-spec","title":"Announcements product specification","status":"active","owners":[],"sources":[],"update_when":["Observable announcements behavior changes"],"relations":[],"evidence":[],"affected_docs":[],"verified_at":null,"verified_against":null} -->

# Announcements Product Specification

## Requirements

### Requirement `BR-announcements-001`: Responsive announcement reading

The system SHALL keep announcement dialogs within the viewport with 1rem side margins and a maximum desktop width of 48rem. Detail titles SHALL wrap. Header and close actions SHALL remain visible while the keyboard-accessible body scrolls independently. Long text SHALL wrap and wide code or tables SHALL scroll within their own content area without widening the dialog. Unspecified or unknown code languages SHALL render as plaintext. The layout SHALL support light and dark themes.

#### Scenario `SC-announcements-001`: Read a long announcement on a narrow screen

- **WHEN** a user opens a long announcement containing a long title, a table or a code fence at a 320px viewport width
- **THEN** the dialog retains viewport margins, body text stays within its width and can scroll to the last paragraph, and the close button stays accessible
- **AND** the same content remains readable on desktop and in dark mode
