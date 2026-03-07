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

### TESTING RULE (MANDATORY)

Every implementation session must include testing before presenting work as complete. "Done" means tested, not just coded.

**Standard flow for any feature or fix:**
1. Implement the change
2. Type-check both frontend (`cd frontend && npx tsc --noEmit`) and backend (`cd backend && npx tsc --noEmit`)
3. Run the full test suite (`cd backend && npm test`) — all tests must pass
4. If the change touches a new category of behavior (new entity operations, new API patterns, edge cases), write new chaos tests before calling it done
5. Update CHANGELOG.md
6. Only THEN present the work as complete

**Chaos testing philosophy:**
- Chaos tests simulate real users who change their minds, overlap dates, delete things, work simultaneously, and generally behave unpredictably
- New features that involve data mutation (create, update, delete, move, hide) need chaos tests covering: normal operation, idempotent re-application, edge cases (invalid IDs, already-deleted items, empty inputs), and interaction with existing features
- AI chat tools are especially important to chaos-test because users ask unpredictable things and the AI decides which tools to call

**Test database safety:**
- Tests run on an isolated Neon database branch (created automatically before tests, deleted after). Production data is never touched.
- The branch isolation is handled by `tests/vitest-global-setup.ts` (creates branch, writes URL to temp file) and `tests/vitest-setup.ts` (reads URL in workers). No manual cleanup needed.
- If `NEON_API_KEY` is not set, tests fall back to the production DB with a warning. Ensure the key is set in `.env`.
