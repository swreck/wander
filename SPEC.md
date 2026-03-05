# Wander — Complete Product Specification for Claude Code

**Version:** 3.0 — Final Unified Master Document
**Prepared for:** Claude Code autonomous development
**Date:** March 2026

This document is the single authoritative specification for the Wander travel planning and execution application. It supersedes all prior drafts, addenda, audit documents, and partial specifications. Claude Code must not invent any architectural, UX, or behavioral decision not explicitly addressed here. Where this document provides a decision, that decision is final. Where this document acknowledges uncertainty, it says so explicitly and provides the preferred resolution path.

---

## 1. Product Identity and Purpose

Wander is a web application that bridges the gap between travel research and travel execution for small, trusted travel groups. It is not a travel discovery platform. It is not a booking platform. It is not a social travel application.

Wander begins at the moment a traveler notices something worth considering — a restaurant mentioned in a travel writer's article, a ceramics studio recommended by a friend, a temple described in a blog post. Everything before that moment happens outside Wander. Everything after that moment — capture, evaluation, spatial reasoning, day planning, and real-time execution — happens inside Wander.

The product must feel like a trusted, calm travel companion. It must never feel like it is improvising. It must never feel like a toy. It must never reorganize, rewrite, or reinterpret the user's plan without explicit instruction.

---

## 2. Non-Negotiable Product Principles

These principles govern every implementation decision. When Claude Code faces a choice not explicitly addressed in this document, it must resolve that choice by asking which option best honors these principles.

**The itinerary is sacred.** Nothing in the itinerary moves, changes, or disappears without an explicit user action. No automatic reorganization. No AI-driven restructuring. No silent updates.

**The map is the center.** Every screen that involves planning or execution is built around a persistent map. Lists, panels, and drawers are secondary surfaces layered on top of the map. The map never disappears behind a full-screen list.

**Capture never blocks.** The act of saving an experience must never wait for enrichment, geocoding, ratings lookup, or AI processing to complete. Capture is instant. Everything else happens asynchronously afterward.

**The system reveals, the user decides.** Spatial clusters, travel distances, ratings signals, and AI observations are information surfaces, not recommendations. The system never automatically promotes, demotes, or sequences experiences. Every state change requires a user gesture.

**Trust over cleverness.** A deterministic, reliable answer beats an impressive but uncertain one. This applies to location data (never show a map pin without verified coordinates), ratings (never average conflicting sources), and travel time estimates (never show a time based on an assumed transportation mode).

**Execution clarity above all.** During travel, the application must load the current day's information immediately, answer the four critical questions (where am I, what is next, when should I leave, what matters right now), and hand off reliably to native device features.

**Smart, never chatty.** The application expresses its intelligence through clarity, timeliness, and the quality of information it surfaces — never through conversational language, action encouragement, or behavioral prompting. The app does not tell users what to do. It does not say "let's" anything. It does not frame information as suggestions to act. The sole exceptions are genuinely time-sensitive alerts with real consequences: departure warnings, reservation windows closing, transportation departures approaching. Those alerts are direct and specific. Everything else is silent, visual, and informational.

**No modal UI.** Modal dialogs, blocking overlays, and full-screen interruptions are undesirable. Every piece of information the app knows should be expressible within the persistent canvas. Panels slide in. Drawers open. Details expand inline. Nothing should interrupt the map view with a blocking overlay except the absolute minimum required for destructive action confirmation (permanent deletion only).

**Visual density reflects travel reality.** Travel days contain few anchors. The interface must reflect this with open space rather than dense timelines. This principle applies to every screen, not just day view. Information is shown with breathing room. Lists are not packed. The UI feels spacious and navigable at all times.

---

## 3. Target Users and Use Context

Wander is built for a small, trusted travel group of approximately two to six people. All group members share access to the same trip data. All group members can view and modify the plan. The application is not designed for strangers, large groups, or public sharing.

The primary user is an experienced traveler who already has a working planning process — browser research, notes capture, and spreadsheet-based itinerary management. Wander replaces that process without imposing new structure. The system must respect that experienced travelers already know which city an experience belongs to, already have opinions about which experiences are worth including, and do not need the application to tell them what to do.

**Planning context:** primarily Mac and iPad, larger screens, more deliberate interaction, richer simultaneous panels visible.

**Execution context:** primarily iPhone, map-first, one-handed interaction, immediate information access, frequent reference while walking.

All features must be available on all devices. The layout adapts to device size but no feature is locked to a specific device.

---

## 4. Technical Stack — Explicit and Non-Negotiable

Claude Code must implement Wander using exactly the following stack. No substitutions without explicit user approval.

**Frontend:**
- React 19 with TypeScript
- Vite as build tool and dev server
- Dev server runs on port 5173
- API calls proxied to localhost:3001 during development
- Tailwind CSS for styling

**Backend:**
- Node.js with Express 5 and TypeScript
- ESM modules throughout ("type": "module" in package.json)
- Prisma ORM for all database interactions
- dotenv/config for environment variable loading
- Source structure: src/routes/, src/services/, src/middleware/

**Database:**
- Neon PostgreSQL exclusively
- Connection via DATABASE_URL environment variable
- All schema changes managed through Prisma migrations
- No Redis, no additional data stores

**Image Storage:**
- Cloudinary for all image storage and delivery
- Cloudinary handles upload from multiple sources including file upload, URL fetch, and base64 encoded screenshots
- Cloudinary public IDs stored in the database, not full URLs, to allow URL transformation at render time
- Free tier is sufficient for this use case

**Mapping:**
- Google Maps JavaScript API exclusively
- Google Maps handles map rendering, marker display, clustering, geocoding, and travel time calculation
- Google Places API handles ratings enrichment (primary source) and live nearby place discovery
- No other mapping libraries

**Ratings APIs:**
- Google Places API (primary — strongest global coverage)
- Yelp Fusion API (secondary — strong US, UK, Australia coverage)
- Foursquare Places API (tertiary — good international coverage, fills gaps where Yelp is weak)
- All three are free at the scale of this application
- TripAdvisor is explicitly excluded — their API requires business partnership approval not available to individual developers

**Deployment:**
- Railway for all deployment — single unified deployment
- Frontend is built into dist/, copied into backend/public/, served as static files by Express
- Backend serves both the API and the static frontend from one Railway service
- Nixpacks builder
- railway.toml handles build: compile frontend, copy dist to backend/public, start node dist/index.js
- No Vercel, no Render, no split deployment

**Environment Variables Required:**
- DATABASE_URL (Neon PostgreSQL connection string)
- GOOGLE_MAPS_API_KEY
- GOOGLE_PLACES_API_KEY
- YELP_API_KEY
- FOURSQUARE_API_KEY
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- JWT_SECRET (for session management)
- ACCESS_CODES (structured format: CODE:DisplayName pairs, comma-separated — e.g., ABC123:Ken,DEF456:Larisa,GHI789:Kyler)

---

## 5. Authentication and Access Control

Wander uses a pre-generated access code system. There are no usernames, no passwords, no email verification, no OAuth providers, and no password reset flows.

**How it works:**
- The administrator (primary user) generates a set of access codes before the trip
- Each traveler receives one unique access code
- The login screen presents a single input field: "Enter your access code"
- Access codes and their associated display names are stored in the ACCESS_CODES environment variable using the format: CODE:DisplayName pairs, comma-separated. Example: `ACCESS_CODES=ABC123:Ken,DEF456:Larisa,GHI789:Kyler`
- If the entered code matches any valid code, the user is authenticated and their display name is loaded from the paired value
- The display name is used throughout the application and in the change log to identify who made each action

**Code management:**
- Access codes and their associated display names are configured in environment variables
- The administrator can add new codes by updating the environment variable and redeploying
- Codes do not expire during a trip
- There is no user account creation flow inside the application

**Session handling:**
- JWT-based session tokens, consistent with existing projects
- Sessions persist across browser closes so travelers do not need to re-enter codes constantly
- Session expiry is set to 30 days

**Security posture:**
- This is a low-security application for a trusted group
- The goal is friction-free access, not enterprise security
- Basic abuse prevention only — no aggressive rate limiting

---

## 6. Core Data Model

### 6.1 Trip

A trip is the top-level container for all planning and execution data.

Fields:
- id
- name (e.g., "Japan 2026")
- start_date
- end_date
- status: active | archived
- created_at
- updated_at

Rules:
- Only one trip may have status "active" at a time
- When a new trip is created and set to active, the previous active trip is automatically archived
- Archived trips are fully preserved with all experiences, itinerary data, images, and change log entries
- Archived trips are read-only — no edits permitted
- Multiple simultaneous active trips is a future enhancement, not built in v1

### 6.2 Route Segment

A route segment represents a major leg of travel between cities.

Fields:
- id
- trip_id
- origin_city
- destination_city
- sequence_order
- transport_mode: flight | train | ferry | drive | other
- departure_date
- notes

### 6.3 City

A city represents a base location where the group stays overnight.

Fields:
- id
- trip_id
- name
- country
- latitude
- longitude
- sequence_order
- arrival_date
- departure_date

### 6.4 Day

A day represents a single calendar date within the trip.

Fields:
- id
- trip_id
- city_id (the base city for that day)
- date
- exploration_zone (optional text description, e.g., "Gion district")
- notes

### 6.5 Experience

An experience is the core entity. It begins in the Possible state and may be promoted to Selected.

Fields:
- id
- trip_id
- city_id (required — every experience belongs to a base city)
- name
- description (narrative text, the primary capture content)
- source_url (optional link to original article or page)
- source_text (optional raw text from capture)
- location_status: unlocated | pending | confirmed
- latitude (null until confirmed)
- longitude (null until confirmed)
- place_id_google (for Places API enrichment)
- state: possible | selected
- day_id (null if possible, assigned when selected via day — mutually exclusive with route_segment_id)
- route_segment_id (null if possible, assigned when selected via route segment — mutually exclusive with day_id)
- time_window (optional text, e.g., "morning" or "2:00 PM")
- transport_mode_to_here: walk | transit | taxi | null (used for leave-time calculation on Now screen, not for spatial overlay)
- exploration_zone_association (optional)
- priority_order (integer, used for ordering within possible or selected lists)
- cloudinary_image_id (primary representative image)
- themes (array: ceramics | architecture | food | temples | nature | other)
- user_notes
- created_by (access code of creating user)
- created_at
- updated_at

### 6.6 Experience Ratings

Ratings are stored separately to support multiple platforms per experience.

Fields:
- id
- experience_id
- platform: google | yelp | foursquare
- rating_value (decimal)
- review_count
- last_refreshed_at
- raw_response (JSON, for debugging and future use)

### 6.7 Accommodation

Hotels and accommodation anchors for each day.

Fields:
- id
- trip_id
- city_id
- day_id
- name
- address
- latitude
- longitude
- check_in_time
- check_out_time
- confirmation_number (optional)
- notes

### 6.8 Reservation

Dinner reservations and other timed commitments.

Fields:
- id
- trip_id
- day_id
- name
- type: restaurant | activity | transport | other
- datetime
- duration_minutes (optional)
- latitude
- longitude
- confirmation_number (optional)
- notes
- transport_mode_to_here: walk | transit | taxi | null

### 6.9 Change Log

Every state change in the application is logged. This log is permanent and never pruned.

Fields:
- id
- trip_id
- user_code (the access code of the user who made the change)
- user_display_name
- action_type: experience_created | experience_promoted | experience_demoted | experience_edited | experience_deleted | day_note_edited | reservation_created | reservation_edited | trip_created | accommodation_added | other
- entity_type: experience | day | reservation | accommodation | trip
- entity_id
- entity_name (human-readable name of the affected item, stored at time of action)
- description (human-readable description of what changed, e.g., "Promoted Tokyo National Museum to Day 4")
- previous_state (JSON snapshot of entity before change)
- new_state (JSON snapshot of entity after change)
- created_at

---

## 7. Trip Lifecycle and Initiation

### 7.1 Creating a New Trip

When no active trip exists, the application presents a trip creation screen. This screen must be simple and fast. Fields:

- Trip name
- Start date
- End date
- Cities (ordered list of base cities, each with arrival and departure dates)
- Route segments (automatically inferred from city sequence, user can adjust transport mode)

The trip creation screen must not ask for experiences. It creates only the structural skeleton: dates, cities, and route segments.

### 7.2 Trip Initiation from Existing Itinerary Document

Many trips begin with a pre-existing document — a tour group itinerary, a travel agent document, or a structured list from an AI chatbot. Wander must support importing this document as the foundation of the trip skeleton.

**Supported input formats:**
- Screenshots (one or multiple) — OCR extraction required
- Copied text from any source including AI chatbot output, email, or article
- URLs to web pages containing itinerary information
- Structured or semi-structured lists from AI assistants

**Extraction process:**
1. User pastes, uploads, or screenshots the source document on the trip creation screen
2. AI extraction runs immediately, parsing the content for: dates, city names, hotel names, activity names, reservation details, transportation segments
3. The system presents a structured review screen showing all extracted items organized by day
4. Each extracted item is shown with its source text highlighted so the user can verify accuracy
5. User confirms, edits, or removes individual items before committing
6. User taps "Create Trip from This Itinerary" to commit all confirmed items
7. Confirmed items become the trip skeleton: cities, days, accommodations, and reservations populate automatically
8. Experiences extracted from the document are created in the Selected state and assigned to their respective days

**Critical rule:** Nothing is committed to the database until the user explicitly confirms. Extraction is always followed by review. Review is always followed by explicit user confirmation. There is no automatic commit.

**Handling partial documents:**
If the imported document covers only part of the trip (e.g., 8 of 22 days are a tour group itinerary), the remaining days are created as empty day placeholders. The user then defines the cities and activities for those days through normal planning flow.

**Handling list-format captures:**
When any capture event — import, paste, screenshot, or URL — produces content that appears to contain multiple distinct experiences (bullet points, numbered list, paragraph-separated descriptions), the system detects the list structure and presents a non-blocking choice:
- "Create one candidate per item" (best-effort parsing into individual experience records)
- "Keep as one entry" (store as a single experience with full raw text)

This choice is presented inline, never as a blocking modal. If parsing fails or is ambiguous, store as one candidate with raw text and proceed immediately. Parsing must never block or delay capture.

---

## 8. The Experience Funnel

All experiences move through exactly two states: Possible and Selected. There is no intermediate state.

**Possible:** The experience has caught the user's attention and been captured. It is a candidate for the trip. The user has not yet decided it deserves time in the itinerary. A city typically contains five to twenty possible experiences at any time — this scale informs UI decisions about list density, scroll behavior, and pagination.

**Selected:** The experience has been promoted into the itinerary. It is assigned to either a specific day or a specific route segment. It appears as a committed item in the day's or route segment's structure.

**There is no "Contender" or "Shortlist" state.** Users move directly from Possible to Selected or back.

**Promotion** requires: assigning either a day or a route segment (required), and optionally assigning a time window and transportation mode to the experience.

**Demotion** moves an experience back to Possible and removes its day assignment, route segment assignment, time window, and transportation mode. The experience is not deleted. No confirmation dialog is required for demotion — it is easily reversible.

**Deletion** is permanent and always requires a confirmation dialog with the experience name shown explicitly: "Are you sure you want to delete [Fushimi Inari Shrine]? This cannot be undone." This is the only modal dialog permitted in the application.

---

## 9. Capture System

### 9.1 Capture Philosophy

Capture must be the fastest action in the application. A user reading an article on their phone who notices a ceramics studio must be able to save it in under ten seconds. Capture is instant. Enrichment is asynchronous. Nothing about the capture flow waits for any external process.

### 9.2 Supported Capture Sources

**Browser screenshots:**
The most common capture method. User takes a screenshot of an article, map, or listing and uploads it to Wander. OCR extracts text. AI identifies the experience name, description, and any visible ratings or location information.

**Copied text:**
User copies text from any source — article, email, AI chatbot output — and pastes into the capture interface. AI parses the text for experience names and descriptions. If the text is a list, the list-format capture flow applies (Section 7.2).

**URL paste:**
User pastes a link. The system fetches the page and extracts title, description, images, and any visible ratings. If the URL is a Google Maps or Yelp listing, the system extracts structured data directly.

**AI chatbot output:**
Treated identically to copied text. The system is optimized to handle semi-structured list output from AI assistants, which may include bullet points, numbered lists, or paragraph descriptions of multiple places.

**Manual entry:**
User types the experience name and description directly. Always available as a fallback.

### 9.3 Capture Interface

The capture interface is accessible from every screen via a persistent capture button (bottom right, prominent, always visible).

The capture interface presents:
- An input area accepting paste (text or image), file upload, or camera capture
- City association selector (required before saving — user selects which base city this experience belongs to, presented as a simple tap list of the trip's cities)
- Optional: user note ("why I saved this")
- A "Save" button that commits immediately without waiting for enrichment

The city association selector must not attempt to guess the city. The user selects it explicitly. Experienced travelers always know which city an experience belongs to.

### 9.4 What Capture Creates

Each capture event creates one or more Experience records in the Possible state with:
- City association (from user selection)
- Name (extracted or entered)
- Description (extracted narrative text)
- Source reference (URL, "screenshot," or "manual")
- Location status: unlocated (until geocoding completes asynchronously)
- State: possible
- Created_by: current user's access code

### 9.5 Post-Capture Enrichment (Asynchronous)

After capture commits, the following enrichment happens in the background while the app is open:

**Geocoding:** System attempts to locate the experience using Google Places API, matching on name and city. If a confident match is found, latitude, longitude, and place_id_google are stored and location_status updates to "confirmed." If no confident match is found, location_status remains "unlocated" and the user sees the location affordance indicator. Geocoding runs automatically with no user action required unless confirmation is needed.

**Image extraction:** If the capture included a URL or screenshot, the system extracts the most representative image and uploads it to Cloudinary. The Cloudinary public ID is stored in the experience record.

**Ratings enrichment:** Triggered by capture as described in Section 11.

Enrichment results update the experience record silently. The user does not need to wait or take action unless geocoding requires confirmation.

---

## 10. Location and Geocoding Model

### 10.1 Location Status States

Every experience has one of three location statuses:

**Unlocated:** No coordinates. The experience was just captured and geocoding has not yet completed, or geocoding failed to find a confident match. The experience appears in lists and can be used in all planning flows, but does not appear as a map marker.

**Pending:** Geocoding has returned a potential match but confidence is below threshold. The system presents the match to the user for confirmation before committing.

**Confirmed:** Coordinates are verified. The experience appears as a map marker at the appropriate tier. Spatial overlay calculations include this experience.

### 10.2 Unlocated UI Affordance

Unlocated experiences in any list show a consistent visual indicator — a small location pin icon with a question mark, or the text "Location needed" — displayed inline within the list item. This indicator is not a badge or alert; it is a quiet signal integrated into the item's layout.

Tapping this indicator opens a location resolution panel (slides in, does not block the map):
- Shows the top geocoding match (name, address, map preview)
- "This is correct" button confirms and sets status to confirmed
- "Search for location" opens a map search where the user can drop a pin or search by name
- "Skip for now" dismisses without changing status

### 10.3 Map Marker Rule

**Hard rule: No experience appears as a map marker until its location_status is "confirmed."** A misleading map pin is worse than no map pin. The map must be completely trustworthy at all times.

---

## 11. Ratings Enrichment System

### 11.1 Philosophy

Ratings in Wander serve one purpose: sanity checking. Users have already discovered experiences through credible narrative sources. Ratings answer a single question: "Is there evidence this place is disappointing?"

Ratings must never:
- Drive automatic sorting of experiences
- Prevent promotion from Possible to Selected
- Be averaged across platforms
- Dominate the visual design of experience cards
- Be used by AI to recommend or discourage any experience

Ratings must always:
- Appear as secondary, compact visual indicators
- Show multiple sources without combining them
- Display discrepancies honestly (a Google 4.6 alongside a Yelp 3.9 is informative — the discrepancy itself has meaning)
- Remain visually subordinate to the experience name and description

### 11.2 Enrichment Timing and Triggers

Ratings are fetched from external APIs under specific conditions:

**At capture time:** If the captured source (URL or screenshot) contains visible ratings from Google, Yelp, or Foursquare, those ratings are extracted and stored immediately as part of capture processing.

**While the app is open — specific triggers:**
1. An experience card is viewed (user opens detail view)
2. A city is loaded on the map (user navigates to a city on the selector strip)
3. Background enrichment process runs for experiences with no ratings or ratings older than 7 days

**When the app is closed:** No ratings enrichment occurs under any circumstances. The system makes no background API calls when closed.

### 11.3 API Implementation

**Google Places API:** Search by name and city, use place_id for detail fetch. Store rating and user_ratings_total.

**Yelp Fusion API:** Search by term (name) and location (city). Match on name similarity. Store rating and review_count. Yelp's international coverage is thinner than Google or Foursquare — if no result returned, store nothing and show nothing.

**Foursquare Places API:** Search by name and near (city). Match on name similarity. Store rating and stats.total_ratings. Foursquare covers international destinations well and serves as the primary fallback when Yelp returns nothing. Note: Foursquare uses a 10-point scale — display ratings as-is without converting to a 5-point scale.

**Matching confidence rule:** Only store a ratings result if the returned place name matches the experience name with high confidence using a standard string similarity library (e.g., Levenshtein distance or Jaro-Winkler). A low-confidence match is worse than no match and must be discarded.

**Silent failure rule:** If any platform returns no result or a low-confidence match, store nothing for that platform and show nothing in the UI. Never show a failed ratings badge, "not found" indicator, or any error state related to ratings. Absence of a platform's rating is completely invisible to the user.

### 11.4 Ratings Display

On experience cards, ratings appear as compact badges below the experience description:

Example: `G ★ 4.6 (1.2k)  Y ★ 4.1 (340)  4sq 8.2 (190)`

Platform abbreviations: G = Google, Y = Yelp, 4sq = Foursquare.

Only platforms with confirmed data are shown. If only Google has data, only Google appears.

### 11.5 Low Rating Warning

If any single platform returns a rating below 3.8 (Google/Yelp scale) or below 6.5 (Foursquare scale), the experience card shows a subtle warning text beneath the ratings badges: "Reviews are mixed on [Platform]."

This warning does not prevent any user action. It is informational only. It does not use alarming colors or prominent visual treatment.

### 11.6 Ratings Conditional Formatting in Lists

When experiences appear in the candidate list alongside the map, ratings provide subtle visual conditional formatting:

- Experiences with strong ratings (Google/Yelp ≥ 4.5 or Foursquare ≥ 8.5) show a subtle positive left border tint (soft green)
- Experiences with mixed ratings (any platform below the warning threshold) show a subtle cautionary left border tint (soft amber)
- Experiences with no ratings data show no border treatment

This formatting is a passive scan signal only. It must be conservative and understated — noticeable on close inspection but not visually dominant. It must never feel gamified or ranking-like.

### 11.7 AI Ratings Synthesis

The AI may use ratings data as one input when generating observations about an experience. When it does, the AI must synthesize patterns from review data rather than repeating raw review text or scores. Example of acceptable AI observation using ratings context: "Several reviewers mention advance reservation is required here." Example of unacceptable behavior: "This place has a 4.6 on Google with 1,284 reviews." The raw score display is already handled by the ratings badges — the AI adds no value by repeating numbers.

---

## 12. Image Storage and Management

### 12.1 Cloudinary Integration

All experience images are stored in Cloudinary. The database stores only the Cloudinary public_id, not the full URL. URLs are constructed at render time using Cloudinary's URL SDK, allowing image transformation (resize, crop, format optimization) at delivery time.

### 12.2 Image Sources

Images enter Wander through three paths:

**From URL capture:** When a URL is pasted, the system fetches the page, identifies the most representative image (og:image preferred), downloads it, and uploads to Cloudinary.

**From screenshot capture:** When a screenshot is uploaded, the full screenshot is uploaded to Cloudinary. A basic cropping UI allows the user to select the relevant portion if the screenshot contains extraneous content.

**From manual upload:** User can upload any image file directly from their device.

### 12.3 Image Display

Each experience card shows one representative image. The image is displayed using Cloudinary's transformation URLs sized appropriately for the display context (list thumbnail vs. detail view full width).

If no image has been captured for an experience, show a neutral placeholder — a simple gray area with the experience name. Do not show a broken image state.

---

## 13. The Spatial Canvas

The spatial canvas is the primary UI surface of Wander. It is not one screen among many — it is the persistent foundation that every planning and execution view is built on top of. The City Exploration view, the Day Planning view, and the Execution view are all the same canvas operating in different axis contexts. They are not separate screens.

The canvas consists of:
- A full-screen Google Map (the base layer, always visible)
- A selector strip anchored to the bottom of the screen (the navigation control)
- An experience list panel (slides in from the right on larger screens, drawer from bottom on phone)
- A capture button (persistent, bottom right)
- A "Now" button visible during travel dates (bottom left)
- A History button with unread indicator (top right or accessible from trip overview)

The map is never replaced by a full-screen list. On iPhone, lists appear as partial-screen drawers that leave the map partially visible above. On iPad and Mac, lists appear as persistent side panels alongside the map.

---

## 14. Navigation Axes

### 14.1 Overview

The spatial canvas supports three navigation axes. Only one axis is active at a time as the primary navigator. The active axis determines what the selector strip shows. Non-active axes serve as contextual information layers — their data remains visible on the map in a de-emphasized form to provide spatial orientation.

**Cities axis:** Selector strip shows base cities. Map shows all experiences associated with the selected city at full visibility. Transportation segments and route paths are shown as contextual overlays.

**Days axis:** Selector strip shows individual trip days. Map shows the hotel, selected experiences, and nearby possible experiences for the selected day. City context (which base city this day belongs to) is shown as a map label. Transportation segments for travel days are shown as day anchors.

**Routes axis:** Selector strip shows route segments (e.g., Tokyo → Kyoto). Map shows cities along the segment, experiences near each stop, rail stations and transportation hubs along the route, and transportation infrastructure. City-specific experiences appear de-emphasized as context.

### 14.2 Dynamic Axis Role

Each axis can function as either the Navigator (primary selector, determining map focus) or as Context (information shown in de-emphasized form on the map while another axis is primary).

Example: When navigating by Days axis, transportation segments become contextual — they appear on the map but are not interactive selectors. When navigating by Routes axis, individual days become contextual — the day structure is visible but the route is the primary frame.

This dynamic role means the map always shows the full picture; only the interactive emphasis shifts.

### 14.3 Axis Switcher

Above or beside the selector strip is a small axis label showing the current axis name and a chevron: "Cities ▲" or "Days ▲" or "Routes ▲."

Tapping this label opens a small floating chooser with three options. Selecting an option replaces the selector strip content immediately. The map transitions to show the appropriate context. The selected item within the new axis defaults to the most contextually relevant item (e.g., if switching from Days to Cities, the map centers on the city corresponding to the previously selected day).

### 14.4 Selector Strip Behavior (Scrub Bar)

The selector strip behaves like a Live Photo frame selector — a compact horizontal row of labeled items that the user drags across to explore contexts.

- Items are rendered as compact chips or tabs
- As the user scrubs (drags), the map updates in real time
- When the user releases, the strip snaps to the nearest item
- The currently active item is visually distinguished (larger, highlighted)
- The strip supports both scrubbing (drag) and tapping individual items

The scrub interaction model is identical regardless of which axis is active. The axis changes the content of the strip; the interaction never changes. This is a core usability principle — one interaction learned once.

### 14.5 Context Persistence

Switching axes or scrubbing to a new item never loses or resets planning data. Experiences in the Selected state remain selected. Experiences in the Possible state remain in their city association. Nothing disappears — items outside the current view context are de-emphasized, but the underlying data is unchanged and always recoverable.

---

## 15. Three-Tier Map Marker System

The map displays three tiers of markers simultaneously at all times — during planning and during execution. There is no mode that hides any tier. The visual hierarchy communicates the relationship between the tiers without requiring labels or controls.

**Tier 1 — Selected Experiences (full weight):**
Bold markers, full opacity, filled style, larger size. These are experiences committed to the itinerary. They are anchored to their day visually. Accommodations and reservations also appear at Tier 1 weight as they are also committed anchors.

**Tier 2 — Saved Possible Experiences (reduced weight):**
Lighter markers, lower opacity, outlined style rather than filled, smaller size. These are experiences the group has captured and is considering. They are present on the map as spatial information — showing where candidates are located relative to the plan — but visually subordinate to committed items.

**Tier 3 — Live Nearby High-Rated Places (ghost weight):**
Very subtle markers, minimal opacity, ghost style. These are places the group has never saved in Wander, surfaced in real time from Google Places API based on the current map view. They represent highly-rated restaurants, museums, landmarks, iconic buildings, and points of interest that happen to be near the current planning or execution context.

Tier 3 markers appear only for places that meet a high rating threshold (Google Places rating ≥ 4.4 with meaningful review count). They are categories: restaurants, museums, landmarks, religious sites, markets. They are not generic POIs.

Tier 3 markers are tappable. Tapping one opens a compact detail card showing the place name, category, rating, a brief description if available, and an option to save it as a new Possible experience in Wander. This card slides in from the bottom or side — it does not block the map.

Tier 3 markers are fetched and refreshed as the map viewport changes. They are never prefetched or cached — they represent what is currently visible on the map. On the Now screen during execution, Tier 3 markers near the current GPS position are especially relevant as opportunistic detour candidates.

### 15.1 Theme Filtering

The map includes a theme filter control that allows the user to filter which experiences are visible by theme. Themes available for filtering: Ceramics, Architecture, Food, Temples, Nature, Other.

The theme filter is a multi-select control — multiple themes can be active simultaneously. When theme filters are active, only experiences matching the selected themes are shown on the map. Tier 3 (live nearby) markers are filtered by equivalent Google Places categories when theme filters are active.

The theme filter control is compact and unobtrusive — a horizontal scrollable row of small theme chips above the selector strip or in the list panel header. Active filters are visually distinguished. "All" is the default state with all themes visible.

### 15.2 Map Interactions

Users can perform the following interactions with the map:

- Tap any marker (Tier 1, 2, or 3) to see a compact summary card
- Expand a cluster to see individual markers
- Drag the map to pan freely
- Pinch to zoom
- Filter by themes (see 15.1)
- The three-tier visual system is always active — no toggle is needed because the visual hierarchy itself communicates the distinction at all times

### 15.3 Passive Spatial Intelligence

The map quietly and continuously reveals spatial structure without requiring user action:

- **Geographic clusters:** Experiences that are geographically proximate naturally cluster, revealing walking groups and natural half-day groupings
- **Items reachable within short time:** Experiences within approximately 15 minutes walking of a current selection are visually distinguishable from those that require major travel — implemented via proximity rings or visual proximity emphasis
- **Items requiring major travel:** Experiences more than approximately 45 minutes walking from the current day's hotel or primary cluster are visually de-emphasized within the Tier 2 display, signaling that they require dedicated travel commitment
- **Natural walking groups:** When three or more experiences fall within a small geographic area, a subtle convex hull or proximity indicator highlights the grouping

These signals are visual and passive. They require no user action and trigger no notifications or suggestions.

---

## 16. Spatial Consequence Visualization (Travel Geometry Overlay)

### 16.1 Purpose

When a user is planning a day and promotes experiences into the Selected state, the map should immediately convey how much ground the selected experiences cover. This is a passive signal — it reveals spatial consequence without making a recommendation.

### 16.2 Overlay Behavior

When two or more selected experiences for a given day have confirmed locations, the map displays a travel geometry overlay.

The overlay is implemented as one of the following (Claude Code chooses the most visually clean implementation):
- Smallest enclosing circle
- Smallest enclosing ellipse
- Convex hull polygon

The overlay is rendered as a subtle semi-transparent shape — low opacity fill, soft border — that does not obscure map content or Tier 3 markers.

### 16.3 Numeric Signal

Alongside the overlay, the map displays two numeric signals:

**"Span: 4.2 km"** — the maximum straight-line distance between any two selected experiences for that day.

**"Walking: ~50 min across"** — the implied walking time across that span (calculated as span distance ÷ average walking speed of 5 km/h, rounded to nearest 5 minutes).

Both signals are shown simultaneously. The user understands that transit or taxi reduces the walking time — the system does not state this.

### 16.4 Real-Time Update

When the user drags an experience into or out of the Selected zone, the overlay and numeric signals update in real time. This creates an immediate, visceral sense of the spatial cost of including or excluding an experience.

### 16.5 Transportation Mode Note

The travel geometry overlay always uses straight-line distance and implied walking time. Transportation mode tags on individual experiences (walk, transit, taxi) are used only by the leave-time calculation on the Now screen — they do not affect the overlay. This separation is intentional: the overlay is a planning tool that makes no assumptions about how the group will move; the Now screen is an execution tool that uses the specified mode for precise calculations.

### 16.6 Restraint

The overlay does not suggest routes. It does not suggest optimal ordering. It does not calculate total walking time for the day. It shows only the footprint of the current selection. It is a calm constraint visualization, not a planner.

---

## 17. In-Canvas Promotion UI

### 17.1 Concept

When navigating by Cities axis or Days axis, the experience list panel shows all experiences associated with the current context, divided into two zones.

### 17.2 Selected Zone and Candidate Zone

The list is vertically partitioned:

**Selected zone (top):** Experiences promoted into the itinerary for the current day or city context. Items here have a day or route segment assigned.

**Candidate zone (below the divider):** Experiences in the Possible state associated with this city. Not yet committed to the itinerary.

A visible, labeled divider separates the zones. The divider shows the count of items in each zone: "3 Selected · 8 Possible."

### 17.3 Drag and Drop

Each list item has a drag handle (left side, standard grip icon).

Drag behaviors:
- **Drag up across the divider into Selected zone:** Triggers the promotion flow — a compact inline panel appears (not a modal) asking for day or route segment assignment (required) and optional time window. Confirming commits the promotion.
- **Drag down across the divider into Candidate zone:** Demotes the experience back to Possible. Day assignment, route segment assignment, and time window are cleared. No confirmation required.
- **Drag within Selected zone:** Reorders priority among selected experiences. This order is meaningful as a user expression of priority but does not force specific scheduling times.
- **Drag within Candidate zone:** Reorders priority among possible experiences. This order is preserved and meaningful.

### 17.4 Promotion via Tap

Tapping an experience in the Candidate zone opens the Experience Detail view. Within that view, a prominent "Add to Itinerary" button triggers the same promotion flow as drag-to-selected.

### 17.5 Promotion Flow Detail

When promotion is triggered (by drag or tap), the system presents an inline panel (not a modal overlay):
- **Assignment type:** "Add to a Day" or "Add to a Route Segment" — user chooses which
- **Day selector** (if day chosen): shows all trip days with their dates and base city
- **Route segment selector** (if route segment chosen): shows all route segments with origin and destination cities
- **Time window:** optional text field (e.g., "morning," "2:00 PM," "after lunch")
- **"Add to [Day/Segment Name]"** confirm button
- **"Cancel"** to abort without any change

On confirmation, the experience moves to the Selected zone, the map marker transitions to Tier 1 visual weight, and the travel geometry overlay updates immediately.

### 17.6 Capacity Guidance

Wander does not enforce a maximum number of selected experiences per day. Capacity guidance is communicated entirely through the spatial consequence overlay (Section 16) — the growing span distance and walking time signal naturally communicates over-selection without the system imposing a cap.

---

## 18. Day View

### 18.1 Access

Day view is the spatial canvas operating on the Days axis with a specific day selected on the selector strip. It is not a separate screen.

### 18.2 Day Structure

A day is organized around anchors — fixed, time-bound commitments. Anchors include:

- **Hotel** (shown at top as the day's base — check-in or check-out details visible if relevant)
- **Transportation segment** (shown as a day anchor when the group moves between cities on that day — includes mode, origin, destination, and any departure time if known)
- **Selected experiences** (shown in priority order, with optional time windows)
- **Dinner reservation** (shown at its scheduled time)

Between anchors, the day has intentional open space. The UI must reflect this openness — dense timeline views are explicitly prohibited. The day should feel spacious and navigable, not packed. Anchors are separated by generous vertical space. The empty time between anchors is represented as breathing room, not as slots to fill.

### 18.3 Exploration Zone

Below the anchors, the day view may show an exploration zone — a neighborhood or district the group plans to explore that day (e.g., "Gion district"). This is a text field the user populates.

When an exploration zone is defined, the map biases its display of nearby Possible experiences to favor those geographically near the zone's name (resolved to coordinates via Google Maps geocoding). This is a display bias, not a filter — experiences outside the zone are not hidden, they are de-prioritized in the list ordering.

### 18.4 Nearby Possible Experiences in Day View

Within the day view, the Possible experiences for that city are shown in the Candidate zone, ordered by proximity to the day's selected experiences and exploration zone. This ordering is spatial and informational — it does not remove or hide any experiences.

---

## 19. Execution Mode — The "Now" Screen

### 19.1 Access and Visibility

The "Now" button is visible in the bottom left of the spatial canvas during the active travel dates of the trip (from trip start date to trip end date inclusive). Outside those dates, the button is hidden.

Tapping "Now" opens the execution screen. The execution screen must load immediately from local cache — no network request is required or made for the initial load. All data for today must be available offline.

### 19.2 Four Questions

The Now screen must immediately and unambiguously answer:

1. **Where am I?** — Today's hotel and base city, shown at top
2. **What is next today?** — The next upcoming anchor (experience, reservation, or transportation) based on current time
3. **When should I leave?** — The calculated departure time for the next anchor (see Section 20)
4. **What matters right now?** — Time-sensitive information only: approaching departure time (within 60 minutes), a reservation window that opens soon, a transportation departure approaching. These alerts are specific and factual — no behavioral language, no action encouragement beyond the bare fact.

### 19.3 Today's Full Schedule

Below the four answers, the Now screen shows today's complete day structure — all anchors in chronological order, with a current time indicator showing position within the day. Past anchors are visually de-emphasized. The next anchor is visually prominent. Future anchors are shown at normal weight.

### 19.4 Opportunistic Awareness

If the current time is more than 30 minutes before the calculated departure time for the next anchor, the Now screen map shows Tier 3 ghost markers near the current GPS position. These represent high-rated nearby places (restaurants, landmarks, museums) that could be visited in the available time window. No text suggestion is shown — the markers are visible on the map and tappable for detail. The user notices them or doesn't. The app does not prompt action.

This section requires GPS to be active. If GPS is unavailable, no opportunistic markers are shown.

---

## 20. Leave-Time Calculation

### 20.1 Calculation Logic

For each upcoming anchor with a known location, the system calculates a recommended departure time:

1. Determine destination coordinates (from experience, reservation, or accommodation record)
2. Determine transportation mode (from transport_mode_to_here field on the anchor, default: walk)
3. Query Google Maps Distance Matrix API for travel time from current location (GPS if available, hotel if not) to destination using the specified mode
4. Add buffer time: 10 minutes for walking, 15 minutes for transit, 5 minutes for taxi
5. Subtract total (travel time + buffer) from anchor time to get departure time

**Example:**
- Dinner reservation: 7:30 PM
- Transport mode: walk
- Google Maps walking time: 38 minutes
- Buffer: 10 minutes
- Recommended departure: 6:42 PM

### 20.2 Display

The departure time is displayed prominently on the Now screen:

**"Leave by 6:42 PM"** in large, clear type.

Below it in smaller type: "38 min walk + 10 min buffer to [Reservation Name]"

### 20.3 Dynamic Update

While the app is open, this calculation updates every 60 seconds using the current GPS position as the origin. If GPS is unavailable, the calculation uses the day's hotel coordinates as the origin.

### 20.4 Transportation Mode Default

If no transportation mode is specified for an anchor, the system defaults to walking and shows a small inline indicator: "Assuming walk · change." The word "change" is tappable and opens a compact inline selector for walk, transit, or taxi, which recalculates departure time immediately on selection.

---

## 21. Departure Handoff

The web application cannot send notifications or fire alarms when the browser is closed or the screen is locked. This is a fundamental web platform constraint. The application handles this by providing excellent handoff to native device capabilities. The timer handoff is primary. The original specification's description of alarm as "most trusted" is superseded by this specification — the timer via Siri is the primary and preferred handoff mechanism for this application.

### 21.1 Primary Handoff: Timer

The primary departure handoff is a timer.

The Now screen displays prominently below the departure time:

**"Set a [38] minute timer"** — displayed as a prominent tappable button.

Tapping this button triggers a Siri deep link pre-composing the command: "Set a 38 minute timer." The user's Apple Watch picks up this timer automatically. The timer fires on the watch at the departure moment.

The timer duration is calculated as: minutes from now to recommended departure time, rounded to the nearest minute.

### 21.2 Secondary Handoff Options

Below the timer button, secondary handoff options appear as smaller, less prominent buttons:

- **"Set alarm for 6:42 PM"** — Opens iPhone Clock app with alarm pre-set to departure time
- **"Create reminder for 6:42 PM"** — Opens iOS Reminders with a reminder pre-set to departure time
- **"Add to Calendar"** — Creates a calendar event titled "Leave for [Destination]" at the departure time
- **"Open in Apple Maps"** — Launches Apple Maps with the destination pre-loaded
- **"Open in Google Maps"** — Launches Google Maps with the destination pre-loaded (shown below Apple Maps)

### 21.3 Share Plan

A "Share Today's Plan" button on the Now screen generates a plain text summary of the day's schedule that can be sent via iMessage, email, or any share sheet destination. Format: day date, hotel, each anchor in order with times, any notes.

---

## 22. GPS Behavior and Offline Mode

### 22.1 GPS Constraints

The application is a web app. It can access device GPS only while the browser tab is active and the screen is on. It cannot perform background location monitoring. The application must behave correctly under all GPS states without ever showing an error state.

- **GPS active and accurate:** Use current position for travel time calculations and Tier 3 nearby markers
- **GPS recently acquired (position is stale):** Use for calculations, show no indicator to user
- **GPS unavailable:** Use hotel coordinates for origin in calculations. Tier 3 nearby markers on Now screen are hidden. No error state shown anywhere.

### 22.2 Offline Mode

Wander implements partial offline support optimized for execution.

**Cached for offline access:**
- Complete data for the current calendar day: hotel, all selected experiences with full detail, all reservations, all notes
- Complete data for tomorrow: same as above
- Trip structure overview: cities, dates, route segments
- All confirmed experience locations (coordinates) for the full trip
- All experience names for the full trip (for search and change log queries)

**Not cached offline:**
- Ratings data (fetched fresh when online)
- Images for days beyond tomorrow (fetched on demand when online)
- Change log entries beyond the last 50
- Tier 3 live nearby markers (always requires network)

**Offline behavior:**
- Now screen loads instantly from cache with no network request
- Day view loads from cache for today and tomorrow
- Map shows cached Tier 1 and Tier 2 markers with a subtle "Offline" indicator in the corner; Tier 3 markers are absent when offline
- Capture is queued: new captures are stored locally and sync when connectivity returns
- Change log updates are queued locally and sync when connectivity returns
- Ratings and images beyond cache show placeholder states

The application must detect connectivity status. The offline indicator is subtle — a small icon, not a banner. Never show stale data as current data.

---

## 23. Change Log, Group Awareness, and Natural Language Search

### 23.1 What Is Logged

Every state-changing action creates a permanent change log entry. Read operations are not logged.

Actions that create log entries:
- Experience created (any method: capture, import, manual)
- Experience promoted to Selected (with day or route segment assignment)
- Experience demoted to Possible
- Experience edited (name, description, notes, themes, location)
- Experience deleted
- Day notes edited
- Exploration zone set or changed
- Accommodation added or edited
- Reservation added or edited
- Trip created
- Trip archived

### 23.2 Log Entry Content

Each log entry stores:
- Timestamp
- User display name (e.g., "Ken")
- Human-readable description: "Ken promoted Tokyo National Museum to Day 4 (Tuesday)"
- Entity name at time of action (stored even if entity is later renamed or deleted)
- JSON snapshot of entity before and after the change

### 23.3 Group Awareness Indicator

The History button (accessible from trip overview or persistent navigation) shows a subtle unread indicator — a small dot, not a count badge — when changes have been made by any group member since the current user's last visit to the History view.

The dot is the complete notification system. There are no push notifications, no in-app alerts, no banners. The dot is purely informational. Its purpose is to invite curiosity and awareness of group activity — particularly useful for sparking group conversation about planning decisions. It does not demand attention or convey urgency.

The dot clears when the user opens the History view.

### 23.4 Change Log UI

The change log is accessed via the History button. It displays as a reverse-chronological list of entries. Each entry shows:
- User display name (most prominent)
- Human-readable action description
- Timestamp (relative: "2 hours ago," "Yesterday at 3:14 PM")

### 23.5 Natural Language Search

Above the change log list is a search input supporting natural language queries:

- "Tokyo museum" → returns all log entries mentioning any experience with "museum" or "Tokyo" in the name
- "who moved the cooking class" → returns log entries where the action involved an experience with "cooking" in the name, showing user display name most prominently
- "yesterday" → filters to entries from the previous calendar day
- "Ken" → filters to entries made by the user with display name Ken
- "promoted" → filters to entries of type experience_promoted

Search is implemented using full-text matching across the description field and entity_name field of all log entries. No AI is required — keyword and phrase matching only. Recent entries (last 50) are filtered client-side for speed. Older entries are queried server-side.

Search results display the user display name first and most prominently — the primary use case is answering "who did this?"

---

## 24. Between-Cities Experiences

Some experiences are physically located between two base cities — a temple on the route from Kyoto to Nara, a roadside attraction between cities.

**City axis context:** The experience is associated with the preceding city in sequence. If the experience is geographically between Kyoto and Nara, it appears in Kyoto's experience list. The decision to include it is made while planning from the prior location.

**Route axis context:** The experience additionally appears as a potential route stop along the relevant segment. It is shown with a subtle "Along the way" label to distinguish it from base city experiences. Its appearance in route context is additive — it does not replace or change its city association.

**Permanence rule:** An experience's city association never changes when the user switches axes. An experience never appears to vanish or reclassify. The city association is permanent. Route context appearance is supplementary.

---

## 25. Exploration Zones

An exploration zone is a named neighborhood or district designated for a day's wandering. Examples: "Gion district," "Yanaka neighborhood," "Shibuya area."

Exploration zones are text fields attached to day records. When defined, the map resolves the zone name to coordinates via Google Maps geocoding and uses the result to bias the display ordering of nearby Possible experiences — experiences geographically near the zone are shown higher in the candidate list. Experiences outside the zone are not hidden.

---

## 26. Trip Overview Screen

The trip overview is the entry point to all planning and the only screen in the application that does not center the map.

It shows:
- Trip name and dates
- Cities in sequence with arrival and departure dates and nights count
- Route segments with transport modes
- Count of selected experiences per day
- Count of possible experiences per city
- Total days planned vs. total trip days
- History button with unread dot indicator if applicable
- "Start Planning" button (enters the spatial canvas on the Cities axis)
- "Now" button if currently within trip dates (enters the Now screen directly)
- Archived trips listed below the active trip with read-only access

---

## 27. Experience Detail View

The experience detail view shows the complete record for one experience. It slides in as a panel — it does not replace the map on larger screens.

Contents:
- Representative image (full width at top, placeholder if none)
- Experience name (large type)
- City association and themes (displayed as small tags)
- Narrative description (full text)
- Source reference (tappable link if URL available)
- Ratings from all platforms with last-refreshed timestamps
- Low-rating warning text if applicable
- Map preview showing the experience location at Tier 1 weight (if confirmed) or location needed affordance (if unlocated)
- User notes (editable inline, saves automatically)
- Compact change history for this specific experience (last 3 changes, with "see all" link)

Action buttons:
- "Add to Itinerary" (if Possible state) — triggers promotion flow
- "Move to Candidates" (if Selected state) — triggers demotion (no confirmation needed)
- "Edit" — opens edit mode for name, description, themes
- "Refresh Ratings" — manually triggers ratings enrichment for this experience
- "Delete" — triggers the deletion confirmation dialog (the only modal in the application)

---

## 28. AI Assistant Behavior

The AI assistant in Wander is passive and advisory. It never acts autonomously on itinerary data. It never uses conversational language or action-encouraging framing. It surfaces observations as plain factual information. It does not say "you should," "consider," "we recommend," or any similar phrasing.

### 28.1 When AI May Offer Observations

The AI may surface observations in specific contexts:

**Spatial clustering:** "These four experiences fall within a 12-minute walk of each other."

**Day density:** "Current Day 3 selection spans 8.4 km."

**Route detour awareness:** "This temple is 90 minutes round trip from the Kyoto base."

**Ratings synthesis (pattern-based, never raw scores):** "Several reviewers note this studio requires advance reservation."

**Comparative selection patterns:** "Most visitors to this area choose two of these four ceramics studios." (This observation is derived from Google Places review patterns and Foursquare tips data — it synthesizes behavioral patterns, not ratings.)

**Import extraction notes:** "14 items found. 3 items were ambiguous and flagged for review."

**Time-sensitive alerts (the only proactive AI output permitted):**
- "Departure for [Anchor] in 45 minutes."
- "Reservation window for [Experience] opens in 10 minutes and fills quickly." (Only when this information is verifiable from review data or known reservation behavior.)

### 28.2 How AI Observations Are Displayed

AI observations appear as dismissible information cards, visually distinct from system UI. They are never blocking. They can always be dismissed. They never modify data. They contain no action language — only facts and context.

Time-sensitive alerts are more visually prominent than general observations but still not modal or blocking.

### 28.3 What AI Must Never Do

- Automatically promote or demote experiences
- Reorder the itinerary
- Delete or hide experiences
- Use conversational, encouraging, or action-pushing language
- Present an observation as a recommendation or instruction
- Average ratings across platforms
- Repeat raw ratings data that is already visible in ratings badges

---

## 29. Trust Model and Immutability Rules

These rules are absolute and must be enforced at the application layer, not just the UI layer:

1. **No automatic itinerary modification.** No background process, AI agent, or enrichment task may change the state, day assignment, route segment assignment, or sequence of any experience.

2. **No silent data loss.** Demoting an experience preserves all its data — description, images, ratings, notes. Only the state, day assignment, route segment assignment, and time window are cleared.

3. **No automatic archiving of experiences.** Experiences are never automatically moved, hidden, or removed from the user's view.

4. **Confirmation required for deletion only.** The deletion confirmation dialog is the only modal permitted in the application. All other actions are reversible and require no confirmation dialog.

5. **Change log is permanent.** Log entries are never automatically deleted or pruned.

6. **Ratings never override user decisions.** No rating threshold prevents, blocks, or creates friction for any user action.

7. **The map is always trustworthy.** No marker appears without confirmed coordinates. No travel time estimate appears without a specified transportation mode.

---

## 30. Device-Specific Layout Rules

### 30.1 iPhone

- Map occupies the full screen at all times
- Selector strip anchors to bottom, above the safe area
- Capture button: bottom right, above selector strip
- Now button: bottom left, above selector strip (visible during trip dates only)
- Experience list: bottom drawer, slides up to approximately 40% of screen height, map remains visible above
- Experience detail: slides up as a tall bottom sheet, leaving map partially visible at top
- Promotion UI: compact inline panel within the list drawer, not a modal
- Change log: full screen from trip overview
- Theme filter chips: horizontally scrollable row above the selector strip

### 30.2 iPad

- Map occupies the right 60% of the screen
- Left 40%: persistent side panel showing experience list with selected/candidate zones
- Selector strip: anchors below the side panel, spans the left panel width
- Axis switcher: above the selector strip in the left panel
- Capture button: bottom right of map area
- Experience detail: slides in as right panel overlay on the map (map de-emphasizes behind it)
- Promotion UI: inline within the list panel, no sheet required
- Travel geometry overlay and numeric signal: always visible on map when applicable
- Theme filter chips: top of the left panel

### 30.3 Mac (Browser)

- Layout mirrors iPad with additional hover states and larger proportions
- Map occupies the right 60-65% of the window
- Left panel: persistent, scrollable, resizable within reasonable bounds
- Hover on list items previews the map marker (marker pulses, map does not pan)
- Drag and drop uses mouse drag with standard cursor feedback
- Keyboard shortcuts for common actions (Claude Code implements using standard conventions)
- The application must be fully functional in a standard desktop browser with no extensions required
- Theme filter: top of left panel, same as iPad

---

## 31. External API Dependencies and Failure Handling

### 31.1 Google Maps JavaScript API

Required for: map rendering, clustering, geocoding, travel time calculation, Tier 3 nearby place discovery.

Failure handling: If Google Maps fails to load, display a message "Map unavailable — check connection" and present the experience list in full-screen list mode as a fallback. All list-based planning features remain functional without the map.

### 31.2 Google Places API

Required for: ratings enrichment, geocoding confirmation, Tier 3 live nearby markers.

Failure handling: Silent. Failed calls skip enrichment for affected experiences. No error state shown. Retry on next trigger event.

### 31.3 Yelp Fusion API

Required for: secondary ratings enrichment.

Failure handling: Silent. Show only Google and Foursquare ratings when Yelp calls fail. Never show a Yelp error indicator.

### 31.4 Foursquare Places API

Required for: tertiary ratings enrichment, international coverage.

Failure handling: Silent. Same behavior as Yelp failure handling.

### 31.5 Cloudinary

Required for: image upload and delivery.

Failure handling: If upload fails, store the experience without an image and show the placeholder state. Retry upload on next app open. Capture is never blocked by image upload failure.

### 31.6 General API Failure Philosophy

Core functionality — viewing the itinerary, using the Now screen, accessing the change log — must never depend on third-party API availability. All critical data lives in Neon PostgreSQL. The application degrades gracefully and silently when external services are unavailable. Users should rarely if ever see an error state caused by a third-party API failure.

---

## 32. Implementation Priority Guidance for Claude Code

Claude Code should implement features in this sequence to ensure a usable application exists at each stage:

**Phase 1 — Foundation:**
Database schema (complete, as specified in Section 6), authentication (access codes with display name pairing), trip creation, city/day/route segment structure, basic experience capture (manual entry only), basic list views, change log writing, Railway deployment.

**Phase 2 — Core Planning:**
Google Maps integration, three-tier marker system (Tier 1 and 2 from saved data first, Tier 3 as subsequent addition), selector strip with Cities and Days axes and scrub behavior, drag-and-drop promotion UI with both day and route segment assignment, basic day view, travel geometry overlay with real-time update.

**Phase 3 — Capture Enrichment:**
URL capture with page parsing, screenshot upload with OCR, Cloudinary image integration, AI extraction for trip import documents with review-before-commit flow, list-format capture choice flow.

**Phase 4 — Ratings and Geocoding:**
Google Places geocoding with location status flow and unlocated affordance, Google Places ratings, Yelp ratings, Foursquare ratings, ratings display with conditional formatting, theme filtering on map.

**Phase 5 — Execution:**
Now screen with four-question layout, leave-time calculation with Google Maps Distance Matrix, transportation mode default and override, timer handoff via Siri deep link, secondary handoff options (alarm, reminder, calendar, Apple Maps, Google Maps), offline caching for current and next day, GPS fallback behavior.

**Phase 6 — Intelligence and Polish:**
Routes axis with rail station markers, between-cities experience handling, Tier 3 live nearby markers, change log natural language search, group awareness dot indicator, AI observations (spatial clustering, day density, detour awareness, comparative patterns), share plan feature, exploration zone geocoding bias, passive spatial intelligence signals (proximity rings, reachability de-emphasis).

---

## 33. Closing Directives for Claude Code

These directives summarize the non-negotiable implementation requirements. Each represents a decision made explicitly by the product owner that must not be revisited or overridden:

- **The spatial canvas with Google Maps is the center.** Build it first. Every other screen is secondary.
- **The three-tier marker system is always active.** Planning mode and execution mode show the same map. There is no mode switching that hides tiers.
- **The selector strip scrub interaction must feel smooth and immediate.** Map transitions must be fast. One interaction model, always.
- **Capture is always instant.** The user never waits for enrichment, geocoding, or image processing before the experience is saved.
- **No experience appears on the map without confirmed coordinates.** No exceptions.
- **Ratings are a background layer.** They never sort. They never block. They never average across platforms.
- **The change log is permanent.** Every state change is logged from day one of development. Never pruned.
- **The Now screen loads from cache.** No network request required or made for initial load.
- **Timer via Siri deep link is the primary departure handoff.** Build it before alarm and calendar options.
- **Railway single-deployment architecture.** No split deployment. Frontend served as static files by Express.
- **Cloudinary handles all images.** No images in the database. No images on Railway filesystem.
- **Access code authentication only.** No OAuth. No passwords. Format: CODE:DisplayName pairs in environment variable.
- **One active trip at a time.** Full archiving of previous trips with complete data preservation.
- **Promotion supports both day assignment and route segment assignment.** Both paths must be built.
- **The app is smart, never chatty.** No action-encouraging language anywhere in the UI. The only proactive output permitted is time-sensitive factual alerts.
- **No modal dialogs except deletion confirmation.** Everything else slides, opens inline, or draws from the bottom.
- **Visual density reflects travel reality.** Open space is intentional. Dense timelines are prohibited.

---

*End of Wander Master Specification v3.0*
