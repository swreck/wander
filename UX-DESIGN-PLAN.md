# Wander UX Design Plan

**Purpose:** Comprehensive design for the next phase of Wander, organized into buildable initiatives. Each initiative states the problem, the design, what changes, and what it depends on. Ordered by impact, not by difficulty.

**Governing principle:** Wander must welcome, delight, and surprise with value so that every trip member — including the one who never planned to plan — becomes an equal participant. The app earns engagement before asking for contribution.

---

## Initiative 1: The First Open

**Problem:** Andy gets an access code from Ken. He opens Wander for the first time. Right now he lands on TripOverview — a list of cities, a count of experiences, and a "Start Planning" button. This looks like Ken's spreadsheet. Andy has no reason to come back.

**Design:** The first time a user opens an active trip they didn't create, the experience should feel like arriving in a new city — oriented, not overwhelmed, with something personally interesting visible immediately.

**1a. Arrival screen (replaces TripOverview for non-creator first visit)**

Instead of the stats view, show a map-first overview with the trip's geographic footprint:
- A fitted map showing all cities as labeled pins connected by route lines
- The trip name and dates as a quiet header
- Below the map: a horizontally scrollable **filmstrip** of days. Each cell shows:
  - The date (Mon Oct 18)
  - The city name
  - A small **contextual map thumbnail** — not a generic Google map, but a pre-rendered crop centered on that day's experiences and accommodation at a neighborhood-level zoom. If there are 3 things in Higashiyama, the thumbnail shows Higashiyama, not all of Kyoto. If there are no experiences yet, the thumbnail shows the hotel location at district zoom.
  - A count: "3 planned" or "open day"
- Tapping a filmstrip cell opens the day view directly — no intermediate screens.
- Below the filmstrip: "What's been added recently" — the 3 most recent experiences added by anyone, with who added them. This signals that the trip is alive and collaborative, not a static document.

**1b. Personal relevance signal**

On first open (and periodically after), surface one "discovery" — a highly-rated place near something already planned that matches a broad interest category. Not a recommendation — a quiet card: "Near Tuesday's lunch spot: Raku Museum (ceramics, 4.7 stars)." Tappable to see on map or save. Dismissible. Never repeated once dismissed.

This is how Andy discovers value he didn't expect. He didn't ask for it. The app just knew something useful about where he's going.

**Depends on:** Geocoded experiences, Google Places API, existing ratings data.

---

## Initiative 2: The Filmstrip Day Navigator

**Problem:** The current selector strip shows day chips as "Mar 14 - Kyoto" — flat text pills that all look the same. You can't tell busy days from empty days, or distinguish neighborhoods. You said it: the user wants "local maps that are applicable, not just a Google map one has to orient and zoom."

**Design:** Replace the text chip selector strip (on Days axis) with a visual filmstrip:

- Each cell is a small card (~120px wide) containing:
  - A **mini-map thumbnail** rendered at neighborhood zoom, centered on the centroid of that day's confirmed-location experiences (or the accommodation if no experiences). The zoom level is set so that all of the day's experiences fit with ~20% padding. This means a day with experiences clustered in one neighborhood shows that neighborhood; a day with experiences spread across a city shows more of the city.
  - Date and city name overlaid at the bottom of the thumbnail in a semi-transparent bar.
  - A subtle density indicator: small dots (1-5) representing how many selected experiences are on that day.
  - The accommodation name in tiny text if one exists.
- The active cell is slightly larger with a highlighted border. Scrubbing works exactly as the current strip — drag to browse, tap to select.
- On mobile (where horizontal space is tighter), the cells are narrower but still show the mini-map.

**Rendering the mini-maps:**

These are not live Google Maps instances (that would be 25 iframes). They are **static map images** from the Google Maps Static API — a single URL per thumbnail that returns a PNG at the right zoom, centered on the right coordinates, with small markers for experiences. These images are generated on the backend when day data changes (experiences promoted/demoted, accommodation changed) and cached. The frontend loads them as regular `<img>` tags. Cost is negligible — Static Maps API is within free tier for this volume.

**The filmstrip replaces the selector strip only on the Days axis.** Cities axis keeps text chips. Routes axis is removed per earlier recommendation.

**Depends on:** Google Maps Static API key (same key as existing), a backend endpoint to generate/cache static map URLs, geocoded experience coordinates.

---

## Initiative 3: Remove the Routes Axis

**Problem:** The Routes axis (Cities / Days / **Routes** in the axis switcher) suggests planning experiences during transit segments. For Japan shinkansen trips, this doesn't apply — transit is 2 hours of sitting. The axis adds cognitive overhead without earning its place.

**Design:**
- Remove "Routes" from the axis switcher. The switcher becomes just Cities / Days.
- Route segments remain in the data model and are visible on TripOverview and as contextual information (lines connecting cities on the map).
- Route segment data is still importable and shown in the import review.
- Experiences can no longer be assigned to route segments (simplifies the promotion flow — always assign to a day).
- The promotion UI drops the "Add to a Day / Add to a Route Segment" choice — it always assigns to a day.

**Migration:** Any experiences currently assigned to route segments get demoted to "possible" on deploy.

**Depends on:** Nothing. This is a removal, not an addition.

---

## Initiative 4: Calendar Strip Promotion

**Problem:** Promoting an experience requires selecting from a dropdown of 25 days. You need to already know your plan to build your plan.

**Design:** Replace the day dropdown in the promotion flow with a **visual calendar strip**:

- When you tap "Add to Itinerary" on an experience, instead of a dropdown, a compact horizontal strip appears showing all days as small cells:
  - Each cell shows: short date (Mon 18), city initial or abbreviation (KYO), and a fill indicator (empty / 1-2 / 3+ experiences already planned).
  - Days in the same city as the experience are highlighted. Days in other cities are dimmed but tappable (cross-city promotion is allowed but visually de-emphasized).
  - The strip auto-scrolls to center on days matching the experience's city.
- Tapping a cell immediately promotes. No confirmation step needed (demotion is one tap, so promotion should be equally lightweight).
- The optional time window input appears inline after promotion, not before — "Added to Mon Oct 20. Set a time? Morning / Afternoon / Evening / Skip."

This also works in drag-and-drop: when you drag an experience from the possible zone upward, the calendar strip appears as a drop target row above the selected zone.

**Depends on:** Nothing beyond existing data.

---

## Initiative 5: Personal Notes Prominence

**Problem:** Larisa's ceramics research has rich context — "crusty ones," "birth place of Japanese porcelain." This is the reason you're visiting a place. Currently it's buried in a userNotes field behind a tap into ExperienceDetail.

**Design:**
- On the Now screen, each upcoming anchor that has personal notes shows them directly — a single line of the user's note text in a slightly different color, visible without tapping. "🔥 crusty ones — atmospheric firing" appears right under "Shigaraki" in the schedule.
- In DayView, personal notes appear as a subtle italic line below each experience name. No tap required.
- In ExperienceList (PlanPage side panel), personal notes show as a truncated line below the description, before the ratings badges.
- The field label changes from "Why I saved this" to just "Notes" — it's not a justification, it's context that travels with the experience.

**Depends on:** Nothing. Display-only changes across 4 components.

---

## Initiative 6: City/Trip Taglines

**Problem:** The trip has a narrative arc (ceramics exploration, then cycling adventure) but the app treats every city as an equal-weight item in a list. The trip feels like a spreadsheet, not a story.

**Design:**
- Add a `tagline` field to the City model (optional, short text, max 60 chars).
- Taglines appear everywhere the city name appears: selector strip chips, TripOverview city list, DayView header, filmstrip cells.
- Display format: "Kyoto — temples & ceramics" or "Nikko — mountain cycling."
- Settable via: ExperienceList city header area (click to edit), chat ("set Kyoto's tagline to 'temples & ceramics'"), import extraction (the AI can suggest taglines based on the itinerary content).
- Also add a `tagline` field to the Trip model for the overall trip: "Japan 2026 — clay and wheels."

**Depends on:** Prisma schema change (two new optional string fields). Minimal.

---

## Initiative 7: Day Shape — Suggested Spatial Sequence

**Problem:** A day is a flat priority-ordered list. But a real day has geography — you walk from the hotel to a neighborhood, spend the morning, move somewhere for lunch, do an afternoon thing nearby. The app doesn't help you see or build that spatial narrative.

**Design:**

When a day has 2+ selected experiences with confirmed locations, the DayView can show a **suggested sequence** — a reordering of experiences based on geographic proximity, starting from the accommodation:

- Algorithm: nearest-neighbor from hotel → closest experience → next closest unvisited → ... (simple greedy, no API call needed — straight-line distance from geocoded coordinates).
- Display: a subtle "Suggested route" toggle at the top of the selected zone. When active, experiences reorder to the spatial sequence and a numbered route line appears on the map connecting them in order.
- The suggested sequence is informational. It doesn't change the saved priority order. Tapping "Use this order" applies the spatial sequence as the new priority order (calls the reorder endpoint).
- The map route line uses a dotted style in the sand-tone palette — it's a suggestion, not a GPS route.
- If the user has already set time windows (morning, afternoon, evening), the sequence respects those as constraints — morning items come first regardless of geography.

**Depends on:** Geocoded experiences only. No new API calls.

---

## Initiative 8: Proactive Friction Alerts

**Problem:** The plan doesn't tell you when something is off. You can put 6 experiences on Tuesday and 0 on Wednesday. You can schedule something in Kyoto on a day you're staying in Tokyo. The system knows this is wrong but stays silent.

**Design:**

Subtle, dismissible alerts that appear contextually — not as a separate notification system, but inline where the friction exists:

- **Density imbalance**: When a day has 5+ selected experiences and an adjacent day in the same city has 0-1, show a quiet line at the bottom of the overloaded day's card: "6 planned here — Wednesday is open." No action button, just awareness.
- **Geography mismatch**: When an experience is promoted to a day in a different city than the experience's cityId, show: "This is in Kyoto but you're staying in Tokyo on this day." Allow it (the user may be doing a day trip) but flag it.
- **Travel time warning**: When two consecutive selected experiences on the same day are more than 45 minutes walking apart (using geocoded coordinates and straight-line estimate), show: "These are ~4km apart." Inline, under the second experience in the day view.
- **Reservation proximity**: When a reservation time is within 30 minutes of a travel-time estimate from the previous anchor, show: "Tight timing — [Restaurant] is 25 min from [Temple]."

All alerts are:
- Inline, not modal or toast
- Dismissible per-instance (dismissed state stored in localStorage, not the database)
- Sand-toned, low contrast — not red, not urgent. Informational.
- Never blocking any action

**Depends on:** Geocoded coordinates, travel time estimates (existing), reservation data.

---

## Initiative 9: Share Target (iOS/PWA)

**Problem:** Larisa finds a restaurant on Instagram or reads an article in Safari. Her natural action is to share it. Right now, she'd have to open Wander, navigate to the right city, open capture, and paste. That's 6 taps too many.

**Design:**

Register Wander as a PWA share target so it appears in the iOS/Android share sheet:

- In `manifest.json`, add `share_target` configuration that accepts text, URLs, and files.
- When shared to Wander, the app opens to a **lightweight capture screen**:
  - Shows the shared content (URL title, text preview, or image)
  - City selector (defaults to the most recently viewed city, or the current city if GPS is available during the trip)
  - Personal notes field
  - "Save" button
- The save action creates a possible experience via the capture pipeline, same as today. Enrichment runs in background.
- The user is back to Safari/Instagram in under 5 seconds.

**PWA share_target spec:**
```json
"share_target": {
  "action": "/capture-share",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "title": "name",
    "text": "text",
    "url": "url",
    "files": [{ "name": "image", "accept": ["image/*"] }]
  }
}
```

A new route `/capture-share` renders the lightweight capture screen, pre-populated with the shared data.

**Depends on:** PWA manifest changes, one new frontend route, existing capture backend.

---

## Initiative 10: Thematic Nearby Discovery

**Problem:** You've decided to visit Fushimi Inari. What else is nearby that matches your interests? The current Nearby button shows generic Google Places results. The user cares about ceramics, architecture, and food — not convenience stores.

**Design:**

Replace the generic Nearby toggle with a **theme-aware nearby discovery**:

- When an experience is selected on the map (tapped), and the user has active theme filters (or even without them, using the trip's most common themes), the Tier 3 ghost markers are filtered to relevant categories:
  - ceramics → "museum," "art_gallery," "store" with ceramics/pottery in name
  - architecture → "church," "hindu_temple," "landmark," "museum"
  - food → "restaurant," "cafe," "bakery," "bar"
  - temples → "hindu_temple," "buddhist_temple," "place_of_worship"
  - nature → "park," "natural_feature"
- Additionally, show a **proximity ring** on the map — a subtle circle at 500m and 1km from the selected experience, so the user can instantly see what's walkable.
- Tapping a Tier 3 marker now shows a richer card: name, rating, distance from the selected experience ("350m from Fushimi Inari"), category, and a one-tap "Save to trip" button.

**Depends on:** Google Places API (existing), theme filter state, geocoded experience coordinates.

---

## Initiative 11: What's Happening on the Map (Contextual Map Cards)

**Problem:** The map shows pins, but you have to tap each one to learn anything. When you scrub to a new day on the filmstrip, the map updates but there's no immediate narrative about what this day looks like spatially.

**Design:**

When the Days axis is active and a day is selected, show a small **context card** floating at the top of the map (similar to the existing travel geometry card, but richer):

- Line 1: "Tuesday Oct 20 — Kyoto, Higashiyama" (day, city, exploration zone if set)
- Line 2: "3 planned · 2.1 km span · ~25 min walking" (from existing travel geometry calculation)
- Line 3 (only if there's a reservation): "Dinner: Kikunoi 7:30 PM"
- If tagline exists: shown as a subtitle under the city name

This card gives immediate orientation when scrubbing through days. You don't need to open the side panel to understand the day.

On mobile, this card appears as a compact bar between the map and the filmstrip.

**Depends on:** Travel geometry calculations (existing), reservation data, exploration zone data.

---

## Initiative 12: Wander as a Morning Briefing

**Problem:** Julie opens Wander on the morning of Day 3 in Kyoto. She didn't build the plan. She needs to feel oriented and informed in under 10 seconds, with no prior familiarity with the planning interface.

**Design:** Redesign the Now screen to work as a self-contained daily briefing for any trip member:

**Top section — "Today"**
- City name and date, large and clear
- Hotel name and a "navigate" link (opens in Apple/Google Maps)
- Weather: current conditions and high/low (via a free weather API or simply a link to weather.com for the city — no need to build a weather service)
- Tagline if set: "Kyoto — temples & ceramics"

**Middle section — "Your Day"**
- A **timeline view** (not a list) showing anchors spaced proportionally by time:
  - 9 AM: Fushimi Inari — "🔥 atmospheric firing" (personal note visible)
  - 12 PM: Open (no anchor — the gap is visible as breathing room)
  - 1 PM: Kikunoi (reservation)
  - 3 PM: Philosopher's Path
  - 7 PM: Return to hotel
- The "next" anchor is highlighted with the leave-by time prominent
- Past anchors are faded
- Each anchor with coordinates shows a tiny inline distance from current position or hotel: "2.4 km from hotel"

**Bottom section — "Around You"**
- Only visible during the trip (when GPS is available)
- Shows 3-5 nearby interesting places that are NOT already in the plan — thematically relevant, highly rated
- Each one shows: name, distance, one-line description, "Save" button
- This is the "surprise and delight" — Julie discovers a ceramics gallery she walks past on the way to lunch

**Key design principle:** The Now screen works with zero prior interaction with the planning interface. Julie has never seen PlanPage. She doesn't need to. The Now screen is her entire Wander experience, and it should be complete.

**Depends on:** Existing day/experience/reservation data, GPS, Google Places API for nearby discovery.

---

## Initiative 13: Low-Friction Contribution

**Problem:** Andy sees something interesting on the Now screen's "Around You" section, or he finds a great ramen shop while walking. Contributing this to the trip needs to be effortless.

**Design:**

Three contribution paths, each under 5 seconds:

**Path A — Save from "Around You":** One tap on the "Save" button next to a nearby discovery. It becomes a possible experience in the current city. Done.

**Path B — Share target:** Andy shares a Google Maps link from his phone. Wander opens, shows the place name, he taps Save. Done. (Initiative 9)

**Path C — Quick capture on Now screen:** A small "+" button on the Now screen (not just PlanPage). Tapping it opens a minimal capture: just a name field and a Save button. City is auto-set to today's city. No mode tabs, no city selector, no description field — just the name. Everything else can be added later.

The change log shows "Andy added 'Ramen Ichiran' to Kyoto" — Ken and Larisa see this next time they open the app, making Andy's contribution visible and valued.

**Depends on:** Existing capture backend, Now screen layout changes.

---

## Initiative 14: Collaborative Presence Signals

**Problem:** Collaboration feels invisible. If Larisa adds 5 experiences to Kyoto while Ken is planning Tokyo, Ken doesn't know until he switches to Kyoto. There's no sense that the trip is being built together.

**Design:**

Subtle, non-intrusive signals that other trip members are active:

- **Recent activity indicator on TripOverview:** "Larisa added 3 experiences to Kyoto · 20 min ago" — one line, most recent activity by anyone other than the current user.
- **"New since your last visit" badges:** When you open PlanPage for a city, experiences added by others since your last visit to that city have a subtle "new" dot (fades after you've viewed them). Not a notification — a visual signal.
- **Change attribution in lists:** In the ExperienceList, each experience shows a tiny "by Ken" or "by Larisa" label. This is already in the data model (createdBy). Just surface it.

What this does NOT include:
- No real-time presence ("Larisa is viewing Kyoto right now")
- No typing indicators
- No push notifications
- No conflict resolution UI

The goal is to make contribution feel acknowledged, not to build a real-time collaboration system.

**Depends on:** Existing changeLog data, createdBy field on experiences. Minimal backend changes.

---

## Initiative 15: Experience Detail as a Place Page

**Problem:** The ExperienceDetail panel is currently an edit form — name, description, notes, promote/demote buttons. It's functional but it doesn't help you understand the place.

**Design:** Make the detail panel feel like a mini place page:

- **Hero image** (already exists, just needs better sizing and a fallback to a Google Street View static image via coordinates)
- **Map snippet** — a small static map showing just this experience's location at street level, with the accommodation marker for context ("12 min walk from hotel")
- **Personal notes** — prominent, above the description, in a slightly different background color. This is why someone saved this place.
- **Ratings** — existing badges, unchanged
- **"Nearby in your trip"** — 2-3 other experiences in the same trip that are within 500m, shown as small tappable links. This reveals spatial relationships: "oh, this temple is right next to the ceramics shop we're already visiting."
- **Source link** — if the experience came from a URL capture, show it as a clean link: "From: timeout.com/tokyo"
- **Added by** — "Larisa saved this · Mar 2" — attribution and timestamp

The detail panel should make someone who has never heard of this place understand why it's in the trip and where it fits spatially.

**Depends on:** Google Maps Static API (for map snippet), geocoded coordinates, existing data fields.

---

## Build Sequence Recommendation

These initiatives have natural dependencies and groupings. Here's how I'd sequence them:

**Wave 1 — Foundation & Quick Wins (highest impact, lowest risk):**
- Initiative 3: Remove Routes axis (simplification, unblocks cleaner promotion)
- Initiative 5: Personal notes prominence (display changes only, immediate value for all users)
- Initiative 6: City/trip taglines (tiny schema change, big narrative impact)
- Initiative 14: Collaborative presence signals (surfacing existing data)

**Wave 2 — The Day Experience (the filmstrip + day shape):**
- Initiative 2: Filmstrip day navigator (the most visible UX upgrade)
- Initiative 11: Contextual map cards (pairs with filmstrip — orientation when scrubbing)
- Initiative 7: Day shape — suggested spatial sequence (makes days feel planned, not listed)
- Initiative 4: Calendar strip promotion (smoother promotion flow)

**Wave 3 — Welcome & Delight (the first-open experience):**
- Initiative 1: The First Open (arrival screen, personal relevance signal)
- Initiative 12: Now screen as morning briefing (Julie's entire app experience)
- Initiative 8: Proactive friction alerts (the plan tells you when something's off)

**Wave 4 — Contribution & Discovery:**
- Initiative 9: Share target (Larisa's share-from-Safari flow)
- Initiative 13: Low-friction contribution (Andy's ramen shop discovery)
- Initiative 10: Thematic nearby discovery (interest-aware Tier 3 markers)
- Initiative 15: Experience detail as place page (richer understanding of each place)

---

## What This Plan Does Not Include

Things I considered and deliberately excluded:

- **Real-time collaboration (WebSocket sync):** The change log + refresh-on-open model is sufficient for a 4-person trusted group. Real-time sync adds complexity without proportional value.
- **Per-user interest profiles:** Tempting (Andy likes food, Larisa likes ceramics), but premature. Theme filtering already exists. Personal profiles would require onboarding friction that contradicts "welcome and delight."
- **Voting or consensus features:** "Should we go to this restaurant? Vote!" — this isn't how trusted travel groups work. They talk to each other. The app should stay out of interpersonal negotiation.
- **Itinerary versioning / undo history:** The change log already tracks every state change. A full undo system is engineering complexity that doesn't match how trips are planned (forward, not backward).
- **Social/public features:** Trip sharing with non-members, trip templates, community features. Wander is for your group. Period.
- **Push notifications:** These interrupt. Wander's principle is "the app is valuable when you open it," not "the app demands your attention." The one exception might be a departure-time alert during the trip, but even that should be a timer handoff to the OS, not a push notification.
