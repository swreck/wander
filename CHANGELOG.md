# Wander Change Log

SPEC.md is canonical. CHANGELOG.md records implemented behavior changes and flags when SPEC needs updates.

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
