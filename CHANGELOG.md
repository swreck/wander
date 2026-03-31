# Wander Change Log

SPEC.md is canonical. CHANGELOG.md records implemented behavior changes and flags when SPEC needs updates.

## 2026-03-31 — Chaos Testing Round 2: 8 More FK/Validation Bugs Fixed

### Fixed
- **Day creation with missing tripId/cityId/date → 500** — No input validation on POST /api/days. Added required field checks, trip existence check, city-on-trip validation, and date format validation. (days.ts)
- **Day PATCH with non-existent cityId → 500** — Reassigning a day to a deleted/fake city caused FK violation. Added city existence check. (days.ts)
- **Day PATCH with invalid date → 500** — `new Date("banana")` passed to Prisma. Added date format validation. (days.ts)
- **Route segment POST with non-existent tripId → 500** — FK violation. Added trip existence check. (routeSegments.ts)
- **Route segment PATCH with invalid departureDate → 500** — Same garbage-date pattern. Added date format validation on both POST and PATCH. (routeSegments.ts)
- **Decision POST with non-existent tripId/cityId → 500** — Checked presence but not existence. Added trip + city-on-trip validation. (decisions.ts)
- **Approval POST with non-existent tripId → 500** — FK violation. Added tripId required check + trip existence validation. (approvals.ts)
- **Learning POST with non-existent tripId → 500** — FK violation on optional field. Added trip existence check when tripId provided. (learnings.ts)

### Added
- **423 chaos tests** (up from 360) — 63 new tests targeting: FK validation gaps, cross-trip references, whitespace content, swapped dates, zero-value numeric fields (lat/lng/duration), Unicode/emoji names, 5000-char descriptions, restore edge cases, double-restore, restore-after-delete-parent, idempotent promote/demote, rapid create-delete-create, import commit validation, cascade deletions, reaction toggle cycles, resolved-decision voting, explicit-null PATCH. (chaos.test.ts)

### Also fixed (design bugs, not 500s)
- **Learning PATCH accepts whitespace-only content** — Added trim + empty check on PATCH to match POST behavior. (learnings.ts)
- **Day reassignment to cross-trip city succeeds** — Added same-trip ownership check on cityId. (days.ts)
- **Accommodation PATCH silently ignores cityId** — Field wasn't destructured. Now accepted and validated for same-trip ownership. (accommodations.ts)
- **Reservation PATCH dayId allows cross-trip days** — Moving a reservation to a day from a different trip now rejected with "Day not found on this trip." (reservations.ts)
- **Trip PATCH allows empty name** — Clearing the trip name now rejected with "Trip name can't be empty." (trips.ts)
- **Trip creation with swapped dates** — startDate after endDate now returns a helpful message: "Looks like the dates are swapped — did you mean Dec 1 to Dec 10?" (trips.ts)
- **Zero values (lat 0, lng 0, duration 0) silently nullified** — `value || null` treats `0` as falsy. Changed to `value ?? null` across accommodations, reservations, restore, trips, and chat routes. Affects lat/lng/durationMinutes on all CRUD operations. (accommodations.ts, reservations.ts, restore.ts, trips.ts, chat.ts)
- **Restore experience after parent city deleted → 500** — FK violation on re-create. Added P2003 (foreign key) error handling alongside existing P2002 (unique constraint). Now returns helpful message. (restore.ts)

## 2026-03-31 — Chaos Testing: 18 FK Validation Bugs Fixed

### Fixed
- **Reservation with invalid datetime → 500** — `new Date("garbage")` passed to Prisma. Added format validation on POST and PATCH. (reservations.ts)
- **Reservation with cross-trip dayId → 500** — Day from Trip B used on Trip A's reservation. Added trip ownership check. (reservations.ts)
- **Reflection with non-existent dayId → 500** — Upsert attempted FK to missing day. Added existence check. (reflections.ts)
- **Route segment with invalid transport mode → 500** — "teleportation" not in enum. Added VALID_TRANSPORT_MODES validation on POST and PATCH. (routeSegments.ts)
- **City creation on deleted trip → 500** — FK violation when trip doesn't exist. Added trip existence check. (cities.ts)
- **Accommodation creation with non-existent dayId → 500** — FK violation. Added day existence check when dayId provided on POST. (accommodations.ts)
- **Accommodation PATCH with non-existent dayId → 500** — Same pattern on PATCH. Added day existence check. (accommodations.ts)
- **Experience PATCH with non-existent cityId → 500** — FK violation when moving to deleted city. Added city existence + trip ownership check. (experiences.ts)
- **Experience PATCH with non-existent dayId → 500** — FK violation. Added day existence check. (experiences.ts)
- **Experience promote with non-existent dayId/routeSegmentId → 500** — FK violations. Added existence checks for both. (experiences.ts)
- **City reorder with non-existent ID → 500** — Prisma transaction fails on missing record. Wrapped in try/catch, returns 400. (cities.ts)
- **Experience reorder with non-existent ID → 500** — Same pattern. Wrapped in try/catch, returns 400. (experiences.ts)
- **Decision vote with non-existent optionId → 500** — FK violation. Added existence check before upsert. (decisions.ts)
- **Decision add option with non-existent experienceId → 500** — FK violation. Added existence check before linking. (decisions.ts)
- **Reaction on deleted experience → 500** — FK violation. Added experience existence check before create. (reactions.ts)
- **Experience note on deleted experience → 500** — FK violation. Added experience existence check before create. (experienceNotes.ts)
- **Experience query with invalid state enum → 500** — SQL injection-like value passed as query param. Added VALID_STATES validation on GET. (experiences.ts)

### Added
- **360 chaos tests** (up from 300) — 60 new tests covering FK validation gaps, stale data operations, concurrent mutations, delete-then-operate patterns, cross-trip references, SQL injection attempts, vault PIN lifecycle, and full trip lifecycle cascade. (chaos.test.ts)

## 2026-03-30 — Vault System, Planner Tools, Security Hardening

### Added
- **Document vault with PIN + Face ID** — Sensitive documents (passport, visa, insurance) are now encrypted behind a 4-digit PIN. After first setup, Face ID / biometric unlock is offered. Vault auto-locks after 5 minutes. Non-sensitive documents (tickets, frequent flyer, custom) remain visible without unlock. (VaultGate component, vault.ts backend, ProfilePage integration)
  - SPEC UPDATE NEEDED: Section on document security / vault behavior
- **Planner PIN reset** — Planners can reset another traveler's vault PIN from the Travelers section on trip overview. "Larisa, I lost my PIN" → one tap. (TripOverview TripMembers section)
- **Vault-gated document viewing** — ProfilePage shows "Unlock" button when sensitive documents exist. Locked documents show type/label but not data. Once unlocked, full details are visible for 5 minutes. (ProfilePage)

## 2026-03-30 — Security Hardening, UX Bug Fixes, Service Worker Re-enabled

### Added
- **Rate limiting** — Login/join: 10/min per IP. Chat: 20/min (protects Anthropic credits). General API: 200/min. Warm error messages. (index.ts)
- **Security headers** — Helmet middleware adds X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, and more. CSP disabled (blocks Google Maps). (index.ts)
- **CORS whitelist** — Production only accepts requests from wander.up.railway.app. Dev mode allows all origins. (index.ts)
- **SSE trip membership check** — Verifies the user is a trip member before establishing the real-time event stream. Previously any authenticated user could subscribe to any trip. (sse.ts)
- **Profile ownership check** — Users can only update their own traveler preferences. Previously any authenticated user could modify any profile. (auth.ts)
- **32 chaos tests for 2.0 features** — SSE, travel advisories, day-level decisions, vote chaos, cross-feature integration. (2.0-features.test.ts)

### Changed
- **JWT expiry: 30 days → 365 days** — Sessions effectively never expire for a home-screen web app. Vault PIN protects sensitive data separately. (auth.ts)
- **JWT secret enforced in production** — Refuses to start if JWT_SECRET is not set, instead of falling back to "dev-secret". (auth.ts)
- **JSON body limit: 50MB → 10MB** — Previous limit enabled memory exhaustion attacks. (index.ts)
- **Error handler: generic messages in production** — 500 errors return "Something went wrong on our end" instead of leaking internal details. (index.ts)
- **Onboarding overlay deferred 5 seconds** — New users see the trip for a few seconds before being asked about interests. Also suppressed on GuidePage. (App.tsx)
- **BottomNav label size: 10px → 11px** — Improved readability for older users. (BottomNav.tsx)
- **Service worker re-enabled** — SW registration restored in main.tsx, old blanket-unregister script removed from index.html. Offline caching, API caching, and predictive city prefetch now active again. (main.tsx, index.html)

### Fixed
- **GuidePage back button loop** — After joining via invite link, the back button navigated to the join page instead of home. Now goes to `/`. (GuidePage.tsx)
- **Delete undo used wrong token key** — PlanPage read `wander:token` but auth stores as `wander_token`. Undo always failed silently with 401. Now checks both keys. (PlanPage.tsx)

## 2026-03-29 — Overnight: Advisories, Onboarding, Nav Redesign, Extraction Fixes

### Added
- **Health & visa advisory system** — Static data service for Vietnam, Cambodia, Japan covering visa requirements, CDC vaccine recommendations, health/safety notes, connectivity info, currency details. REST endpoint `GET /api/travel-advisory/trip/:tripId` derives countries from trip cities. Chat tool `get_travel_advisories` (tool #55) proactively suggests when a new country is added. (NowPage pre-trip view, chat, backend service)
  - SPEC UPDATE NEEDED: Section on travel preparation / pre-trip checklist
- **NowPage "Before you go" section** — Pre-trip view now shows visa warnings, vaccine recommendations, and connectivity heads-up pulled from travel advisory service. (NowPage)
- **NowPage day-level decision voting** — When the current day has unresolved choices (from extraction or Scout), shows compact voting cards at the top of the timeline. (NowPage active trip view)
- **Onboarding activated** — `NewMemberOnboarding.tsx` was dead code (written but never imported). Now wired into App.tsx with three dismiss paths: save interests, remind me later (24hr snooze), skip for now (permanent). Checks localStorage state and existing preferences to avoid re-showing. Returns "You can always update this in Settings." (App.tsx overlay)

### Changed
- **Bottom nav: 4 tabs → 3** — Dropped Profile tab (used once or twice, not worth permanent real estate). Tabs: Home, Plan, Now. "Overview" renamed to "Home." (BottomNav)
- **PlanPage single action bar** — Global BottomNav now hides on `/plan`. PlanPage's own bar includes Home + Now navigation alongside List, Add, Chat. Eliminates 3-level nav stacking. (PlanPage, BottomNav)
- **SSE exponential backoff** — EventSource reconnection now uses 1s→2s→4s→8s→16s→30s backoff instead of native auto-retry. Disconnects when offline, reconnects when online. (useTripSync)

### Fixed
- **Extraction: startDate hint missing for PDFs** — When uploading images/PDFs without text, the startDate hint was only added to the text content path. "Day 1" through "Day 8" stayed as relative labels instead of converting to calendar dates. Now added to image prompt path. (itineraryExtractor)
- **Extraction: duplicate cities from PDF** — Backroads PDFs sometimes mention the same city in different sections. Import commit now deduplicates by name, extending existing city date ranges instead of creating duplicates. (import.ts)
- **Offline test Scout rename** — `offline.spec.ts` still referenced "Wander Assistant" in chat panel assertions. Changed to "Scout." (offline.spec.ts)

## 2026-03-29 — UX Completion: Extraction + Sync + Navigation + Split Days + Polish

### Added
- **SSE real-time sync** — Other travelers' changes appear as a tap-to-refresh banner at the top of the screen. Backend broadcasts via Server-Sent Events after every change log entry. (All authenticated pages)
  - SPEC UPDATE NEEDED: Section on real-time collaboration
- **Persistent bottom navigation** — 4-tab bar (Overview / Plan / Now / Profile) visible on all authenticated pages. PlanPage keeps its own action bar stacked above. (All pages)
  - SPEC UPDATE NEEDED: Section on navigation architecture
- **Split-day choices (Decisions tied to days)** — Decision model now has optional `dayId`. Extracted "OR" activities create day-level Decisions. DayView shows choice cards with voting. Chat tool `create_day_choice` available. (DayView, import pipeline, chat)
  - SPEC UPDATE NEEDED: Section on group decisions, section on extraction
- **Extraction: choice group detection** — "relax at hotel OR visit Royal Citadel" now creates separate experiences linked by a Decision, not dropped or merged. (Import pipeline)
- **Extraction: missing-page detection** — If day sequence has gaps (Day 1-4 then 7-8), shows a yellow warning banner on the review screen. (ImportReview)
- **Extraction: prose-embedded activities** — "we stop for lunch at a local restaurant" now extracted as an experience. Prompt detects verbs like "stop at", "visit", "explore". (itineraryExtractor)
- **Extraction: operational warnings kept** — "Please Note" schedule changes preserved in notes, not filtered as general advice. (itineraryExtractor)
- **Extraction: hotel contact details** — Phone numbers, websites, addresses in hotel descriptions go into accommodation notes. (itineraryExtractor)
- **Extraction: max_tokens 4096→8192** — Handles 8+ day itineraries without truncation. (itineraryExtractor)
- **"Start a vote" in Add menu** — PlanPage's Add popover now has a "Start a vote" option that opens Scout with a prefill. (PlanPage action bar)
- **Join page city photo** — Personal invite pages show a photo of the first trip destination. (JoinPage)
- **Trip Story learning prompt** — "Anything you'd do differently?" input at the bottom of TripStoryPage saves a learning. (TripStoryPage)
- **Chat tool: `create_day_choice`** — Scout can create day-level activity choices. Tool #54. (chat.ts)

### Changed
- **PlanPage action bar loses Home button** — Home navigation now handled by persistent bottom nav. PlanPage bar stacks above it. (PlanPage)
- **Capture toast during trips** — "All set — take a look" → "Nice find — saved for today" when capturing during active trip dates. (UniversalCapturePanel)
- **Playwright test updated** — "Wander Assistant" → "Scout" in chat test assertion. (capture-ux.spec.ts)
- **All authenticated pages have bottom padding** — `pb-20` prevents content hiding behind bottom nav. (8 pages)

### Fixed
- **ImportReview: choice groups displayed** — Grouped experiences shown in blue "Choose one" cards instead of flat list. (ImportReview)

## 2026-03-29 — UX Audit Fixes (Pass 2)

### Fixed
- **HistoryPage restore silently failed** — Used `"wander:token"` (colon) but auth stores as `"wander_token"` (underscore). Every "Bring back" button returned 401.
- **LearningsPanel same token bug** — Same colon vs underscore mismatch in auth headers. All learning CRUD silently failed.
- **LearningsPanel delete invisible on mobile** — Used `opacity-0 group-hover:opacity-100` which has no effect on touch devices. Now always visible with subtle color.
- **Trip switch toast used undefined variable** — `switchedTrip` wasn't in scope. Now correctly finds the trip name from `allTrips`.
- **Photo upload crashes offline** — `uploadRequest()` had no network error handling. Now shows a clear message: "You're offline — photos need a connection to upload."
- **Scout search only checked names** — `search_experiences` tool only searched the `name` field. Now also searches `description` and `userNotes`. "Find that ramen place" works even if the name is "Ichiran".
- **CreateTrip manual mode unreachable** — ~450 lines of trip creation code (name, dates, cities, members, invite links) had no button to reach it. Added "Or start from scratch" link on the main import view.
- **CityBoard unreachable for dated cities** — No navigation path to `/city/:cityId` for cities on the calendar. Added "browse ideas" chips below the calendar grid.
- **ProfilePage used native browser confirm** — `window.confirm("Remove this document?")` replaced with inline Remove/Keep buttons matching app tone.
- **ExperienceList used native browser confirm** — `window.confirm("Clear this decision?")` replaced with inline confirmation.
- **ChatBubble used native browser confirm** — "Start a fresh conversation?" dialog replaced with inline Clear/Keep buttons.

### Changed
- **PlanPage tone: "Added to itinerary"** → "On the plan"
- **PlanPage tone: "Moved to Maybe list"** → "Back in the idea pile"
- **Vote error tone** — "Vote didn't go through — check your connection?" → "Vote didn't stick — try again?"
- **CulturalNotes empty state** — "No cultural context available for this place." → "We don't have specific tips for this one yet"
- **UniversalCapturePanel placeholder** — "Activity name" → "What's it called?"
- **UniversalCapturePanel progress** — "Analyzing..." → "Reading your itinerary..."
- **All loading states warmed** — Replaced generic "Loading..." with context-specific messages:
  - TripOverview: "Finding your trip..."
  - PlanPage: "Getting your plan ready..."
  - NowPage: "Checking what's next..."
  - ExperienceDetail: "Pulling up the details..."
  - CaptureSharePage: "Getting things ready..."
  - ProfilePage learnings: "Finding your learnings..."

SPEC UPDATE NEEDED: CityBoard browse chips on TripOverview, CreateTrip "start from scratch" entry point, search_experiences now searches description/notes.

## 2026-03-29 — UX Audit Fixes (Pass 1)

### Fixed
- **"Ask Scout" broken everywhere** — CityBoard, CaptureFAB, and ImportCard dispatched `wander:open-chat` (colon) but ChatBubble listened for `wander-open-chat` (hyphen). All 5 dispatch sites now use the correct event name.
- **Chat prefill never worked** — ChatBubble's event handler ignored `detail.prefill`. Now reads the prefill text and populates the chat input, so "Ask Scout about X" pre-fills the question.
- **City photo never loaded on CityBoard** — Frontend sent `?city=X&country=Y` but backend expects `?query=X`. Also read `photoUrl` from response but backend returns `url`. Both fixed.
- **"Add an idea" lost city context** — CityBoard's "Add an idea" button navigated to `/plan` without passing `?city=cityId`. Now includes the city so PlanPage opens in the right context.
- **"Ask Scout" on CityBoard navigated away** — Tapping "Ask Scout" or scout nudges navigated to `/plan` before opening chat. Now opens chat directly on the current page.

### Changed
- **Calendar renders before phase content on TripOverview** — Phase nudges and progress now appear below the calendar, not above. Users see their trip structure first.
- **Past phase hides calendar** — When a trip is over, TripOverview shows the summary card (with "See your trip story" link) instead of the full calendar grid.
- **Post-trip Now page links to story** — Added "See your trip story" button in the post-trip summary view on NowPage.
- **ScoutNudge dismiss button** — Changed from "Dismiss" (software language) to "Got it" (travel companion voice).
- **PlanningProgress reframed** — Open days no longer feel like a deficit counter. Now says "left to fill (or leave open)" to frame unplanned days as flexibility.
- **ActivityFeed icons clarified** — Changed from ✨/💬/📝 to ＋/❤️/💬 (additions, reactions, notes) for clearer meaning at a glance.

SPEC UPDATE NEEDED: TripOverview layout order, past-phase calendar hiding, post-trip story links.

## 2026-03-29 — Wander 2.0 UX Builds (2–11)

### Added

**Build 2: City Idea Boards**
- New `/city/:cityId` page (CityBoard) — browse a city's ideas grouped by theme (food, temples, art, etc.)
- iMessage-style emoji reactions on experiences (❤️ 👍 🔥 + custom) — toggle on/off, grouped with counts
- Inline notes on experience cards — quick thoughts from any traveler
- Personal items per day — private reminders only visible to the creator
- Photo header from Google Places, accommodation info, stats bar
- "Ask Scout" button on each idea card opens chat with context
- Backend routes: `/api/reactions`, `/api/experience-notes`, `/api/personal-items`
- Schema: ExperienceReaction, ExperienceNote, PersonalItem models
- DatelessTripView and CandidateDestinations now navigate to CityBoard instead of PlanPage
- SPEC UPDATE NEEDED: CityBoard is a new page not in SPEC.md

**Build 3: Phase-Aware Dashboard**
- Trip phase detection: dreaming → planning → soon → active → past
- PlanningProgress component shows day coverage and cities needing attention
- ScoutNudge component — dismissable contextual thoughts, persisted in localStorage
- TripPhaseContent on dashboard adapts by phase: today preview (active), trip stats (past), readiness nudge (soon)
- Calendar day cells now show theme emojis (🍜⛩️🏺 etc.) instead of generic 🗓️ icon
- SPEC UPDATE NEEDED: Phase-aware dashboard is a new behavior not in SPEC.md

**Build 4: Phase-Aware Now Screen**
- Now page shows planning insights before the trip (busy days, food-heavy cities, open days)
- Pre-trip preview of what Now becomes during travel
- Post-trip summary with stats (cities, days, things done)
- PlanningInsight component — tappable, dismissable insight cards
- SPEC UPDATE NEEDED: Pre/post-trip Now page content is new behavior

**Build 5: Scout as a Presence**
- Backend `/api/scout/suggestions` endpoint — contextual rule-based suggestions per view
- useScoutSuggestions hook for fetching suggestions in any component
- Scout suggestions on CityBoard (theme-heavy, unscheduled ideas)
- "Ask Scout" inline action on every idea card
- Day-level suggestions (nearby restaurants for free time)

**Build 6: Activity Feed**
- Backend `/api/activity-feed/trip/:tripId` — merges ChangeLog, reactions, and notes into unified feed
- ActivityFeed component replaces old RecentActivityButton on dashboard
- Shows recent actions with time-ago formatting, type icons, expand/collapse
- Feed refreshes on `wander:data-changed` events

**Build 7: Reflections and Trip Story**
- Reflection model (per-day, per-traveler: highlights, note, media URLs)
- Backend `/api/reflections` — CRUD for daily reflections
- ReflectionCard — evening prompt (after 6pm during trip) to mark highlights and save notes
- TripStory page (`/story`) — scrollable city-by-city, day-by-day narrative
- Highlighted experiences shown with ⭐, reflection notes shown as quotes
- SPEC UPDATE NEEDED: Reflections and trip story are new features

**Build 8: Onboarding Enhancement**
- Join page now shows trip snapshot: city count, experience count, date range
- Scout introduction text on personal invite page
- Backend auth endpoint enriched with trip context data

**Build 9: Capture FAB**
- CaptureFAB floating action button on all pages (except login/join/guide/story)
- Tap: camera capture. Long-press: paste, camera, or voice options
- Context-aware — uses existing capture pipeline underneath
- SPEC UPDATE NEEDED: CaptureFAB replaces scattered capture entry points

**Build 10: Voice and Tone Audit**
- Fixed 7 tone violations across NowPage and CityBoard
- "Saved" → "Added to today", "Copied" → "Ready to paste"
- "Next-up reminders on/off" → warm conversational alternatives
- "Loading..." → "Getting the board ready..."
- "City not found" → "Couldn't find that city — try heading back"

**Build 11: Testing and Verification**
- All 481 backend tests pass
- 13/19 Playwright tests pass (6 failures are documented offline/SW-disabled tests)
- Fixed CaptureFAB hooks-order violation (early return before useCallback hooks caused crash on unauthenticated routes)

### Changed
- TripOverview uses `getTripPhase()` instead of manual date comparison for `isWithinDates`
- Calendar day cells show dominant theme emojis from scheduled activities
- Dateless trip city clicks navigate to CityBoard instead of PlanPage
- Candidate destination clicks navigate to CityBoard

### New Files
- `frontend/src/pages/CityBoard.tsx` — City idea board
- `frontend/src/pages/TripStoryPage.tsx` — Trip narrative page
- `frontend/src/lib/tripPhase.ts` — Phase detection utility
- `frontend/src/components/ScoutNudge.tsx` — Dismissable Scout thoughts
- `frontend/src/components/PlanningProgress.tsx` — Day coverage progress
- `frontend/src/components/TripPhaseContent.tsx` — Phase-specific dashboard content
- `frontend/src/components/PlanningInsight.tsx` — Tappable insight cards
- `frontend/src/components/ActivityFeed.tsx` — Unified activity stream
- `frontend/src/components/ReflectionCard.tsx` — Evening reflection prompt
- `frontend/src/components/CaptureFAB.tsx` — Floating capture button
- `frontend/src/hooks/useScoutSuggestions.ts` — Scout suggestions hook
- `backend/src/routes/scout.ts` — Scout suggestions endpoint
- `backend/src/routes/activityFeed.ts` — Activity feed endpoint
- `backend/src/routes/reflections.ts` — Reflections CRUD

## 2026-03-28 — Build 6: Multi-Trip Test Suite

### Added
- 6 new backend test files covering all multi-trip features (92 new tests, 481 total)
- `auth-invite.test.ts` — Personal invite creation, claim, duplicate handling, trip-level invites, resend, preferences
- `learnings.test.ts` — Learning CRUD, scope filtering (general/trip-specific), experience linking
- `approvals.test.ts` — Approval creation, planner approve/reject, auto-execution of bulk_delete and shift_dates payloads
- `roles.test.ts` — Creator-as-planner, role promotion/demotion, member management, role enforcement on approvals
- `restore.test.ts` — Entity recovery from ChangeLog (experience, reservation, accommodation), double-restore 409 conflict
- `dateless-trips.test.ts` — Dateless trip creation, content operations, trip switching/activation, anchor dates

### Fixed
- ChangeLog `actionType` values: reservation uses `reservation_deleted`, accommodation uses `accommodation_deleted` (not generic `deleted`)
- Traveler identity in tests: ACCESS_CODE login requires re-login by displayName after Traveler record creation to get travelerId in JWT
- Test isolation: unique displayNames per test file prevent cross-file Traveler collisions
- Learnings list tests gracefully handle active-trip role check when running in full suite

## 2026-03-28 — Multi-Trip Foundation: Schema, Auth, Roles, Scout, Recovery

### Added
- **Multi-trip database schema** — Trip dates now nullable (dateless trips supported), Day model has dayNumber for relative numbering, Traveler has preferences JSON for interests/dietary/travel style. Three new models: Learning (trip wisdom), ApprovalRequest (queued big changes), LoginEvent (device tracking).
- **Personal invite links** — Each trip member gets a unique invite token. Tapping the link auto-identifies the person (no name entry needed). Planners can resend links (regenerates token, invalidates old one). "Lost access? Ask your trip planner" messaging.
- **Planner/Traveler roles** — Per-trip role assignment. Planners get full access; Travelers see a warm confirmation when deleting someone else's addition ("[Name] added this one. Remove it?"). Role middleware enforces access on mutation endpoints.
- **ApprovalQueue panel** — Planners see a badge on Trip Overview ("2 to review") when Travelers request big changes. Slide-up panel with approve/reject per request. SPEC UPDATE NEEDED: Roles section.
- **LearningsPanel** — Planners can view, add, edit, and delete trip learnings (wisdom captured during travel). Scope filter: "All trips" / "This trip" / "Everything". Accessible from Trip Overview header.
- **9 new Scout chat tools** — save_learning, get_learnings, update_learning, delete_learning, get_pending_approvals, review_approval, add_trip_members, change_member_role, set_trip_anchor. Total tools: 62. System prompt rules 40-48 added.
- **Restore endpoint** — POST /api/restore/:changeLogId recreates deleted entities from ChangeLog previousState. Supports experiences, reservations, accommodations, route segments, days.
- **Undo toast on deletions** — Deleting an experience shows a 10-second toast with "Undo" button that calls the restore endpoint. History page shows "Bring back" links on deletion entries (Planners only).
- **Profile page rewrite** — Three sections: "About You" (interest tags, editable preferences), "Your Documents" (existing travel doc management), "Your Learnings" (Planner-only). Header: "Here's what Scout knows about you — to help make every trip better."
- **New member onboarding** — First-time visitors see interest picker (food, nature, art, history, etc.) with "Skip for now" option. Preferences persist across trips.
- **ImportCard on Trip Overview** — Permanent "Have something to add?" entry point with Camera, Paste, and Ask Scout buttons. Replaces dismissable Quick Start as primary import entry.
- **Dynamic traveler colors** — Color palette scales to 12+ travelers (was hardcoded to 4). Colors assigned dynamically and stay consistent within sessions.
- **Dateless trip creation** — Three date states: "I know the dates" / "Roughly" / "Not yet". Dateless trips show "Day 1, Day 2, Day 3..." until anchor date set via Scout ("Day 1 is December 25").
- **Trip switching** — Tap trip name on overview to see all trips. Switch between them without logging out.
- **Traveler preferences endpoint** — GET/PATCH /api/auth/travelers/:id for reading and updating preference data.
- **Login event tracking** — Records IP and user agent on every login for future anomaly detection.

- **Invite link sharing screen** — After creating a trip with members, planner immediately sees all personal invite links with copy buttons. No hunting in submenus.
- **Dateless trip city view** — Trips without dates show cities as tappable cards instead of a calendar. Prompt: "When dates are ready, tell Scout: Day 1 is December 25."
- **Proactive learning surfacing** — Scout sees all relevant learnings (general + trip-specific) in its context before every message. Planners only.
- **Trip switching auto-restore** — App remembers last-viewed trip. Opening Wander brings you back to where you were.
- **Approval auto-execution** — When planner approves a queued change, the operation executes automatically (bulk deletes, date shifts, day rearrangements).
- **5 new Scout tools** — activate_trip, delete_decision, retract_interest, restore_entity, resend_invite. Total: 67 tools.

### Changed
- **AI agent renamed to Scout** — System prompt, chat bubble, guide page, and all user-facing strings now reference "Scout" instead of "the chat assistant" or "Wander Assistant".
- **Trip creation flow** — Now accepts member names (generates personal invite links), optional dates with three states, optional cities. Creator automatically becomes Planner.
- **History page** — Deletion entries now show "Bring back" restore links (Planner-only). Warm empty states.
- **ExperienceDetail delete confirmation** — Shows author attribution when deleting someone else's addition.

### Fixed
- **change_member_role chat tool** — Schema defined `travelerName`/`role` but implementation read `memberName`/`newRole`. Now matches.

SPEC UPDATE NEEDED: Roles & permissions, invite links, Scout identity, dateless trips, learnings, approval flow, profile page, multi-trip switching.

## 2026-03-27 — Interest Notifications, Quick Start Update, UX Polish

### Added
- **Creator interest notifications** — When someone shows interest in an activity you added, you see a notification next time you open Wander: "[Name] is interested in your activity [name]" with "OK" and "Take me there" buttons. Creator notifications persist across sessions (tracked in localStorage) until explicitly dismissed. Takes priority over general unreacted-interest notifications.

### Changed
- **Quick Start text updated** — Was still referencing the old import method ("Use Import on the map"). Now says: "Paste or drop anything — an article, a friend's list, a screenshot — and Wander picks it up."
- **Phrase card icon raised** — Japanese phrase button moved up to avoid overlap with the home navigation icon.

## 2026-03-27 — Tone Audit, UX Polish, Import Chaos Testing

### Changed
- **Full tone audit across all user-facing strings** — Every toast, error, empty state, confirmation, status message, and loading indicator rewritten to sound like a warm travel companion, not software. ~70 strings changed across 13 files. Examples: "Save failed" → "That didn't save — try again?", "Import complete" → "All set — take a look", "Decision resolved" → "Settled!", "No reservations yet" → "Nothing booked yet", "Are you sure you want to delete X? This cannot be undone." → "Remove X from your trip?", "Synced 3 changes" → "You're back — caught up on 3 things". Permanent tone audit rule added to CLAUDE.md.
- **Trip countdown uses UTC math** — Was using local-time millisecond subtraction with Math.ceil, which could be off by 1 day across DST boundaries. Now uses Date.UTC arithmetic. Shows exact day count always (no imprecise "weeks away" rounding). "Trip complete" → "Welcome home".
- **City color bands on overview calendar** — Each day cell in the Trip Overview calendar shows a colored left border matching its city.
- **Warm empty state for cities** — "No experiences yet" → "Kyoto is wide open. Paste something you've found, or ask the chat what's worth seeing."

## 2026-03-27 — Import Chaos Testing, Capture UX Consistency

### Added
- **36 import chaos tests (S175–S210)** — Covers input validation, dedup/idempotency, special characters, emoji names, mixed-language names, version updates, merge edge cases, URL extraction errors, session expiry, and non-travel content. Total test count: 389.

### Changed
- **Paste/drop now works on Trip Overview** — Universal capture was only wired to the experience list page. Now also active on Trip Overview, where most large imports happen.
- **Removed chat paste split UX** — Previously, pasting into chat showed Import/Discuss/Cancel buttons (a different flow from pasting elsewhere). Now paste always behaves the same: paste into chat = paste text into chat. Paste outside any text field = universal capture toast. One behavior, no branching.
- **Map city markers now show correct calendar order** — Was using database insertion order (sequenceOrder), now sorted by arrivalDate. Tokyo (Oct 1) = 1, Kyoto (Oct 5) = 2, etc. Multi-visit cities (e.g., Kyoto visited twice) show combined numbers in a pill: "2 · 8".

### Fixed
- **commit-recommendations crash on missing urls/themes** — Endpoint crashed with `Cannot read properties of undefined` when recommendations had no `urls` or `themes` fields. Now handles missing optional fields gracefully.
- **extract endpoint crash on empty body** — `req.body` was undefined when no multipart form data sent. Now returns 400 instead of 500.
- **universal-commit FK constraint on invalid cityId** — Invalid city IDs caused unhandled Prisma error. Now skips the item gracefully instead of 500.
- **universal-commit version updates overwriting existing values** — Version updates now only fill blank/null fields, never overwrite user's existing data.

## 2026-03-26 — Offline Capture Queue, P2 UX Fixes, Test Infrastructure

### Added
- **Offline capture queue** — Paste or drop content while offline and it's saved in IndexedDB (`capture-queue` store). When connectivity returns, queued captures are automatically re-submitted for AI extraction. Uses existing offline mutation pattern.
- **Capture queue replay on reconnect** — `main.tsx` replays both mutation queue and capture queue in parallel when `online` event fires.
- **6 new Playwright tests** — Chat clear confirmation, profile page rendering, settings labels, first-time guide non-blocking, contributor indicators, daily greeting non-blocking.

### Changed
- **Vote buttons debounced** — Decision vote options and "Happy with any" button now show loading state and prevent double-tap race conditions.
- **Decision cancel confirmation** — Canceling a group decision now asks "Cancel this decision? All votes will be lost." before proceeding.
- **Document delete confirmation** — Deleting travel documents on Profile page now asks for confirmation.
- **All error toasts improved** — Every "Couldn't save/delete/update" error across ProfilePage, PlanPage, and TripOverview now includes "check your connection and try again" instead of terse messages.
- **PlanPage "Moved to candidates" → "Moved to Maybe list"** — Consistent with the UX audit's plain language standard.

### Fixed
- **Neon test branch reliability** — Added `pg` connection warmup in vitest-setup.ts worker process. Neon branch endpoints report "active" before Prisma's Rust engine can connect; the `pg` probe ensures connectivity before tests run. Upgraded DB_VERSION to 2 for IndexedDB migration.
- **Chat clear button** — Now requires confirmation dialog before wiping conversation history.
- **Voice input** — Shows helpful alert ("Voice input isn't supported in this browser") instead of silently doing nothing when SpeechRecognition API is unavailable.

## 2026-03-26 — Contributor Attribution, Map Calendar Order, Full UX Audit

### Added
- **Contributor attribution** — Every activity shows a colored circle with the contributor's initial (Ken = warm brown, Larisa = soft rose, Andy = sage green, Julie = sky blue). Visible in ExperienceList, DayView, and TripOverview.
- **Contributor filter bar** — Tappable colored name chips above experience lists. Filter to one person's additions. "See all across trip" link opens a trip-wide ContributorView overlay.
- **ContributorView** — Full-screen overlay showing everything one person has contributed across all cities, grouped by city with state labels (planned/maybe/deciding).
- **Contributor summary on Trip Overview** — Between "Trip members" and "Recent activity", shows colored chips with counts per contributor. Tap any chip to open their full contribution list.
- **`get_contributions_by_traveler` chat tool** — Ask "What has Larisa added?" and the AI returns a grouped summary of their contributions across all cities. Tool #53.
- **Map city markers show calendar order** — Cities numbered 1 through N based on visit order instead of activity count. Multi-visit cities are separate records in data model.

### Changed — UX Audit (Plain Language + Smart Defaults)
- **DayView**: "Route order" → "Suggested route by distance", "Save this order" → "Lock in this order", "Use my order" → "Keep my order", "Show route order" → "View distance-optimized route"
- **DayView**: Distance warnings now include walking time estimate (~N min walk)
- **ExperienceList**: "Move to candidates" → "Remove from itinerary (keep as idea)", empty planned state now says "No planned items yet — add from the Maybe section below, or tap + to create new ones"
- **ExperienceList**: Unlocated items hint changed from "not on map — tap the pin icon to locate" → "items need a location to appear on the map"
- **ChatBubble**: Timeout error now says "That took over 45 seconds — the connection might be slow" instead of "That took too long"
- **ChatBubble**: Placeholder changed to example prompts: `e.g. 'What's planned for Tuesday?' or 'Add this to Kyoto'`
- **ChatBubble**: Clear button now asks for confirmation before wiping conversation
- **ChatBubble**: Voice input shows helpful alert when browser doesn't support speech recognition instead of silently failing
- **SettingsPage**: "City photo duration" → "City intro photo" with warmer description
- **ProfilePage**: "🔒 Private" → "🔒 Only me", "👥 Shared" → "👥 Everyone in this trip"
- **PlanPage**: Removed iPad-specific layout assumptions ("Swipe days at bottom" → "Swipe days", "Tap List below" → "Tap List to see all activities")
- **PlanPage**: "Moved to candidates" toast → "Moved to Maybe list"
- **BatchReviewList**: "Swipe left to remove" → "Tap the × to remove"
- **VersionMatchPanel**: "Add details to N activities" → "Update N activities with new info"
- **UniversalCapturePanel**: "Adding to import" → "N activities so far — add more or confirm"
- **NextUpOverlay**: Type label "Planned" → "Activity"
- **FirstTimeGuide**: Converted from blocking full-screen modal to inline non-blocking card (SPEC compliance — no modal UI)
- **DailyGreeting**: Converted from blocking full-screen modal to non-blocking floating top card, "tap anywhere to continue" → "tap to dismiss"
- **MapCanvas**: Platform-aware map URLs — Apple Maps for iOS, Google Maps for Android
- **All error toasts** now include "check your connection and try again" instead of terse "Couldn't save/delete/update" messages (ProfilePage, PlanPage, TripOverview)

SPEC UPDATE NEEDED: Contributor attribution section — colored indicators, filter bar, ContributorView, chat tool. FirstTimeGuide — no longer modal. DailyGreeting — floating card, not full-screen overlay.

## 2026-03-24 — Andy's Traveler Profile: Three Os + Buddhism + Tech

### Changed
- **Andy's interest profile** — Replaced vague bookstore/philosophy interests with his "Three Os" (Oceans, Outdoors, service to Others) plus Buddhism/temples and tech/innovation. Five interest categories with tailored nudges and city-specific teasers for Tokyo, Kyoto, Osaka. Easter eggs conversationally connect to his passions without being cloying.
- **City teasers** — Added ocean (Tokyo Bay restoration, Osaka fishing heritage), outdoor (Higashiyama trails, Meiji Shrine forest), community service (Osaka mutual aid), tech (Akihabara maker spirit, Kyoto tech scene), and temple/Buddhism teasers. Removed bookstore teaser.

## 2026-03-24 — Old Voting Removal, Decision Nudge, City Selector Fix

### Removed
- **Old voting system** — `VotingCard.tsx`, `voting.ts` route, `VotingSession`/`Vote`/`VoteOptionResult` types all deleted. The card-stack vote UI is fully replaced by the inline Decide Together section. Old voting tests (S109-S116) replaced with 8 decision system tests.

### Added
- **3-day decision nudge** — Decisions open longer than 3 days get a stronger amber border and "Open N days — time to decide?" prompt, nudging the group to resolve.
- **8 decision chaos tests** (S109-S116) — Create decision, vote (upsert), happy-with-any, resolve (winner/loser states), delete (options return to possible), 404 on missing, reject options on resolved, two-user voting.

### Changed
- **City selector in Manual entry** — Replaced horizontal scrolling pill buttons (bad UX with many cities, names cut off) with a native dropdown select. Full city names visible, works on all screen sizes.

SPEC UPDATE NEEDED: Voting section — old preference voting system removed, replaced by Decide Together.

## 2026-03-24 — Group Decision System

### Added
- **Decide Together section** in experience list — Sits between Planned and Maybe. Each decision shows a question (e.g., "Where should we eat in Kyoto?") with tappable options. Each person picks ONE option per decision; vote dots show who picked what. "Happy with any" option for flexible travelers. Resolve button promotes winners to Planned, moves others to Maybe.
- **Three-way save on manual entry** — When adding an experience via Manual (+), three buttons replace the old single "Save": **Plan it** (adds to itinerary), **Maybe** (saves as candidate), **Decide** (creates a group decision with this as the first option, prompts for a decision question).
- **"+ Start a group decision" link** in experience list when no decisions exist, plus a + button in the Decide section header to create new decisions.
- **Decision data model** — `Decision` table (tripId, cityId, title, status, createdBy) with `DecisionVote` (one vote per person per decision, nullable optionId for "happy with any"). Experiences gain `voting` state and `decisionId` link.
- **Decision API** — `GET /api/decisions/trip/:tripId`, `POST /api/decisions`, `POST /:id/options`, `POST /:id/vote`, `POST /:id/resolve`, `DELETE /:id`. Full CRUD with change logging.
- **5 AI chat tools** — `create_decision`, `add_decision_option`, `cast_decision_vote`, `resolve_decision`, `get_open_decisions`. Rule 38 teaches AI when to use them (triggered by "let's decide", "help us choose", "start a vote", etc.).
- **Fixed**: `enrichExperience` import missing in chat.ts (pre-existing bug), `selectedCityId` reference in import (was undefined, now uses `activeCityId`).

### Changed
- **Experience list header** — Now reads "X Planned · Y Deciding · Z Maybe" instead of "X Selected · Y Possible".

SPEC UPDATE NEEDED: Activities section — decision/voting system, three-way save flow, "Decide Together" section in experience list.

## 2026-03-24 — Unified Import (Manual + Import replaces 5 modes)

### Changed
- **Add menu simplified to 2 options: Manual and Import.** Previously had Manual, Paste Text, URL, Screenshot as capture modes plus a separate Import panel with Itinerary/Recommendations toggle — 5 input paths total. Now: Manual for structured entry (name + description), Import for everything else. AI auto-detects whether content is a single place, recommendation list, or structured itinerary and routes accordingly.
- **Import panel** — Single textarea accepts text, URLs, or file uploads (screenshots/PDFs). No mode selection needed. Placeholder reads "Paste anything — a URL, friend's recommendations, itinerary, article..." AI classifies using Haiku (fast), then routes to appropriate extractor.
- **CapturePanel** — Stripped to manual-only: name, description, notes, city selector. Clean and focused.

### Added
- **`POST /api/import/smart-extract`** — New unified extraction endpoint. Auto-detects URL in text, classifies content (simple/recommendations/itinerary), routes to existing extractors, returns typed response. Simple items auto-save; recommendations and itineraries show review UI.

SPEC UPDATE NEEDED: Capture system section — manual + import replaces multi-mode capture.

## 2026-03-24 — Timezone Fix, Phrase Panel Polish

### Fixed
- **All dates display correctly regardless of user timezone** — Previously, UTC midnight dates (e.g., Oct 1) displayed as the previous day (Sept 30) for users in US timezones. Fixed across all 8 frontend files (~20 call sites) by adding `timeZone: "UTC"` to every date formatter. Affects: nav strip, day cards, overview calendar, Now page, day picker, route segments.

### Changed
- **Phrase panel width** — Panel is now compact (280-340px centered) instead of full-width. Delete button no longer stranded far from content.
- **Phrase pronunciations** — Default phrases now include English syllable-by-syllable pronunciation guides in parentheses (e.g., "Hello (Koh-nee-chee-wah)").

## 2026-03-24 — Day Trip Rule, Data Cleanup

### Changed
- **AI chat day-trip behavior (Rule 37)** — When users ask to add a destination as a day trip from an existing city, AI now uses `add_experience` within that city instead of incorrectly creating a new standalone city. Fixes issue where pottery town requests created empty duplicate cities instead of experiences.

### Fixed
- **Stale data cleanup** — Removed 4 duplicate cities (Mashiko, Shigaraki, Bizen, Arita) incorrectly created by AI chat, 10 city-name stub experiences, and 1 test experience from production.

## 2026-03-24 — Photo Cards, Web Search, Geolocation UX, Voice Fix

### Added
- **Google Places photo cards in chat** — AI shows inline photo cards with rating, address, and image when discussing places. New `lookup_place` tool (tool #49). Appears in chat panel.
- **Web search in chat** — AI can search the web via Brave Search API for current info (reviews, opening hours, crowd levels, recommendations). New `web_search` tool (tool #50). Requires BRAVE_SEARCH_API_KEY env var; degrades gracefully without it.
- **Place details API** — New `/api/place-details` endpoint returns Google Places data for any query.

### Changed
- **Capture panel** — Removed misleading "Just add to list" / "Look up & place on map" toggle. All experiences are auto-geocoded. Simple note replaces toggle.
- **Map recenters after location resolve** — When user confirms a location via pin icon, map now pans to include the new pin.
- **Delayed re-fetch after capture** — After adding an experience, a second fetch runs 2.5s later to pick up async geocoding results and recenter the map.
- **Voice input** — Fixed Safari crash on mic permission denial (try/catch around recognition.start). Switched to continuous listening mode so pauses don't auto-stop.
- **Control bar icons** — Larger (16→18px) and darker (#6b5d4a) for better visibility, bar height unchanged.
- **"Capture" renamed to "Manual"** throughout the UI.
- **Import panel** — Moved from top slide-down to bottom drawer for consistency with Manual panel.

### Fixed
- **63 test failures** — Fixed document carry-over pollution and parallel worker race condition in traveler document tests. 352/353 passing.
- **Stale Neon branch cleanup** — Test setup now auto-deletes orphaned test branches before each run.
- **Stale data** — Removed test traveler accounts (Grace, Stranger, Ivan, katherine) and orphaned experiences (Backroads Tour, Tokyo) from production.

SPEC UPDATE NEEDED: Chat tools section — add lookup_place and web_search tools.

## 2026-03-24 — Guide, Test Safety, Backroads Fix, Bulk Day Tool

### Added
- **In-app guide** (`/guide`): Card-based walkthrough for new users — Quick Start, navigation, chat assistant, travel days, group planning, map filtering, profile. Designed for phone screens with Wander visual language.
- **Printable guide** (`/guide.html`): Standalone two-column HTML version of the same content, styled for PDF export (File → Print → Save as PDF). For sending to trip companions before the trip.
- **"?" icon on all screens**: Subtle link to the guide from Trip Overview (identity bar), Plan page (bottom action bar), Now page (header), History page (header), and Settings page ("View guide" button).
- **Auto-show guide on first join**: New users joining via invite link see the guide immediately after picking their name. Subsequent visits go straight to the trip.

### Fixed
- **Test isolation safety**: Tests that fail to create a Neon database branch now abort instead of silently running against production. Previously, a branch creation failure would fall back to production DB, causing test trips to appear in the live app and overwrite the active trip.
- **Cleaned 156 test trips from production**: Test data leaked into production during a branch isolation failure. Reactivated the real Japan 2026 trip.

## 2026-03-24 — Backroads Fix, Bulk Day Tool, Chat & Safety Fixes

### Fixed
- **Backroads "B" badge on wrong days**: Itinerary-imported experiences were stuck on pre-trip days (Oct 1, Oct 6-7) due to date restructuring, causing the Backroads badge to span Oct 1-19 instead of Oct 15-22. Moved 7 misplaced activities to correct Backroads days, fixed Jogasaki Coast city assignment (Kyoto → Izu Peninsula), and promoted 7 unassigned itinerary activities (Irohazaka, Lake Chuzenji, Kinugawa rafting, waterfalls, Senjogahara, bullet train) to their correct Backroads days.
- **Trip day structure**: Fixed overlapping days from Kyoto's wide date range (Oct 5-23 spanning other cities), removed departure-day duplicates across all cities, resulting in clean 23-day schedule.

### Added
- **`bulk_update_days` chat tool**: AI can now update, create, and delete multiple days in a single operation, enabling trip restructuring that previously timed out with sequential tool calls. Includes Rule 34 in system prompt for when to use it.
- **AI system prompt guardrails**: Rule 10 updated to reference bulk operations; new Rule 34 guides AI on multi-day restructuring.

SPEC UPDATE NEEDED: Tool count increased to 48 (was 46). New bulk_update_days tool.

## 2026-03-24 — Chat Button Fix, Input Validation, Privacy

### Fixed
- **Chat button invisible on day pages**: Chat panel z-index was lowered to z-40 (same as mobile day view overlay), making the button unresponsive on day pages. Restored to z-50 so chat always layers above page content.
- **Readiness check privacy leak**: `check_travel_readiness` chat tool included private documents (marked `isPrivate`) when checking another traveler's status. Now filters private docs for non-owners.
- **Input validation on all creation endpoints**: Trip, city, experience, accommodation, reservation, and route segment POST endpoints now reject empty/missing required fields with clear error messages instead of passing garbage to the database.

## 2026-03-23 — Backend Safety & Frontend UX Polish

### Fixed
- **Accommodation PATCH security**: Was passing raw `req.body` to Prisma, allowing clients to tamper with `tripId`, `cityId`, or any field. Now cherry-picks only allowed fields (name, address, coordinates, check-in/out times, confirmation number, notes, dayId).
- **Accommodation PATCH log type**: Change log recorded edits as `"accommodation_added"` instead of `"accommodation_edited"`. Fixed.
- **Reservation PATCH security**: Same raw `req.body` issue as accommodations. Now cherry-picks fields (name, type, datetime, duration, coordinates, confirmation number, notes, transport mode, dayId).
- **Experience reorder atomicity**: Reorder loop updated each experience individually — partial failure left inconsistent order. Now wrapped in `prisma.$transaction()`.
- **City reorder atomicity**: Same transaction fix as experience reorder.
- **Day deletion atomicity**: Experience demotion and day deletion were separate calls — if delete failed, experiences were already demoted with nowhere to go. Now wrapped in `prisma.$transaction()`.
- **No global API error handler**: Unhandled errors returned HTML stack traces instead of JSON. Added Express error handler for `/api` routes that returns `{ error: message }` with proper status codes.

### Changed
- **Frontend UX polish (13 fixes)**: Logout button on settings page; experience detail panel closes after delete; route segments panel always visible; collab modal backdrop click fix; edit trip save button shows loading state; z-index hierarchy normalized (z-30 floating buttons → z-40 panels → z-50 overlays); NowPage uses data refetch instead of full page reload (preserves GPS/timers); 15-second timer refresh; quick capture dispatches data-changed event; clipboard share fallback with toast; transit alerts refresh every 5 minutes; import failure shows error toast; capture panel clears errors on mode switch.

## 2026-03-23 — Login & Join Page Stability

### Fixed
- **Service worker reload loop**: The inline SW unregister script called `location.reload()` without waiting for `unregister()` to complete, causing infinite reload loops on devices with stale SWs. Now waits for all unregistrations via `Promise.all` and uses a `sessionStorage` flag to ensure at most one reload per session. This was causing the tab cycling/blinking and preventing login buttons from working.
- **Stale index.html cache**: Express served `index.html` without cache-control headers, so browsers cached old HTML pointing to old JS bundles. Now serves `index.html` with `no-cache, no-store, must-revalidate` and hashed assets with 1-year immutable cache.
- **Login page blinking**: Removed JS image preloading and opacity transitions. Background photo now uses pure CSS `background-image` (browser handles loading natively). AuthContext skips loading state when no token exists, eliminating the null render frame for new users.
- **iPad missing Home button**: Action bar visibility fixed for iPad landscape breakpoint.

## 2026-03-22 — Shared Phrase System

### Added
- **Shared phrase card**: `TripPhrase` table stores phrases per trip in the database. When anyone adds a phrase (via AI chat), it appears at the bottom of everyone's phrase panel automatically.
- **AI chat tool `add_phrase`**: Ask the AI "how do you say X in Japanese?" and it saves the phrase with English meaning and romaji pronunciation to the shared pool. Rule 27 in the system prompt.
- **Local reorder and hide**: Each traveler can reorder phrases (up/down arrows) and remove phrases (× button) locally without affecting others. Stored in localStorage.
- **日 icon**: Phrase button uses the kanji character instead of a generic speech bubble.
- **Scroll fix**: Phrase panel now scrolls properly on iPhone — won't scroll the page behind it.
- **Phrase API**: `GET /api/phrases/trip/:tripId`, `POST /api/phrases`, `DELETE /api/phrases/:id`.

### Changed
- Total chat tools: 48 (was 47). New: `add_phrase`.
- Orientation banner on Trip Overview tightened: "Quick start" with PWA save tip, shorter wording, "got it" dismiss.

SPEC UPDATE NEEDED: Phrase system (TripPhrase table, shared pool, chat tool) and chat tool count (48) are new.

## 2026-03-22 — Identity System: Database-Backed Travelers with Invite Links

### Added
- **Traveler table**: Users are now stored in the database instead of only in the ACCESS_CODES env var. Existing ACCESS_CODES users are auto-seeded on first boot (idempotent). Login page fetches the traveler list from the API — no more hard-coded names in the frontend.
- **Invite link system**: Every trip gets a shareable invite link (e.g., `wander.app/join/abc123`). The organizer enters expected guest names, shares the link, and invitees open it and tap their name to join. New travelers are created automatically.
- **Smart invite security**: Wander tracks expected guests via TripInvite records. Fuzzy name matching (Jaro-Winkler) auto-claims invites. Unexpected joins (someone not on the list) are flagged in server logs. Duplicate joins return gracefully.
- **Trip membership**: TripMember table tracks who belongs to each trip with roles (owner/member). Trip creator is auto-added as owner.
- **Members & Invite UI**: New "Travelers" section on Trip Overview shows current members, pending invites, the invite link (with copy button), and a form to add expected guest names.
- **Join page**: New `/join/:token` page with the Wander design language — shows trip name, expected names as tap-to-join buttons, and a custom name input for others.
- **14 chaos tests (S161–S174)**: Traveler list, login via DB and ACCESS_CODES, invite creation, join flow (expected/unexpected/duplicate), fuzzy matching, member listing.

### Changed
- Login page now fetches traveler list from `GET /api/auth/travelers` instead of using a hard-coded array. All users in the Traveler table appear automatically — no code changes needed to add Kyler or anyone else.
- Login accepts display names directly (e.g., "Ken") in addition to ACCESS_CODES (e.g., "CHAOS1") for backward compatibility.
- `POST /api/trips` now generates an `inviteToken` and creates a TripMember record for the trip creator.

SPEC UPDATE NEEDED: Identity system (Traveler table, invite links, TripMember, TripInvite) is entirely new and not in SPEC.md. AUTH section needs rewrite.

## 2026-03-22 — Fix: Chat Fails to Save Frequent Flyer Numbers

### Fixed
- **Fast-path hijacking travel documents**: Pasting frequent flyer numbers into chat triggered the recommendation import shortcut (≥3 lines + >200 chars), bypassing Claude entirely. Added pattern detection for travel document keywords (airline names, "SkyMiles", "MileagePlus", etc.) so document text falls through to the normal AI loop where Rule 17 correctly triggers `save_travel_document`.

### Added
- **`save_travel_documents_bulk` chat tool**: Save multiple documents in one call (e.g., 20 frequent flyer numbers across 3 travelers). Eliminates the need for 20+ sequential tool calls that would time out.
- **`forTraveler` parameter on save_travel_document**: Ken can now save Larisa's and Kyler's documents on their behalf. Resolves traveler names against the access code system. Works on both single and bulk save tools.
- **5 chaos tests (S156–S160)**: Frequent flyer save, multiple FF per traveler, privacy on shared endpoint, fast-path pattern detection, document carry-over to new trips.

### Changed
- Total chat tools: 47 (was 46). New: `save_travel_documents_bulk`.
- System prompt Rule 17 updated to guide Claude toward bulk saves for batches and `forTraveler` for multi-person saves.

SPEC UPDATE NEEDED: Chat tool count and traveler document capabilities (forTraveler, bulk save) are new behaviors not in SPEC.md.


## 2026-03-21 — UX Polish: Trip Switcher, Chat Resilience, Map Navigation

### Added
- **Trip switcher**: Tap the trip name on the overview screen to open a bottom sheet showing all your trips. Switch between active and archived trips, or start a new one. Subtle chevron hint — stays out of the way until you need it.
- **"Take me here" quick-tap on map markers**: Tapping a pin on the map now shows a compact popup with two options: "Take me here" (opens Apple Maps directions) and "Details" (opens the experience panel). Faster than going through the detail view.
- **Chat timeout + retry**: Chat now times out after 45 seconds instead of hanging forever. Shows "Try again" and "Move on" buttons on failure.
- **Voice auto-send**: After dictating via the microphone button, the message sends automatically when speech recognition ends — no need to tap Send.
- **Document carry-over**: When creating a new trip, portable documents (passport, frequent flyer, insurance) are automatically copied from existing traveler profiles. No re-entry needed.
- **Unlocated item banner**: Experience list now shows a clear amber banner when items aren't on the map, with the count and a hint to tap the pin icon.
- **Group interest badge in Day View**: Day-by-day view now shows interest count badges on experiences that have group interest activity.

### Changed
- **Group interest icon audit**: Fixed broken SVG path data in the people icon across ExperienceList. Improved unlocated-item pin indicator from a tiny crossed-out emoji to a visible amber-bordered button.
- **Map marker click behavior**: Markers now show the quick-action popup instead of immediately opening the detail panel. Dismiss by tapping X or clicking elsewhere.

### Fixed
- **Chat freeze on slow AI responses**: Previously, if the Anthropic API was slow, the chat input locked permanently (the `sending` flag never cleared). Now uses AbortController with a 45-second timeout.

SPEC UPDATE NEEDED: Trip switching UI, "Take me here" map navigation, and document carry-over are new behaviors not in SPEC.md.

## 2026-03-20 — Group Interest System (replaces Voting)

### Added
- **"Share with group" on experience cards**: Subtle group icon on every experience in the Plan page list. Tap to tell travel companions you're interested, with an optional note explaining why. One tap to share, no forms or setup.
- **Inline reactions**: When someone shares interest, others see a warm badge on that experience card. Tap to react: Interested, Maybe, or Pass. Reactions update in place — change your mind anytime.
- **Experience detail group section**: Full interest/reaction view in the experience detail panel. See who's interested, their notes, all reactions, and react yourself.
- **App-open interest notification**: When you open the app and a travel companion has shared something new, a card slides up: "Ken is interested in Pottery Workshop in Kyoto." Tap to navigate there. Auto-dismisses after 12 seconds. Shows once per session.
- **Backend interest API**: `/api/interests` — float (POST /), list by trip (GET /trip/:tripId), react (POST /:id/react), retract (DELETE /:id). Upsert-based so re-floats and reaction changes are idempotent.
- **Chat tools**: `float_to_group`, `react_to_interest`, `get_group_interests` replace the 3 old voting tools in the AI assistant.
- **15 chaos tests (S141-S155)**: Float, upsert, react, invalid reaction, change reaction, retract permissions, cascade delete, full lifecycle, multi-user scenarios, auth requirement.

### Removed
- **VotingCard component**: Removed from Trip Overview. The formal polling pattern (create poll → define options → vote) was replaced by the lightweight interest system that matches how travelers actually make group decisions — browsing, finding something interesting, and sharing it with one tap.

### Changed
- Total backend tests: 334 (was 319). All passing with Neon branch isolation.

SPEC UPDATE NEEDED: Voting/polling sections should be replaced with Group Interest system description.

## 2026-03-20 — Chat Parity: 7 New Chat Tools

### Added
- **create_trip chat tool**: Users can now create a new trip entirely via chat ("plan a trip to Portugal in June"). Auto-generates days for cities with dates.
- **delete_travel_document chat tool**: Remove travel documents via chat ("delete my frequent flyer info").
- **get_cultural_context chat tool**: Ask about etiquette, practical tips, or best timing for any experience via chat. Generates and caches AI cultural notes.
- **share_day_plan chat tool**: Generate a shareable text summary of any day's schedule via chat ("share Tuesday's plan").
- **get_travel_time chat tool**: Ask how long it takes to get between places via chat. Uses Google Distance Matrix with haversine fallback.
- **cast_vote chat tool**: Vote on open voting sessions via chat ("vote yes on Ichiran"). Upserts to allow changing votes.
- **get_ratings chat tool**: Ask about ratings for any experience via chat ("how is this place reviewed?").
- Total chat tools: 46 (was 39).

## 2026-03-20 — Creative Features: Cultural Context, Voting, Transit, Voice, Tabelog, Predictive Caching

### Added
- **Cultural context cards (G4+A2)**: Each experience gets AI-generated cultural tips covering etiquette, practical info, and timing/crowd patterns. Loads on demand via "Cultural context" button in experience detail. Tips are cached on the experience so they only generate once. Categories are color-coded: amber (etiquette), blue (practical), emerald (timing).
- **Preference voting (C2)**: Group decision-making with card-stack UI. Create a question with options, swipe through Yes/Maybe/No on each. Tallies combine across travelers. Sessions can be closed. Voting card appears on Trip Overview above Recent Activity.
- **Transit disruption alerts (A3)**: Scrapes JR East and JR Central English status pages for train disruptions. 5-minute cache. Now page shows red alert banner when disruptions affect trip routes.
- **Real train schedules (D3)**: Google Directions API with transit mode and rail filter. Returns up to 4 route options with departure/arrival times, line names, transfers, fare. Available via AI chat tool.
- **Voice chat input (A6)**: Microphone button in chat panel uses Web Speech API for speech-to-text. Red pulse animation while listening. Works on iOS Safari 14.5+.
- **Tabelog ratings (B3)**: Japan's restaurant rating platform added as a rating source. Set via AI chat tool (no public API). Displays as "T" badge in ratings with 3.0 low-warning threshold.
- **Phrase card (modified D2)**: Floating button (left side) opens bottom sheet with 7 essential phrases: Hello, Thank you, Yes please, No thank you, How much?, Excuse me, Check please. English + romaji pronunciation only — no Japanese characters.
- **Predictive caching (F1)**: Service worker pre-fetches next city's day and experience data when a city transition is within 2 days. Triggered from Now page load. Data cached for offline use before arrival.
- **6 new AI chat tools**: `create_vote`, `get_vote_results`, `set_tabelog_rating`, `check_transit_status`, `search_train_schedules`, plus cultural notes generation.
- **14 chaos tests (S109–S122)**: Voting CRUD, vote upsert, session close, multi-user tallies, Tabelog rating upsert, transit status structure, train schedule validation, cultural notes 404.

SPEC UPDATE NEEDED: Cultural context cards, voting system, transit alerts, train schedules, voice input, Tabelog ratings, phrase card, predictive caching — none in SPEC.md.

## 2026-03-20 — Traveler Documents & Profile System

### Added
- **Traveler document storage**: Each traveler can store passport, visa, frequent flyer, insurance, ticket, and custom documents per trip. Documents use a flexible JSON data field so any key-value pairs can be stored per type.
- **Profile page**: Tapping your name on the trip overview navigates to `/profile`, where you can add, edit, and delete documents grouped by type. Privacy toggle per document controls visibility to other travelers.
- **5 AI chat tools**: `save_travel_document`, `update_travel_document`, `get_my_documents`, `get_shared_documents`, `check_travel_readiness` — chat can store, retrieve, and analyze travel docs conversationally.
- **Travel readiness check**: API endpoint analyzes stored documents against trip destinations and flags gaps (missing passport, expiring passport, no insurance, no frequent flyer programs).
- **Pre-trip daily greeting nudges**: Before the trip starts, DailyGreeting checks document completeness and shows gentle reminders (passport → insurance → frequent flyer, rotating by day). If documents are complete, shows personalized destination teasers based on traveler interests.
- **Now page document cards**: On travel days, relevant document info surfaces contextually — passport name/number on transport days, hotel confirmation on check-in days. Values are copy-to-clipboard buttons.
- **Privacy model**: Documents default to shared but can be marked private. Shared endpoint filters private documents from other travelers. Owner-only mutations (edit/delete) enforced server-side.
- **13 chaos tests (S96–S108)**: Covering auto-profile creation, data merge on update, cascade delete, privacy filtering, owner-only mutations, duplicate prevention, invalid types, readiness checks, multi-traveler visibility, and double-delete idempotency.

### Fixed
- **Trip delete cascade error**: Deleting a trip with change logs failed with a 500 because `logChange` tried to insert a ChangeLog record after the trip (and its cascaded ChangeLogs) were already deleted. The log is now written before the delete.
- **Google Maps link "no results found"**: `?q=place_id:XXX` URL format is broken/deprecated. Fixed to use Maps URLs API format `?api=1&query=...&query_place_id=XXX` in both experience detail and ratings badge.
- **Rating hotlink missing**: Rating badge link was using the same broken place_id URL format. Fixed alongside Google Maps button.
- **White strip below nav**: `safe-bottom-nav` CSS class had doubled safe-area inset (both padding-bottom and margin-bottom). Removed the redundant margin.
- **Action bar transparency**: Increased from barely-visible 95% opacity to 55% (`bg-white/55`) for map visibility.

SPEC UPDATE NEEDED: Traveler Documents feature (storage, profile page, chat tools, readiness check, pre-trip nudges, Now page surfacing) not in SPEC.md.

## 2026-03-14 — Bottom Action Bar, External App Handoffs, Layout Fixes

### Fixed
- **Action bar / filmstrip overlap on map page**: The bottom action bar (Home, List, Add, Chat) was overlapping the day filmstrip because it used a hardcoded pixel offset. Both are now merged into a single fixed-bottom container that stacks naturally — action bar on top, filmstrip below, no overlap.
- **Backroads B badge missing on some calendar days**: Days with long city names (e.g., "Izu Peninsula") pushed the B badge below the visible area of the calendar cell, which has `overflow-hidden`. The badge is now absolute-positioned in the top-right corner where it always stays visible regardless of city name length.

## 2026-03-14 — Bottom Action Bar + External App Handoffs

### Added
- **Experience detail action bar**: Map (pin in Apple Maps), Website (source URL in browser), Google (Maps place page or search), and Share (Web Share API) buttons below the hero image. Visible when coordinates, source URL, or place ID are available.
- **Accommodation address → Apple Maps**: Tapping an accommodation address on the Day View opens Apple Maps with a pin at the location. Previously plain text.
- **Reservation name → Apple Maps**: Reservation names on the Day View link to Apple Maps pin when coordinates exist.

### Changed
- **Map links use pin, not directions**: All planning-context links to Apple Maps now drop a pin (`ll` + `q` parameters) instead of starting turn-by-turn directions (`daddr`). Directions from a different country/continent would fail. The "Now" screen retains directions links since those are used when physically nearby.
- **Map GPS defaults to off**: The map no longer requests location permission automatically on load. GPS activates only when the user taps the location button, or when viewing the "Now" screen during trip dates. Reduces unnecessary location permission prompts.
- **Bottom action bar replaces floating buttons**: The map page now has a clean bottom bar with labeled icons (Home, List, Add, Chat) instead of scattered floating circles. "Add" opens a menu for Capture or Import. The old top bar with the hard-to-find back button is removed — Home is now always one thumb-tap away in the bottom bar. Chat bubble is hidden on the map page since Chat is in the bar.

SPEC UPDATE NEEDED: Map page navigation pattern changed (top bar removed, bottom action bar added).
- **Copy confirmation number**: All confirmation numbers (accommodations, reservations, route segments) across Day View, Now page, and Route Segments panel are now tappable — copies to clipboard with a 📋 indicator and toast confirmation. Useful at check-in counters.

SPEC UPDATE NEEDED: External app handoffs not in SPEC.md.

## 2026-03-10 — UI Polish & Settings Page

### Added
- **Settings page** (`/settings`): New page with city photo duration toggle (1/3/5 seconds, default 1s), next-up reminder on/off toggle, and "Reset all guides" button to re-show first-time orientation tips. Accessible via gear icon on Trip Overview's identity bar.
- **DailyGreeting auto-dismiss**: Greeting overlay now auto-dismisses after 5 seconds (still dismissible by tap).

### Fixed
- **FirstTimeGuide backdrop dismissal**: Tapping the dark backdrop behind the guide panel now dismisses it (same as "Remind me" — shows again next session). Previously only the buttons worked.
- **Travel geometry legend overlap**: Moved the walking-distance legend from upper-left (`LEFT_TOP`) to lower-left (`LEFT_BOTTOM`) so it no longer overlaps the day info card on iPhone and iPad.

SPEC UPDATE NEEDED: Settings page not in SPEC.md.

## 2026-03-09 — Offline Cache Overhaul

### Added
- **Mutation queueing**: POST, PATCH, and DELETE requests to experiences, reservations, accommodations, days, cities, route segments, and captures are now queued in IndexedDB when offline instead of failing silently. Queued changes replay automatically when connectivity returns.
- **Offline UI feedback**: OfflineIndicator now shows queued item count ("Offline · 3 queued"). Toast notifications appear when changes are saved offline and when they sync on reconnect.
- **City image prefetch**: On app start, all city static map images (both TripOverview 120x120 and PlanPage 240x120 sizes) are eagerly fetched and cached. Clicking a city for the first time in a session shows the map instantly — no flash.
- **Trip data prefetch**: On app start, active trip data (days with experiences/reservations/accommodations, trip structure with route segments) is eagerly fetched into the SW cache so the Now page and Plan page work instantly if the user goes offline.
- **Google Maps tile caching**: Interactive map tiles from googleapis.com and gstatic.com are cached with StaleWhileRevalidate so the map renders offline from last-viewed tiles.
- **Cloudinary image caching**: Experience photos from res.cloudinary.com are cached with CacheFirst strategy (30-day expiry, 100 entries). Viewed once online, available offline indefinitely.
- **Explicit SW caching for accommodations, reservations, route-segments**: Previously only covered by the catch-all StaleWhileRevalidate rule (1-day expiry). Now each has a dedicated NetworkFirst rule with 7-day expiry and 3s timeout.

### Changed
- **api.ts**: Now catches `TypeError` (network failure) on mutation requests and routes them to the offline queue instead of throwing. Returns a synthetic `{ _queued: true }` response so the UI doesn't crash.
- **Service worker**: Added `CacheFirst` import and 4 new caching rules (Google Static Maps, Google Maps tiles, Cloudinary, plus explicit accommodation/reservation/route-segment rules).

### Fixed
- **offlineStore.ts was never called**: The `queueRequest()` function existed since the offline system was built but was never imported or called by any code path. Now connected via api.ts.

**SPEC UPDATE NEEDED**: Offline caching strategy section (Section 17), service worker cache rules, mutation queue behavior.

## 2026-03-08 (cont'd — Next-Up Overlay)

### Added
- **Next-up reminder overlay**: When opening Wander during your trip, a compact card slides up showing your next upcoming action (reservation, planned experience with a time, or transport departure) within the next 4 hours. Shows the name, time, and key details. Tap anywhere on the card to dismiss, or it auto-closes after 10 seconds. Only appears once per app session and only when there's high-confidence time-specific data for today — never guesses or shows generic content. Outside trip dates, nothing appears.
- **Next-up setting toggle**: On/off toggle at the bottom of the Now page. On by default. Persisted in localStorage. Shows toast confirmation when toggled.
- **Data sources for next-up**: Reservations (exact datetime), selected experiences with time windows (parsed: "morning"=9am, "afternoon"=2pm, "evening"=6pm, or exact times like "2:00 PM"), and route segments with departure date+time.

**SPEC UPDATE NEEDED**: New component NextUpOverlay, Now page settings section.

## 2026-03-08 (cont'd — Chat Tool Parity + UX)

### Added
- **8 new AI chat tools**: `delete_route_segment`, `update_reservation`, `add_accommodation`, `update_accommodation`, `delete_accommodation`, `create_day`, `delete_day`, `reorder_cities`. The assistant can now perform full CRUD on all major entities.
- **Intentionally excluded `delete_trip`** from chat tools — too destructive for AI-initiated action.

### Changed
- **Chat close button**: Replaced X icon with down-chevron to signal "minimize" rather than "destroy." The close action preserves conversation context in localStorage; only the "Clear" button wipes it.

**SPEC UPDATE NEEDED**: AI chat tools list (now 39 tools total).

## 2026-03-08 (cont'd — Transport System: Gap-Fill, UX Polish, Tests)

### Added
- **Standalone RouteSegmentsPanel (TripOverview)**: Collapsible "Travel" panel on the trip overview page for managing intercity segments independently of day view. Shows segment count, tap-to-edit cards, delete with confirmation, and "Add your first travel segment" prompt when empty. Persists expanded state in localStorage.
- **AI chat tools for route segments**: `add_route_segment` and `update_route_segment` tools added to chat. Users can ask the AI to add/edit intercity transport with all logistics fields (flight numbers, confirmation numbers, times, stations, seats).
- **Itinerary import extracts logistics**: When importing itineraries, the AI extraction prompt now pulls service numbers, confirmation numbers, departure/arrival times, stations, and seat info from the source text.
- **NowPage auto-adopts saved transport mode**: When viewing leave-time for an experience, the mode picker defaults to that experience's saved `transportModeToHere` mode instead of always defaulting to walking.
- **Chaos tests S63-S66**: Route segment CRUD with logistics fields, experience transportModeToHere with all 7 expanded modes, travel time with expanded modes, change log preservation on segment deletion.

### Changed
- **TransportConnector visibility**: Now shows between all consecutive experiences that have an explicit transport mode set, not just those with coordinates. Previously required both coordinates and spatial ordering.
- **NowPage mode picker wraps on iPhone**: Uses flex-wrap so all 6 modes fit without horizontal scrolling on narrow screens.

### Fixed
- **S66 test bug**: Change log endpoint path was wrong (`/api/change-logs/{id}` → `/api/change-logs/trip/{id}`) and response field was `logs` not `items`.

**SPEC UPDATE NEEDED**: Sections 6.2 (RouteSegment fields), 6.7 (TravelMode enum values), 14.3 (route segment UI + standalone panel), 22.2 (travel time modes), AI chat tools list.

## 2026-03-08 (cont'd — Transport System)

### Added
- **Intercity transport card (DayView)**: On city-transition days, shows a full travel card with mode, service number, times, stations, confirmation, seat, and notes. Tap to edit inline. Creates or updates route segments directly from the day view. Appears at the top of the day before experiences.
- **Intra-city transport connectors (DayView)**: Between consecutive experiences, shows travel mode emoji + estimated time. Tap to expand a mode picker (walk, subway, train, bus, taxi, shuttle). Saves the chosen mode to the experience's `transportModeToHere` field. Replaces the old walking-only distance hints.
- **Route segment logistics fields (schema)**: `confirmationNumber`, `serviceNumber`, `departureTime`, `arrivalTime`, `departureStation`, `arrivalStation`, `seatInfo` added to RouteSegment model. Backend POST/PATCH accept all new fields.
- **Expanded intra-city travel modes**: TravelMode enum changed from `walk | transit | taxi` to `walk | subway | train | bus | taxi | shuttle | other`. All backend speed/buffer calculations, Google Distance Matrix mappings, and NowPage mode picker updated.

### Changed
- **NowPage travel mode picker**: Now shows 6 modes (walk, subway, train, bus, taxi, shuttle) instead of 3.
- **Experience PATCH endpoint**: Now accepts `transportModeToHere` for direct mode updates from the UI.

**SPEC UPDATE NEEDED**: Sections 6.2 (RouteSegment fields), 6.7 (TravelMode enum values), 14.3 (route segment UI), 22.2 (travel time modes).

## 2026-03-08 (cont'd — Runtime Crash Fixes, Playwright Smoke Tests)

### Fixed
- **Blank white page (dnd-kit import crash)**: `DragEndEvent`, `DragStartEvent`, `DragOverEvent` were imported as runtime values from `@dnd-kit/core`, but they're type-only exports. Vite's module loader failed silently, rendering a completely blank page. Fixed with `type` keyword on imports.
- **"Something went wrong" after login (React error #310)**: `useMemo` for Backroads day badges was placed after early `return` statements in both TripOverview and PlanPage. React requires hooks in the same order every render — when the loading state transitioned, React saw extra hooks and crashed. Moved `useMemo` above early returns in both components.

### Added
- **Playwright smoke tests (5 tests, ~16s)**: Catches runtime crashes that TypeScript misses. Tests cover: login page rendering, login click stability, unauthenticated route redirects, and post-login rendering of TripOverview and PlanPage (the loading→loaded transition that triggered the hooks bug).
- **Playwright added to dev dependencies**: `@playwright/test` with Chromium browser.

## 2026-03-08 (cont'd — iPhone Polish, Creator Badges, Login & Splash)

### Fixed
- **Back button visible on iPhone**: ExperienceDetail header, mobile list view header, and DayView all now respect `safe-area-inset-top`, keeping the back/close button below the notch and clock.

### Changed
- **Candidate destinations collapsed on calendar page**: The TripOverview page now collapses candidate cities by default, matching the filmstrip behavior. Uses the same localStorage key so the preference syncs across views.
- **Creator initial badge on experiences**: When anyone adds an item, their first initial appears as a subtle badge (e.g., "K" for Ken) next to the name. Disappears when someone else edits the record. Tracks via new `lastEditedBy` field on experiences.
- **Login screen redesigned**: Full-bleed travel photography background (Japan-themed, random from curated set), frosted glass name buttons, gradient overlay for legibility. Replaces the plain white login.
- **City splash photo on day selection**: When you first tap into a city, a full-bleed iconic photo of that city appears briefly (1 second default, configurable 1/3/5s in settings via localStorage `wander:splash-duration`), then fades to reveal the map. Shows once per city per session. Tap to dismiss early. Uses Google Places photo API.
- **"dismiss all" button moved**: Now appears at the end of the expanded candidate list in the filmstrip, not at the divider.

### Added
- **City photo API endpoint**: `GET /api/geocoding/city-photo?query=CityName` returns a Google Places photo URL for splash screens.
- **`lastEditedBy` field on Experience model**: Tracks who last edited an experience, used to show/hide creator badge.

SPEC UPDATE NEEDED: Login screen design, city splash feature, creator badges, safe area handling.

## 2026-03-08 (cont'd — Circle-Driven Map Zoom)

### Changed
- **Map zooms to fit the circle, not all city pins**: Previously the map zoomed to fit every selected experience in the city, making the walking circle invisible at wide zoom levels (e.g., Nikko spanning 30km). Now the map zoom is driven by the circle bounds, keeping the circle at ~30-50% of the viewport. Pins outside the circle (other days' items) may be off-screen — the user can pan to them.
- **Default circle is 2 miles diameter**: Changed from the previous 1.2 mi (2 km) default to 2 mi, better suited for healthy walkers. Max cap raised to ~5 mi diameter.

## 2026-03-08 (cont'd — Candidate Cities Collapse, Circle Polish)

### Changed
- **Candidate cities collapsed by default**: The recommendation cities in the filmstrip are now hidden behind a toggle ("12 ideas ›"). Collapsed state is stored per-browser in localStorage — Julie and Andy will never see them; Ken and Larisa can expand when planning. Collapsing is purely local and doesn't affect other travelers.
- **"clear" renamed to "dismiss all"**: The bulk dismiss button is now labeled honestly. It appears at the end of the expanded candidate list, not as the primary action at the divider.
- **Dismiss remains shared**: Dismissing a city (× or "dismiss all") sets `hidden: true` in the database, affecting all travelers. This is a trip decision, not a view preference.
- **Circle dashed vs solid**: City-overview circle (no items assigned to this day) renders with a dashed stroke and lighter fill. Day-specific circle (items assigned to this day) renders solid. Visual shorthand: dashed = "here's the geography," solid = "here's your walking plan."
- **Circle falls back to city-wide when no day assignments**: If no selected experiences are assigned to the current day, the circle shows all selected for the city (dashed). Once items land on the day, it narrows to just those (solid).
- **Circle label shows scope**: "Today: 2 items · 1.2 mi · ~20 min walk" vs "All selected: 4 items · 2.1 mi · ~30 min walk."

### Fixed
- **Overview map zoom buttons removed**: The +/- zoom controls on the trip overview hero map were non-functional. Removed since the map auto-fits to show all cities.

SPEC UPDATE NEEDED: Candidate city UX section — collapsed by default, local vs shared state distinction. Travel geometry section — dashed/solid distinction, day-scoping fallback.

## 2026-03-08 (cont'd — Circle Overlay Fix)

### Fixed
- **Travel circle now scoped to current day**: The walking-distance circle was encompassing ALL selected experiences across the entire city (producing absurd 41.6 km circles spanning Fushimi to Philosopher's Path). Now it only includes selected experiences assigned to the currently viewed day. When no day is selected, it falls back to all selected.
- **Circle radius capped at 2.5 km**: No circle can exceed 5 km diameter (~3.1 miles), keeping it within walkable range. Minimum remains 2 km diameter (~1.2 miles) for single items.
- **Circle label now shows miles**: Switched from kilometers to miles for the distance label and walking time calculation (at 2 mph), matching user expectations for US travelers.
- **Map pins still show all city experiences**: Only the circle is day-filtered — all selected experience markers for the city remain visible on the map regardless of day.

SPEC UPDATE NEEDED: Travel geometry overlay section should note day-scoping, mile display, and radius cap.

## 2026-03-08 (cont'd — Map Cleanup, Layout Fixes)

### Fixed
- **Overview map only shows itinerary cities**: Previously showed all 44 cities (including recommendation candidates), creating overwhelming numbered clusters. Now only dated, non-hidden cities appear on the overview map and route polyline.
- **Floating buttons no longer hidden behind filmstrip**: The capture (+) and activity list buttons on PlanPage were at z-30, same as the filmstrip, and at insufficient bottom offset. Raised to z-35 and moved up to 110px above the bottom.
- **Day header card respects safe area**: On PWA/notched devices, the day info card at the top of the map was clipped by the status bar. Now uses `env(safe-area-inset-top)` for proper positioning.

## 2026-03-08 (cont'd — Rating Links, Dismiss Safety)

### Changed
- **Rating badges link to Google Maps**: Tapping the "G ★ 4.2 (1.4k)" rating on any experience now opens that place's Google Maps page in a new tab — quick access to reviews, photos, and directions. Only works for geocoded experiences with a Google Place ID.
- **Dismiss city requires confirmation**: Tapping the X on a candidate city now shows a confirmation dialog ("Dismiss Takeo and its ideas?") instead of immediately hiding. Same for the "clear" all button.
- **Undo for dismissed cities**: After dismissing a city, a toast appears with an "Undo" button (visible for 6 seconds) that restores the city instantly. Works for both individual and bulk dismissals.
- **Toast system supports action buttons**: Extended the toast component to accept an optional action (label + callback), used for undo operations.

## 2026-03-08 (cont'd — Test Isolation, Soft-Delete, AI Tools, Bug Fix)

### Added
- **Neon branch test isolation**: Tests now automatically create a temporary Neon database branch before running and delete it after. Production data is never touched. This eliminates the risk of test data polluting the live app (previously, test users Alice/Bob and hundreds of test trips appeared in production). Uses Neon API to create point-in-time branches, with endpoint readiness polling. Architecture: `vitest-global-setup.ts` creates branch, writes URL to temp file; `vitest-setup.ts` reads it in worker processes; teardown deletes branch.
- **CLAUDE.md testing rules**: Added mandatory testing protocol — all feature work must include test runs before being declared done. Chaos testing required for user-facing features.

### Changed
- **Vitest config updated for v4**: Moved deprecated `poolOptions` to top-level `singleFork` option.
- **Experience PATCH endpoint expanded**: Now supports `cityId`, `state`, `dayId`, and `timeWindow` fields, enabling the AI chat move_experience tool and other operations.

## 2026-03-08 (cont'd — Soft-Delete, AI Tools, Bug Fix)

### Fixed
- **Candidate city experiences not rendering**: When viewing a candidate city (recommendation import) in PlanPage, the right panel showed "0 SELECTED · 4 POSSIBLE" in the header but no experience items below. Root cause: the drag-reorder cache in ExperienceList retained IDs from the previous city; when switching to a candidate city, those IDs didn't match, causing `orderedPossible` to be empty. Fixed by resetting cached order state when the experience set changes. Affects: ExperienceList component.

### Added
- **Soft-delete for candidate cities**: Cities can now be hidden (dismissed) instead of permanently deleted. Hidden cities and their experiences are preserved in the database but invisible everywhere in the UI. On PlanPage, each candidate city tab has an X button to dismiss, and a "clear" link dismisses all candidates at once. The AI chat agent can restore hidden cities by name ("bring back Ibusuki"). Backend: `hidden` field on City model, filtered in all trip/city includes. Frontend: dismiss buttons on PlanPage filmstrip. SPEC UPDATE NEEDED — candidate city management section.
- **Three new AI chat tools for city visibility**: `hide_city` (individual or bulk), `restore_city` (fuzzy name match), `list_hidden_cities`. Enables conversational management: "dismiss all the recommendation cities" or "what cities did I archive?"
- **AI tool: move_experience** — Move an experience from one city to another ("move that ramen place to Osaka"). Fills a gap where previously the AI would need to delete and recreate.
- **AI tool: bulk_delete_experiences** — Delete multiple experiences at once ("delete all suggestions for Ibusuki"). Previously required N serial delete calls.
- **AI tool: update_city** — Edit city name, tagline, or country via chat ("rename that city to Saijo" or "add a tagline for Takeo").

## 2026-03-08

### Fixed
- **Geocoding now works on production**: All import paths (commit, merge, replace-backbone, commit-recommendations, chat fast-path) previously used fire-and-forget geocoding (`Promise.all(...).catch(() => {})`) which silently failed on Railway because the process context terminated after the HTTP response was sent. Changed all 7 locations to `await` geocoding before responding. This means imports take slightly longer but experiences actually get coordinates. The distance/walking time overlay (circle + label on the map) was never visible because zero experiences had geocoded locations.
- **Batch-geocoded all existing experiences**: Ran a one-time batch geocode of all 21 unlocated experiences. 15 confirmed (high confidence), 3 pending (low confidence), 3 failed (too vague for Google Places). The distance overlay should now be visible on day maps with geocoded selected experiences (Nikko, Kyoto, etc.).

### Removed
- **Cleaned up junk database items**: Deleted 3x "ミレット" and 4x "e-jaro" from Okayama — artifacts from earlier failed chat import attempts.

## 2026-03-07 (cont'd — Chat Memory)

### Fixed
- **Chat now has conversation memory**: Previously each message was sent independently — the bot had zero knowledge of anything said earlier in the conversation. Now the last 10 messages are sent as context with each new message, so the bot can reference what was discussed before.
- **Chat history persists across page navigation**: Conversation is saved to localStorage per trip. Navigating between pages or refreshing no longer wipes the chat. The "Clear" button still works to reset.
- **Chat textarea expands for large pastes**: Input area now grows up to 40% of the chat panel height (was capped at ~5 lines). Pasting 100 lines of recommendations shows a substantial portion instead of a tiny sliver.

## 2026-03-07 (cont'd — Text Size + Chat Input)

### Changed
- **Text size increase for readability**: All text across the app now meets minimum size thresholds for users aged 55-65. Primary content is 16px minimum, secondary content 14px minimum, and UI chrome 12px minimum. No text anywhere in the app is smaller than 12px. Affected components: TripOverview, PlanPage, MapCanvas, ChatBubble, RatingsBadge, DayView, NowScreen, HistoryPage, and all sidebar/card components.
- **Chat input now supports multi-line paste**: The chat input field is now a textarea that auto-expands (up to 5 lines) when you paste large blocks of text like recommendation lists. Previously, pasting multi-line content into the single-line input showed only the first line, making it appear truncated.

## 2026-03-07 (cont'd — Theme Filter, Keyboard Shortcuts, Overlay Fix)

### Added
- **Theme filtering on map**: Emoji filter bar on the left side of the map. Tap a theme emoji to show only markers of that type (food, temples, ceramics, etc.). Tap again or tap "All" to clear the filter. Applies to selected, possible, and nearby markers. Only shows themes that are actually present on the current map view.
- **Keyboard shortcuts**: Global navigation shortcuts work on all pages: 1/g+h = Overview, 2/g+p = Plan, 3/g+n = Now, 4/g+l = History. Plan page also supports: c = toggle capture, i = toggle import, m = toggle map/list, Esc = close panel. Press ? for a help overlay showing all shortcuts. Shortcuts are suppressed when typing in inputs.

### Fixed
- **Distance overlay visibility**: Circle around selected pins was nearly invisible (10% opacity, thin stroke). Now uses 18% fill opacity, 2.5px stroke at 70% opacity, darker color (#8a7a62). Walking time/distance label moved to top center with a small circle indicator matching the overlay style.

SPEC UPDATE NEEDED: Theme filtering and keyboard shortcuts are new features.

## 2026-03-07 (cont'd — Chat Recommendation Import)

### Added
- **Chat-based recommendation import**: Pasting a recommendation list into the AI chat now triggers the same extraction and categorization pipeline as the Import panel. The chat detects recommendation-style text automatically, extracts places, routes them to existing/new/Ideas cities with fuzzy matching, and reports back what was imported. No need to navigate to a specific page — paste anywhere the chat is available.
- **Fuzzy matching parity**: Frontend preview panel now uses the same substring-containment matching (min 4 chars) as the backend, so the color-coded preview accurately reflects what will actually happen on commit.

SPEC UPDATE NEEDED: Chat AI can now import recommendations, not just answer questions and manage individual items.

## 2026-03-07 (cont'd — Recommendation Import)

### Added
- **Recommendation extraction**: New import mode for unstructured recommendation lists (friend's emails, blog posts, etc.). Uses a dedicated AI prompt that extracts individual places, preserves personal notes/URLs, and classifies by location.
- **Three-category routing**: Extracted recommendations are categorized:
  - Green: items in cities already on your trip (added as candidates)
  - Amber: items in new locations (creates dateless "candidate cities" grouped by sender's region)
  - Gray: items with no identifiable location (goes to an "Ideas" city bucket)
- **Import mode toggle**: Import panel now has "Itinerary" and "Recommendations" tabs. Recommendations mode has a "From whom?" field to tag the source.
- **Recommendation review panel**: Shows color-coded categorization before committing. Items grouped by existing city, new locations (by region), and general ideas.
- **Candidate Destinations section on TripOverview**: After recommendation import, dateless cities (candidate cities) appear in a new section below the calendar. Grouped by region (from sender's organization), each city is expandable to browse individual suggestions with descriptions and source attribution (e.g., "via Larisa's recommendations").
- **Fuzzy city name matching**: Recommendation routing uses substring containment (min 4 chars) in addition to exact matching, so "Kyoto" matches a trip city named "Kyoto" even if casing or whitespace varies.
- Backend endpoints: `POST /import/extract-recommendations` and `POST /import/commit-recommendations`

SPEC UPDATE NEEDED: Recommendation import is a new feature. Candidate cities (dateless cities for planning options) are a new concept.

## 2026-03-07 (cont'd — Date Shifting, Backbone Replacement)

### Added
- **Bulk date shift**: New `POST /days/shift` endpoint and `shift_trip_dates` AI chat tool. Shifts all days, city dates, route segments, and reservations by N days. Users can say "move everything one week earlier" in chat and the AI will execute it.
- **Single day date change**: `PATCH /days/:id` now accepts `date` field. New `update_day_date` AI chat tool for individual day moves.
- **Backbone replacement**: New `POST /import/replace-backbone` endpoint. Archives old Backroads (imported itinerary) days/experiences/cities into a separate trip, imports new content, and repositions non-Backroads days to maintain their relative position before/after the new backbone. Archived trips can be reactivated to restore old plans.
- **Replace Backbone UI button**: When importing into a trip that already has backbone (imported itinerary) days, a red "Replace Backbone" button appears alongside "Add to Trip" in the import review panel. Clicking it archives old backbone days, imports new content, and repositions surrounding days.
- AI chat system prompt updated with instructions for date shift operations.

SPEC UPDATE NEEDED: Date shifting and backbone replacement are new capabilities. Trip dates section needs update to reflect they're always derived from days.

## 2026-03-07 (cont'd — Trip Date Sync, Backroads Badge)

### Added
- **Backroads day badge on calendar**: Days with experiences imported from the Backroads PDF show a small red "B" badge next to the calendar icon. Identified by `sourceText` on experiences — no schema change needed.

## 2026-03-07 (cont'd — Trip Date Sync)

### Fixed
- **Trip header dates out of sync with calendar**: Header showed Oct 16–Oct 31 while calendar showed Oct 18–Nov 1. Root cause: trip.startDate/endDate were set at import time and never updated when days changed. Now trip dates are automatically derived from actual day records. Every operation that creates, deletes, or modifies days recalculates trip dates. Manual date editing removed from trip edit form — dates always match your city schedules.

SPEC UPDATE NEEDED: Trip dates are now derived from day records, not independently editable.

## 2026-03-07 (Location Resolver, Travel Days, Map-List Linkage, Distance Overlay)

### Added
- **Inline location resolver**: Unlocated experiences show a crossed-out 📍 icon. Tapping it opens an inline search — pick a result to set the map location. No separate review queue needed.
- **Walking distance overlay on maps**: Circle-based distance overlay replaces polygon hull. Works with even 1 geocoded item (shows 2km walking radius). With 2+ items, circle encompasses all points with 20% padding. Label shows diameter and estimated walking time at 3 km/hr. Minimum circle size is 2km diameter.
- **Travel day cards**: Days with a city change show a transport banner (🚃/✈️/🚌 etc.) with origin → destination, mode, and notes from route segments. Appears in both the floating day card and DayView detail panel.
- **List ↔ Map highlight**: Hovering a list item highlights its marker on the map with an amber ring. Clicking a map marker opens the detail panel.

### Fixed
- **Duplicate city names on calendar**: Static maps already show the city name — removed our overlay text when a map is present. Only shows city name on cells without a map (e.g., Izu Peninsula).
- **Nearby marker duplicates**: Clicking a nearby place that already exists as an experience now opens its detail instead of creating a duplicate. New nearby discoveries save lat/lng and placeId for proper dedup.
- **Map stuck on GPS location**: Tapping the same day after "where am I" now re-centers the map correctly.
- **Back button going to CreateTrip**: If /trips/active returns null but trips exist, auto-reactivates instead of showing the new trip screen.

### Changed
- **Filmstrip redesign**: Each day now shows 3-letter day name (Mon, Tue...), date (Oct 23), and full city name with word-wrap — no truncation. Map thumbnail is pure geography.
- **Static map labels suppressed**: Google's city name labels (京都市, 岡山市 etc.) hidden on all static maps via styling. Our own consistent label shows instead — no more duplicate/competing text.
- **Simplified location model**: "Pending" locations treated same as "unlocated" — either you have a confirmed location or you don't. Tap the icon to fix it.
- **Calendar icon**: Replaced 📋 (clipboard/copy-paste confusion) with 🗓️ (calendar) for plans indicator, consistent across calendar and PlanPage.

SPEC UPDATE NEEDED: Location resolver is new inline UI. Travel day display is new. List-map linkage is new interaction pattern.

## 2026-03-06 (Home Page Redesign, Brand Language, Smart Navigation)

### Changed
- **Calendar cells redesigned**: Map is now the hero element at 70% opacity with white gradient overlay at bottom showing date, city name (word-wrapped), and colored dots for activity count. Replaces text-heavy cells.
- **"Open Map" renamed to "Day by Day"**: Better reflects that the trip view is for following, not just planning.
- **Brand language**: All instances of "exploring" replaced with "wandering." Tagline is now "Enjoy your Wander."
- **Back button shows short trip label**: "Japan 2026" instead of full trip name. Derived dynamically from trip data.
- **"New Trip" button removed from Trip Overview**: Declutters the home page.

### Added
- **City-click navigation**: Clicking a city on the hero map or calendar navigates to that city's first day on the Plan page (via `?city=` URL param), not always day 1.
- **City-specific daily discovery tips**: Greeting system includes local insider tips for Tokyo, Kyoto, Nikko, Karatsu, Okayama — different each day.

SPEC UPDATE NEEDED: Navigation labels changed. Brand language updated throughout. Calendar cell design changed. City-click deep linking is new.

## 2026-03-06 (iPhone UX Overhaul, Emoji Markers, Date Fix)

### Fixed
- **Trip dates shifted to October 2026**: All days, cities, and trip envelope shifted from March/April to October/November to match actual Backroads tour dates. Trip now runs Oct 17 - Nov 1.
- **iPhone Safari safe areas**: Added `viewport-fit=cover` and `env(safe-area-inset-bottom)` padding to all fixed-position elements. Nav strip, floating buttons, and chat bubble no longer hidden behind Safari's bottom toolbar. Uses `100dvh` instead of `100vh`.
- **Nav strip scroll on touch**: Added `touch-action: pan-x` and `overscroll-behavior-x: contain` so horizontal swiping works without moving the whole page on mobile.
- **Nav strip pinned to true bottom**: Filmstrip is now `position: fixed` at viewport bottom with safe area padding, always visible and tappable on iPhone.
- **Floating buttons repositioned**: Capture (+) and activities (📋) buttons use `position: fixed` with safe area offset, no longer clipped off-screen.

### Changed
- **Emoji map markers**: Replaced abstract geometric shapes with emoji-in-pin markers. Food=🍜, Temples=⛩️, Ceramics=🏺, Architecture=🏛️, Nature=🌿, Transport=🚃, Shopping=🛍️, Art=🎨, Nightlife=🌙, Other=📍. Pin shape is teardrop-style for visibility on mobile.
- **Marker labels always visible**: All markers show name label below the pin. Selected markers are 44px, possible 36px (dashed border), nearby 28px with star rating.
- **Activities button**: Replaced hamburger icon (≡) with 📋 emoji — clearer meaning for "view activities list."
- **Distance overlay more prominent**: Walking distance/time overlay moved to bottom-center, larger text with 🚶 emoji, white background with shadow. Now readable on mobile.
- **Home page orientation text**: Shortened to bullet-point format ("Tap a day to jump to the map", "Colors match cities across all views", etc.) instead of paragraphs.
- **Recent activity collapsed**: Now a small "📋 5 recent changes" button that opens a modal, instead of inline list taking up screen real estate.
- **City legend removed**: Colors are self-documenting between calendar and nav strip — no separate legend needed.
- **Hero map city markers**: Now show numbered circles with city name label below, using matching pastel colors from calendar. Larger (40px) and more visible.
- **Easter egg discoveries**: Daily greeting now includes city-specific local tips (e.g., "The backstreets of Shimokitazawa have some of Tokyo's best vintage finds") for Tokyo, Kyoto, Nikko, Karatsu, Okayama. Different tip each day.

### Added
- **"Return to my location" button**: Blue 📍 button on map (bottom-right) pans and zooms to GPS position. Only appears when location is available.
- **Chat knows current day/city**: AI assistant now receives the currently selected day and city as context, so "What are my activities today?" works correctly on the Plan page.
- **New theme categories**: Added transport, shopping, art, nightlife as marker themes with distinct emoji.

SPEC UPDATE NEEDED: Map marker system completely redesigned. iPhone safe area handling is new. Easter egg discovery system is new feature. Chat context awareness improved.

## 2026-03-06 (Map Markers, GPS, Mini-maps)

### Changed
- **Map markers dramatically larger and labeled**: Selected markers are now 40px with white border, double ring shadow, and name label below. Possible markers are 32px with dashed border. Nearby markers are 24px with star rating. All tiers are now clearly visible on iPad and iPhone screens. Accommodation markers enlarged to 36px with hotel emoji. (Plan page map)
- **Mini-map thumbnails in calendar cells**: Trip Overview calendar cells now show a faded Google Static Map background centered on the city's coordinates. City name shown in full at bottom of each cell. (Trip Overview)
- **Full city names everywhere**: Filmstrip on Plan page and calendar cells show full city names, not abbreviations. (Plan page filmstrip, Trip Overview calendar)

### Added
- **"You are here" GPS marker**: When the app has location permission, a pulsing blue dot with "You are here" label appears on the map. Uses `watchPosition` for live tracking. Highest z-index so it's always visible. (Plan page map)

SPEC UPDATE NEEDED: Map marker sizes/styles changed significantly. GPS user location is new feature. Mini-map backgrounds on calendar cells are new.

## 2026-03-06 (Service Worker, Trip Switching, Date Guards)

### Fixed
- **Service worker blocking updates**: PWA service worker was using `CacheFirst` for JS/CSS and never activating new versions. Users saw stale code forever. Fixed with `skipWaiting()` + `clientsClaim()`, changed to `StaleWhileRevalidate`, and added auto-reload on SW update. Future deploys will update automatically without manual cache clearing. (All screens)
- **Past dates in import**: AI extraction sometimes guessed wrong years (e.g. 2024 instead of 2026). Added two guards: (1) Review screen shows amber warning listing any past dates so user can fix before committing. (2) Backend auto-shifts all dates forward if trip start is in the past. (Import review screen, backend import/commit)
- **Fixed wrong dates on Okayama, Karatsu, Nagoya**: Corrected from Jan 2024 to Apr 2026 in database.

### Added
- **Trip switching**: Tap any archived trip on the overview to reactivate it. Create screen now shows "Your Trips" list so you can get back to an existing trip. New `POST /trips/:id/activate` API endpoint. (Trip Overview, Create Trip screen)
- **Calendar handles date gaps gracefully**: Days separated by 7+ day gaps render as separate calendar blocks instead of one enormous grid. Prevents blank page when dates span multiple years. (Trip Overview)

## 2026-03-06 (Calendar, City Geocoding, AI Observations)

### Added
- **City geocoding**: Cities are now automatically geocoded via Google Geocoding API during import (both commit and merge). This populates latitude/longitude on cities, enabling the hero map on Trip Overview, filmstrip map thumbnails, and proper map centering. (Backend: import pipeline)
- **Week-view calendar grid on Trip Overview**: The day listing is now a Mon-Sun calendar grid with city-colored cells. Travel days show diagonal gradients between two city colors. Each cell shows the day number, planned experience count, and abbreviated city name. A color legend beneath the calendar maps colors to city names. Replaces the horizontal filmstrip and city list. (Trip Overview page)

### Changed
- **AI Observations hidden behind disclosure**: The blue AI Observation boxes in Day View are now collapsed behind a small (i) icon labeled "AI Observations". Tap to expand, tap again to collapse. No longer takes up screen space by default. (Day View panel)
- **Removed unused AI Observations import** from ExperienceList component (cleanup).

SPEC UPDATE NEEDED: Trip Overview layout changed from list/filmstrip to calendar grid. City geocoding is new backend behavior. AI Observations display behavior changed.

## 2026-03-05 (Login & Personalization)

### Changed
- **Login simplified**: No more access codes. The login screen shows four name buttons (Ken, Julie, Andy, Larisa). Tap your name, you're in. Everyone sees everything, can change anything. The changelog tracks who did what. (Login screen)

### Added
- **Personalized nudges (easter eggs)**: When a nearby place or experience matches a traveler's personal interests, a warm, specific message appears — like a thoughtful friend whispering a suggestion. Not a feature, not an alert — a quiet personal touch that appears only when it's relevant.
  - **Larisa**: ceramic frogs (for her mother), tulips, flower markets, ceramics studios (shared with Julie), local artisan gifts, sweet treats (custard, matcha, pastries), sports gear
  - **Andy**: Buddhist temples and meditation spots, Zen gardens, AI/tech innovation spaces, independent bookstores
  - **Julie**: ceramics and pottery studios (shared with Larisa), exceptional fresh produce, cooking classes, quality sportswear
  - **Ken**: AI/tech innovation, philosophy/bookstores, cooking classes, art galleries, Japanese culture
- Nudges appear in three places:
  1. **Daily greeting** — on first app open each day, a personalized overlay appears: "Good morning, Andy. I noticed Zen Meditation Temple is on your list today — thought you'd enjoy that one." Scans today's planned experiences against the traveler's interests. If no match, gives a warm generic greeting with the city name. Time-of-day aware (morning/afternoon/evening). Tap anywhere to dismiss. Shows once per day per user. (All screens, overlay)
  2. **Map nearby marker** — when tapping a nearby ghost marker that matches your interests, shows a card with the nudge and "Add to trip" / "Not now" buttons. Rate-limited to ~1 per 8 hours. (Plan screen)
  3. **Experience detail** — when viewing an experience that matches your interests, the nudge appears inline. No rate limit since user chose to look. (Experience Detail)

SPEC UPDATE NEEDED: Login flow changed from access codes to name buttons. Personalized nudge system (daily greeting + map nudges + detail nudges) is new and not in SPEC.md.

## 2026-03-05 (UX Polish — Power Made Visible)

### Added
- **Toast notification system**: Every action that touches the server now shows brief feedback at the bottom of the screen — "Added to itinerary," "Order saved," "Location confirmed," "Couldn't save order." Slides up, disappears after 3 seconds. Users always know whether their action worked. (All screens)
- **First-time guide overlays**: Each screen shows a one-time overlay on first visit explaining what you can do there. Two buttons: "Got it" (never show again) or "Remind me" (show again next session). Screens covered: Trip Overview, Plan, Day View, Now. (All screens)
- **Map legend**: Subtle legend in bottom-left of map showing what each marker color means — Planned, Possible, Nearby, Hotel. Replaces the need for the old Nearby toggle. (Plan screen, map area)
- **Friction indicator dots**: Amber dot on day cards in the selector strip when that day has 5+ experiences. Visual signal without text — tap the day to see details. (Plan screen, day selector)
- **Walking time hints between experiences**: When route order is active in Day View, shows estimated walking minutes between consecutive experiences (e.g. "8 min walk"). (Day View)

### Changed
- **Nearby markers always on**: Removed the Nearby toggle button. Ghost markers now appear automatically whenever the map has a center point. The visual hierarchy (ghost style, smallest scale) is the signal — no mode switching needed. (Plan screen, map)
- **Spatial sequence on by default**: Day View now shows experiences in walking-distance order by default (nearest-neighbor from hotel). "Use my order" lets you override; "Show route order" brings it back. Previously required finding and clicking "Suggest route order." (Day View)
- **Theme filters persist across axis switches**: Switching between Cities and Days no longer resets your theme filter. The filter is a lens on your whole trip, not tied to an axis. (Plan screen)
- **Accommodation details surfaced**: Check-in time, check-out time, confirmation number, and notes now display in Day View and Now screen wherever accommodations appear. Previously only showed name and address. (Day View, Now screen)
- **Reservation confirmation numbers surfaced**: Confirmation numbers now show in reservation cards in Day View and in the Now screen schedule. (Day View, Now screen)
- **Experience detail panel responsive**: On mobile, the detail panel is now full-screen instead of a 384px sidebar. Back button is labeled. Touch targets are larger. (Plan screen, mobile)
- **Mobile planning layout rebuilt**: On mobile, the experience list is now a full-screen view (toggled via list icon) instead of a cramped bottom drawer. Includes a bottom action bar with Capture and Day Details buttons. Map and list are separate views you switch between. (Plan screen, mobile)
- **Import preview stacks on mobile**: The three-column import preview now stacks to single column on narrow screens. (Plan screen, import panel)
- **Friction alerts styled as amber warnings**: Changed from neutral sand background to amber tint with amber text for clearer visual weight. (Day View)
- **"Refresh ratings" button renamed**: Now says "Update location & ratings" to clarify what it actually does. (Experience Detail)

### Fixed
- Silent failures on reorder, geocode, promote, demote, save, delete — all now show feedback via toast.
- Mobile bottom drawer was cramped and hard to dismiss — replaced with full-screen list view.

SPEC UPDATE NEEDED: First-time guide overlays, toast notifications, always-on nearby markers, default spatial ordering, and mobile layout are new UX patterns not in SPEC.md.

## 2026-03-05

### Added
- Yelp Fusion API ratings integration (backend/src/services/yelp.ts): searches Yelp for each experience by name and city, stores rating and review count in ExperienceRating table with platform "yelp" when match confidence > 0.5. Requires YELP_API_KEY env var; silently skips if not set.
- Foursquare Places API ratings integration (backend/src/services/foursquare.ts): searches Foursquare for each experience, fetches place details for the 10-point rating scale, stores in ExperienceRating with platform "foursquare". Requires FOURSQUARE_API_KEY env var; silently skips if not set.
- Enrichment pipeline now calls Yelp and Foursquare in parallel after geocoding (capture.ts enrichExperience). Ratings from all three platforms (Google, Yelp, Foursquare) are collected during capture enrichment.
- Theme filter chips on the Plan screen (PlanPage.tsx): horizontally scrollable row of theme buttons (ceramics, architecture, food, temples, nature, other) above the selector strip. Multiple themes can be active (OR filter). Filters both map markers and experience list. "Clear" button appears when any filter is active. Default is all experiences shown.

### Changed
- Exported stringSimilarity function from geocoding.ts so Yelp and Foursquare services can reuse it for match confidence checks.

SPEC UPDATE NEEDED: Sections covering ratings enrichment pipeline and theme filtering UI should be updated to reflect Yelp/Foursquare integration and the theme chip UI on the Plan screen.

### Added (PWA Offline Caching)
- PWA offline caching via service worker (vite-plugin-pwa with injectManifest strategy)
- App shell precaching: HTML, CSS, JS, fonts, and images are cached on first load
- NetworkFirst caching for API endpoints: /api/trips/active, /api/days/*, /api/experiences (3-second network timeout, then serves from cache)
- CacheFirst strategy for static assets (fonts, images, CSS/JS chunks) with 30-day expiry
- Now screen loads instantly from cache when offline — no network request required
- Offline capture queue: failed POST/PATCH requests stored in IndexedDB, replayed when connectivity returns (via Background Sync API and online event fallback)
- Subtle "Offline" indicator (small pill icon, bottom-right corner) — only visible when device is disconnected
- useOnlineStatus React hook for detecting network state changes
- Web app manifest (manifest.json) with Wander branding, sand-tone theme color #514636, standalone display mode
- Apple mobile web app meta tags for iOS PWA support

SPEC UPDATE NEEDED: Section 22.2 (Offline / Caching Strategy) — implementation now matches spec requirements for day data caching, Now screen offline loading, and capture queuing.

### Added (Leave-Time Calculation & Departure Handoff)
- Leave-time calculation backend route (POST /api/travel-time) that accepts origin/destination coordinates and travel mode (walk/transit/taxi), returns travel duration, buffer time, and calculated departure time. Uses Google Maps Distance Matrix API when GOOGLE_MAPS_API_KEY is set, otherwise falls back to haversine distance estimation with detour factor.
- Buffer times by mode: 10 min walking, 15 min transit, 5 min taxi.
- Now screen requests GPS position via navigator.geolocation; falls back to hotel coordinates if denied.
- Now screen calls travel-time API for each upcoming anchor with coordinates and displays "Leave by X:XX PM" prominently with breakdown (e.g., "12 min walk + 10 min buffer to [Name]").
- Travel mode selector (Walk / Transit / Taxi) on the Now screen next card.
- Auto-refresh: travel time recalculates every 60 seconds while the Now page is open.
- Departure handoff buttons below the timer: "Set alarm for X:XX PM" (deep link to iOS Shortcuts), "Open in Apple Maps" (maps.apple.com deep link), "Open in Google Maps" (google.com/maps deep link).
- Siri timer handoff remains as primary action, now using travel-time calculation for smarter timer duration.
- Leave-by times shown inline on each upcoming anchor in the full schedule list.

SPEC UPDATE NEEDED: Sections 20 (Leave-Time Engine) and 21 (Departure Handoff) now have working implementations.

### Added (AI Observations)
- AI Observations backend: POST /api/observations/day/:dayId and POST /api/observations/city/:cityId generate spatial clustering, day density, detour awareness, and ratings pattern observations using Claude Haiku
- AIObservations frontend component (frontend/src/components/AIObservations.tsx): displays observations as dismissible light blue-gray cards at the top of DayView and ExperienceList
- DayView renders AI observations above selected experiences when a day has selected experiences
- ExperienceList renders AI observations above the selected zone when selected experiences exist, scoped to the city
- Observations follow SPEC section 28 rules: no action-encouraging language, no raw ratings repetition, pattern-based synthesis only
- Fetched lazily on mount with ref-based deduplication to avoid re-fetching on re-renders

SPEC UPDATE NEEDED: Section 28 (AI Observations) is now implemented — SPEC should reflect endpoint details and integration points in DayView/ExperienceList.

### Added (Drag-and-Drop Reordering)
- ExperienceList now supports drag-and-drop reordering via @dnd-kit. Both selected and possible zones are drag-sortable.
- Each experience item has a grip handle (6-dot icon) on the left side for initiating drags.
- Dragging within the selected zone reorders and persists the new order via POST /api/experiences/reorder.
- Dragging within the possible zone reorders and persists similarly.
- Dragging from the possible zone into the selected zone triggers an inline day selector panel for promotion.
- Dragging from the selected zone into the possible zone triggers demotion.
- A drag overlay follows the cursor during drag for visual feedback.
- All existing functionality preserved: promote/demote buttons, ratings badges, click-to-detail.

### Added (Travel Geometry Overlay)
- MapCanvas now draws a convex hull polygon overlay around selected experiences with confirmed locations, using Google Maps Polygon API with sand-tone fill (low opacity).
- A small card overlay at top-center of the map shows two signals: "Span: X.X km" (max straight-line distance between any two selected experiences) and "Walking: ~XX min across" (span / 5 km/h, rounded to nearest 5 minutes).
- Both polygon and signals update in real-time as experiences are promoted or demoted.
- Overlay requires at least 2 located selected experiences to show the card, and at least 3 for the polygon.

SPEC UPDATE NEEDED: Sections covering drag-and-drop reordering (Section 14, Experience Reorder) and travel geometry (Section 16, Travel Geometry Overlay) should be updated to reflect these implementations.

### Fixed
- Removed duplicate reservations section in DayView that rendered reservations twice (once read-only, once with add button). Now only the interactive version with the add button is shown.

### Added (RatingsBadge Component)
- RatingsBadge component (frontend/src/components/RatingsBadge.tsx) shows compact inline ratings badges for Google (G), Yelp (Y), and Foursquare (4sq) with star rating and review count. Shows "Reviews are mixed on [platform]" warning for low ratings. Used in ExperienceList (both selected and possible items) and DayView.
- Rating-based border accents on possible experience items: green left border for high-rated (4.5+ / 8.5+ 4sq), amber left border for low-rated (< 3.8 / < 6.5 4sq).

## 2026-03-05 (cont.)

### Fixed (Day/City/Experience Lifecycle — 6 UX Issues)
- **Duplicate day creation**: Adding a city with dates that overlap existing placeholder days no longer creates duplicate days. Existing days are reassigned to the new city instead.
- **PATCH city dates no longer destroys day data**: Previously, changing a city's date range deleted ALL its days and recreated them from scratch — destroying reservations, notes, exploration zones, and experience assignments. Now only days falling outside the new range are removed, and existing days within range are preserved intact.
- **Experiences demoted when their day is removed**: When a day is deleted or falls outside a shrunk date range, selected experiences on that day are automatically demoted to "possible" instead of being left in a "selected" state with no day (invisible limbo).
- **Day reassignment moves experiences too**: When a day is reassigned from one city to another (via PATCH /api/days/:id or city date changes), experiences on that day now update their cityId to match. Previously an experience could belong to Tokyo's city list but render on a Kyoto day.
- **City deletion preserves experiences**: Deleting a city now moves its experiences to another city in the trip (demoted to "possible") instead of permanently cascade-deleting them. Only when no other city exists does cascade delete apply.
- **Placeholder notes cleared on reassignment**: Import-created placeholder days with "Unassigned — add city and activities" notes now have those notes cleared when the day is properly assigned to a city.

Affects: backend/src/routes/cities.ts, backend/src/routes/days.ts

### Fixed (Route Segment Deletion Limbo)
- **Route segment deletion now demotes experiences**: Deleting a route segment with promoted experiences left them in "selected" state with no day or segment (invisible limbo). Now experiences are demoted to "possible" before the segment is deleted. Found via chaos simulation S25.

Affects: backend/src/routes/routeSegments.ts

### Added (Chaos Simulation Test Suite)
- 50 chaos simulation tests (backend/tests/chaos.test.ts) covering 8 categories: trip shapes, date gymnastics, data preservation, experience flow, destructive operations, multi-user collaboration, import edge cases, and cascade integrity. Found and fixed 1 additional UX bug (route segment deletion limbo) during simulation. Total test count: 204.

SPEC UPDATE NEEDED: Sections covering city date management, day reassignment, city deletion, and route segment deletion should document the data preservation behaviors.

### Added (Conversational Chat Assistant)
- Two-way conversational chatbot (POST /api/chat) that can answer questions about trip data and perform all user actions via natural language. Uses Claude Haiku with tool_use to read trip state and execute operations (add/promote/demote experiences, manage cities/days, add reservations, reorder, search, etc.). All actions are logged to the change log with "(via chat)" attribution.
- ChatBubble frontend component (frontend/src/components/ChatBubble.tsx): subtle floating chat icon (bottom-right) that expands to a conversation panel. Responsive design: bottom sheet with backdrop on mobile (max 75vh), fixed-width side panel on desktop (384px). Sand-tone styling consistent with app palette.
- Pages auto-refresh when the chat performs data-changing actions via a custom `wander:data-changed` event. PlanPage, TripOverview, and NowPage all listen for this event.
- Chat context includes current page, trip ID, and active city/day for contextual responses.
- Example queries: "What's planned for Tuesday?", "Add Fushimi Inari to Kyoto", "Move the temple visit to day 3", "How many experiences in Osaka?"

Affects: backend/src/routes/chat.ts, backend/src/index.ts, frontend/src/components/ChatBubble.tsx, frontend/src/App.tsx, frontend/src/pages/PlanPage.tsx, frontend/src/pages/TripOverview.tsx, frontend/src/pages/NowPage.tsx

SPEC UPDATE NEEDED: A new section for the conversational assistant should be added to SPEC.md.

## 2026-03-05 (cont.)

### Added (Chat Tool Coverage Expansion)
- 5 new chat tools to close gaps found during page-by-page function audit:
  - `update_experience`: edit experience name, description, or personal notes via chat
  - `update_trip`: edit trip name or date range via chat
  - `delete_city`: remove a city (preserves experiences by moving to another city) via chat
  - `delete_reservation`: delete a reservation via chat
  - `get_change_log`: view/search recent trip change history via chat
- Chat assistant now covers 20 tools total (up from 15), matching all user-facing CRUD operations across TripOverview, PlanPage, DayView, ExperienceDetail, and HistoryPage
- Functions intentionally NOT covered by chat (device-dependent): travel time calculations (GPS), timer/alarm deep links, map share sheet, text/URL/image import (complex multi-step capture pipeline), nearby places discovery (map interaction)

Affects: backend/src/routes/chat.ts

### Changed (Import UX — Multi-City Smart Ingest)
- Import extraction now accepts a **start date hint** — if the source text uses "Day 1, Day 2" instead of real dates, the user specifies when the trip starts and the AI calculates actual dates. Added to both the CreateTrip import screen (new date picker above the paste area) and the PlanPage import panel.
- New **merge endpoint** (POST /api/import/merge): adds extracted cities, experiences, accommodations, and route segments to an existing trip instead of creating a new one. Matches extracted city names to existing cities (case-insensitive); creates new cities for unmatched ones. Expands trip date range if the new content falls outside it. Experiences are created as "possible" candidates in the correct city. Geocoding fires in background.
- **PlanPage Import panel upgraded**: now uses the full itinerary extractor (multi-city, multi-entity) instead of the simple single-city capture. Shows a compact review panel with new cities, experiences grouped by city, hotels, and route segments before merging. Existing cities are marked "(exists)" to clarify what's new.
- Two-step import flow on PlanPage: paste text → "Extract & Review" → review what was found → "Add to Trip" (or go back to edit).

Affects: backend/src/services/itineraryExtractor.ts, backend/src/routes/import.ts, frontend/src/components/CreateTrip.tsx, frontend/src/pages/PlanPage.tsx

SPEC UPDATE NEEDED: Import/capture section should document the start date hint, merge endpoint, and the upgraded PlanPage import flow.

### Changed (Extraction Prompt — Real-World Input Quality)
- Rewrote the itinerary extraction prompt to handle two common real-world input patterns:
  1. **Tour company itineraries** (Backroads, G Adventures, etc.): multiple activity levels per day are collapsed into one experience at the moderate option. Optional activities are included with "(optional)" note. Marketing copy, pricing, equipment specs, packing lists, and included-services lists are ignored. Accommodations with "begins N-night stay" produce one record, not N.
  2. **Informal planning notes**: arrow notation ("Tokyo (4 nights) → Mashiko (day trip)"), night counts, emoji bullets, weather analysis, date rankings, and personal opinions are all handled correctly. Weather/opinion sections are ignored as non-itinerary content.
- **Base city vs. day trip distinction** (most impactful change): the prompt now explicitly instructs the AI that a "city" is only a place where the traveler sleeps overnight. Day trips, excursions, and places visited for a few hours are created as EXPERIENCES under the base city, not as separate cities. This prevents the common error of creating 11 cities instead of 5 cities + 6 experiences.
- **Date chaining from night counts**: "Tokyo (4 nights) → Kyoto (3 nights)" with a start date hint now chains correctly — Tokyo Sep 28–Oct 1, Kyoto Oct 2–4, etc.
- **Route segments between base cities only**: day-trip destination routing arcs (Mashiko → Shigaraki → Bizen) are not mistaken for route segments between overnight stays.
- **Pre-processing step added**: strips cookie banners, navigation fragments, and excessive whitespace from browser pastes before they hit the AI. Truncates to 6000 chars to stay within context budget.

Affects: backend/src/services/itineraryExtractor.ts

## 2026-03-05 (cont.)

### Changed (Wave 1 UX — Foundation & Quick Wins)

#### Routes Axis Removed
- Removed "routes" from the axis switcher on PlanPage. Only "cities" and "days" axes remain. Route segments still exist in the data model and display on TripOverview, but they no longer have their own navigation axis on the planning screen. This simplifies the planning workflow — experiences are organized by city or by day, not by transit legs.

Affects: frontend/src/pages/PlanPage.tsx

#### Trip & City Taglines
- Added optional `tagline` field to Trip and City models in the database schema.
- TripOverview shows the trip tagline (italic, below the trip name) and city taglines (below each city name).
- Trip tagline is editable in the trip edit form (with placeholder "Ceramics, temples, and autumn leaves").
- PlanPage city selector strip shows the active city's tagline inline.
- DayView header shows the city tagline next to the city name.
- Backend PATCH routes for trips and cities now accept and persist `tagline`.

Affects: backend/prisma/schema.prisma, frontend/src/lib/types.ts, backend/src/routes/trips.ts, backend/src/routes/cities.ts, frontend/src/pages/TripOverview.tsx, frontend/src/pages/PlanPage.tsx, frontend/src/components/DayView.tsx

#### Personal Notes Prominence
- ExperienceList (both selected and possible zones) now shows `userNotes` inline below the description, in italic text.
- DayView selected and possible experience cards show `userNotes` inline.
- NowPage schedule items include personal notes in the detail line (concatenated with time window using a separator).

Affects: frontend/src/components/ExperienceList.tsx, frontend/src/components/DayView.tsx, frontend/src/pages/NowPage.tsx

#### Collaborative Presence Signals
- All experience items across ExperienceList and DayView now show "by [createdBy]" attribution in small text.
- TripOverview shows a "Recent Activity" section with the last 5 change log entries, showing who did what and when (relative timestamps like "2h ago").
- Recent activity data is fetched from the existing change-logs API.

Affects: frontend/src/components/ExperienceList.tsx, frontend/src/components/DayView.tsx, frontend/src/pages/TripOverview.tsx

SPEC UPDATE NEEDED: Sections covering the Plan screen axis switcher, experience display fields, trip/city metadata, and collaboration signals should be updated.

### Changed (Wave 2 UX — Day Experience)

#### Filmstrip Day Navigator
- When the Days axis is active on PlanPage, the selector strip is replaced with a visual filmstrip of day cards (~100-120px each). Each card shows:
  - A mini-map thumbnail from Google Maps Static API, centered on the day's experiences and accommodation at neighborhood zoom
  - Date and city name overlaid at the bottom
  - Experience count for that day
- If no Google Maps API key is set or no experiences have coordinates, a fallback letter initial is shown.
- The active day card has a highlighted ring and is slightly wider.
- Cities axis continues to use text chip pills.

Affects: frontend/src/pages/PlanPage.tsx

#### Contextual Day Card on Map
- When the Days axis is active and a day is selected, a floating info card appears at the top of the map showing: full date, city name, city tagline, planned experience count, exploration zone, and the first reservation if any.
- The card uses a frosted glass style (bg-white/90 backdrop-blur) and is max 384px wide.

Affects: frontend/src/pages/PlanPage.tsx

#### Day Shape — Suggested Spatial Sequence
- DayView now shows a "Suggest route order" toggle when a day has 2+ experiences with confirmed locations.
- When toggled on, experiences are reordered using a nearest-neighbor algorithm starting from the accommodation (or first experience). Time windows (morning/afternoon/evening) are respected as constraints.
- A "Use this order" button applies the spatial sequence as the new priority order via the reorder endpoint.
- The suggested sequence is informational and doesn't change saved order until explicitly applied.

Affects: frontend/src/components/DayView.tsx

#### Calendar Strip Promotion
- The day dropdown in the promote flow (both inline promote and cross-zone drag promote) is replaced with a horizontal scrollable calendar strip.
- Each day cell shows: short date (e.g., "Mon 18"), city abbreviation (e.g., "KYO"), with matching-city days highlighted in sand-tone.
- Tapping a cell immediately promotes the experience to that day — no separate confirmation step needed.
- Cancel button available below the strip.

Affects: frontend/src/components/ExperienceList.tsx

SPEC UPDATE NEEDED: Sections covering the day selector strip, experience promotion flow, day view, and map overlays should be updated to reflect filmstrip navigation, calendar strip promotion, spatial sequencing, and contextual map cards.

### Changed (Wave 3 UX — Welcome & Delight)

#### TripOverview Day Filmstrip
- The "Days" section on TripOverview is replaced with a horizontal scrollable filmstrip of day cards. Each card shows: short date, city name, and planned count (or "open day"). Tapping any card navigates to the Plan page.
- This gives new users immediate orientation on the trip's shape and density without needing to enter the planning screen.

Affects: frontend/src/pages/TripOverview.tsx

#### Now Screen as Morning Briefing
- Now screen header enhanced with: city tagline display, hotel navigate link (opens Apple Maps), and a quick summary line showing planned count and reservation count.
- Quick capture "+" button added to Now screen (Initiative 13: Low-friction Contribution): a minimal form with just a name field. City auto-set to today's city. Creates a possible experience instantly. Designed for Andy discovering a ramen shop while walking.
- Personal notes from experiences now surface in schedule items via the detail line.

Affects: frontend/src/pages/NowPage.tsx

#### Proactive Friction Alerts
- DayView now shows dismissible inline alerts for two friction patterns:
  1. **Density imbalance**: When a day has 5+ selected experiences and an adjacent day in the same city has 0-1, shows "[N] planned here — [day] is open."
  2. **Distance warning**: When consecutive selected experiences are more than 3km apart, shows "[A] and [B] are ~X.Xkm apart."
- Alerts are sand-toned (not red), non-blocking, and dismissible. Dismissed state persists in localStorage.

Affects: frontend/src/components/DayView.tsx

SPEC UPDATE NEEDED: Sections covering TripOverview layout, Now screen design, and friction alerts should be updated.

### Added (Wave 4 UX — Contribution & Discovery)

#### PWA Share Target
- Wander is now registered as a PWA share target in manifest.json. When a user shares a URL, text, or image from Safari/Instagram/etc., Wander appears in the iOS share sheet.
- New `/capture-share` route renders a lightweight capture screen pre-populated with the shared content: name (auto-extracted from text/URL), city selector, notes field, and a Save button.
- The user is back to their source app in under 5 seconds.

Affects: frontend/public/manifest.json, frontend/src/pages/CaptureSharePage.tsx, frontend/src/App.tsx

#### Experience Detail as Place Page
- ExperienceDetail panel redesigned to feel like a mini place page:
  - Map snippet: when no hero image exists but coordinates are confirmed, shows a Google Maps Static API street-level map centered on the location
  - Personal notes shown prominently above description in a highlighted background
  - Source link shows the domain name cleanly (e.g., "From: timeout.com/tokyo")
  - Attribution line shows creator name and date added
  - Promote flow uses the calendar strip (same as ExperienceList)

Affects: frontend/src/components/ExperienceDetail.tsx

#### Thematic Nearby Discovery
- Nearby places (Tier 3 ghost markers) now filter by active theme selection. When theme chips are active on PlanPage, the nearby request passes those themes to the backend.
- Backend maps Wander themes to Google Places types: ceramics → museum/art_gallery/store, food → restaurant/cafe/bakery/bar, temples → hindu_temple/buddhist_temple/place_of_worship, etc.
- When no theme filter is active, the default broad type set is used.

Affects: frontend/src/components/MapCanvas.tsx, frontend/src/pages/PlanPage.tsx, backend/src/routes/geocoding.ts, backend/src/services/geocoding.ts

#### Quick Capture on Now Screen
- "Add a discovery" button on the Now screen opens a minimal capture form: just a name field and Save button. City auto-set to today's city. Creates a possible experience instantly.
- Designed for the "Andy finds a ramen shop while walking" use case — contribution in under 5 seconds.

Affects: frontend/src/pages/NowPage.tsx

SPEC UPDATE NEEDED: Sections covering share target, experience detail, nearby discovery, and Now screen contribution flow should be updated.

## 2026-03-05 (cont.)

### Changed (Import UX — Unified Drop Zone & PDF Support)

#### Unified Import Zone
- CreateTrip screen consolidated from separate text area + file picker into a single intelligent input zone. Users can paste text, drop files (PDF or image), paste URLs, or paste screenshots — all in one area. The zone auto-detects input type and routes accordingly.
- Full-page drag overlay prevents Safari from opening dropped files as new pages.
- File chips show attached files with size and remove button.
- Start date hint collapsed by default, expandable when itinerary uses "Day 1, Day 2" notation.
- Removed redundant "Start from scratch" link at bottom (back button serves same purpose).

#### PDF Import Support
- File picker now accepts PDFs in addition to images (`image/*,.pdf,application/pdf`).
- Backend sends PDFs as `type: "document"` content blocks to Claude API (native PDF reading) instead of `type: "image"`.
- Multer file size limit raised from 10MB to 50MB for large tour company PDFs.

#### URL Import
- New `POST /import/extract-url` endpoint: fetches URL content server-side, strips HTML tags, extracts itinerary from text. Handles PDF URLs by downloading and sending as document blocks.
- CreateTrip auto-detects pasted URLs and routes to the URL extraction endpoint.

#### Collaboration Welcome
- When Andy or Julie first open a trip that Ken and Larisa have already been editing, a one-time welcome overlay appears: "Ken and Larisa have already started the Japan itinerary. Once you enter, you'll be collaborating on the trip and everyone will get your changes."
- Uses change log inspection to dynamically detect who has been active, rather than hardcoding names.

#### Login Screen Polish
- Changed "Who's exploring?" to "Who's wandering?" on the login screen.
- CreateTrip header includes identity bar with user name and sign-out button.

Affects: frontend/src/components/CreateTrip.tsx, frontend/src/pages/LoginPage.tsx, frontend/src/pages/TripOverview.tsx, backend/src/routes/import.ts, backend/src/services/itineraryExtractor.ts, frontend/src/components/CapturePanel.tsx

SPEC UPDATE NEEDED: Import flow, PDF support, URL extraction, collaboration welcome overlay, and login screen copy should be documented.

## 2026-03-06

### Changed (Plan Screen — Map + Filmstrip Redesign)

#### Map is the primary view
- Plan screen is now a full-screen map with a horizontal day filmstrip pinned to the bottom. The filmstrip is the only navigation — scroll through days, tap one to center the map on that day's neighborhood.
- Removed the cities/days axis switcher. Navigation is always by day (days belong to cities, so scrolling through days IS browsing cities).
- Removed theme filter chips from below the map. Category is now communicated through marker shape and color — no text filtering needed.
- Removed city pill selector. Redundant with the filmstrip (each day card shows its city name).
- Removed the map legend. Markers teach their own category when tapped.

#### Category-specific map markers
- Each experience theme has a distinct marker shape and color on the map:
  - **Food**: warm brown circle
  - **Temples**: muted red diamond (rotated square)
  - **Ceramics**: blue rounded square
  - **Architecture**: gray square
  - **Nature**: green tall pill
  - **Accommodation**: dark rounded-bottom square
- Three tiers expressed by size and opacity: Planned (large, full), Possible (medium, 70%), Nearby (small, 50%).
- Tapping any marker opens the detail card, which shows the category — teaching the user what each shape means.
- Nearby ghost markers are also themed based on their Google Places types.

#### Filmstrip navigation
- Day cards show mini-map thumbnail, date, city name, and planned count. Amber friction dot when a day has 5+ experiences.
- First tap on a day card: selects it, centers the map. Second tap on the already-active card: opens the Day View detail panel.
- Desktop: side panel shows experience list or day view. Mobile: full-screen list toggle preserved.

#### Flow and labeling fixes
- TripOverview: "Start Planning" renamed to "Open Map" — because by the time you see it, you've already started planning via import.
- TripOverview: post-import orientation card: "Your trip is set up — X cities, Y days, Z experiences ready to explore. You can always add more with Import."
- PlanPage: first-visit orientation banner: "Your itinerary is on the map. Scroll the days below to explore, or tap + Import to add more."
- Import button in the Plan screen top bar is more visible and clearly labeled "+ Import".
- FirstTimeGuide text on TripOverview updated to match new button names.

Affects: frontend/src/components/MapCanvas.tsx, frontend/src/pages/PlanPage.tsx, frontend/src/pages/TripOverview.tsx

SPEC UPDATE NEEDED: Plan screen layout, marker system, navigation model, and flow labeling should be updated in SPEC.md.
