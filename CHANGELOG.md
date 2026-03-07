# Wander Change Log

SPEC.md is canonical. CHANGELOG.md records implemented behavior changes and flags when SPEC needs updates.

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
