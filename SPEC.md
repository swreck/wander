# Wander — Complete Product Specification for Claude Code

**Version:** 3.0 — Final Unified Master Document
**Prepared for:** Claude Code autonomous development
**Date:** March 2026

This document is the single authoritative specification for the Wander travel planning and execution application. It supersedes all prior drafts, addenda, audit documents, and partial specifications. Claude Code must not invent any architectural, UX, or behavioral decision not explicitly addressed here. Where this document provides a decision, that decision is final. Where this document acknowledges uncertainty, it says so explicitly and provides the preferred resolution path.

> **Status (updated Oct 15, 2026).** Since Sep 27, 2026, Wander is a front end to Larisa's Japan Guide (her Google
> Sheet) for the group's Japan trip in October 2026. Her Guide is the master: Wander reads copies of it and never
> changes it, and Scout can't change the trip. Part I below is the March 2026 design, kept as written. **Part II, at
> the end, describes Wander as built, and wins wherever Part I differs.** Sections of Part I that the trip product
> replaced carry a one-line "[Superseded: …]" note. Ken's later decisions (CLAUDE.md) win over both.

---

# Part I — The March 2026 Design (v3.0)

## 1. Product Identity and Purpose

*[Superseded: see Part II §1.1–1.2. Wander is a front end to Larisa's Guide for four friends on one trip.]*

Wander is a web application that bridges the gap between travel research and travel execution for small, trusted travel groups. It is not a travel discovery platform. It is not a booking platform. It is not a social travel application.

Wander begins at the moment a traveler notices something worth considering — a restaurant mentioned in a travel writer's article, a ceramics studio recommended by a friend, a temple described in a blog post. Everything before that moment happens outside Wander. Everything after that moment — capture, evaluation, spatial reasoning, day planning, and real-time execution — happens inside Wander.

The product must feel like a trusted, calm travel companion. It must never feel like it is improvising. It must never feel like a toy. It must never reorganize, rewrite, or reinterpret the user's plan without explicit instruction.

---

## 2. Non-Negotiable Product Principles

*[Partly superseded: see Part II §1.3. "The itinerary is sacred" now means Larisa's Guide, which nothing in Wander changes. The map is no longer the centre. Scout speaks as a warm guide. Small confirmations and quiet cards are used where they help.]*

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

*[Superseded: see Part II §1.2.]*

Wander is built for a small, trusted travel group of approximately two to six people. All group members share access to the same trip data. All group members can view and modify the plan. The application is not designed for strangers, large groups, or public sharing.

The primary user is an experienced traveler who already has a working planning process — browser research, notes capture, and spreadsheet-based itinerary management. Wander replaces that process without imposing new structure. The system must respect that experienced travelers already know which city an experience belongs to, already have opinions about which experiences are worth including, and do not need the application to tell them what to do.

**Planning context:** primarily Mac and iPad, larger screens, more deliberate interaction, richer simultaneous panels visible.

**Execution context:** primarily iPhone, map-first, one-handed interaction, immediate information access, frequent reference while walking.

All features must be available on all devices. The layout adapts to device size but no feature is locked to a specific device.

---

## 4. Technical Stack — Explicit and Non-Negotiable

*[Partly superseded: see Part II §20.1. Access codes, the ratings services and the capture pipeline are gone from the trip product.]*

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

*[Superseded: see Part II §14. Sign-in is Face ID with personal invite links; access codes are gone.]*

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

*[Superseded: see Part II §20.2. Her Guide is a layer Wander replaces with each good copy; what people add lives apart from it.]*

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

*[Superseded: see Part II §4. Trips come from her Guide; there is no trip creation or itinerary import.]*

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

*[Superseded: see Part II §8 (Maybes) and §3.4 (choices in a block).]*

All experiences move through exactly two states: Possible and Selected. There is no intermediate state.

**Possible:** The experience has caught the user's attention and been captured. It is a candidate for the trip. The user has not yet decided it deserves time in the itinerary. A city typically contains five to twenty possible experiences at any time — this scale informs UI decisions about list density, scroll behavior, and pagination.

**Selected:** The experience has been promoted into the itinerary. It is assigned to either a specific day or a specific route segment. It appears as a committed item in the day's or route segment's structure.

**There is no "Contender" or "Shortlist" state.** Users move directly from Possible to Selected or back.

**Promotion** requires: assigning either a day or a route segment (required), and optionally assigning a time window and transportation mode to the experience.

**Demotion** moves an experience back to Possible and removes its day assignment, route segment assignment, time window, and transportation mode. The experience is not deleted. No confirmation dialog is required for demotion — it is easily reversible.

**Deletion** is permanent and always requires a confirmation dialog with the experience name shown explicitly: "Are you sure you want to delete [Fushimi Inari Shrine]? This cannot be undone." This is the only modal dialog permitted in the application.

---

## 9. Capture System

*[Superseded: see Part II §7.6 (Scout takes any file) and §8 (Maybes).]*

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

*[Superseded: see Part II §4.4, §4.5 and §7.7. The rule lives on: a misplaced pin is never a destination.]*

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

*[Superseded: see Part II §21. Ratings aren't part of the trip product.]*

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

*[Superseded: see Part II §16.]*

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

*[Superseded: see Part II §2.3 and §21. Ken (Oct 3): "stop the map".]*

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

*[Superseded: see Part II §1.4 and §21.]*

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

*[Superseded: see Part II §2.3 and §21.]*

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

*[Superseded: see Part II §21.]*

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

*[Superseded: see Part II §21.]*

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

*[Superseded: see Part II §3 (the day screen).]*

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

*[Superseded: see Part II §2.4 (Next).]*

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

*[Superseded: see Part II §2.4. Walk, Train and Taxi open Google Maps from where the phone is; on the last day her own way to the airport is used.]*

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

*[Superseded: see Part II §2.4 and §3.6 (Send this day).]*

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

*[Superseded: see Part II §15 (offline) and §7.7 (location).]*

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

*[Superseded: see Part II §17.3 (History) and §15.2 (other people's changes).]*

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

*[Superseded: see Part II §21.]*

Some experiences are physically located between two base cities — a temple on the route from Kyoto to Nara, a roadside attraction between cities.

**City axis context:** The experience is associated with the preceding city in sequence. If the experience is geographically between Kyoto and Nara, it appears in Kyoto's experience list. The decision to include it is made while planning from the prior location.

**Route axis context:** The experience additionally appears as a potential route stop along the relevant segment. It is shown with a subtle "Along the way" label to distinguish it from base city experiences. Its appearance in route context is additive — it does not replace or change its city association.

**Permanence rule:** An experience's city association never changes when the user switches axes. An experience never appears to vanish or reclassify. The city association is permanent. Route context appearance is supplementary.

---

## 25. Exploration Zones

*[Superseded: see Part II §21.]*

An exploration zone is a named neighborhood or district designated for a day's wandering. Examples: "Gion district," "Yanaka neighborhood," "Shibuya area."

Exploration zones are text fields attached to day records. When defined, the map resolves the zone name to coordinates via Google Maps geocoding and uses the result to bias the display ordering of nearby Possible experiences — experiences geographically near the zone are shown higher in the candidate list. Experiences outside the zone are not hidden.

---

## 26. Trip Overview Screen

*[Superseded: see Part II §2.1 (Home).]*

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

*[Superseded: see Part II §8 and §3.4.]*

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

*[Superseded: see Part II §7 (Scout).]*

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

*[Partly superseded: see Part II §1.3 and §4.3. The spirit holds, more strictly: nothing in Wander changes her Guide, and nothing people add is lost on a re-read.]*

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

*[Superseded: see Part II §1.2 and rules/engineering.md § iPhone.]*

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

*[Superseded: see Part II §20.1.]*

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

*[Superseded: Part II describes what was built; CLAUDE.md holds the working rules.]*

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

*[Superseded: Part II describes what was built; CLAUDE.md holds the working rules.]*

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

*End of Part I (Wander Master Specification v3.0)*


---
---

# Part II — Wander as built (October 2026)

Part II describes Wander as people use it on the Japan trip. It was written on Oct 15, 2026 from CHANGELOG.md (every
entry from Sep 27 on, and the March–April entries marked "SPEC UPDATE NEEDED"), CLAUDE.md, rules/engineering.md and
rules/tone.md. Where Part I and Part II differ, Part II wins. Where two changelog entries differ, the newer one wins.
Ken's words are quoted with their dates. Lines marked (Claude) are the engineer's reading beside them.

Keeping it current: every batch that changes behaviour updates this part in the same pass as its CHANGELOG entry. Ken
(Oct 13): "Product spec should be up to date!" and "yes. Always! Should not need my approval!"

---

## 1. What Wander Is Now

### 1.1 Purpose

Ken (Apr 11 2026, reconfirmed Sep 27): "Wander is a value-add front end to Larisa's Japan Guide."

Larisa's Guide is the Google Sheet she built for the trip: an Itinerary tab, a tab for many key days, dining
reservations, hotel notes, pasted emails, pictures, to-do lists. Wander reads a copy of it and never changes it. Wander
makes her plan easy to use on a phone during the trip: what's next, what today holds, what not to miss, how to get
there, and answers to questions about any of it.

Ken (Oct 1 2026): "be creative… friends travelling to a new location with new culture, style, foods… hand built for
the individuals instead of mass appeal… 10 or more exciting yet safe-to-implement ideas."

Ken's ambition (Sep 27; a close paraphrase, his exact words weren't recorded): Wander seduces people, Larisa included,
into seeing it as a parallel tool that earns its place as the main window into the plan through its charm, its ease
and its usefulness. Larisa is the final judge, comparing it with her own sheet.

The design standard. Ken (Apr): "UX for non-technical users resulting in delight without having to be trained".

### 1.2 The people

Four travelers, with accounts named Ken, Larisa, Andy and Julie. Ken (Oct 10): "They see themselves as andy and Julie.
The initial was yours. And the initial seems to have caused a problem".

- **Ken** looks after Wander. He is the trip's first member (the "organizer" in Wander's words), and a few actions are
  his and the person who added a thing (removing from Maybes, removing a phrase from everyone's card).
- **Larisa** owns the Guide. Wander speaks to her about it as hers: "your Guide", "your tabs", "your plan for the day".
- **Andy and Julie** join a week after Ken and Larisa. For any Japan date when someone is still at home, Wander says so
  and keeps the others' plan apart (§18).
- Everyone carries an iPhone 16 or later. Screens are reviewed at 393, 402 and 440 pt wide and on iPad. The 375 pt SE
  must work but isn't polished for.

Wander speaks to the person holding the phone. Larisa sees "your Guide"; Ken sees "your rail sheet"; everyone else
reads "Larisa's Guide" and "Ken's rail sheet". Wander's own lines never talk about the reader in the third person
(Sep 30, Oct 5, Oct 10).

### 1.3 The rules that govern every screen

1. **Downstream of Larisa's Guide (hard rule, Sep 27).** Her sheet is the master. Ken (Oct 2): "The ONLY reason for
   non-live connections is the danger of you changing something or deleting something or destroying something she
   created." Nothing in Wander writes to any sheet. Google access is read-only, so Google itself would refuse a write.
   A trip read from her Guide can't be deleted. Scout's tools for restructuring the trip are withdrawn (§7.9).
2. **Lightweight planning only, inside her plan's open space.** Ken (Sep 27): "which of 3 restaurants", "what Andy and
   Ken do on the spur of the moment while Larisa and Julie are at a ceramics demonstration". Days, cities, hotels and
   tours are her Guide's job. Ken: "no non-Wander workflows". Ken (Sep 27): "May change while on the road, but it's
   the right start."
3. **Faithfulness with judgement.** Ken (Oct 2): "everything in the spreadsheet is data". Ken (Oct 10): "Faithfulness
   continues to be Key. But your judgement as head of engineering with faithfulness as a goal is just as important.
   Perhaps more because 'you are the head of engineering creating a great product that has faithfulness at its
   core.' This optimization would be clear to a human." (Claude) Two questions of every fact on screen: is her word
   kept exactly, and is this the best a traveler can have right now? When they differ, both show: live first, hers
   labelled hers.
4. **Scout never lies (Sep 29).** Ken: "one scout error when asked when or where something is happening can overwhelm
   multiple correct answers." Ken (Oct 2): "if they go to the airport on the wrong day because of Wander, I will never
   hear the end of it". Ken (Oct 13): "Why hide rain if a legitimate forecast has it? If it is real, use it. If not,
   don't. Scout does not lie." The same honesty applies to every screen.
5. **Disagreements are shown, never settled.** When her tabs, her pictures, Ken's rail sheet or a file someone sent
   differ on a time, a place or a booking, Wander shows both and where each comes from. It never picks one.
6. **Done or out of date isn't shown.** Ken (Oct 14): "You don't change her sheet. You add value to it. So if it is
   done or out of date, you don't show it" · "Just don't show it in wander".
7. **Personal information.** Ken (Oct 4): "unless the info passes through the vault in a safe way, Wander should not
   surprise people by surfacing their personal info." (§19)
8. **Each fact once.** A booking, a disagreement or a deadline is said in one place on a screen, with a pointer from
   anywhere else that needs it (the day screen review, Oct 4).
9. **Words.** The test in CLAUDE.md §5: could this string appear unchanged in Jira, a banking app or a form builder? If
   yes, rewrite it. Ken (Oct 2): "remember to use table for two, and don't use ambiguous nouns." The full rule is
   rules/tone.md.
10. **Nothing moves under the reader.** (Claude) A card arrives in a screen's first drawing or waits for the next
    visit. One ask per visit, in a fixed order. Layout shift stays under 0.1. Most of the Oct 10 audit fixes were
    this.
11. **Chat parity for Wander's own additions.** "anything that can be done by the visual UI should be able to be done
    by the agent" (Apr). When a screen changes something Wander owns, Scout has a matching tool, and the reverse.
    Never for anything read from her Guide. Ken (Oct 13): "Good job ensuring scout can reorder like a user. that is
    big picture thinking. Keep it."
12. **What matters is Japan.** Ken (Oct 13): "Focus on what matters to users in Japan. Wander must be honest, no bugs,
    usable with no training and no manual. What it says about Japan to andy and Julie while in California is not
    important."

### 1.4 The screens

The bottom bar, on every screen: **Home · Today · Next · Notes · Budget · Scout**, and a small **日** at its right end
for the phrase card. **Today** (Oct 16, where Maybes was — Ken: "Replace 'maybes' with 'full itinerary for today'") opens
the traveler's own today's full day page and is lit there; Maybes opens from a row on Home. Budget took Actions' place on Oct 15 (Ken: "There seems to be no need for the [Actions] button in
the main navigation menu, so you can replace that with budget"); to-dos and deadlines open from Home (§11). Budget's
icon says who pays next (§9.9). Tapping Home while on Home closes any open panel and Scout and goes back to the top. A dot on a tab means
something new there.

Other screens: a day (tap any day on Home's calendar), the budget page, the story of the trip, the whole trip on one page, History ("What's changed in
Wander"), People, Settings, Profile (travel documents), How Wander works, the ticket pickup page, and Ideas for Wander.
The old Plan screen's address now opens Maybes.

---

## 2. Home and Next

### 2.1 Home

Home is the trip at a glance, with today first. From the top:

- **The header** is one row: the trip's name with ▾ and its dates, then "? History ⚙ <your name>" (Sep 30). The ▾
  lists only trips you're on that were read from her Guide, each with its dates and when the Guide was read.
- **Wander ideas** (Ken and Andy only): a small amber chip with a sparkle that opens Ideas for Wander, with a dot when
  something there is new (§12).
- **Today's weather**, one line just under the dates: "63‑73°F, rain 18% (.09")" with **Go to today ›** at its right.
  Ken (Oct 13): "Can it be one line of: 63‑74°F, rain 6%      Go to today ›". It shows only on your own days in Japan,
  so it needs no place name; a screen reader hears where it's measured. When her plan takes you somewhere other than
  where you sleep, a second line follows, each line naming its town, in the order the day is lived. On a travel day,
  from noon in Japan, tonight's town leads. Rain hours aren't on Home: Ken asked for one line there (§6).
- **The trip map** (§2.3).
- **The Today card** (§2.2), or before the trip the countdown and your first days, or after it "Welcome home".
- **The budget line**, just under the Today card: the next action only — "Who pays next: KL Ken & Larisa · ¥23,475 to
  be even" ("Budget: nothing kept yet" before anything is). A tap opens the budget page (§9.9). Ken (Oct 16, replacing
  his Oct 15 "a button on the homepage that actually shows the total"): "people do not want to be reminded how much
  they've paid. They simply want to understand the next action, which is who pays next and what the difference is."
- **To-dos and deadlines ›**, one quiet line under it, opening what the Actions tab used to open (§11).
- **Quiet notes**: the Safety tips note under the day's card (§6.7); and one ask per visit, in order, the leaving card,
  Face ID, then the welcome (§17.1).
- **The calendar**: every day of the trip in its city's colour with a small map (hidden when Google's maps can't be
  reached), a "B" beside the date on a Backroads day ("B · with Backroads" under it), today ringed. Every day is one
  tap. It stays after the trip.
- **The whole trip on one page** and **Your Guide, tab by tab**, with Find a word (§4.6).
- **Recent activity**: what people did in Wander (maybes, shared notes, picks, plans added). One person's quick changes
  of mind on one line within half an hour merge into the latest. Something added and taken back is left out (History
  keeps both). A private note never appears.
- **A Maybes line** when there's something new: "Andy has a maybe for Tokyo: "…" · and 1 more ›". No phone alerts.

**The leaving card** (Oct 2). For anyone whose own first flight is after the trip begins (Andy and Julie), once a day
before they leave: "You leave in 10 days", "You leave tomorrow", "You leave today · Safe travels." It shows their
flight as her Guide has it and one fact about Japan, a different one each day, each checked against published sources.
It shows only if it's ready before they've touched anything, with nothing else open; otherwise on the next visit. Ken
(Oct 10): "conflict in the UI since both are early and unexpected info… Overlap, race condition". Ken can preview it
with a setting: "If Julie and Andy open Wander today, this is what they'll see:".

**If Google's map won't load**, Home opens at the trip's name without the map, and the phone tells Wander's server why
(Oct 15).

### 2.2 Home's Today card

During the trip the Today card is today from her Guide, on Japan's date for you:

- Her open question about today comes first ("Still open in her Guide: …"), unless her own line marks it done.
- Her Itinerary line for the day leads, saying whose it is when it's someone else's ("— For Ken & Larisa"). Short
  untimed bits share one line: "In her Itinerary for today: "…" · "…"".
- Then the day in time order: her timed lines, your booked trains, flights, bookings. A train, a flight, a booking,
  a line to a station or airport, and a line still waiting for a pick ("Lunch · 2 places to choose from ›") are never
  folded away. When other lines are left out, "and 9 more from 11:35 AM ›" sits at the gap and opens the day there.
- **Now** and **Next** by the clock (§2.4). A booked meal under way is "Now · <restaurant>, booked for 6:00 PM" with its
  confirmation, for two hours, with the restaurant's checked photos and "Maps ↗" to its address; tapping it opens Today
  at that line (Oct 16, stability walk 2: at 7:30 PM it had no photo and the only Maps on Next went to the hotel).
- **Tonight**: where you sleep, both hotels when her Guide lists two, each one tap to Maps by its name. The check-in
  row leaves once you're there.
- **Tomorrow**: the earliest of her Itinerary, her day plan and your booked trains. "her Guide lists two places" when
  it does, never a pick.
- **Your deadlines** in the next few days, said by whose name the booking is under. Charges that have started sit under
  "Now in effect". A free-cancellation day says "Last day … Nothing to do unless plans change", never a gold deadline.
- **Earlier today: … ›** folds the morning's check-out and the lines that only got you here, once you've reached
  tonight's place (§2.4).

Before the trip, the card says "You leave in N days", shows only your own lines and the deadlines in the next two
weeks, and says where the others are now (§18.3).

On a Japan date you're still at home, Home's now and next only take lines that name you; the others' lines sit under
"The rest is the others' plan."

After the trip: "Welcome home, Ken." with the trip's days and places, a way into the trip notes (or an offer to write
some), "The story of the trip ›" (§9.8; Next links to it after the trip too), and the last day. While the flight home
is in the air: "Should be in the air"; after it lands, "Safe travels
home." Each person's own trip is counted.

### 2.3 The trip map on Home

Numbered markers in visit order, each in its city's calendar colour, with names beside them and gently arced legs with
one arrow each; "start" and "end" on the first and last stops (Oct 1). Google's own place names are off; the only words
are Wander's. Tapping a marker opens that city's first day, or today if it's today's city. Two stops close together
that the trip doubles back through share a split marker ("2 | 3") that opens a chooser. During the trip, today's city
is dark and what's behind you goes quiet; no city is "today's stop" for someone still at home, or before their plane is
due to land. Pinching or dragging with two fingers works wherever the fingers land; a "Whole trip" button brings the
view back.

The map is built once per visit and kept with the view it settled on, so coming back to Home draws it at once (Oct 9).
Its layout is worked out in the background, so opening the app never freezes (Oct 10). It never shrinks under someone
reading.

Ken (Oct 3): "stop the map". No more spending on its polish. A map that is added or changed is reviewed by a fresh
agent against a rubric, at the review sizes, on production data (rules/engineering.md).

### 2.4 Next

Next (the Now tab until Oct 2) answers what's next, when, and how to get there. Ken (Oct 10, Hakata): "given the time
of day that you know, I would think you would realize that when I tapped on next, you would know that I was already in
Hakata at the hotel, and so when I tapped on next, it would not tell me we were taking a local train to Hakata."

**Just next** (Oct 16 — Ken: "Next should just be next. It shouldn't then scroll to the equivalent of what is on the
today tab. Add more visuals to next… Be able to hop to maps at any time based on either of them"): what's now and what's
next, each with its place's checked photos (one or two) and Maps; Next also has Walk / Train / Taxi. Then "All of today ›"
(the Today tab's page). The day's list, its photos and notes are Today's, not Next's. "Now, in Larisa's plan · …" opens
Today at that line.

**Pictures on Next** (Oct 18; Ken, on the Nikko day's Next with only "Tonight" and "Tomorrow": "Next page should have
pictures"): a booking, a meal or a tour as the Next card has its own checked photo, as the day's list does. When nothing
with a time is left on a Backroads day, Backroads' stops for the day come first, "Today with Backroads, in their order",
side by side with their photos and no times (their itinerary has none); a tap opens a stop's photos. Tonight's hotel
shows its photo.

**How Wander decides what's next.** One reckoning for Next, Home and the day screen: the train you're on; otherwise the
sooner of your next booked train and her next timed line for you. A plan added in Wander counts. "This morning" lines
show before the first clock time. Once you've reached tonight's place (the evening, tonight's check-in time, or the
booked train here has arrived), the morning's check-out and the untimed lines that got you here fold into "Earlier
today: … ›". The check-out goes once your first booked train has left.

Rules that keep it right:
- While you're on a booked train, her lines timed before its arrival wait. "On this train now, by the schedule ·
  arriving 7:05 PM", with the seats, stays in view between leaving and arriving.
- A line her other tab puts at another hour is never Next or Now; it stays in the day with its difference said.
- On a split day, a line inside the split with no name on it is never anyone's Now or Next. It's mentioned: "At 10:35
  AM, her plan has … — her Guide doesn't say which group".
- An end time is only one her plan gives. A line with no end runs until her next line.
- Before you land, the landing is next.

**What Next shows.** One strong card at a time; a second card is a step quieter.
- **The Next card**: the time, how long until it, her transit and dress notes ("Notes from your Guide ›"), the group's
  pick or "2 places to choose from", whether her tabs differ. Under it: **Find in Maps**, and **Get there from where
  you are: Walk · Train · Taxi**, each opening Google Maps with walking, transit or driving directions from the phone to
  her own place (the pin of a place she linked, the address she wrote, a hotel's booked address). Nobody types an
  address. Not shown for a flight, or for a stop with no place.

**Every map link opens Google Maps** (Oct 15): a day's "Maps ↗", Next's Find in Maps and Walk / Train / Taxi, the
airport-to-hotel route, Play's Maps and Scout's directions. Ken: "Apple Maps sent us to the wrong place for dinner
tonight. Putting address into Google Maps went to right place. Please have the map link go to Google Maps if you can."
Her own Apple Maps search links in her cells open the same search in Google Maps. Her Apple Maps guides, which she made
in Apple Maps, stay Apple's.
- **The train card**: "Next train · in 2 hr 57 min", car, seats, reservation number, any check before boarding, and the
  seat from a ticket you kept (§5.5).
- **The landing card**, for the person landing: the status by the schedule (§18.4), and how to get from the airport to
  the hotel in her own words from whichever tab says it, with **Ask Scout the ways to go ›** and **Directions in
  Maps ↗**. It leaves three hours after landing.
- **The last day**: her own way to the airport (her train) replaces Wander's "leave for the airport" estimate; that
  estimate shows, labelled as one, only when her Guide gives no way.
- **Tomorrow**, naming its clock on a phone not on Japan time.
- (Until Oct 16 a labelled **日 Phrases** button sat in the header; the bar's **日 Phrases** is now the one way in, §10.)

A screen opened from Next says "‹ What's next".

---

## 3. The Day Screen

Ken's decision (Oct 4, Oct 8): first the day in a few sentences, then what you can't get wrong today, then the day by
the clock in ONE list in the order it's lived; reference last; never category sections. Chips may filter that list in
place. Each fact once. Ken (Oct 8): "the general principle is an absolute yes to your ideas… create an agent that is an
expert in user experience and discuss options… you are the head of engineering, so you can sequence it".

Before changing the day screen, run day-risk-check.mjs and lost-facts.mjs (trip-data/session-tools). Everything the
day draws (her Guide, the rail sheet, Wander's summaries, her other tabs, her maps and pictures, plans added in Wander)
is asked for at once and drawn in one step, from the phone's copy when it has one. On a very slow first open the day
waits up to 4 seconds, then says "Still getting the train times from the rail sheet…" rather than look trainless.

### 3.1 The top

- **The top bar**: a back button that names where it goes ("‹ Home", "‹ What's next", "‹ Notes"), the date, the way on
  a travel day ("Tokyo → Nikko"), "Today" on today, and the neighbouring days as bordered buttons ("‹ Sat", "Mon ›").
- **The city band**: the city's name large in its calendar colour, on the city's photo with the words in white and the
  photographer credited (Oct 15; Ken: "Do it… the look was beautiful"). It carries the day's quiet facts: the forecast
  lines (§6), "With Backroads · day N of 8" on a Backroads day, and **Send this day ›**. Until the photo is ready, or
  with no signal, the band is plain; its height never changes. Tapping the city's name brings back the arrival photo.
- **Her Kyoto map, one day at a time** (Oct 15). On each Kyoto day, just under the band, her illustrated Kyoto map's
  panel for that date, shown whole: a tall panel at most 340 pt, over a soft blur of itself, so the day's summary still
  starts on the first screen. Under it: "Larisa's map · tap to see all five days" ("Your map" to Larisa). A tap opens her
  whole map to pinch and zoom. Each panel was cut once from her picture, and her picture is never changed. If a new copy
  of her Guide brings a new map, the old panels stop showing. Those days don't also offer "See her map from this tab".
  Not on Next.

### 3.2 The day in a few sentences

"Wander's summary of Larisa's plan" (to Larisa, "your plan"), first under the band: two or three sentences on what
kind of day it is, its shape, and what anchors the evening. It is written from the same day Scout reads (her lines,
her pictures' words, who isn't in Japan yet, Backroads) and says only what they say. It names the people actually
there and says "you" to the reader. It says Backroads leads its days and states her disagreements neutrally. Every
summary is read against her lines before it's published. When a new copy of her Guide changes a day, its summary is
hidden until it's rewritten and read. The phone keeps a copy for no signal.

### 3.3 Don't miss

"Today, don't miss" (or "Don't miss" on another day), right under the summary. In this order:
1. The storm watch's line, when there is one (§6.6).
2. The ticket pickup card, on its day (§5.4).
3. Each thing to check, once: a disagreement between the sources today; her open question for the day; a train still
   marked to verify; your own deadline ending today (or one of your own party's, said as theirs: "Larisa's to-do, last
   day today: …"); a line where her tabs name two places.

Each has ↓, which opens the line it points to. Four show; more open in place. Left out: anything her own words mark
done, a deadline someone marked done in Wander, "Free cancellation ends" (it asks nothing), and someone else's to-do.

The "You land at …" box shows on the day screen only when it says something the day doesn't: that earlier lines are the
others', or how to get from the airport to the hotel. It goes three hours after the landing; the landing stays in the
day.

### 3.4 The day by the clock

One list, in the order the day is lived.

**What's now stands out** (Oct 16, today only). The line under way — or, until it starts, your next — has a deep maroon
edge and wash, its title two points larger in maroon, and above it "Now" or "Next · in 50 min": the same line the Next tab
reckons, moving down the day as the hours pass. A booked meal under way counts as now. The rest stays in view; lines
already past are quieter. The line that stands out shows its place's checked photos (Oct 17: up to six — the best wide,
the rest small beneath it, each opening the full-screen photos at itself; two side by side; one alone); every other
line one. Under the day's summary, "Now · Kappabashi Dougu Street ↓" (or "Next · in 50 min …") names it and scrolls down to
it, stopping clear of the header. Ken: "imagine the full orientation being visible but the 'now' gets more prominence…
So that exact page changes as hours pass on what pops out."

**At its top**, her Itinerary's heading for the day as one quiet line: "In her Itinerary for today: …".

**Her plan for the day.** On a day with her detailed day tab, "Larisa's plan for the day" leads: her tab, in her order,
with her times as she wrote them ("~8:30–9:15", "After dinner"). Beside its heading: **▶ Play the day** (§3.7). Under
it, when her tab has one: **See her route for the day in Google Maps** (the day's city and "Japan" are added to bare
stop names so the app finds every stop) and **See her Apple Maps guide for the day ↗** (§4.5).
- Each line says who it's for when the group splits ("Yours · Ken & Andy", "For Larisa & Julie").
- A line with no name inside a split says "No group named here". When her picture names the group, Wander quotes it:
  "a picture in your tab lists it under "You & Julie (morning)"".
- Her longer notes sit under "Larisa's notes ›" ("Transit:", "Experience:" on their own lines). Short ones show
  without a tap.
- Maps for a line comes from her stop list's own link, then her booking's address, then a place her words name; the
  town her tab names is added. "Leave …" and "Depart …" lines get no Maps. "The hotel" means tonight's hotel.
- **Two versions of the day** in one tab: Wander follows the one she added most recently and says so ("Wander follows
  the one she added most recently; the other has different times"). Scout sees the other as the earlier version.
- **Choices in a block.** When she lists several places for one time, each has **We're going here**. The pick is a plan
  added in Wander; her sheet is untouched. It shows "✓ The group's pick · Ken, in Wander" with **Undo** and **Tell
  Larisa**; the others offer **Switch to this**. One pick per line, kept on the server. With no signal, "✓ Your pick ·
  on this phone until there's signal".

**Her stops' photos** (Oct 15). Under a stop's name, a 16:9 photo from Google's listing of the very place its Maps
button searches, kept only when a check reads her line (and the stop her tab names) and Google's place and finds they
are the same place. A tap opens that place's photos full screen, swiping across, with the time, name and Maps pinned
below. Trains, walks and "refresh at the hotel" stay compact text rows. The time column stays on the left; nothing of
her plan moves or is reordered. Ken (Oct 15): "simply adding a photo on each day page does not seem to fulfill Andy's
social media vision of a visual flow… It might be an option when you see a picture to see more pictures".
- **Every photo checked, up to six** (Oct 17). Ken, on Robuchon with none: "I would expect four to six pictures of the
  restaurant and food", and for "the rest of Wander". Google's up-to-10 photos of the place are each looked at; only
  those that show it as her line means it (a restaurant's room or food, a market's stalls, a food hall's counters) are
  kept, best first, up to six; a lesser place keeps fewer, and none means no photo. Phones are only given checked photos.
- **Her booking's place.** When a line's Maps search is her booking's address, the check reads her booking's name too
  ("her booking for it: LeTable de Joel Robuchon - 1F"): her Oct 17 day plan says Gastronomy, her Dining Resos tab books
  La Table in the same château, and Ken: "we're at la table". "Her tabs differ" stays on the line.
- A "no" is searched once more by her line's own words, and asked again after a day.
- **Photos on every day** (Oct 17; Ken: "Why aren't there pictures on the day?"). On a day without her detailed plan,
  each booking, meal, stay, tour and check-in/out line shows its place's checked photo (the one Play shows); on a
  Backroads day their stops are listed with their photos and lengths; tonight's hotel shows its photo. A line of her
  plan that names a place with no Maps link ("…at Bizen KIBIDO") is looked up by the place her words name, in the day's
  town — for its photo only, never a Maps link; the same-place check decides.

**A day that follows another list of hers** (Oct 17). Ken, sending her Google Maps list "Tokyo Day 3": "Adjust this day
on wander to reflect these places. Remove existing wander places not on the Google map. (Ie, treat as a replacement
set). If order is not clear pick an order that makes sense… Robichon is last". Her tab's lines for the day are hidden in
Wander, never deleted, and her list's places stand in their place in an order Wander chose, untimed; the lines she keeps
(the dinner) follow. The plan's heading says "From her Google Maps list "Tokyo Day 3"". Each line shows her list's words
for the place (its kind, or her note on the pin: "3D panda billboard"); each Maps search was checked to land on her pin.
Scout knows the day follows her list by Ken's choice, what was set aside, and Wander's straight-line distances between
her pins, said as Wander's. Her sheet is untouched; a new Guide copy doesn't undo it (day_plan_swaps).

**When a stop is open** (Oct 15). Ken: "the feature or info or view the user would want before they realize they want
it". When her plan's time doesn't fit the place's hours as Google lists them, the stop's line says so, as Google's:
"Google lists … as opening at 11 AM" (her plan has it at 10:00), "… as temporarily closed", "… as closed on Mondays", "… as
closing at 4:30 PM" when her time runs a quarter hour or more past closing. For a whole street or market it says
"Google's hours for … start at 10 AM", since one listing isn't every shop's. It shows only on the line that is the stop
itself (never "Taxi to…" or "Finish…"), and only for a place Wander has already checked is the one her line means (the
place of its photo). Nothing is said when her times fit or Google has no hours. Her plan is never changed. Hours come
from Google's listing, special days included for the coming week, and are looked at again every three days.

**Your trains, in the day** (Oct 4, Oct 8). Each booked train is drawn once: under her line when it names the train,
else at its time. The short row keeps what you need on the platform: times, name and route, car, seats, reservation
number, any check before boarding, and her Guide's other time for it. "Reservation, notes and steps ›" opens the rest.
A car, taxi or local leg with no booking is one thin row beside the train it connects to ("After train · … · Car /
taxi · no booking"). Her untimed lines sit right after the train or leg that goes where they name. On your landing day,
untimed lines come after you land, and the airport leg follows the landing. The others' trains fold to one line ("Ken &
Larisa's trains today (4) ›").

**Plans added in Wander** sit at their time, "Added by you · not in Larisa's Guide" (or by whoever added them), with
Tell Larisa and Take off this day. A plan with no time sits under "Added in Wander". **+ Add a plan for this day** and
**+ Add a note for this day** are on every day (§9.3).

**Each line is short until tapped** (Oct 9). A row is its time and what it is; a tap opens the rest in place, "Show
less ‹" closes it. What you can't be without stays in sight: a train's essentials; a line's open question or
disagreement; a question for you; check-out timing; a flight's status and confirmation; a meal's name, whether it's
booked, and its Map; a to-do's window and phone numbers. Class, sources, addresses and her notes open on a tap.

**Today**: the line that's now opens by itself. Earlier timed lines turn a quieter colour, never hidden. On a day
ahead its first timed line opens; a day looked back on stays short.

**Someone else's line** on a split day is one quiet row at its time ("Ken & Larisa · Day trip from Tokyo to Mashiko ›"),
opened in place.

**Mornings.** A check-out on a morning you leave earlier reads "Check out before 8:30 AM · Meet Backroads, …", with the
hotel's own time below, smaller. On a two-hotel morning each check-out shows with its own time and confirmation.

**Deadlines** say whose booking they are ("Booked under your name", "Larisa's to-do · …"). Amber is only for the person
who must act. "Why this date? ›" opens the policy. A deadline someone marked done reads "Done — Larisa, Oct 14 (marked
in Wander)" (§11).

**Her tabs differ** is said on the line itself, both quoted, both spots one tap each ("In your sheet: Itinerary ↗ ·
Kyoto Thu… ↗"). A disagreement already said at the top points up: "The sources give two times for this — see the top of
the day ↑".

**Source links** are quiet: "From Larisa's Guide — the Itinerary tab ↗" in small gray, opening her sheet at the exact
cells (§4.6). Phone numbers can be tapped only when they're shaped like a phone number.

### 3.5 Reference, last

At the foot of the day: "Also in her Guide for today" for what has no line of hers; where everyone sleeps ("Tonight",
or "The night of Wed, Oct 14" on another day); "Photos from the day" (§3.8); her note for a whole stay, folded to one
row ("Larisa's note for the Okayama stay, Oct 6–8 ›"); the papers kept for that day (§9.6); and the gray footer: "Larisa's Guide, as Wander last read
it …" and "The trains are from your rail sheet, as Wander last read it … Japan time."

### 3.6 Send this day

**Send this day ›** opens the phone's share sheet (or copies) for someone outside the four: her plan in her order with
her times and whose each line is, her Itinerary line, the booked trains, where they sleep, and "— from Larisa's plan for
the trip". No confirmation numbers. A time her tabs dispute goes out marked "her tabs differ on this; check before
relying on it". A time on another clock goes with its clock. **Send ›** on a booked meal, check-in or tour sends its
name, day, time, address and confirmation, for a concierge.

### 3.7 Play the day

The day's moments full screen, one per screen (Oct 15). Ken: "'Play the day' feels right"; for 2.0, "treat current as
1.0… make it fabulous".

- **Every day plays** (Oct 15). Ken, on a Backroads day: "Looking ahead I don't see it every day… I wanted to see Nikko
  and looked ahead at this backroads day. But nothing." Then: "Create play every day. Use what you have from the
  backroads content."
  - **Where**: "▶ Play the day" beside "Larisa's plan for the day" on a day with her timed plan; beside "The day with
    Backroads" on a Backroads day; beside "The day in her Guide" on any other day.
  - **A Backroads day** plays Backroads' own itinerary (the one Ken gave Wander, §4.5), moment by moment in its order:
    their words exactly ("Backroads' words" opens the whole passage, keeping its "…" where a sentence runs on), a short
    title, the length they give ("13 or 26 miles by bike", "1 hour"), and a photo of each place they name, each checked
    by AI to be that place. Where Backroads describes a place without naming it, a stand-in photo says so beside its
    credit. Her Guide's own lines are those moments where she has them (the morning meeting, each dinner by her name for
    it, the check-outs). Times only where she gives one; Backroads gives lengths. A choice in their day reads as one
    moment ("…, or a climb to a viewpoint"). Play on a Backroads day waits for Backroads' moments before it offers itself.
    The cover says: "The moments that follow are Backroads' general itinerary for their Day N, with Larisa's Guide's own
    lines where they're the same moment. Details can differ for your departure." Backroads' current web page describes
    another departure and isn't used. A moment quotes the sentence its title names (both, when the title names two).
  - **On the day's page**, under "The day with Backroads", one line names their moments with their lengths ("Backroads'
    general itinerary for their Day 1: Shuttle to Kanuma (2 hours) · … Play the day shows each, in their words."), so
    the ride and the stops are there without opening Play; her check-out, meeting and dinner follow in the list.
  - **Check-out on the morning they leave** (day list, card, Home, Play): "Meet Backroads, Courtyard by Marriott Tokyo
    Station is at 8:30 AM, so check out before then. The hotel's own check-out time is 12:00 PM."
  - **Any other day** without her timed plan plays her lines in the day list's order.
- **A moment**: the photo, the time, the name, a line of her note, a train's booking, her bookings and dress code, the
  stop her tab names for the line, Maps, "6 photos". "Her full note" shows all her words for the line.
- **The list's corrections come along**: each moment carries what the day's list says about it (a booked arrival, "the
  sources give two times", her tabs differing), and the stop's hours when they don't fit her time (§3.4). A line her
  Guide marks done is never a moment. An open note never stops the words scrolling.
- **Her order, nothing dropped**: her travel lines (taxi, transfer, return, and "Leave…" lines) fold into the moment
  they lead to as "Getting there: 9:15 AM · Taxi back to …". A "Finish X" line joins X as "Then: …".
- **Moving**: a white **Next** button names what comes next ("Next · 1:30 PM / …"), with ‹ for the one before. Swipe left
  and right moves between moments; taps on the picture still work; swipe down, ✕ or Back closes. It never moves on by
  itself. Keyboard focus stays inside Play while it's open.
- **The cover**: a day that isn't under way opens on the date and city over the day's own first stop photo (or the
  city's), the day in a few sentences (her Itinerary line when there's no summary), "13 moments · 6:45 AM to 6:30 PM"
  (the span only when the first and last moments have times), and **Start**. To Larisa the summary speaks in her voice ("your tab"), as the day page does. When her tab has two
  versions of the day, the cover says which one Play follows. Today opens on Now, with the cover one step back.
- **Rain and sunset** (Oct 15). Play has no weather band, so the band's rain hours are said on the moments they touch:
  "The forecast has rain likely 2–6 PM" on the first moment of that span, "One forecast sees showers 9–10 AM" likewise.
  They come from the same forecast as the band, for days up to three ahead (§6.4). Today, only what's still ahead, on
  the next moment ("… until 6 PM"). Sunset is worked out on the phone for the day's city and said as "about": on the
  cover ("sunset about 5:07 PM", never split across lines) and on the moment the sun goes down in. No sunset line once
  the sun is down. Ken (Oct 15): "the feature or info or view the user would want before they realize they want it".
- **Today**, each moment says when it is: Now, "in 45 min", Under way (someone else's line), Earlier today. A moment
  further off says This morning, This afternoon or This evening.
- **No sure photo**: the moment shows a drawing of its kind of stop (a bowl for a meal, a gate for a temple, a train, a
  bed for the hotel) on a warm colour, just above its words. On a Kyoto day her own map panel for that day fills the
  upper part, captioned "Larisa's map of the day" ("Your map of the day" to Larisa). On other days the upper part is a
  faint pattern of the drawing. Her map sits centred in its room. Nothing suggests a photo of the stop. A small photo
  shows whole over a blur of itself.
- **On a booked train**, its moment leads with the booked times and gives her plan's time beneath. Once you're on the
  train, no "Getting there" shows.
- **Your own photos**: photos shared with the trip, and your own, play right after the moment they were taken in
  ("Next · 1:42 PM / Andy's photo"), whole and uncropped, with their words under them when someone added a few. A photo
  with no clock comes after the timed ones. Someone else's photo shows only once its picture has come, and drops within
  seconds when its taker makes it private or deletes it (§3.8).
- **Motion**: photos drift slowly closer and fade into each other; none of that under Reduce Motion.
- **Moving on by itself** (Oct 16): the first time after 3 seconds, then every 4 (Ken: "with more photos, auto advance
  can be 1-2 seconds faster"; it was 5), a second photo at 2 seconds, the bar at the top filling for the
  moment showing. It waits while a finger rests on the screen, while a moment's full words or its photos are open, and
  while Wander isn't on screen; it stops at the end and never goes into the next day by itself. Ken: "Play day should
  auto advance after a few seconds… first change after only 2-3 seconds to teach users about auto… then slow to 5
  seconds for rest."
- **All its checked photos** (Oct 16 two; Oct 17 up to six): each fades in over the last, 2 seconds each (six photos,
  12 seconds; a tap moves on), with its own credit; after a pause it goes on from the photo showing, the bar filling over
  what's left. "6 photos" opens them full screen at the one showing.
- **On Home** (Oct 16): today's lines carry their places' photos, small at each line's end, and Next's box its place's
  photo on its right side — the same checked photos as the day's screen.
- **The end**: "That's the day.", ‹ back to the last moment, and **Play tomorrow**, straight into the next day's Play,
  or **See tomorrow** (the next day's page) when that day has nothing to play. Played on a day other than today, they
  read **Play the next day** / **See the next day**.

### 3.8 Your own photos

Each of the four keeps their own photos on the trip day they took them (Oct 15). Ken: "Yes. Value, delight. Not
gimmicks. Go", to: "let each of you add your own photos to a day… private by default, with a choice to share with the
trip".

- **Where**: "Photos from the day" near the foot of each day page (§3.5). With none yet: "Your photos from this day,
  kept with it." and, following the box, "The ones you add are shared with the trip." or "The ones you add are just
  yours."
- **Adding**: "+ Add photos" on today or an earlier day, several at once. Each is filed under the day its own clock
  says it was taken (else the day you're on), and shrunk on the phone. "Share with the trip" starts where you left it
  last time. Wander says where they went: "3 added, shared with the trip (some on Oct 14, when they were taken)".
- **The strip** shows your photos and the ones the others shared, by when they were taken; your private ones are marked
  "just you". Photos with no clock sit after the timed ones.
- **The viewer**: a tap shows them full screen, a swipe for the next, with who and when ("You · 1:42 PM · just you"). On
  your own: "Add a few words" (a caption, shown under it there and in Play), "Share with the trip" or "Keep it just for
  me", and Delete, which asks first ("Delete for good" or "Don't delete") and is gone for real.
- **Through Scout**: send a photo and say "keep this for today" (just yours) or "…share it" (keep_photo, prompt rule
  62). A receipt or a ticket stays a paper (§9.6).
- **Also in**: Play the day (§3.7) and the story of the trip, where shared photos lead their day (§9.8).
- **Privacy**: nobody else ever sees a photo its taker hasn't shared (§19).

---

## 4. Larisa's Guide as Master, and the Importer

### 4.1 Where her Guide comes from

Wander reads snapshot copies of her sheet that Ken downloads and gives to Wander. It never reaches her online sheet.
Ken's words for it: "never reach her online sheet". Changing that is Ken's call alone. Wander never uses the Google
Drive connector.

New copies during the trip. Ken (Oct 2): "I want you prepared for a new copy anytime during the trip that Larisa makes
changes to the sheet by phone or iPad. When she does that, I need to download with my phone (only device) and give to
you over the long distance remote control from Japan to Mac." The procedure (trip-data/session-tools/guide-update)
finds the copy, imports it into the test copy, and lists every warning and changed cell. Each is read before
production. After production, only the changed days' summaries are rewritten, and each is read before it's published.

### 4.2 How Wander reads her Guide

Ken (Oct 4): "I want to reinforce that this smart parsing of her unstructured (sometimes random) entries are the power
you bring. That intent and requirement should stay durable across sessions please." Ken (Oct 2): "Larisa has spent a
great deal of time on that spreadsheet. She is precise and intentional. Everything earning a place in the spreadsheet
is important… every word, image, and number [is] 'data' that is valuable…"

- **Every tab**, with each tab given exactly one reader: the Itinerary, a day plan, a reservations tab, a booking email,
  an actions list, a pasted copy of Ken's rail sheet. Columns are found by their header names. Her words are kept as
  written, her Notes column and rows without a date included. Sections she marked "SKIP" stay out.
- **Every word on her pictures** (flight confirmations, booking screenshots, illustrated maps). Scout gets each
  picture's full words, read once even when she pasted it in several tabs (Oct 2).
- **Pasted emails** for bookings and deadlines. A deadline worked out from a rule ("reconfirm 3–7 days prior") says so,
  quotes her words, and is listed on its last day. A date when charges start closes as that day begins (Oct 4).
- **Every line records its exact cells**, so Sources can open the spot (§7.4).
- **Day tabs**: time blocks, choices in a block, who each line is for, her stop list's map links, and a date matched
  when her tab gives none (Wander says how it matched).
- **Her shorthand**: initials become names ("KL day trip" is Ken & Larisa's; "AB / JD" is Andy & Julie). Initials no one
  on the trip has ("LT") stay as she wrote them; her "LT actions" list is a heading, never a person.
- **Her informal lists** in the Actions tab: a cell ending "actions" or "to do" heads a list of to-dos.
- **Backroads dinners** listed "Day 1" … "Day 7" are dated from the first Backroads night in her Itinerary, and say so.
- **Done marks** ("— DONE", "DONE —", "(done)", a tick) close a question or line, which then isn't shown as open.
- Hotel dates written into a hotel's name win over the date columns. A room description beside a hotel isn't the day's
  line. Working notes in a heading never create a city. "By 3:45p" is never a start time. Tab names cut at 31 letters
  end at the last whole word with "…".

(Claude) Never trust "accepted" on an import: a sentence she typed in the hotel column became a second hotel (Oct 4).
Fix the reader with a general rule tested on her real cells; never her sheet. Before asking Ken about her sheet, read
the cell. Ken (Oct 10): "There is no lt. why do you keep asking?" Ken approved (Oct 11): everything she wrote is data
Wander holds and Scout can answer from; how much screen work each piece gets is proportionate. Ken is asked only when
two readings would give a different time, place or booking.

**A picture older than her text.** Her Tokyo day tabs open with an illustrated map labelled with earlier dates. Ken
(Oct 15): "The map is old and should not be the target. Text under is correct". When Wander's reading says a picture
dates the day differently, the day page doesn't offer the picture, and Scout says it's her earlier plan. Home's tab by
tab says under it: "The dates in this picture are from an earlier plan. Her text in this tab is the plan Wander
follows."

### 4.3 A new copy

A good copy replaces the Guide layer, and Wander records what changed. A copy that looks broken (no itinerary, no
dates, or far fewer hotels or tabs than last time) is refused, and the last good reading stays.

Nothing people added in Wander is lost on a re-read. Plans added in Wander are stored apart from her Guide. An idea
that leaves her Guide carrying anything someone added is kept, marked "No longer in Larisa's Guide"; if she renamed it
(one new idea in the same city shares a distinctive word), the additions move to the new one. Wander's I'm in marks
survive (only her X marks are replaced). A maybe taken off the list stays off. Her maps, Wander's place notes, the
Backroads itinerary, the sheet's link and the day-plan version Wander follows are all kept.

### 4.4 Wander's own notes on her places

When her Guide only names a place (a Backroads stay, say), Wander can keep its own note on it, apart from her Guide:
where it is and where that came from (Oct 2). Scout reads it beside her stay, marked as Wander's addition. Sources lists
it as Wander's note. Walk, Train and Taxi use its location when nothing of hers gives one, and the Home map places the
stop by it. A stop is never given an old stop's pin by its dates alone.

### 4.5 Her other sources

From CLAUDE.md §2: "Her view-only share links (Apple Maps guides, her Google map) may be read; say so first."

- **Her Apple Maps guides** (Oct 2). For some days she made a guide in Apple Maps. **See her Apple Maps guide for the
  day ↗** opens it as it is now. Scout knows each guide's places and addresses and Wander's straight-line distances
  between them. Ken: "Scout might add value by saying what's close and what isn't". Scout says which are close and which
  need a train or taxi, as straight-line distance, never a walking time, and never reorders her day. Where her guide and
  her tab differ, Scout says both. A guide is matched to its tab by name; one no tab matches isn't put on a day.
- **Her Google map** (Oct 11): her map of every location of the trip, in layers she named. Anyone asking for it gets the
  link ("Open the Google map"; to Larisa it's her own). Scout uses her pins for "where is…", what's close to what, and
  directions when her sheet gives no address. A layer's name is hers, never a date. Wander reads its public export
  again every few hours and keeps the last good reading. A pin far from every town of the trip is weighed against her
  plan; a misplaced one is never used for directions.
- **Backroads' itinerary** (Oct 4). Ken gave Wander Backroads' detailed itinerary for their week. Its words are kept as
  written, its days dated from the day her Guide meets Backroads. Scout reads it as "Backroads' own words, given to
  Wander by Ken — NOT Larisa's Guide". It is their general itinerary, not one for this departure, and Scout says so
  when it matters. Where it and her Guide differ, Scout says both.

### 4.6 Seeing her Guide in Wander

- **Your Guide, tab by tab** (Home): her tabs in her sheet's order, each opening on its own. Her pictures open full
  screen ("See the picture ›": pinch or double-tap to zoom, Done or Back to close). Wander's own links say they're
  Wander's.
- **Find a word** at the top of tab by tab: every tab and every word on her pictures, searched on the phone, no accents
  needed ("osaka" finds "Shin-Ōsaka"). Each find shows the tab and cell, her words around it with the word marked, the
  day it belongs to, and "Open this spot in your sheet ↗". It works with no signal after the first search. A word she
  never wrote: "Nothing in your Guide says '…' — at least in the copy Wander has."
- **The whole trip on one page** (Home, under the calendar): day by day (where, her line for the day, where you sleep,
  meals booked); where you sleep (dates, nights, whose, check-in and check-out, confirmation, free to cancel until);
  every meal in her dining tab with any disagreement; flights and booked trains in one list; every date to keep in mind.
  A table on a laptop, a list on a phone. Every row opens its day.
- **Open at this spot in her sheet.** The phone opens her Google Sheet at that tab and those cells; Google decides who
  may see it. Wander never opens her sheet itself. A tab Wander has no address for opens her sheet, with the tab and
  cell named in words. Her sheet's address and tab ids live in the database, never in this public repo.
- **Settings → Where Wander's plan comes from**: the copy of her Guide and Ken's rail sheet, each with when Wander last
  read it, in Japan time on every phone.

---

## 5. Trains: Ken's Rail Sheet

### 5.1 The source

Ken's rail sheet is his own Google Sheet of rail reservations, written with AI help (Sep 30). Wander reads it live and
read-only: its robot can only view it, and nothing in Wander writes to it. It's read again every 10 minutes; a new copy
is kept only when something changed; if a read fails, the last good copy stays and Wander says so. It's never merged
into her Guide. Its tabs are recognized by their header rows (the trains, the ticket pickup steps, a rebooking tab), so
they'd be read the same way in any sheet.

### 5.2 Trains on screen

Each leg shows its times, train, class ("Green Car (JR's first class)"), car and seats, reservation number, how many
people, the sheet's own status words, its notes, and where it came from ("From Ken's rail sheet, written with AI help —
Rail Detail tab, row 6"). A leg with no booking says so. A leg the sheet marks "?" says its open question right there.
24-hour times get their 12-hour words ("18:17 (6:17 PM)"); 10:00–12:59 only gain AM or PM.

**Whose trains.** A leg with seats for the whole group is everyone's. Fewer seats are the sheet owner's couple (Ken &
Larisa). Andy and Julie never get Ken & Larisa's trains as theirs; a note that says whose ("Ken + Larisa only") shows up
top.

**Status words.** A status that starts with Done, Complete, Confirmed, Verified or ✓ is settled: shown in the colour of
a thing done, never under Don't miss, and Scout is told it's done (Oct 4). A "PENDING — SmartEX…" check goes once you're
aboard. A status naming a day already past reads: "The rail sheet still said, when Wander read it …: "…" Wander can't
tell whether that has been done since", with whose job it was.

### 5.3 Rebooked trains

When the sheet gains a rebooking tab, Wander marks each train it lists (Oct 9). A cancelled booking's number, seats,
cost and notes are kept only as "the cancelled booking's", never on a screen or from Scout as current. A rebooked train
says "Rebooked on Ken's new card — car and seats are on the paper tickets" until the new details are in the sheet. A
train cancelled and not rebooked says there's no booking for it.

### 5.4 The ticket pickup page

The sheet's pickup tab, step by step, in its order and words, with a tick for each that stays on that phone (Sep 30).
It opens at the step you're on, folds ticked steps to one line, titles each reservation by its journey with the
reservation number in bold and "The ticket should say:", and counts in tickets ("4 of 6 tickets ticked on this phone —
next: JR West 5"). A row of jump buttons sits near the top. It opens with no signal once seen. After the pickup day,
a ticket this phone didn't tick is said at the top of Home and Next on the morning it travels, with the sheet's own words
on where it can still be had. Once tickets are in hand, the collection steps are left out.

### 5.5 Your seat, from the ticket you kept

A train's card shows the car and seat from a ticket kept in Papers for that day that names the same train: "Car 9, seat
11-D, on the ticket you kept" (Larisa sees "on the ticket Ken kept"). Ken (Oct 13): "I know Scout knows my seat, and I
can't read it, and it's not showing up." A ticket carrying two trains gives each train the car and seats written after
its own name.

### 5.6 When the sources differ

Worked out by rule, never settled: when the rail sheet and her Guide give a train different times, both show, each with
its source. A window that holds the time ("ideally around 4:45–5:00 PM" for a 4:58 train) or "leave 6:15 or later" is
agreement. The difference shows until every time it names has passed.

### 5.7 Train status

Scout has no train-status tool: the old one read an empty route list and said there were no trains (withdrawn Oct 10).
For delays Scout finds the railway's own status page and says it found it online. It never says whether a train will
run. On a day with a train, the storm watch adds JR's rule (§6.6).

---

## 6. Weather and the Storm Watch

### 6.1 One source

The day's weather is the live forecast (Open-Meteo, in °F) for where you'll be. Her pre-trip forecast shows only when
there's no live one, labelled "Her pre-trip estimate" (Oct 10). Ken (Oct 13), on Scout and the screens: "yes. One
unified and correct source". The day page, Home and Scout use the same forecast and the same words (one file on each
side, a test failing if they differ). Wander asks for 15 days (asking for 16 failed between midnight and 9 AM in Japan).

### 6.2 Which place

- **Where you sleep that night**: "Forecast at the <hotel>: 48‑66°F, 68% chance of rain". The town's forecast only when
  there's no stay that night, and before a person's own first night (they're on the plane). More than 7 days out the
  line says "Early outlook". A day that's over shows no forecast.
- **Two places when the day goes somewhere else** (Oct 13). Ken: "staying at [the hotel], but the day plan is to go to
  Mashiko, so both weathers should be there, even if it means an additional line of small text with the same standard
  spacing between lines. That should always be true if you can identify a different location from the plan." A day trip
  in her plan for you gives "Mashiko: …" then "Tokyo: …"; a travel day gives "Tokyo this morning: …" then "Nikko
  tonight: …". A second place counts only when it's more than about 15 miles from where you sleep. Plan words in a
  headline ("Rest Day", "Departure") are never a town.

### 6.3 How much rain

Every forecast gives the day's expected rain in inches right after the chance: "rain 90% (.09")" on Home, "90% chance of
rain (.09")" on the day page. Ken (Oct 13): "rain percentage is important, but especially in Japan, the quantity of
rain matters, so can you in parentheses right after the percentage put the quantity of rain in inches? E.g., (.0x")".
An amount that rounds to nothing beside a chance of 20% or more reads "(under .01")". When the main forecast gives 30%
or more, Europe's, Japan's and the US models are compared: "though other forecasts show little rain" when none shows any
to speak of, "but the forecasts disagree" when some do.

### 6.4 When the rain comes

On a day up to 3 days ahead with a 30%+ chance, the day page says when it's most likely: "90% chance of rain (.09"), most
likely 3–7 PM, with showers possible 8–10 AM"; also "until 10 AM", "from 6 PM", "likely through most of the day", "on and
off 8 AM to 6 PM" (Oct 13). An hour is "most likely" when the main forecast gives it 50%+ or two of the three models put
measurable rain in it; "showers possible" when one model alone puts .02"+ in it at a 25%+ chance. Between 7 AM and 10 PM
Japan time. On today, only the hours still to come, worked out on the phone, so a morning copy stays right with no
signal. On a travel day, the morning's town gets its hours to 1 PM and tonight's town from noon. Not on Home.

### 6.5 Staying current

Home's line and the day page's lines ask again whenever the phone shows Wander again (unlocked, switched back to), once
more a minute later, when the signal comes back, and every 5 minutes while in view (Oct 14). A copy under 30 minutes old
is reused, the same time Wander's server keeps one. The forecast Scout read for an answer becomes the phone's copy, so
the screens show the numbers Scout just said. An older forecast never replaces a newer one. The phone keeps a copy for
no signal; a copy kept by an older version of Wander is fetched again.

### 6.6 The storm, warning and train watch

A watch on Japan's weather agency (JMA) for each person's own places, today through 5 days ahead (Oct 14; Ken, Oct 13:
"yes"; live before the Oct 21 Shinkansen). It is silent unless one of these holds:
- a Level 3+ warning is in force for the town you're in today (all of it, or "part of" it);
- a medium or high chance of warning-level weather there (by region for the next day or two, then by prefecture, said
  as the prefecture's, as far as the agency's outlook goes);
- a typhoon or tropical storm forecast within about 190 miles of you within 5 days, checked hour by hour along its track.

Its places are the day page's (where you sleep, a day trip, a travel day's start), the airports in her plan that day,
and the areas a travel day's road route crosses. A day with a train adds JR's rule: planned stops are usually announced
the day before, and a cancelled train is refunded in full. Its line is first under Don't miss, with a link to the
agency's English warning or typhoon map, or the Shinkansen's status page. Scout sees the line with every question, so a
typhoon on a travel day is said even when asked only "anything I should know about the 21st?". When part of the agency's
data can't be read, Scout says so and never gives an all-clear. A file that has stopped updating is refused.

### 6.7 Packing tips and the Safety tips note

**Packing tips** (Scout's packing_tips; Oct 12): Ken: "Adjust your packing tips for this. Don't say obvious things. Be
helpful." From the live forecast at each of that person's hotels, from their own first night: up to three items tied to
their dates and to what her Guide and Backroads have them doing, then a checked list of what Americans most often wish
they'd brought to Japan, seven in all. Nothing Backroads already tells them, no umbrella to pack (convenience stores
sell them), never "mild" or "bring ordinary clothes". Rain is "likely" only when all three models show it; otherwise
"may", saying the forecasts disagree. Julie and Andy were offered this once in Scout before they flew (§7.5).

**The Safety tips note** (Home, for Larisa, Andy and Julie; Oct 13): Ken got an alert pointing him to Safety tips, the
free warning app from Japan's Tourism Agency; he installed it, "and you're with him". "Here's how" shows three steps and
an App Store button; "Got it" puts it away for good on every phone. Ken: "Messages should be gentle".

---

## 7. Scout

### 7.1 Who Scout is

Scout is Wander's guide, asked in words or by voice from every screen. Its voice is a Backroads guide, knowledgeable and
warm. Ken (Apr) on those guides: "some of the best employees in any job I've ever seen." The test: would a world-class
trip guide say this, in this tone, at this moment? Scout answers the question in its first sentence, keeps in-the-moment
answers short, never repeats a paragraph, and uses no spreadsheet words. It says "Larisa's Guide" to everyone but
Larisa, and "your Guide" to her.

### 7.2 What Scout reads with every question

- Her whole Guide, every tab, with every word on her pictures; every date with its weekday; who isn't in Japan yet on
  each date; today, tomorrow and yesterday named.
- Ken's rail sheet, Backroads' itinerary, her Apple Maps guides and Google map, Wander's notes on her places.
- What people added in Wander: plans, picks, maybes and I'm ins, the phrase card, to-dos and their marks.
- Facts already worked out: each deadline's status from the clock (passed, open now, not open yet), each flight's
  status by its schedule in both clocks, where each party is now, whose a split-day line is ("whose: not stated").
- The notes the asker may see (their own and those shared with the trip) and what Scout kept for them; the papers they
  may see.
- The storm watch's line, when there is one.
- The person's own date, time and time zone, the screen they're on, and when Wander last read each source.
- Only the last 10 messages of today's conversation. What lasts is Notes (§7.10).

### 7.3 Scout never lies

Scout may honestly not know. It never states a time, place, booking or fact it can't support. It gives the Guide's
answer with its tab; the web when the Guide is silent, labelled as found online, never as the plan; plain words for
what's unknown.
- **Links** in an answer are only ones Scout saw while answering (her Guide, the rail sheet, a document, a file sent, a
  tool's result, a page it opened). Wander checks every answer; a link Scout never saw sends it back once, and one it
  keeps anyway is marked "(Wander couldn't check this link — Scout didn't open it)" (Oct 4). (Claude) Past his rail
  sheet it had described a page it never opened and given a dead link.
- **Website and app steps** come only from a page Scout opened, the rail sheet's steps, or the person's screenshot.
  Otherwise it asks for a screenshot. While someone works through a screen, it gives only the next step.
- **Who did it**: who booked, paid or set something only when a source says so. A hedge ("it should be in the email") is
  a claim and needs its source.
- **Her plan**: it never reconciles two tabs that disagree, never says which "to go by", never adds units, never treats
  a check-in time as an arrival or a line's time as a time to leave, copies her transit directions word for word, names
  a restaurant by its booking, never names a vehicle her Guide doesn't, and never assigns a split-day line with no name.
- **Flights**: only what the schedule supports ("should have landed by now… that's the schedule, not a confirmation").
- **Its own estimates** (a departure plus a ride) are labelled as its estimates.
- **Distances** are straight lines, never walking minutes of its own.
- **Bookings**: only the person a booking is under hears "your name".
- After someone says no, it doesn't offer again.

Exams are written from her text before building, never from Wander's output. They're rerun after any change to the
reader, Scout's context or its prompt, and every answer is read word for word. When Scout passes one, a harder one is
written. An honesty failure is a blocker.

### 7.4 Sources

Ken (Sep 30): "make sure we're not trying to surface the sources unless they're requested." Ken (Oct 2): "be sure the
source button goes to the right tab and right cells… a button to open it".

Under each answer, a quiet **Sources** link opens "Where this came from": each part from her Guide with its tab, cell
and exact words (with **Open at this spot in her sheet ↗**); Wander's own notes, labelled "not her words"; a screenshot's
**See the picture**; what Wander worked out (a deadline's status, who's at home) with the cells it came from; plans added
in Wander and who added them; Ken's rail sheet, Backroads' itinerary and her maps, each named as not her Guide; web
pages with their title, address and the words quoted; a file sent with the question ("Sent with the question — Wander
doesn't keep it"); a time Scout said that isn't in its sources ("Scout worked it out, or got it wrong. Worth checking");
and Scout's own words with no source. It names the copy of her Guide it came from.

Sources are recorded when the answer is written (Anthropic citations), never worked out afterwards. Ken: a wrong source
is worse than none. An exact quote Scout forgot to point to is found and shown as such ("Wander found them here, word
for word"). Escape closes the Sources panel, and only it.

### 7.5 Scout's panel

- **Opening**: the Scout tab or any "Ask Scout" button opens Scout with the cursor in the box and the keyboard up, in one
  tap. It opens at half height so the page stays readable; swipe up for full height, down to make it small, ✕ to close.
- **The slim bar** (Scout made small): two rows, Scout's own headline for it, then ↩ Back, an "Ask Scout…" box, the
  microphone and ✕. Ken (Oct 13): "change to dark is confusing. So please keep scout color same at all three sizes." It
  is the open panel's cream at every size.
- **Showing you things**: "Show me the day Andy and Julie arrive", "show me the deadlines": Scout opens the screen, says
  what it opened, and steps down to the slim bar. ↩ Back, a typed or spoken "back" and the phone's Back each go one
  screen. Scout never moves the screen while you're typing.
- **The box** (Oct 18; Ken: "ability to include a new line via return, etc. Just like this field with you"): on a phone,
  Return makes a new line and the arrow sends; at a Mac's keyboard, Return sends and Shift-Return makes a new line.
- **Stop** (Oct 18; Ken: "should be able to stop scout thinking as I can with you… to question or edit the question"):
  while Scout answers, the arrow is a Stop. A tap ends the answer, takes the question off the conversation and puts it
  back in the box (with anything sent with it) to change or ask again; Wander is told, so that answer is never saved and
  never turns up later. Anything a tool already did before the Stop stays done.
- **The microphone**: tap to start, tap to stop; the words wait in the box for a glance and Send (Ken's choice, Oct 1).
  No auto-send, no hold-to-talk. Send stops the mic. Before the first word, after six seconds with nothing heard: "I'm
  not hearing any words yet…". Pauses in a long recording are joined with a space, and a period where the iPhone signals
  a fresh sentence; the words themselves are never changed (Oct 14).
- **The mic keeps listening until you tap stop** (Oct 16). Ken (Oct 15): "When dictating a note or message to scout,
  wander seems to time out and iPhone sleeps while dictating." An iPhone ends a recording by itself after a pause; Wander
  now starts listening again for the same person, the words heard so far kept in front. It doesn't start again once
  they've tapped stop, while Wander is in the background, or when the phone keeps ending it at once. The same holds for
  Notes' Talk.
- **The screen stays on while words are coming** (Oct 15–16): while Wander's mic listens (Scout's mic, Notes' Talk), and
  while any box in Wander has the cursor and words are arriving, since the keyboard's own microphone is the iPhone's and
  Wander isn't told about it. It may sleep again when listening stops, when the box is left, or after 3 minutes with no
  new words.
- **Unsent words are never lost** (Oct 15). Ken: "Larisa was dictating something that started with the phrase, ask Ken
  with a major new feature, and her phone just shut off and lost the dictation, and it was all wasted time. There is
  something about scout getting dictation that needs to keep the phone from turning off". Scout's unsent words, typed or
  dictated, are kept on the phone as they come, so a screen going off, a reload or an update never loses them. They're
  back in the box the next time Scout opens. Sending clears them. Each person's are their own.
- **Under each answer**: Sources, **Copy** (the whole answer as plain words), **Read aloud** (the phone's own voice,
  Japanese in a Japanese voice, nothing sent anywhere), and any buttons the answer offers. On an iPhone the voice follows
  silent mode, which Safari can't report, so while it reads a line says: "Hear nothing? Silent mode on your iPhone
  silences this voice too." (Oct 15; the voice now starts a moment after any stop and holds each part until it's said,
  since Safari had dropped it on Ken's iPhone.) Tables are drawn as tables.
  Web addresses show as short tappable names.
- **While it works** it says what it's doing: "Reading your picture", "Reading what you sent", "Going through the trip",
  then "Still working — a long answer takes a minute or two". The phone waits up to two and a half minutes.
- **On a bad line**: when the line drops mid-answer, Scout says "The connection dropped while I was answering — I'm still
  on it, and the answer will show up here", looks for the saved answer, and shows it once. Each question carries its own
  tag, so an answer is found for exactly that question. With no signal at all: "No signal right now…", and it looks once
  the signal returns. Try again never loses an earlier try's answer.
- **The same conversation on every device** (Oct 4). Ken: "When I change devices or change between a webpage and web app
  … I seem to lose the history". "Start fresh" asks "Clear this conversation on all your devices?"; what was said stays
  saved.
- **A buzz when an answer takes a while**: "Scout answered" on the lock screen for any answer of 8 seconds or more. Each
  phone is asked once, ever. The lock screen shows the answer's first line, unless it holds a booking code or a long
  number. On iPhone, from the Home Screen icon only (Apple's rule for web apps).
- **Ask from a link**: Wander's address with "?ask=<question>" opens Scout asking it, for a Siri Shortcut (Oct 5). The
  question leaves the address at once, so a reload never asks twice.
- **Offers and tips**, one at a time, in order: a one-time packing offer for Julie, a weather packing offer for Andy and
  Julie before they flew (each with Later and No thanks), the Tell Ken line (§13), the paperclip tip, the Sources tip.
  Scout's evening question ("Anything worth remembering from today?") opens Notes for the day; it's never asked on a
  Japan date you're still at home, on landing night, during a booked dinner, or on a visit something else has asked.
- **On the iPhone**: the box sits above the keyboard and clear of the bar iOS floats over it (˄ ˅ ✓); the page under
  Scout holds still; the panel's top stays below the clock's strip. On iPad the panel sits above the bottom bar and the
  keyboard. (Claude) Any change touching the keyboard or fixed elements stays inside one component and is unverifiable
  until Ken's phone (rules/engineering.md, § iPhone).

### 7.6 Photos and files

Ken (Oct 4): "User should just drag (Mac) or paste (iOS) anything and Scout should parse and make sense if it: picture
with text, pdf, text, etc."

- **Ways in**: the camera button; paste into the box (a picture shows as a small copy, a document by its name); drag a
  file anywhere onto Wander on a Mac or iPad ("Drop it here — Scout will read it"); the paperclip, for PDFs, Word
  documents, text, CSV, email and web pages. Up to 6 per question, 10 MB each. Photos are shrunk on the phone first.
- **What Scout does**: pictures are read and translated (a menu or sign line by line, the Japanese beside the English);
  PDFs page by page; documents by their words. Sent with no question, Scout says what it is and what in it matters for
  this trip. Where a file and her Guide differ on a time, place or booking, it shows both. A file it can't open is named
  as unread, never guessed at. A menu photo can't prove what's in a dish; Scout says to confirm with the staff.
- **Nothing sent is kept** unless someone asks Scout to keep a paper (§9.6). The saved conversation keeps only file
  names.

### 7.7 Where you are, and how to get there

Ken (Oct 11): "the two closest places that attracted Larisa are X about 4 blocks from you and Y a 1.5 mile walk in the
direction of your hotel".

- **What's near me**: her pins first (her Google map and Apple Maps guides), each with how far in the words people use
  ("about 400 m — roughly 4 blocks", "1.5 miles"), which way, and "toward your hotel" when it is within 30°. Straight
  lines, never a walking time. Far from all of her places, Scout says so and names the closest.
- **Everyday needs** ("somewhere to sit down for a coffee?", "a pharmacy I can walk to?"): when her pins have nothing of
  that kind near, Scout finds the closest real ones near the phone (Google Places), said as found on Google, with a
  walking button to the closest open one (Oct 12). On a fast-moving train it says "near" is changing and offers no
  walking button.
- **Use my location**: when Scout needs to know where someone is and can't see it, its answer carries "📍 Use my
  location"; one tap asks the phone and asks the question again. Scout decides when an answer depends on where they are,
  so it works for any wording. iOS forgets a Home Screen app's location answer each time it's opened, so this is the
  usual way on a fresh open. If they say no, a short reply says so; a second no says how to change it.
- **Directions**: asked how to get somewhere, Scout names the stop and its time, quotes her own route for that leg, and
  adds a button for each way, each opening Google Maps ("Walk to … ↗", "Taxi to … ↗"; §2.4): the way they asked, else
  the way her plan names, else Walk and Train. It never writes turn-by-turn steps or travel times of its own. The destination is hers, best first
  (her linked pin, her address, a hotel's booked address, her map's pin); it never sends you to a different place of
  hers. When it can only search, the button says so: "Maps will search for … Check it's the right place before you go."
- **The phone's position** is sent only with a question that needs it, goes to Google only for "near me" questions,
  rounded to about 100 m, and is never stored (Ken approved, Oct 12).

### 7.7a Letting everyone know

Ken (Oct 18): "Alert on next login function from anyone using anything to scout like 'let everyone know' with 'got it'
and 'remind me' as options. This is for logistics not general messaging." Anyone on the trip tells Scout ("let everyone
know…"). Scout confirms first, in Ken's words: "Got it. Here's what I'll send: “…”", says who gets it and asks; it sends
only on their yes, those exact words, short and in their voice, never a list of names ("a wall of text"). Each other
member sees it whenever Wander is next on their screen (opened, or come back to), on whatever screen opens, as a card
just above the bottom bar: "From Ken, for everyone · 10:33 AM", the words, **Got it** and **Remind me**. One at a time,
oldest first. Got it ends it for that person; Remind me brings it back on the next day (Ken: "start with the first login
the following day"). It's gone from everyone's screen after 3 days, or once its moment has passed: a message about a
moment ("the bus leaves at 8:15 tomorrow") ends then (Ken: "Expires in 3 days or the moment that the moment has
passed"). It waits while Scout's panel is up. Scout's own answers agree with what everyone has been told (asked "who are
our guides?" after a message that the spellings may be off, the names come with that). Only logistics: a feeling or a chat Scout
declines in a line, offering a shared note or a text. Asked "has everyone seen it?", Scout says who tapped Got it, who
asked to be reminded and who hasn't tapped either (Wander knows only taps). The sender, or Ken, can have Scout take one
back: hidden from everyone, never deleted. No notification is sent.

### 7.8 Weather answers

Scout answers the weather from Wander's own forecast, the day page's numbers, hours and places for the person asking:
both places on a day trip or a travel day, the day's place first; "early outlook" only for days more than a week out
(Oct 14). It never gives ranges of its own ("high 40s"), never calls the day's range tonight's, and never ties one
place's rain hours to another place. On a day with a flight it also has the airport's own forecast. A town in Japan
that isn't on their plan gets Wander's forecast for it, said as not where their plan has them.

Hour by hour (Oct 17; Ken, the night before the Nikko ride: "What the temperature in Nikko where we start biking from
1pm to 6pm?"): asked about part of a day, Scout gives each hour's temperature and chance of rain from the same forecast,
at each of the day's places, with the place's height above sea level and how far Europe's and the US forecasts run from
it. A town the day passes through (where a ride, a walk or a tour goes, from Backroads' itinerary or her Guide) gets its
own reading, never a guess from the others.

Another source (Oct 17; Ken: "Find another source for hourly… I want to be sure it's the correct Nikko and accurate"):
asked for one, or to check a weather app, site or screenshot against Wander, Scout searches online and gives both:
Wander's first, then the other, named and said as found online. Differences are worked pair by pair from the numbers
given, with what may explain them; it never calls either one wrong beyond what it can see, and never refuses to look.
Unasked, Scout gives only Wander's forecast for Japan; weather outside Japan is searched online.

### 7.9 What Scout can do, and what's withdrawn

Scout's tools for Wander's own additions match the screens (§1.3 rule 11):
- **Maybes**: add_maybe, im_in, take_back_maybe, remove_from_maybes, put_back_on_maybes; notes on ideas (add, take back).
- **Plans for a day**: add, list, remove.
- **Notes**: keep_in_my_notes (what you told Scout, or Scout's own answer kept "from Scout"), get_my_notes.
- **Papers**: keep_paper, remove_paper.
- **The phrase card**: add_phrase, arrange_my_phrases.
- **Actions**: get_todos, add_todo, set_todo_done, remove_todo, set_deadline_done. Marking one of her to-dos done marks
  it in Wander, never in her list.
- **Getting around and weather**: directions, offer_location, places_near_me, get_weather, packing_tips.
- **Money**: add_expense, remove_expense, money_so_far (§9.9).
- **Your photos**: keep_photo, for the day, just yours or shared (§3.8).
- **To Ken**: tell_ken (§13), add_wander_idea (§12).
- **Screens**: opening any screen Scout can describe.

**Withdrawn** (WITHDRAWN_TOOLS in backend/src/routes/chat.ts, and they stay withdrawn): deleting places, cities, days,
hotels, bookings, route legs or group choices; shifting or re-dating days; reordering or hiding cities; creating or
switching trips; adding people or changing who plans; re-sending invites; the old train-status check; April's
"learnings". Scout says plainly that plan changes happen in Larisa's Guide, and offers Tell Larisa. It never offers
"Larisa's Guide is unchanged" unless asked. It writes a message for Larisa only when asked.

### 7.10 "Remember that", then "bring it back"

Ken (Oct 13): "Can you remember all that for when I ask for options each day?" Ken (Oct 14): "1. Ask or tell 2. Scott
responds with something useful for future 4. Remember that let's use say something later like "A that thing we
discussed? Bring it back. 5. Scott brings it back by finding in notes what would have been gone."

- "Remember this" keeps Scout's answer in your Notes word for word, marked "kept from Scout". Scout sees what it kept
  with every question.
- Something you tell Scout about the trip is kept in your Notes for that day, marked "told to Scout". Only your own
  words are kept: the server checks every word is in what you said. Private unless you ask to share.
- Asked for something from before ("that thing we discussed", "bring it back", even garbled by dictation), Scout looks
  in what it kept and your notes first, brings back the best fit word for word, says when it was kept, and names the
  others in a few words. "Bring it back" means a removed maybe or phrase only when one is named.
- Scout never promises to hold something "as long as this conversation runs".

### 7.11 Saying it in Japanese

Asked to put something into Japanese for someone ("ask the waiter if…", "tell the taxi driver…"), Scout replies with
only the Japanese, so what's shown or read aloud is just the sentence for the other person (Oct 5). Ken: "if Scout is
asked to translate something, it should assume it should only give the Japanese". It uses the trip (the booking's time,
the hotel's address). Asked how to say it, it adds the pronunciation. Its phrases have an English title, romaji, and how
to say it.

### 7.12 What Scout costs

Ken (Oct 15): "I want Scout to be brilliant, and I want Scout to be cheap… keep good model and better architecture
please." Scout runs on an Anthropic Opus model. Its reading (instructions, tools, her Guide and Ken's rail sheet, about
197,000 tokens) comes first and is the same for everyone, so it's cached; what changes per question comes last. After
any question, a one-token request every 55 minutes keeps the cache for the next four hours, between 7 AM and 11 PM in
Japan. A question within those hours costs about $0.10–0.30; after a quiet stretch, about $2. Every answer logs its
tokens and cost.

Spending on tests (Ken, Sep 29): "use api when needed. Use synthetic Prisma data when checking bugs or plumbing or user
interface." Exams are named with their rough question count before a run; full runs only before a deploy.

---

## 8. Maybes

The group's shared list of "maybe we should…". Ken (Oct 2): "a shared list of maybes", light enough for "tea or ice
cream?". No polls, votes or alerts.

- **Where**: "Maybes ›" on Home (a bottom-bar tab until Oct 16, when Today took its place; called Ideas until Oct 3). It opens on the next city ahead of you that has ideas. A city has a tab only while it has something on its list and a day today or ahead (Oct 16: Osaka showed only "Taken off the list · 1"; Nagoya's days were over) — and the city you're in today always has one, so a maybe in Nikko goes on Nikko's list. Sideways rows of filters fade at their right edge while more is off to the right. A day chip on your own maybe says "added by you".
- **Each city's list** starts with a box: "Maybe we should…". A few words, a link if there is one (kept as its link:
  "Instagram post ↗"), Send, and it's on that city's list for everyone. Saying it means you're in on it. With no signal
  it waits on the phone.
- **The group's maybes**, newest first, sit above Larisa's ideas ("Things to do · from Larisa's Guide"). Each says who and
  when ("Andy · 12 min ago · New"). A small maybe from a day before today folds into "Earlier · n ›", unless it's put on
  today or a day ahead (Oct 16: on its own day it sat folded away).
- **I'm in** on any maybe or any of her ideas; tap again to take it back. "Interested:" is one line: her Activities tab's
  X marks and Wander's I'm ins together, one name a person, "you" for yourself. Your own X in her Guide already counts.
- **Seen by** lists the others who have looked at that city's list since.
- **Tags and filters**: "Today" / "Tomorrow" beside an idea on that day's plan or put on that day in Wander (a day it's
  put on decides; a small maybe on no day says "Today" only on the day it was said); "In Larisa's plan for Mon, Oct 26 ›" on
  ideas her days already have (matched by her words, a long word one letter off still matching). Under "Show:", one
  sideways row: Next 2 days, and themes (Food & drink · Temples & history · Art & craft · Shopping · Nature · Other), one
  at a time. A theme is only ever a filter, never stated as a fact. Who: Everyone · What you're in on · a person's.
- **On each item**: Say something (a note for everyone or just for you), Add to a day, Maps (her places only), its link,
  Ask Scout, and **Tell the group** (the phone's share sheet: the writer's name, the words, the link and the city; hers
  go out as "From Larisa's Guide: …"). Ken (Oct 3): "any item, with the original source".
- **Remove.** Ken (Oct 3): "I should be able to remove items on any list, e.g., Maybes… I know we're going to TeamLab in
  Kyoto, so I can remove it as a maybe for Tokyo." Then: "remove is NOT for everyone. It is for the person who added it
  and me." Anyone can remove their own maybe; Larisa can remove her Guide's ideas; Ken can remove anything. Nobody else
  sees the button (a quiet ×). The × takes it off at once (Oct 16: it used to ask first, and the question sat at the foot
  of a long card behind the tab bar, so "nothing happens"). Removing hides the item for everyone and never deletes: notes
  and I'm ins stay; a day it was put on leaves that day's page (and Scout's view of the day) while it's off. Where the
  card was: "… is off Tokyo's list and off Sat, Oct 17 for everyone. Larisa's Guide keeps it. Put it back" (the day and
  the Guide only when they apply); Put it back returns it to the list and to its day. At the bottom: "Taken off the list
  · n ›", with who took each off and Put it back for the same people. A new copy of her Guide keeps it off.
- **Done or out of date isn't shown** (Ken, Oct 14: "if it is done or out of date, you don't show it"): a maybe or one of
  her ideas whose every day (on her plan, or put on in Wander) has passed leaves the list (Oct 16).
- **Something new**: one quiet line on Home.
- **Scout**: "maybe we should…", "I'm in", "Julie's in too", "never mind the ice cream", remove and put back, by the same
  rules (§7.9).

---

## 9. Notes, Papers, the Story and Money

Ken (Oct 1) called notes and summaries "a major topic for me". Ken (Oct 8): "I like notes function. It will become source
info for an ai assisted summary later. I'm sure I want it integrated with the activities from Larisa's spreadsheet."
Trip notes are kept word for word, the original always kept. The design for later summaries is in memory
(project_trip_notes_and_summaries).

### 9.1 Writing a note

- **Where**: the Notes tab; "+ Add a note for this day" on every day page; Scout's evening question; telling Scout.
- **Scout asks each night** (Oct 17; Ken: "It's not even reaching me!", then "Ask for notification permission when anyone
  opens next… ask if you can ask each night. Options: yes, no, ask me again tomorrow"). On the next opening during the
  trip, a phone that hasn't decided sees on Home: "Can I ask you each night what's worth remembering from the day?" —
  Yes (the iPhone's own box), No (final), Ask me again tomorrow. With a yes, at 9 PM (10 PM when the plan runs past 7:30)
  a notification, "Anything worth remembering from today?", opens Notes for that day — once a night, not on the trip's
  last day or a day you fly, not when you've written about the evening already. Home's evening question asks the same
  in the app; a note written earlier in the day no longer puts it away.
- **Write or talk**. Every word is kept exactly and read back with its count ("Saved — 142 words, every one kept";
  "spoken" for a spoken note). Talk keeps listening through the iPhone's pauses until you tap stop, and the screen stays
  on while it listens or while you're writing (§7.5).
- **Just me or the trip**: each new note starts as "Just me"; sharing is per note.
- **The day and place in one line** (Oct 17, fresh notes audit: two dropdowns above the box read as a form): "For Sat,
  Oct 17, today · Tokyo · change"; "change" brings the Day and Place choices.
- **Place**: a place on the trip, "Backroads", or "Japan overall", on the phone's own list. A new note starts at where
  you are once you've landed; before that, "Japan overall".
- **Typing while the microphone listens** stops the listening. **No signal**: the note is kept on the phone, waiting,
  and the waiting card goes as soon as Wander has it.
- **Scout** keeps a note when told something, finds notes by what they're about, and changes one of the asker's own
  notes (its words, or who sees it) when asked; it never says someone "hasn't written" something — it sees only what
  they've shared. Taking a note out is on the Notes tab.
- Today's page has "✎ A note about today" near its top, beside the one at its foot.
- **Day**: any trip day, or "No particular day" (Oct 13). Ken: "there also should be a button on each day page that says,
  add a note for this day". About follows the day's town unless chosen. Before 4 AM the night belongs to the evening, so
  notes about tonight's dinner written after midnight stay with tonight. A date Wander set itself moves on with the
  trip's clock; one picked by hand doesn't. After a save, the next note is today and where you are.
- **A half-written note** survives closing Wander. A fast double tap saves once.

### 9.2 Reading notes

Under the search box: **Everyone's · Mine · Shared · Scout** (Scout: only what Scout kept at your asking; Ken, Oct 13:
"Memory notes works. Add scout to this view") and **Newest first · Trip order**. Trip order reads the trip as it
happened: Japan overall first, then each place in the order the trip reaches it, Backroads in its week. Each note says
who wrote it, where, the day (one tap to that day) and when; one written on another date says "written Fri, Oct 16,
5:52 PM". Long notes fold. Search marks the words found; when nothing matches, "Ask Scout — it finds a note by what it's
about ›".

### 9.3 Changing, sending, exporting

**Add to it** and **Edit** come first on each of your notes (Oct 18; Ken: "adjust notes so I can change after saving… a
general note like the latest sake brewery note allowing me to add details during the visit… Edit is base requirement").
Add to it puts your words under the note with the time ("3:05 PM — the brewer is the 14th generation"), the day too when
it's another day, so a note grows through a visit; Scout does the same when asked to add to a note. **Edit** opens the
whole note with the cursor at its end. Either keeps the words as first saved one tap away, and Edit can move it to
another day or place (Day and Place in its editor; Scout, asked, does the same). **Send a
copy** goes to anyone (family at home). **Export mine** is a text file, led by place; with notes kept from Scout it asks
**Just my words** or **With Scout's notes too** (Ken: notes are source material for a journal, "so exporting should allow
with or without Scout's notes").

### 9.4 Tidy my dictation

Settings → Notes → **Tidy my dictation**, off by default. It tidies spoken notes only: filler, misheard words,
punctuation. It never adds feeling: no exclamation marks, emphasis or emoji the writer didn't give (Ken: an "!" he never
said "could leak into an eventual trip story"). A tidy that changes more than a few words is thrown away, the original
kept ("Left exactly as you said it."). A tidied note has "Tidied — show exactly what was said". Words changed by hand
are never tidied.

### 9.5 Privacy and the trip-stories question

Someone else sees only a shared note's words as they read now, never the first-saved words or the dictation before
tidying, on screen, in search or in Scout. Notes copies and drafts are kept per person on a shared phone; signing out,
or in as someone else, clears the phone's saved copies. Asked once, after a first note: may others' trip stories use
what you say about places (never anything personal)? The choice lives in Settings too.

### 9.6 Papers

A receipt, a bill, a ticket or a booking can be kept in Wander instead of carried (Oct 12).
- **Keeping one**: "Keep a paper" in Notes (take a photo, choose one, or a PDF), or send it to Scout and say "keep this".
  Wander reads it and files it under the trip day it belongs to ("Kept '… bill' under Oct 9 · Karatsu"; a stay sits on its
  last night), with a one-line description and the total as printed. Never a card, confirmation or passport number in the
  words. Two photos are filed as the papers they are; one photo of tickets for two days is kept under each day.
- **Who sees it**: whoever kept it; Ken's and Larisa's are visible to each other (Ken, Oct 12).
- **Where**: Notes ("3 kept ↓" under the writing box, the list after the notes) and the end of that day's page. Tapping
  one opens it in the phone's own viewer.
- **Remove**: the person who kept it; nothing is deleted.
- **Scout** knows the papers the asker may see ("what did the ryokan cost?"): it asks which when more than one place
  fits, says what a total was for, and never makes up a price per night the paper doesn't show.
- **A send that breaks partway** is sent again by itself, up to three tries; a send cut off keeps nothing, so it can't
  make two.

### 9.7 With no signal

A note is kept on the phone, listed as waiting, and sent once the signal returns, under the writer's own sign-in. While
Notes is open, waiting notes try again every 20 seconds and whenever Wander comes back to the front. A waiting note has
**Change it**; if its first words already reached Wander, the change arrives as an edit with the first words kept as the
original.

### 9.8 The story of the trip

The days lived, city by city, each city under its photo (Oct 15). Each day has Wander's summary of Larisa's plan, her
stops with their photos (or her plan's lines in her words, or her Itinerary's lines with their times), the travelers'
own words from Notes exactly, and **Play the day** / **Open the day**. It is headed "The story so far" during the trip
and "The story of the trip" after it. No AI writing.

Photos: shared photos lead their day (§3.8), whole over a soft blur of themselves so a tall photo keeps its shape; your
own private ones show to you, marked "just you". Its full-screen viewer follows the live photos, so Delete and "Keep it
just for me" show at once.

Whose notes: your own; someone else's only when shared with the trip and their writer said yes to trip stories (the
note's own choice, else their setting; a question not yet answered counts as no). Never Scout's answers kept in Notes.

Where: Home after the trip ("The story of the trip ›"), and Next after the trip. (It replaces a March page that counted
"experiences" this trip never had.)

### 9.9 Who pays next

Larisa's idea, through Ken (Oct 15): "one should be able to say to scout it any time that the unit that is Ken and
Larisa has paid a certain amount of money for something… at the end of the trip… the difference [is] the amount that
one owes to the other… there should always be a simple button that is something like who pays next and it just points
to the couple that currently has the smaller total." Ken's answers (Oct 15): shared half and half; "In yen (or dollars
and you should convert)"; all four see it; "It didn't need to be exact!"

- **Keeping a payment**: any of the four tells Scout what a couple paid and for what ("we paid … for dinner", "Larisa got
  the taxi"), or uses **+ Add entry** on the budget page. Scout answers "who pays next?" and takes a payment away when
  asked.
- **The couples** are her Guide's: Ken & Larisa, and Julie & Andy.
- **The sums**: a payment is shared half and half unless it's for one couple alone (Oct 16 — Ken: "Julie pays 5000 yen
  for jacket to help Larisa but that jacket is not split, it is just Larisa's… Split should probably be an option
  generally also with split as default and either as full owner of item"). Shared: the other couple owes half. For the
  other couple alone: they owe it all. For the payer's own couple alone: nothing is owed. Who pays next is the couple
  that owes; "To be even now" says how much.
- **Shared is the clear default** (Oct 23 — Ken: "Folks are sometimes misaligning whether in expense is shared by both
  parties. Make a shared expense as a clear default. And then in the summary, make it clear and highlight anything that
  doesn't shared because it's probably an error. Ask if the intent is unclear." · "Make the payer color equal the color
  in the home page. And shared a blue color"): in the add pop-up, who paid is in the couple's Home color (KL purple, AJ
  orange); "✓ Shared, half each" is blue and already chosen; "Not shared? Only <the other couple>'s" is one deliberate
  tap away and says what it means ("Not shared: Ken & Larisa will owe Julie & Andy ¥3,000, all of it."; Keep reads
  "Keep it — not shared"). A couple paying for themselves alone is never kept (it's refused with a question); one kept
  before shows flagged. Every row says "Shared, half each" in blue, or "Not shared: … Is that right?" in red-brown on a
  tinted row; at the top, under "To be even now", a red-brown box lists each payment that isn't shared, each opening it,
  each with **That's right** (Oct 24; Ken: "they're all correct… make sure there's a way to remove them"): checked by
  anyone, it leaves the box and its row reads "Not shared: … · checked by Ken", untinted; changing who paid, the amount
  or who it's for puts it back.
  Scout keeps payments shared unless the words plainly say they're the other couple's, asks when it could be either, and
  names anything not shared when asked how things stand.
- **The page's order** (Oct 16 — Ken: who pays next "top importance"; the total "not at top. A reminder of spending
  money which is not what to emphasize. Bottom of page"; the "alone" line "a result. Not a top line topic"): at the top,
  "Who pays next", the couple in large type, then "To be even now…". At the foot, under every entry and above Log, small:
  "¥198,090 shared so far." and what was paid for one couple alone, each couple named ("Plus ¥4,810 paid for Ken &
  Larisa alone and ¥1,980 for Julie & Andy alone."). Home's Budget line shows only who pays next and the difference.
  Scout too: who pays next and the difference; totals only when asked.
- **Never counted twice, never dropped** (Oct 16 — Ken: "There will not be errors. There will not be omissions. Nothing
  will be forgotten, and the math will be correct"). Each Keep carries a one-time tag: sent again (its reply lost on a
  weak signal, "That didn't save", Keep again) it's the same payment. A payment counts for its couple by the people in
  it, whatever order her Guide names them in ("Julie & Andy" or "Andy & Julie"); if a new copy of her Guide named fewer
  than two couples, the couples payments were kept for still count. Nothing about money waits on the phone. With no
  answer, the phone asks once more by itself; if that fails too it says "Wander didn't hear back, so this may or may not
  have saved. Tap Keep it again when you have signal. It won't be kept twice." The phone holds the tag for those words
  from Keep until Wander answers, through Cancel and through closing Wander, so the same payment typed again is still
  one. A Keep that hangs says after six seconds "Still waiting for Wander to answer. You can keep waiting, or Cancel: if
  it got through, it shows in the list, and typing it again won't keep it twice."; one that lands after Cancel holds its
  words for ten minutes. After that, the same words are a new payment (a second taxi).
- **Put it back** (Oct 16 — Ken: "can I assume that means the data can be brought back into the live flow"): right after
  a removal, "✓ Removed: … · Put it back" beside + Add entry for 12 seconds; and on that removal's line in the Log, for
  the same people who may remove it. Put back, it counts exactly as before; the Log says "Put back ¥… (couple): what
  it was for · who" (adds and removals name what it was for too, and so do "✓ Kept: …" and "Removed: …", which has no
  tick). Someone who may not put a removed payment back sees who can: "Julie or Ken can put it back." A Keep closed before
  Wander answered that lands after all says "✓ Kept after all: …"; the same payment typed again says "✓ Already kept: …"
  (the phone's own retry after a lost reply still says "✓ Kept: …"). These lines stay 8 seconds; a removal's, with Put
  it back, 12. The Log's "Changed …" lines say what the payment was for too.
- **Receipts** (Oct 16 — Ken: "take pictures of receipts and add them and simply note who paid for them and have the
  option of adding what the item is"). "📷 Photo of the receipt" on the add pop-up's heading line: Wander reads the
  grand total (合計, never the tax line), yen or dollars, what it was for in a few plain words ("Taxi") and the day, and
  says "From the receipt: ¥5,200, Taxi. Check it, then tap who paid." Who paid then waits for a tap (without a photo it
  starts on your own couple, as always). Another photo replaces what the last one filled in; words typed by hand stay.
  Kept, the photo stays with the payment: "Receipt" on its line opens it for all four; its Change pop-up has "See the
  receipt" — or, for one kept by typing, "📷 Add the receipt's photo" (who kept it, or Ken; the amount untouched; the
  Log says "Added its receipt"); with one kept, "📷 Replace the receipt's photo" too ("Replaced its receipt"). A total it
  can't read is typed by hand, the photo still kept. No card number is ever put into words. Scout
  does the same from a photo sent with who paid.
  Scout too (put_back_expense).
- **Currency**: yen as said. Dollars are kept with that day's yen, at the European Central Bank's rate.
- **Who sees it**: all four.
- **Changing or taking one away** (Oct 16): only the person who kept it, or Ken. Tapping the entry (it shows a "›") opens a pop-up
  with the couple, the amount, ¥ or $, what it was for and who it's for ("Shared, half each", or one couple alone), and "Remove this entry" ("Remove it for everyone?"). A
  removed one is hidden, never deleted. Ken: "add edit button to budget page to go back and add reason, change total, or
  change payer with a pop up, or remove item". A dollar amount keeps the rate it was kept at, unless it's newly dollars.
- **Log** (Oct 16; "History" until Ken: "Change 'history' to 'Log' and put at bottom (it's an admin log, only for me or
  moments of audit)"), a quiet link at the foot of the page: every add, change, removal and put back, newest first, each line the day and time, what was done
  ("Changed ¥2,150 → $15", "Changed who paid: Julie & Andy → Ken & Larisa") and, at the end, who did it. Ken: "date,
  person, action only" and "add the individuals user who made change at end of record". Removals before Oct 16 say who
  wasn't recorded. Data: trip_expense_logs.
- **The Budget tab** (bottom bar, Oct 15) opens the budget page. Its icon says who pays next: "KL" in purple when Ken &
  Larisa do, "AJ" in orange when Andy & Julie do, a coin when they're even or nothing is kept. Ken: "So it will toggle
  based on who is the next to pay, so it can be done in a glance or tapped to see the total. Make the KL version
  purple. And AJ version orange." A payment kept or taken away, on the page or through Scout, quietly tells every open
  screen, so the icon turns at once on all four phones.
- **The budget page** leads with who pays next ("Either — you're even" when they are; "Nothing kept yet" before
  anything is) and what would make them even ("To be even now, … would pay … ¥…"); the total is at the foot. Then
  **+ Add entry**, always there. Add entry opens a pop-up near the top of the screen (above where an
  iPhone's keyboard comes up) with the cursor in the amount, the number keyboard, ¥ chosen and a small ¥ / $ switch (Ken:
  "should always be another button that says add entry for another one to be added then"; "including the pop up and
  keyboard for money with tiny pop up for dollars yen (yen default)"). Then every entry, with what it was for when someone said, and nothing when no one did.
  Ken: "It should show exactly what the item is if it is included in the entry, but can be blank if the topic is never
  added."
- **Home** has the budget line under the Today card (§2.1).
- **Scout**: add_expense, change_expense, remove_expense, money_so_far (prompt rule 61); Scout's map of the app knows
  Budget. Data: trip_expenses, trip_expense_logs.

---

## 10. The Phrase Card

The 日 card: Japanese phrases to say, and characters to find.

- **Where**: a small 日 at the right end of the bottom bar on every screen opens it in one tap (Oct 13). Ken: "a clear
  convenient but subtle way to have phrase button always available". Since Oct 16 the word "Phrases" sits under it, a
  size smaller than the tabs' labels, and it's the one way in (Ken: "Why are phrases now in the upper left and bottom
  right?"; Next's labelled header copy is gone). It closes on Back, Close, a tap on the page, or a change of screen.
- **Each line leads with its English title**, then the Japanese in romaji and how to say it: "Hello", then "Konnichiwa
  (Koh-nee-chee-wah)". Ken (Oct 14): "all phrases titles should be English to find what is needed".
- **Characters to find on a device.** Ken (Oct 14): "Language list should generally not use kanji. But in this case (and
  possibly future ones) the purpose is finding something on a Japanese device." And: "title is Toilet flush ( in
  English) because that is what an English speaker scans for. Then my line. Use that approach if I add anything else like
  this. That should be obvious to you!" A line for signs and machines is the characters, large, with their meanings.
- **Show large.** A line meant for a Japanese reader (an allergy, a diet, a medical need, an address) carries its
  Japanese writing and **Show large**: the Japanese across the whole screen until Close, the screen kept lit where the
  phone allows. Ken (Oct 14): "notes should include kanji when helpful… plus tappable "Show large" (button resulting in
  larger kanji version that stays until "close" button)". Its small English says what the Japanese says, sentence for
  sentence. Ken (Oct 14): "make sure the small type English always makes it clear to the user what they are giving to
  the Japanese reader". Never a fact they didn't give.
- **Ask them a question** (Show large): the line's own next questions, each large in Japanese with its English at the
  top, "‹ Back to the card" and "Ask another ›"; and **Ask something else**: say or type any question in English and
  it's shown large in Japanese, its English saying exactly what it says (not saved). Ken (Oct 14), after a meal where
  every main had one ingredient they avoid: "think thru Ux and make it a smart option for the user to ask what they want".
- **Add**: type or say English (Talk); Wander finds the Japanese and how to say it, and offers two or three ways only
  when the Japanese really differs, each with a few words of context. Ken (Oct 14): "'Add' allows add where person types
  or speaks English and scouts fill in the fine print Japanese and pronunciation. If the translation is questionable or
  problematic or can be done in two ways with different nuance, give an option with super brief context and tappable
  choice." One already on the card in any wording says so; one you took off offers "Put it back".
- **Edit/Reorder**: ↑ and ↓, Remove, and a Removed list with Put back. Ken (Oct 13): "Need to be able to remove phrases.
  And to rearrange the order. No need to designate original or not." Each person's order is their own. Ken: "Anything
  added by one adds to bottom for others no matter where placed by the person adding it. It goes to top for the one who
  adds it." One list, with no "added by".
- **Remove** takes a line off your own card. For a line you added (any added line, for the organizer) it asks: "Just my
  card" (first), "Everyone's card", or "Keep it". Ken (Oct 14): "yes, good suggestion. But ensure just your card is
  default. I don't want Larisa or Julie to accidentally remove for andy!" Nothing is deleted.
- **Scout** adds phrases (one request is one line; a second way of saying what's there only when asked) and arranges the
  card in words ("put Sumimasen first", "take Konnichiwa off it"), taking a phrase off the asker's card unless they say
  everyone's.

---

## 11. Actions and Deadlines

Ken (Oct 9): "it seems to include old actions, non actions, and actions not for me".

Since Oct 15 Actions has no tab of its own (Budget took its place). It opens from **To-dos and deadlines ›** on Home,
under the budget line.

### 11.1 The Actions screen

- **Yours first**: your deadlines and to-dos ("Yours (Julie & Andy)", as Home says it), the ones asking something on top.
  With nothing of yours open: "Nothing for you right now."
- **Others' lists fold** to one quiet row each ("Andy & Julie's to-dos · 4 ›", "Larisa's deadline · 1 ›"), opened in
  place. Her lists are named in plain words ("In her list for Andy & Julie", "Other to-dos in her sheet (marked "LT")").
- **Deadlines that ask nothing** ("Free cancellation ends") sit below as a quiet line: "Nothing to do unless plans
  change". Charges that have started: "These charges apply now. Nothing to do — it stays booked."
- **Her open questions for you**: "Larisa is asking whether you're interested in … — her Guide has it on …: "…"", with
  **Tell Larisa your answer ›**. Never put to someone on a Japan date they're still at home.

### 11.2 Marking done in Wander

A to-do from her Guide can be marked done in Wander by the people it's for and by Ken (Oct 9). It's Wander's record,
never written to her sheet, said with who and when ("done — Andy, Oct 14"), with "Not done after all". A deadline that
asks something (reconfirm, pay, book) has **Mark it done** for whoever it's for, or Ken. Marked done, it leaves Actions'
deadlines, the day's Don't miss and Home; its card on the day says "Done — Larisa, Oct 14 (marked in Wander)". A to-do
done in her Guide can't be un-done here. Scout is told which are done and never reminds anyone of them.

### 11.3 To-dos added in Wander

Anyone can add one ("+ Add"). Each says who added it; only they can take it out ("Take out", then "Take this out?").
History records to-dos added, ticked, marked not done and taken out. Scout uses the same rules.

### 11.4 How deadlines are said

In the trip's time zone, with "your time" on a phone elsewhere: "Today is the last day", "Any day through Wed, Oct 14, by
the end of the day in Japan (Wed 7:59 AM your time)", "Last day … Until 11:59 PM Japan time", "Passed". A deadline with no
time says when the day ends in Japan. Each says whose booking it is ("Booked under your name", or the person's name). A
date when charges start closes as the day begins, never "Today is the last day". A passed reconfirm says Wander can't tell
whether it was done, and to ask Larisa.

---

## 12. Ideas for Wander

Ken and Andy's place for screenshots and ideas to make Wander better, apart from the trip (Oct 15). Ken: "a place used
most by andy and me to place screenshots and ideas to improve wander… Should not get in the way of travel flow. Product
focused only. With all inputs durable and optimized to support planning. So ideally you or Scott are a participant" and
"it should be easy and evident for Andy and me without conflicting with daily reference use". Ken (Oct 15): "make the
'improve wander' function attractive so andy will be drawn to offering ideas to improve".

- **Who**: members only (Ken and Andy). Tell Ken stays Ken's alone.
- **Where**: the amber "Wander ideas" chip with a sparkle on Home (with a dot when something's new), a row in Settings,
  and Scout. Back from Ideas opened on its own goes to Home.
- **The page** opens with a warm header saying what it's for. With no ideas yet: a large **Add a screenshot** tile, ways
  to begin ("I wish Wander…", "This confused me:", "More of this:", "This looks off:", "I loved this:"), how to take a
  screenshot on an iPhone, and an example idea with its answer. Once there are ideas, they lead the page and the box for
  a new one is one bar ("+ A new idea"). After Post, the new idea scrolls into view with "Scout is reading it…", then
  Scout's answer.
- **Each idea** keeps its words exactly, up to six screenshots (shown as the phone screens they are), the screen it came
  from, replies, and a status: New, Talking, Planned, Built, Not now. Where things stand reads as New / Talking /
  Planned / Built counts that filter the list. A status that moves is said on the idea ("Ken marked it Built"); it counts
  as new for the other member (Home's dot, "new" on the card) and brings the idea to the top. A built idea says "✓ In
  Wander now", and "✓ In Wander now, from your idea" on the author's own. What's new since you last looked is marked
  "new". Words being written are kept as a draft.
- **Replies**: Scout answers each new idea in about ten seconds, in two or three sentences without markdown ("I get the
  goal… What about…?"), reading only Wander's features and the idea list (about 2 cents a reply). It says where a
  repeated idea stands ("already planned"), calls the same person's earlier idea "you posted this", and asks one
  question about a bug report. Claude, Wander's engineer, answers in its working sessions, signed "Claude, who builds
  Wander with Ken", and moves statuses. Replies sit in bubbles.
- **From Scout**: "Wander idea: …" (or "For Ideas for Wander: …") posts to the list in two taps from any screen, with the
  screen and any pasted screenshot. "Any ideas for dinner?" stays a question. Ken (Oct 15): think whether the entry is
  "as smooth as it can be".

---

## 13. Tell Ken

Larisa, Andy or Julie say or type "Tell Ken…" to Scout, and Scout passes their words to Ken exactly, with their name,
the time, the screen they were on and any picture they attached (Oct 14). Ken: "if they would like a feature added to
wander or anything about the way wander works is confusing, they can speak or type at that moment what they want and it
will become a message to Ken to try to fix. It cannot be a nuisance, and it should be very easy".

- **Sending**: on a clear "Tell Ken", or a yes to Scout's offer ("Want me to pass that to Ken, word for word?") for a
  wish. Something they don't like about Wander ("I don't like…", "this is annoying") goes to Ken without asking, and
  Scout says it has (Oct 23: Scout's note to Andy promised "Anytime you don't like something, just tap Scout & tell me.
  I'll let Ken know and try to fix it"). Never a personal message.
- **Scout's note to Andy** (Oct 23, Ken's words, once): right after Andy's next payment is kept, a panel "From Scout":
  "Hi Andy. This is Scout. Ken said my UI was disappointing. I'm sorry and I tried to improve. Anytime you don't like
  something, just tap Scout & tell me. I'll let Ken know and try to fix it. Have fun in Kyoto!", with Got it and Tell
  Scout (opens Scout). Only Andy sees it, and only once (the message card, §7.7a, addressed to one person).
- **What happens next** (Ken, Oct 23: "sending me a message of the request and your recommended fix. If response is
  clear to you, do IT during directive and just report the result to me"): each work session starts by reading what's
  come in; a clear fix is built and reported; anything else goes to Ken with a recommended fix.
- **Ken's side**: his phone buzzes ("Julie, about Wander") when it allows Scout's buzz. Settings → "About Wander, from
  the others", newest first, pictures opened in place, "Mark as read".
- **The others' side**: Settings → "Tell Ken about Wander" opens Scout ready to write. A quiet line inside Scout with
  "Start one" the first day they open Scout, two days later, and three days after that; never again once they've sent
  one; ✕ closes it for the day.
- **When someone seems lost**: "Not finding something? Tell Ken ›" just above the bottom bar, at most once a day, gone
  after 20 seconds. Ken (Oct 14): "perhaps even signals based on them seemingly clicking around and not getting value
  and treating that as a trigger to offer." The signs (quick screens, Scout opened and shut with nothing asked, taps on
  words that aren't buttons, opening How Wander works) are added up on the phone and never sent or kept. It needs two
  different kinds of sign, never in the first half minute, never for Ken, and waits while Scout is open.

---

## 14. Sign-In, Accounts and Invitations

### 14.1 Getting in

- **Face ID** (passkeys). The sign-in screen has one button, "Sign in with Face ID". Tapping a name signs no one in,
  except in local development and tests. Sessions last a year; a weak signal or a quick reload never signs anyone out,
  only a real "not authorized" from the server.
- **A new iPhone** (Oct 2, after Larisa's phone hit a dead end): the invite opens in Safari; **Let's go**, with "Next,
  you'll set up Face ID, then put Wander on your Home Screen." On Home in Safari, **Set up Face ID**, then **Put Wander on
  your Home Screen**, whose last step is "Open Wander from your Home Screen and tap Sign in with Face ID." A Face ID key
  made in Safari works in the Home Screen app. Inside the app, the sign-in screen says: "First time on this phone? Open
  the link or code you were sent. It opens in Safari: tap Let's go, then Set up Face ID. After that, Face ID works here
  too."
- Signing out lives in Settings only, and warns when the phone has no Face ID to get back in.

### 14.2 Letting someone in

Ken (Sep 28) on links pasted in chat: "does nothing. it just scrolls away." Invitations live inside Wander:
- **People → + Add someone**: type a name (and pick the trip when you plan more than one). A QR code appears for the
  other person's iPhone camera; **Send as a message instead** (the share sheet) and Copy are there too. The link itself
  is never shown, and link codes never appear on screen or in chat. "Handed to your messages" after sharing.
- A name already in Wander asks "Is this for Julie's new phone?" before any link is made. **New phone? New link** makes a
  fresh one. A person's link stops working once they've set up Face ID.
- A phone signed in as one person opening another's link asks: "This link is for Andy — Stay as Julie / Switch to Andy".
- People lists everyone's status ("Uses Face ID", "Has opened Wander", "Hasn't opened Wander yet") and unused invites.
  Ken and Larisa, the trip's planners, send links. Scout can't add people, change who plans, or send links.

### 14.3 Accounts and access

Each trip is private to its people: you see, open and switch between only the trips you're on. Every route that names a
trip, or an item on one, refuses anyone not on that trip; a traveler's profile is visible only to people sharing a trip.
A person's name comes from their account, so a renamed person is known by the new name at once. Saving one personal
setting never replaces the others.

---

## 15. Offline and Updates

### 15.1 With no signal

- **The phone keeps a copy** of the trip, her Guide's days, the rail sheet, summaries, forecasts, the pickup page once
  seen, and Find a word after a first search. With no signal Home shows the saved copy ("No signal — showing what this
  phone saved today at 9:12 PM"), never a new-trip screen. Reloading an inner screen with no signal shows the saved copy.
- **A lasting line**, "No signal — showing what this phone saved …", shows whenever the phone is offline, wrapping inside
  the screen. "Weak signal" is said only when truly offline.
- **What waits on the phone and goes later**: notes and their changes, maybes, picks, plans for a day, notes on ideas.
  Each is sent once, one at a time, under its writer's sign-in. A pick not answered within 6 seconds is kept on the phone
  ("The signal's weak — saved on this phone, and I'll send it as soon as it gets through"). A save kept for later waits a
  second at most before saying so.
- **Scout with no signal** says so in its box, and its question buttons, Send and microphone wait.
- The offline worker tries fresh data first and uses its copy only without signal.

### 15.2 Staying up to date

- **Other people's changes**: when someone else changes the plan, every open screen reloads at once, and a dark notice at
  the bottom says what changed, with "Got it" (gone by itself after 8 seconds). Screens catch up after a dropped
  connection too. Someone taking back their own addition doesn't pop a notice. A payment kept or taken away, and a
  photo made private or deleted, reach every open screen quietly (the Budget icon turns; the photo drops within
  seconds), and photos are looked at again whenever Wander comes back to the front.
- **The day turning**: the day and Home screens update at midnight and whenever the phone is unlocked.
- **A new version of Wander** loads by itself, but waits until no box on the screen holds unsent words (Oct 15). (Claude)
  The service worker's stale bundle is the main trap when checking a deploy; the global rule in ~/.claude/CLAUDE.md says
  how to tell.
- **Phone reports**: the phone tells Wander's server, in numbers and short words only, when its keyboard and screen
  repairs act, when Scout recovers a dropped answer, and how a paper's send went. Never anyone's words. At most 30 per
  person in 10 minutes.

---

## 16. Photos

- **Arriving in a city** (Oct 1): the first time a day in a new city opens on a phone, a photo of the city's best-known
  sight fills the screen with the city's name, the date, the sight's name and the photographer's credit, for about three
  seconds; a tap puts it away. Once per city per phone. Only on arriving: never before you've landed, never before the
  booked train in has arrived on a travel day, never while a day is being read (it shows only in the day's first
  drawing). The sight is the most-reviewed attraction within 12 km, never a mall, shop, theme park or hotel. The photo
  check looks at the whole picture and passes over any that shows another season (holiday decorations, snow, bare trees,
  cherry blossoms); with nothing fitting October, there's no photo. Tapping the city's name on any of its days brings it
  back. The photo comes through Wander's server, so no Google key reaches the phone.
- **The city band** on every day carries the same photo, already chosen for the season, with the photographer credited
  (§3.1). "Wander in pictures", idea 1.
- **Her Kyoto map, by day**: her illustrated Kyoto map's panel for each Kyoto day, under the band; a tap opens the whole
  map (§3.1). Cut once from her picture, which is never changed; a new map in a new copy of her Guide retires the old
  panels.
- **Her stops' photos** on the day screen, and **Play the day** (§3.4, §3.7). A stop's photo is kept only when a check
  finds Google's place is the same place her line means. That checked place's hours, from its Google listing and
  looked at again every three days, are said on the stop's line when her time doesn't fit them (§3.4).
- **Her pictures**, full screen from tab by tab and from Sources (§4.6). A picture holding people's own travel numbers is
  never shown (§19).
- **Papers' photos** open in the phone's own viewer (§9.6).
- **Your own photos**, kept on the day they were taken, private unless shared, in the day's strip, Play and the story
  (§3.8). Until Oct 15 every photo in Wander came from Google or the city.
- **Photos sent to Scout** are read and never kept (§7.6), unless someone asks Scout to keep one for the day (§3.8) or
  as a paper (§9.6).

---

## 17. Help, Settings, History, People, Profile

### 17.1 First-time help

- **The welcome card** on Home (first open): "Hi Julie. This is Larisa's plan for the trip, day by day, on your phone.
  There's nothing you need to do — it's here when you want it." It comes up just above the tab bar, so nothing moves.
- **Show me around**: seven short steps, one for each button along the bottom including the 日. The screen dims, the
  button stays lit, and a sentence or two says what it's for, with Back, Next and Skip. Nothing starts on its own. Ken
  (Oct 4): "I'd like it offered at least 3x with Yes, Next time, No Thanks". Offered up to three times: "Show me around",
  "Next time" (back on a visit at least 12 hours later), "No thanks"; the third says it's the last and that it's always in
  Settings. The answer is kept per person on Wander. Also in Settings and at the top of How Wander works.
- **One-time tips in Scout**, each shown once: under the first answer with Sources, and the paperclip tip.
- **How Wander works** describes Wander as it is now, entry by entry, with "A New Phone, or Someone New" last. Ken (Oct
  13): "They are in now and can't read it unless they are in already!"
- **One ask per visit**, in order: the leaving card, then Face ID, then the tour.

### 17.2 Settings

Where Wander's plan comes from (her Guide's copy and Ken's rail sheet, with read times); Face ID on this phone; Notes
(Tidy my dictation, trip stories); Show me around; "Tell Ken about Wander" (or, for Ken, "About Wander, from the
others"); Ideas for Wander (members); People; sign out. No sync controls: Wander can't write to any sheet.

### 17.3 History and Recent activity

History is "What's changed in Wander": what people did in Wander, said in plain words ("You added a maybe — …", "switched
'Lunch' to …"), including shared notes, Scout's additions and to-dos, with "Bring back" where it applies. A private note
never appears; a note taken back takes its words out of the history. Home's Recent activity is its short form (§2.1).

### 17.4 Profile: travel documents

Each person can keep travel documents in their Profile. Passport, visa and insurance details open with Face ID or a
PIN, and no one else ever sees them; the group sees only that you have one. Other documents can be shared with the
trip or kept to yourself (the "who can see this" switch). Scout never reveals passport, visa or insurance details; it
says they're locked and that the vault in Profile opens with Face ID or PIN. A planner can reset someone's PIN, which
clears only the PIN.

---

## 18. Whose It Is, and Which Clock

### 18.1 Whose a line is

Every line says whose it is when it isn't everyone's. Her names, her initials ("KL day trip"), a booking's name, who
slept in a room, and a picture's grouping all count; nothing else. A line naming you is never "the others'". Someone
else's to-do is off your day and Home (Ken still sees all). A question in her Guide is "for you" only when it is.

### 18.2 Today, for each person

"Today" for a person is Japan's date from their scheduled landing until their flight home. Before that, on a Japan date
you're still at home, a day screen says so at the top ("You're still at home", with your take-off time) and "The rest of
this day is the others' plan." Notes doesn't call a city "where you are", and Maybes doesn't call it "today", before you
land.

### 18.3 Where the others are

On Home before you've arrived, "Right now in Japan" says where the others really are, by the schedule and their booked
trains: "Ken & Larisa haven't left home yet — they're due to land at …", "should be in the air…", "landed at … by the
schedule, and are on their way to … — due there about 7:05 PM", "the others are in Nagoya now" once the day's booked
train has arrived, "the others travel from Nagoya to Tokyo today".

### 18.4 Flights, by their schedule

Wander can't see a real flight, only its timetable, and says so. Before take-off: "Takes off from San Francisco (SFO)
Tue, Oct 13, 12:00 PM California time — that's Wed 4:00 AM Japan time". In the air: "Should be in the air now — due to
… land at 3:00 PM". After: "Was due to land at 3:00 PM — that's the schedule; a delay wouldn't show here", for 12 hours,
then "landed". Your own landing: "Your flight was due to land at … (Tue 11:00 PM your time) — that's the schedule."

### 18.5 Clocks

On a phone not on Japan time, every time says "Japan time", and a time on another clock says whose ("12:00 PM California
time"). Every countdown, Next, Now and faded past line measures now on the clock its time is on. A time on another clock
is placed in the day by when it happens. "Tonight" means tonight: another day's screen heads its sleeping section "The
night of Wed, Oct 14". "As Wander last read it" is in Japan time on every phone.

---

## 19. Privacy

- **People's own travel numbers stay out of Wander** (Oct 4). Known Traveler, Redress, eTicket, frequent-flyer and
  passport numbers and birth dates: the number goes, the label stays ("KTN [left out by Wander]"); in a record carrying
  one, its phone, email and total go too. A picture holding them isn't shown: "Wander keeps this one to Larisa's sheet —
  it has people's own travel numbers on it." The server won't send it to a phone at all. Every new copy of her Guide is
  cleaned the same way.
- **Personal contacts**: personal email addresses and US phone numbers in her tabs are left out. A hotel's or
  restaurant's own address and Japanese numbers stay.
- **Cards** by their last four digits only ("[card ending 1234]"); a transit card's full ID is left out.
- **The vault**: passport, visa and insurance details open with Face ID or PIN (§17.4).
- **Notes** are private by default and shared per note (§9.5). Papers are seen by whoever kept them, and Ken's and
  Larisa's by each other.
- **Location** is sent only with a question that needs it and never stored (§7.7).
- **Signals** for the Tell Ken offer are added up on the phone and never sent or kept (§13).
- **Your own photos** (§3.8) are a new kind of personal data, kept with Ken's yes (Oct 15). They're private by
  default. Nobody else ever sees a photo its taker hasn't shared:
  - the photo lists the phone keeps are each person's own and go at sign-out, so on a shared phone one person never
    sees another's "just you" photos; a list is tied to the sign-in that asked for it and dropped if someone else is
    signed in when it lands;
  - each picture link is made for one person, and the server checks every time that the photo is still theirs or still
    shared, so a photo made private or deleted stops showing at once;
  - the phone asks again before showing a saved copy (the saved copy is only for no signal at all), the service worker
    drops its copy when the answer is "not there" and never saves the photo lists, and the phone's copies of photos no
    longer in your lists go after each fresh list;
  - someone else's photo shows only once its picture has come, never as a name and caption over black; a picture that's
    gone hides rather than show a broken tile.
- **What each couple paid, and for what**, is shared with all four (Who pays next, §9.9). A new kind of shared data,
  approved by Ken on Oct 15.
- **Any new kind of personal data** (location, photos, documents) is Ken's call, raised in one line before it's built
  (CLAUDE.md §7).
- **This repo is public**: no ids, links, keys, booking codes or people's personal details here (CLAUDE.md). They live in
  trip-data (not in git) or private memory. A git hook blocks commits that add them.

---

## 20. How It's Built (Changes to Part I §4 and §6)

### 20.1 Stack

As in Part I §4: React 19 with TypeScript, Vite and Tailwind; Node with Express 5 and TypeScript; Prisma on Neon
PostgreSQL; one Railway service, with Express serving the built front end. Changes since March:
- **Sign-in**: Face ID passkeys (WebAuthn), with personal invite links as the way in. Access codes are gone.
- **Scout**: Anthropic's API, an Opus model, with citations (for Sources), built-in web search and fetch, prompt caching
  and keep-warm.
- **Her Guide**: snapshot .xlsx copies Ken provides, read on the server; pictures read by AI. Ken's rail sheet: the Google
  Sheets API, read-only.
- **Weather**: Open-Meteo (forecast and several models); Japan's weather agency for the storm watch.
- **Places and photos**: Google Maps on Home; Google Places for city photos, stop photos, opening hours and "near me";
  Google Maps links for every map link and direction (her Apple Maps guides stay Apple's). The travelers' own photos are
  stored by Wander.
- **The phone**: a service worker for the offline copy and updates; Web Push for Scout's and Tell Ken's buzz; the
  phone's own speech recognition (one microphone for the app) and voice for Read aloud.
- Part I's ratings services, capture pipeline and spatial canvas aren't part of the trip product (§21).

### 20.2 What Wander keeps beside her Guide

Her Guide is a layer Wander replaces with each good copy: snapshots, Guide items (each with its cells and time text), and
Guide pictures. Everything people add lives apart from it and survives every re-read: plans for a day and picks, maybes
and their marks and removals, notes on ideas, trip notes, papers, phrases and each person's order and removals, to-dos
added in Wander and the done marks on hers (keyed to stable places in her list), Ideas for Wander, Tell Ken messages, payments for Who pays next,
the travelers' own photos and their captions, push subscriptions, the conversation with Scout and each answer's sources, place photos, Wander's place notes, and other
sources (Ken's rail sheet and its copies, Backroads' itinerary, her maps).

### 20.3 How it's checked

rules/engineering.md holds the deploy path (a backup, any schema change first, merge to main, the functional suite and a
walk on production), the type-check baselines, the backend suite rules, Playwright on its own headless shell, chaos
tests for anything that changes data (Scout's tools above all), timing bars, the iPhone rules, and the React hooks
check. Screens and plumbing are tested on synthetic data with Scout stubbed; real Scout calls check only Scout's own
answers. Ken (Sep 28 2026): "You're authorized to deploy Wander to production whenever ready."

---

## 21. What Became of the March Design

Part I was written in March 2026 for a planning tool: capture, a map-centred canvas, ratings, and promoting experiences
into days. From March to early April it grew planning boards, group decisions and votes, imports, a trip story, travel
advisories, and two-way sync with Larisa's sheet. The changelog's March and April entries marked "SPEC UPDATE NEEDED"
describe those. On Sep 27 Wander became a front end to her Guide. What happened to each:

- **Withdrawn or replaced**: two-way sheet sync and every write to a sheet (Sep 27); the spatial canvas, axes,
  selector strip, three-tier markers, travel geometry overlay and promotion (the trip map on Home is what remains, and
  Ken, Oct 3: "stop the map"); capture by paste or drop on Home and Plan (now Scout takes any file, §7.6); the Plan tab
  and planning board (now Maybes, whose address the old Plan address opens); trip creation and itinerary import (trips
  come from her Guide; "+ Plan a new trip" is gone); group decisions, votes and "happy with any" (choices in a block,
  §3.4, and I'm in, §8); ratings badges; the daily greeting, next-up overlay, interest quiz and evening sheet (nothing
  pops up uninvited, Sep 28); the old phrase card's "no Japanese characters" (§10); voice auto-send (Oct 1); the
  train-status scraper (§5.7); the "learnings" (§7.9); the April trips' placeholder data (Ken, Sep 27:
  "No need to worry about keeping existing data in Wander… That data was placeholder data to learn how to create an
  effective Wander.").
- **Kept, in a new form**: the phrase card (§10); the change log, as History (§17.3); travel documents and the vault
  (§17.4); invite links and trip members (§14); offline caching (§15); city photos (§16); the Now screen, as Next (§2.4);
  Scout, with the rules in §7; the trip story, as the days lived (§9.8).
- **Waiting on Ken**: split days as a designed feature, multiple trips, a native app, trip summaries from notes, Scout
  streaming, "Team Fun" (CLAUDE.md §6 and memory). Never bring back the travelerProfiles nudges: they invent facts.

*End of Part II, written Oct 15, 2026. Keep it current.*
