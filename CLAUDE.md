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

## Product Intent

**Why this exists:** Ken plans complex, multi-week international trips with family and friends (Larisa, Andy, Julie, Kyler). These trips involve dozens of experiences across multiple cities, and the gap between "research" (finding interesting places) and "execution" (knowing where to go today, right now) is where plans fall apart. Wander bridges that gap.

**Core workflow:** Capture interesting places (from articles, friends, blogs) → organize by city/day → see everything on a map → build daily itineraries with realistic travel times → execute during the trip with real-time "what's next" awareness.

**Key design decisions:**
- Map-centric — every screen is built around a persistent map. Lists and panels layer on top. The map never disappears.
- The itinerary is sacred — nothing moves, changes, or disappears without explicit user action. No AI reorganization.
- Capture never blocks — saving an experience is instant; enrichment (geocoding, ratings, AI context) happens asynchronously
- Collaborative but not social — small trusted groups share a trip, not public sharing
- AI cultural context cards — Claude generates brief, respectful cultural context for destinations (not tourist tips, but genuine understanding)
- Real transit data — actual train schedules, not estimates
- Offline-first mutation queue — actions taken without connectivity sync when back online
- Cloudinary for all images

**What makes this app "Ken's":** The travel philosophy embedded in the non-negotiable principles (SPEC.md), the emphasis on calm execution over flashy discovery, the refusal to let AI reorganize plans, and the specific group of travelers it's built for. The SPEC.md document is the definitive product voice — a future AI should read it to understand not just what to build but *how the product should feel*.

**Critical document:** `SPEC.md` is the canonical product specification (v3.0). It contains every architectural, UX, and behavioral decision. CLAUDE.md captures development workflow; SPEC.md captures product truth.

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

### AI CHAT PARITY RULE

The AI chat assistant should be able to perform any data operation the UI can. When adding a new UI action that creates, updates, or deletes data, also add a corresponding chat tool in `backend/src/routes/chat.ts`. This includes:
1. A tool definition in the `tools` array (name, description, input_schema)
2. A `case` in the `executeTool` switch
3. A numbered rule in the system prompt explaining when to use it

Current tool count: 47. Categories:
- **Trip lifecycle**: create_trip, update_trip, shift_trip_dates, get_trip_summary
- **City CRUD**: add_city, update_city, update_city_dates, delete_city, reorder_cities, hide_city, restore_city, list_hidden_cities
- **Day operations**: create_day, delete_day, get_day_details, get_all_days, update_day_notes, update_day_date, reassign_day, share_day_plan
- **Experience CRUD**: add_experience, update_experience, delete_experience, bulk_delete_experiences, promote_experience, demote_experience, move_experience, reorder_experiences, search_experiences, get_city_experiences, get_cultural_context, get_ratings
- **Reservations**: add_reservation, update_reservation, delete_reservation
- **Accommodations**: add_accommodation, update_accommodation, delete_accommodation
- **Route segments**: add_route_segment, update_route_segment, delete_route_segment
- **Traveler documents**: save_travel_document, save_travel_documents_bulk, update_travel_document, delete_travel_document, get_my_documents, get_shared_documents, check_travel_readiness
- **Voting**: create_vote, cast_vote, get_vote_results
- **Ratings**: set_tabelog_rating, get_ratings
- **Transit**: check_transit_status, search_train_schedules
- **Travel**: get_travel_time
- **Import**: import_recommendations
- **History**: get_change_log

Intentionally excluded from chat: delete_trip (too destructive), client-side preferences (localStorage), map interactions (not data operations), screenshot capture (requires image upload).
