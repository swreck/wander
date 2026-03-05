=== WANDER DOC DRIFT RULE (PERMANENT) ===
SPEC.md is the canonical product specification for Wander.
Do not modify SPEC.md automatically during feature work or refactors.

After implementing any feature add/remove/behavior change:
- Append a dated entry to CHANGELOG.md.
- Include:
  (a) what changed (behavior, not just code),
  (b) where it lives in the UI (screen/panel/button location),
  (c) which SPEC.md sections are impacted.
- Include a line: "SPEC UPDATE NEEDED" if behavior now differs from SPEC.md.
=== END RULE ===

## WANDER DEVELOPMENT PROTOCOL

### CHANGELOG AUTOMATION RULE

Every time you implement, modify, or remove a feature in the Wander codebase you must:

1. Append an entry to CHANGELOG.md.

2. The entry format must be:

## YYYY-MM-DD

### Added
- description

### Changed
- description

### Fixed
- description

### Removed
- description

3. Only include the sections that apply.

4. Write entries in plain language describing the user-visible or architectural change.

5. If a feature affects behavior defined in SPEC.md, note that explicitly.

6. Never overwrite previous changelog entries. Only append.

7. If multiple changes happen in one session, group them under the same date block.

8. When starting a new session, read the last entry in CHANGELOG.md before implementing new work.
