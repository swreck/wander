# Wander Change Log

SPEC.md is canonical. CHANGELOG.md records implemented behavior changes and flags when SPEC needs updates.

## 2026-10-02 — Ken's iPhone Check, First Pass

### Fixed
- **Her route for the day opens in Google Maps with every stop found** (Day screen, "See her route for the day in
  Google Maps"). Her links name stops bare, and the Google Maps app looks a bare name up near the phone: from
  California three of her Oct 16 stops weren't found and one landed in Amsterdam ("Can't seem to find that place").
  Wander now adds the day's city and "Japan" to any stop that doesn't name them; her stops and order are unchanged.
- **Talking to Scout puts the words in the box from any screen** (Scout's mic). Scout and Notes each made their own
  speech recognizer, Notes kept listening after you left it, and the mic on Scout's bar started a quarter second
  after the tap; on an iPhone the microphone came on and no words arrived. Now the app has one microphone
  (`lib/voice.ts`), started on the tap itself, handed back when a screen goes; tapping the mic puts the cursor in
  Scout's box; and after six seconds with no words, Scout or Notes says "I'm not hearing any words yet…".
- **Pinching or dragging the Home map with two fingers works wherever the fingers land.** A gesture starting on a
  city's name or marker went nowhere, so on a small map it seemed unsure whether two fingers were down. A tap on a
  marker still opens its day; one finger still scrolls the page.
- **Tables in Scout's answers are drawn as tables** (they came through as rows of "|" and "---").
- **Scout waits for a long answer instead of giving up** (Scout panel). The phone stopped waiting at 45 seconds, but
  a long answer (every source on one place, a table of eight days) takes Scout over a minute to write: the server
  finished and saved answers the phone had already called "too slow" (measured Oct 2, 9:11 PM). The phone now waits
  up to two and a half minutes; after 20 seconds the waiting line says "Still working — a long answer takes a minute
  or two". Answers may run twice as long before being cut off (4,096 tokens; one stopped mid-table at 2,048).
  The server logs how long each answer took.

### Changed
- Notes: the Saved line says "spoken" for a spoken note ("Saved — 8 spoken words, every one kept…").
- Notes: the one-time trip-stories question is its own headed card ("One question, asked once"), apart from the
  Saved line — it read as more of the same and was easy to pass by.

No SPEC change.

## 2026-10-02 (overnight) — Scout Reads All of Her Guide

### Fixed
- **Scout now has every one of Larisa's tabs** (Scout, everywhere). Its copy of her "other tabs" (pasted emails,
  friends' recommendations, hotel notes, picture summaries) stopped at 30,000 characters — partway through her Kyoto
  tabs — so 14 tabs never reached it, among them Mark & Steve's email, her Tokyo hotel notes, the extra text of her
  Tokyo and Kyoto day tabs and the map summaries. Asked "what did Steve and Mark tell us about Omotesando?", Scout
  said they hadn't mentioned it. Now all of her tabs fit; if a copy ever must be cut, Scout is told which tabs are
  missing and never to say the Guide doesn't mention something that could be in them.
  Verified: a new exam in Larisa's own words (10 questions written from her Guide) 9/10 before, 10/10 after, every
  answer read in full (the Omotesando answer now quotes their email, and its whisky-bar extra is in that email).
- Not yet deployed (waiting for Ken's go): it changes what every Scout answer starts from.

## 2026-10-02 — Scout Finds the Exact Spot in Her Sheet; Notes by Place

Ken: "if Larisa wanted to check something in her spreadsheet, asking Scout would be the fastest way to find the exact
spot." Not deployed yet.

### Added
- **"Open at this spot in your sheet ↗"** (Scout → "Sources" under an answer). Under each tab's cells, one button opens
  her Google Sheet at that tab and those cells (Larisa: "your sheet"; others: "Larisa's sheet"; Ken's rail sheet the
  same way). Wander never opens her sheet itself — the phone does, and Google decides who may see it. Her sheet's
  address and tab ids live in the database, not the public code (recorded with `scripts/set-sheet-link.ts`; every
  import keeps them). A tab Wander has no id for opens her sheet and says "then the '…' tab, cells A57:B57". Today 11
  of her 26 tabs have ids (from April); the 15 newer ones need theirs.
- **Each line of a day opens its spot in her sheet** (Day screen). The source line under a line ("From your Guide —
  the Itinerary tab, Y66 ↗") is the link; her plan's "From the … tab" too. Where her tabs disagree, both spots, one
  tap each ("In your sheet: Itinerary Q67 ↗ · Kyoto Thu, 1029 (Flight Home)) B57 ↗") — the reviewer's top reason to open
  the sheet instead was settling exactly that. A tab with no id yet shows its cells in words and "Open your sheet ↗".
  The Guide page's tab-by-tab "Open in the Guide →" uses the same address (it never showed before).
- **Scout answers "where in my sheet is…"**: the tab as she named it, her words there, cited, and a line that
  Sources opens that spot. It never says something is "the only place" — her pictures can hold more than its copy.
- **Notes: what a note is about** (Notes → "About"). A place on the trip, "Backroads", or "Japan overall" — one tap on
  the phone's own list. A new note starts at where you are once you've landed (Larisa on Oct 26: "Kyoto — where you
  are"); before you land, at home, or after the trip, "Japan overall" (Julie on Oct 10). "Change" on your own note can
  move it to another place; its words stay exactly as saved.
- **Notes: whose, and in what order** (Notes, under the search box). "Everyone's / Mine / Others'" and "Newest first /
  Trip order". Trip order reads the trip as it happened: Japan overall first, then each place in the order the trip
  reaches it ("KYOTO · OCT 23–29", Backroads in its week), each place's notes in the order written. Each note says who
  wrote it (others' first), where, the day (one tap to that day) and when. The choices stay on the phone. The export
  file leads with the place too.

### Fixed
- **Sources point at the cell her words are in.** Graded Scout's saved answers against her downloaded Guide: every cell
  shown held its words (84/84), but some answers' words were in a cell the source left out — a stay's dates beside its
  hotel, the second row of a merged line (her Itinerary note on the flight row), the ninth cell of a row (the
  Imperial's airport words), her city heading one row above. Each line's cells are now completed from her rows: the
  cells whose words are in the line, her times in their own cells ("8:30a" for 08:30), a passage the line quotes when
  exactly one cell holds it, "the stop her tab lists", and the tab's picture. Checked across all 551 Guide lines.
- **An exact quote Scout forgot to point to** now gets its line — shown as "Scout quoted these words without pointing
  to them — Wander found them here, word for word", never as Scout's own citation. Only a 15+ character quote found
  in lines that share one source; anything less stays "Scout's own words".
- **Scout says when her tabs disagree, even if you asked about only one part** ("back together at Café ENSOU lunch,
  1:00–2:30 PM — though her Dining Resos tab lists Cafe Ensou at 8:00 PM").
- **The Sources panel speaks to Larisa** as "Your Guide… You may have changed it since".
- A formula with no saved answer in her download was read as "[object Object]"; it now has no words to show.

SPEC UPDATE NEEDED: Notes (what a note is about is a place, not a day; whose/order views); Scout Sources (open in her
sheet).

## 2026-10-02 (overnight) — Through Larisa's, Julie's and Andy's Eyes

Five fresh testers walked the test copy as Larisa (planner, and in Kyoto), Julie (first time), Andy (Backroads
week) and a designer. Fixed (test copy; not deployed — waiting for Ken's go):

### Fixed
- **Her next stop has a map** (Day screen, Home, Now). A timed line that only says what it's for gets the stop her
  tab lists for it, with her own Maps link: "Traditional Kyoto sweet / matcha in Gion" → Gion Tsujiri Main Shop (her
  "sweets" vs the line's "sweet" kept them apart); "Arashiyama river / Togetsukyo" → Togetsukyo Bridge (a long name
  word only one stop has; never a common place word, never the tab's own town). Checked against production line by
  line: 6 lines gain her links, all right. Needs a production re-import after deploy.
- **No end time Wander made up** (Home, Now). "Now, in your plan · Hana Soufflé … stroll, until about 6:30 PM" — her
  Guide has no 6:30. Only an end her plan gives is said.
- **"This morning" before the next clock time** (Home, Now). At 8:30 AM on Oct 25, Next was "11:30 Concludes…";
  her "Morning — Backroads: Fushimi Inari + Tofuku-ji" now shows first, before noon.
- **The dress code from the booking itself** (Day screen, Now). Beside "Strict Formalwear Prep… jackets required for
  men" (her tab, written for the upstairs restaurant): "Her booking at LeTable de Joel Robuchon - 1F asks less: 'please
  wear jackets or collared shirts and ties are not necessary'".
- **No web address spelled out on Now** (the Next card showed her route link as six lines of text).
- **Landing night** (Home, Now): Scout's evening question isn't asked the evening you land, nor while tonight's plan
  still has something to come; the way from the airport to the hotel stays four hours after landing (was 90 min on
  Now, three hours on Home — Julie, jet-lagged, was still on her way).
- **Ideas say what's already on her days** (Ideas). "In your plan for Mon, Oct 26 ›" (or "Larisa's plan" for the
  others) on each idea her days already have; "Nobody has marked this yet" no longer on an idea that's in the plan.
  An idea also counts as planned when her day line's own description names it (Julie's Nippon Made and Onitsuka
  Tiger picks are inside "Ginza Premium Retail Walk" and "Shibuya Retail Flagships"), and a long word one letter off
  still matches ("stationary" / "stationery").
- **Split mornings on Home** (Home's Today card). When her table names no group for a line on a split day (Oct 28
  Shigaraki), Home lists it with the same words the day screen uses ("Your plan's table doesn't name the group; a
  picture in your tab lists it under 'You & Julie (morning)'"); before, Home skipped two hours of Larisa's morning.
  Lines that name a subset say so ("Yours · Larisa & Julie"). On anyone else's phone, the picture's quote adds "that
  'you' is her map's, not you" (Andy read it as himself); who it is stays unnamed, as Scout is told.
- **"and N more" says where the gap is** (Home). When bookings that always show come after lines Home left out, the
  link sits at the gap with its time — "and 9 more from 11:35 AM ›" above the 8 PM dinners — and opens the day at
  that line.
- **The car to the station always shows** (Home). On Oct 29 the noon hotel transfer to Kyoto Station was folded
  under "and 2 more"; a line that takes you to a station or airport is never folded, like trains and flights.
- **The departure-morning ticket box is calm** (Home, Day screen). "Worth a check: the paper ticket for the 1:30 PM
  HARUKA 31 wasn't ticked on this phone at the Shin-Osaka pickup on Tue, Oct 6." It no longer quotes the rail sheet's
  Oct 6 pickup instruction or its "allow a dedicated pickup block" on Oct 29 — only where a ticket can still be had.

No SPEC change.

## 2026-10-01 — The Home Map, Checked Against Production

On production's own city locations the deployed map had a name sitting on a line on the iPhone 15 ("Karatsu ·
Hakata" over the leg to Nagoya). Eight rounds of fresh design review on iPhone SE, 15, Pro Max and iPad followed; each
finding was fixed where it started, and round 8 passed on all four. Home screen, map at the top
(`components/HomeTripMap.tsx`).

### Changed
- Two stops in a row share a split marker when their markers would overlap, or when they're a fingertip apart and
  the trip doubles back through them (Karatsu and Hakata: in from the east, then straight back east). Otherwise
  they're two markers, nudged apart a little. On an iPhone 15 Tokyo and Nikko were "5 | 6", and the leg back to
  Kyoto had to cross the only place for their name; now they're separate on every screen. On an iPad Karatsu and
  Hakata were separate, with an arrow squeezed into a narrow V between them; now they share "2 | 3" everywhere.
- A leg lands on a split marker's top or bottom at a steady angle (it grazed the top of "2" on the phones, and
  hooked into it on a Pro Max).
- The map grows to keep every line clear of Google's logo and credit, not just the names and markers.
- During the trip, today's city stands alone in one dark name label (a dark chip inside a pale label looked like
  a slip); in a shared label it's still a dark chip beside the other name.
- A name keeps clear of a marker that isn't its own ("Kyoto end" hung 15 pt above marker 1 on an iPhone SE).
- Names and marker numbers use Wander's own type (the iPhone's system font) instead of Google's Roboto.
- Legs and names are chosen together. A leg may take another of its arcs to leave a name a clear place, but never one
  that crosses a marker, runs along another leg or a marker's border, crosses another leg, or meets a marker in a
  narrow V with the next leg. A leg leaving a split marker may set off on a slant to climb clear of it.
- An arrow slides along its leg (a little before or after the middle) when it would sit on a name, and is centered
  where it's drawn (Google draws an arrow behind its tip). A leg too short to hold an arrow has none.
- A split marker's names may stand one above the other beside it when one line doesn't fit.
- Legs already travelled are a shade stronger; "start" fades with its city once visited.

### Fixed
- Names were placed using a guess at their width (from their letter count) and judged against arrows that weren't
  where Google draws them; both are now measured.
- "Okayama start" could touch the ring around marker 1; names keep a few points from one another.
- The map could keep a name on a line rather than grow a little taller to give it a clear place below.

No SPEC change: the map's purpose and what it shows are unchanged.

## 2026-10-01 — Charm Comes Back, and Trip Notes

Ken: Wander had become "an attractive database front end with AI support"; it started beautiful. Seven approved
additions bring the places back without touching what Wander and Scout know.

### Added
- **The trip on a map, on Home** (Home, top; `components/HomeTripMap.tsx`). Numbered markers in visit order in each
  city's calendar color, names beside them, gently arced legs with one arrow each; "start" and "end" on the first and
  last stops; tapping a marker opens that city's first day. Shaped by seven rounds of fresh design review on iPhone SE,
  15, Pro Max and iPad screenshots (Ken: "the first time, names and icons were too big and covered what made the map
  useful"):
  - Google's own place names are off (a calm parchment-and-water style); the only words are Wander's.
  - Stops that follow each other and sit closer than a fingertip share one marker split in halves ("2 | 3"), each half
    in its city's color, each leg meeting its own half; tapping it opens a sheet to choose. Stops that don't follow
    each other are nudged apart instead.
  - Names go where they cover no marker, name, arrow or line, inside the map and clear of Google's logo and credit.
  - Legs arc around stops they don't make; a leg travelled back bows the other way. Lines and arrows are drawn at the
    same size on every phone (Google stretches its drawing 0.7–1.4× between zoom levels; measured and corrected).
  - The map is as tall as what's drawn needs, centered on it, with the trip's name below it (over it, it hid the
    map's foot and Google's credit).
  - During the trip: today's city dark with its name in a dark chip; places and legs already behind you go quiet.
  San Francisco (where the trip starts) is left off. Cities were given their locations from Google
  (`scripts/locate-cities.ts`); Shirakabeso has none until Ken confirms which place it is, so it isn't on the map.
- **Arriving in a city** (Day screen, full screen, ~2 seconds). The first time a day in a new city opens on a phone: a
  photo of that city's best-known sight with the city's name, the date, the sight's name and the photographer's credit.
  Once per city per phone; a tap puts it away; never with no signal or if the photo is slow; never for San Francisco.
  The photo comes through Wander's server (`/api/city-photo`), so no Google key reaches the phone. The sight is the
  most-reviewed tourist attraction within 12 km of the city, never a mall, shop, theme park or hotel.
- **Each day in its city's color** (Day screen, below the header). A band in the city's calendar color with the city's
  name large. The top bar above it: a back button that names where it goes ("‹ Home", "‹ Now", "‹ Notes"), the date,
  the way there on travel days ("Tokyo → Nikko"), "Today" on today, and the neighbouring days by name as bordered
  buttons ("‹ Sat", "Mon ›") — a bare "‹" beside "‹ Back" read as the same button. "With Backroads" is said once, in
  the day's own note (now a neutral card).
- **"See your route for the day in Google Maps"** (Day screen, top of the day's plan). When her tab has a Google Maps
  route for the day (Tokyo Days 2 and 3), one button opens it. Larisa sees "your route", others "her route".
- **A weather picture** beside her forecast (Day screen): a rain cloud when she expects any rain, otherwise sun and cloud.
- **Welcome home** (Home, after the trip). While the flight home is in the air: "Should be in the air", when it lands,
  "Safe travels home." After: "Welcome home, Ken." with the trip's days and places, a way into the trip notes, and the
  last day.
- **Trip notes** (new Notes tab in the bottom bar, between Now and Actions). Write or talk; every word is kept exactly
  and read back with its count ("Saved — 142 words, every one kept"). Private unless shared with the trip, per note;
  "Send a copy" to anyone (e.g. family at home); change a note and the words as first saved are kept one tap away;
  search; "Export mine" as a text file; a half-written note survives closing Wander; with no signal a note is kept on
  the phone, listed as waiting, and sent once when signal returns. Asked once, after a first note: may others' trip
  stories use what you say about places (never personal notes)?
- **Settings → Notes**: "Tidy my dictation" (off by default; tidies filler and punctuation only, keeps the original
  with a "Tidied — show exactly what was said" link, and keeps the original whenever a tidy changes more than a
  few words) and the trip-stories choice, both visible and changeable.
- **Scout's evening question** (Home and Now, after 6 PM on a trip day): "Anything worth remembering from today?" opens
  Notes for that day. "Not tonight" puts it away; it isn't asked once a note about today is written.
- Scout can read your notes and others' shared notes (`get_my_notes`); it never writes them.

### Fixed (round 14: five fresh testers on the new things, then a confirmation round)
- **Notes privacy** (a dedicated privacy tester; the server's checks held — every way in was refused — but the app had
  holes):
  - Each new note starts as "Just me" (the switch stayed on "Share with the trip", and the next note went to everyone).
  - Someone else sees only a shared note's words as they read now — never the words as first saved or a dictation
    before tidying, on screen, in search, in Scout (`services/tripNotes/view.ts`, the one rule for all three).
  - A phone handed to someone else: notes copies and drafts are kept per person; signing out clears the phone's saved
    copies of what Wander read; a note waiting for signal is shown only to its writer and sent under the writer's own
    sign-in; trip notes are never in the phone-wide offline copy.
  - The trip-stories question and its Settings switch say plainly that it covers what notes say about places, even
    notes kept to yourself, and never anything personal; an answer is acknowledged.
- **Notes**: closing Wander mid-save and saving again no longer makes two notes (the same words keep their id); a
  draft keeps its day; a note saved with no signal keeps the time it was written; a fast double tap saves once; search
  marks the words found (and says when they're only in the words as first saved); long notes fold to a few lines;
  "Tidy my dictation" tidies spoken notes only and says when a note was left as said; day headings open the day;
  messages after an offline save don't stack or linger; 44-pt switches.
- **Arrival photo**: only on arriving — for a day that's today or past, while you're in that city (looking ahead from
  home, or back at a city already left, used it up or showed it a week late); a tap in its first moment doesn't skip it.
- **Map**: tapping today's city opens today; the dark marker is "today's stop" (it said "you're here" to someone still
  at home); Back and Escape close the city chooser; a "Whole trip" button after a pinch or drag; names can be tapped and
  aren't selectable text; a line names any stop that isn't on the map (Shirakabeso).
- **Welcome home** counts each person's own trip (Andy's starts in Tokyo on Oct 14), switches on after the flight
  home lands (it said "Should be in the air" at home for hours), and offers to write notes when there are none.
- **Oct 29 evening**: no ticket warning for a train that has already left.
- **Day screen**: her forecast reads "low 60s, high 70s, little rain" (the column names doubled her words); a plain sun
  when she says rain 0; the rose city's edge and calendar dots were green (an uneven color rule — now one rule for all);
  on an iPad the city name lines up with the day.
- **Confirmation round (k1, k2)**: idea notes get the same per-person treatment on a handed phone (copies per person;
  the waiting list shows only your own — one rule in `queuedBodies`); signing in as someone else clears the phone's
  saved copies, as signing out does; the same idea note sent twice is kept once; a note written offline or in the
  first seconds keeps its day; after a save the next note is about today; Now says "Should have landed" after landing
  (one landing rule, `scheduledLanding`, for Home and Now); a note that reached Wander though its reply didn't leaves
  the waiting list; words changed by hand are never tidied; "rain 0" reads "no rain"; no evening question on the
  flight-home evening; today's city in the map's chooser says "today".
- **Scout and notes**: Scout sees, with each question, the notes the asker may see (their own and those shared with
  the trip — the same rule as the Notes screen), so "what did Larisa write about…" includes her shared notes as well
  as her Guide. Exam (5 questions, real Scout): own words quoted exactly, nothing private or edited-out ever reaches
  anyone else, shared notes found and attributed, "nothing from you yesterday" when there's nothing.
- **No empty band under the iPhone's status bar.** In the Home Screen app, the page and each screen's top bar both
  left room for the status bar, so Day, Now, Notes, Ideas, People and Settings opened with ~59 pt of blank space at the
  top (found with Chrome's safe-area emulation; it predates this release). One shared rule (`.top-bar` in index.css)
  now lets the bar step up into that room; scrolled, it still covers the status bar's area.
- **A save kept for later no longer sits on "Saving…" forever.** With no signal, a save (a note, a same-day plan) was
  kept on the phone but the screen kept waiting for the app's background helper, which never answers when there isn't
  one (first visit, private window). It now waits a second at most.

SPEC impact: Home (map), Day screen (arrival photo, city band, route button, weather picture), new Notes tab and
Settings section, Scout tools. SPEC UPDATE NEEDED.

## 2026-10-01 — Round 13: The Last Sweep Before the Trip

Five fresh testers (Julie on a small phone, Andy, Larisa auditing all 25 days against her Guide line by line, Ken through
the Oct 6 travel day, a product designer on every screen) found no blockers and twelve majors; all were fixed, and two
confirmation testers re-checked each fix.

### Fixed
- **A trip's items are for its own people.** Routes that name one item (an experience, day, reservation, stay, train leg,
  decision, phrase, to-do, a history entry to undo, a learning) checked sign-in only; anyone signed in could read, change or
  delete another trip's things, or create things on it by naming its trip, city or day. Now each is refused unless you're on
  that trip, and a traveler's profile is visible only to people sharing a trip. (Server only; nothing changes on screen.)
- **Wander no longer says her Guide doesn't name a group when her picture does.** Oct 28: her table names no one for Maruni
  Toryo and the potter visit; her Kyoto map lists them under "You & Julie (morning)". Now: "Her plan's table doesn't name
  the group; a picture in her tab lists it under “You & Julie (morning)”" (Now, Home, the day; Scout sees it too).
- **Oct 25's e-bike tour shows both places** her tab gives: her stop list's Cycle Kyoto and her Viator booking picture's
  "Kyoto's NORU bicycle shop" with "Must arrive 15 minutes prior to departure" — as a difference, not settled.
- **Her travel notes on heading rows are shown** (they were read onto no screen): "Okayama -> Bizen (~40 min local train)"
  on the Okayama stay, and "Hakata - NOT AN OVERNIGHT (travel through)" with PT1/PT2 on the Karatsu stay, under her stay
  notes on the day screen.
- **Home leads with her Itinerary's line for the day on every day** (Oct 23 led with a 7 PM dinner above "day 6 - hike,
  train to kyoto"), saying whose it is when it's someone else's ("— For Ken & Larisa").
- **A booking always shows on Home** (Oct 16's Une Immersion was under "and 2 more"); "and N more ›" opens the day at the
  first line Home left out.
- **Oct 29: Home's train line says "arrives 2:50 PM"**, and her "~2:00–2:30 Arrive KIX" says it was timed for the train in
  her tab and the booked train arrives 2:50 PM.
- **The day screen is one timeline on travel days**: booked trains sit among the timed lines at their times (and still in
  Trains below); lines with no time say so ("The lines above have no time in Larisa's Guide; by the clock:").
- **The morning you fly, the pickup line still says "2 are for before you go"**; Actions lists the rail sheet's
  "Before you travel" steps for the people doing the pickup.
- **Julie's Mashiko question says what the rail sheet already has**: "Ken's rail sheet has the “Mashiko day trip” on Oct 14
  for 2 — “Ken + Larisa only”." The question stays open.
- **Now's Next card shows her transit and dress notes** for the next line of her plan; "Your notes ›" (which read as private
  notes on Larisa's phone) is now "Notes from your Guide ›".
- To the person holding the phone: Help, Scout's first screen and Wander's own notes say "your Guide" to Larisa and "your
  rail sheet" to Ken.
- **Scout quotes her own notes for getting from the airport to a stay** (her hotel-options tab fell past the cut of tab
  text Scout reads, so it told Julie at Narita the Guide named no way to the Imperial): now "the hotel has Airport
  Limousine Bus service… the Narita Express runs direct in as little as 53 minutes" with its tab, before its own estimates.
- Scout says what her Kyoto map picture says about Oct 28's unnamed lines ("lists it under “You & Julie (morning)”")
  instead of "her tab doesn't say whose", and calls the rail sheet "Ken's rail sheet" to everyone but Ken.
- Scout exams: a new harder exam (7 questions written from her Guide and the rail sheet) 7/7; rail exam 12/12; earlier
  failures were grading rules, corrected (honest answers had been marked wrong).
- "Free cancellation ends" adds "Nothing to do unless plans change."; a confirmation that starts with names reads "Ken & Larisa: <code>" (it read as part of a name);
  the same place written two ways ("Team Lab" / "TeamLab") counts once; "You're working on it"; the pickup chip "1" says
  where it is; the No-signal notice no longer covers the last line; Profile has "‹ Back" while it loads; an idea's link
  says what it opens.

SPEC.md sections impacted: Day view (timeline, trains), Home (Today card, Next), Now (Next card), Actions, privacy/access.
SPEC UPDATE NEEDED — the day screen now interleaves booked trains with her lines; access is per trip for every item.

## 2026-10-01 — Demo Prep: Talking to Scout

Found by Ken on his iPhone while preparing to demo, and by a production walk-through as Ken on today's date.

### Changed
- **Wander's microphone works like the iPhone keyboard's.** Tap to start, tap to stop; everything heard waits in the
  box for a glance and Send. It no longer sends on stopping (Ken's choice: a misheard question shouldn't go straight to
  Scout). Words already typed stay, and the spoken words follow them. You can dictate the next question while Scout is
  still answering. (Scout's panel, the mic beside the box; the Guide page and guide.html say "tap it again when you're
  done".)
- **Times the sheet writes 10:00–12:59** gain only "AM"/"PM" ("Nagoya 10:36 AM → Tokyo 12:15 PM"), not a repeat of the
  same digits ("10:36 (10:36 AM)"). Others keep their 12-hour version beside them ("18:17 (6:17 PM)"). (Pickup page,
  Trains, rail-sheet notes.)
- Scout says "your rail sheet" to Ken, and "Ken's rail sheet" to everyone else.

### Fixed
- **One question, asked once.** Tapping Send while the mic still listened sent the question, then the mic sent it again
  as it stopped. The second copy came back "I couldn't get an answer just now", and the retry said "As above —". Now
  Send stops the mic, late words don't refill the box, and only one question can be on its way at a time.
- **Dictating a long question, the box kept the newest words out of sight.** Past its tallest, it now scrolls to the
  latest words, however they arrive (the iPhone's own dictation, Wander's mic, typing).
- **A bold heading ran into its first sentence** in Scout's answers ("**From your rail sheet**You'll need…"). It now
  starts its own line.

SPEC.md sections impacted: Scout (chat) input. No SPEC UPDATE NEEDED — SPEC doesn't describe the voice button's behavior.

## 2026-09-30 — The Delight Audit

A six-person panel (Larisa, Ken on the pickup day, Julie opening it for the first time, Andy who hates apps, a product
designer, and Scout's voice) lived real moments of the trip and wrote down every moment of confusion, annoyance, "meh"
or giving up. What changed:

### Changed
- **Wander speaks to the person holding the phone.** To Larisa: "your Guide", "Your plan for the day", "Your tabs
  differ", "Your note for the Tokyo stay", "Your Guide, tab by tab" — never "Larisa's notes" or "worth checking with
  Larisa" to Larisa herself. To Ken: "your rail sheet". Everyone else still reads "Larisa's Guide". (Home, Now, the day
  screen, the pickup page, her tabs, Trains.)
- **Now and Home show the next thing by the clock.** Just landed: "Next · After landing · KIX → Shin-Osaka · Airport
  train — No booking needed — Buy after immigration/bags", then the pickup, then the 6:17 PM train ("Then" on Home). The
  train card follows her plan when her next line is sooner (11:30 on Oct 29: the Residence transfer in 30 min, then the
  1:30 PM HARUKA). The landing note leaves Now 90 minutes after landing; the pickup card leaves Now once its train has
  gone.
- **The pickup page opens at the step you're on**, folds ticked steps to one line ("Done · show this step again ›"),
  titles each reservation by its journey ("JR West 1 · Oct 8 NOZOMI 9, Okayama 10:26 AM → Hakata 12:09 PM") with the
  reservation number in bold and "The ticket should say:", and counts only steps to do (its help and "not part of
  pickup" rows are notes). Home's and Now's pickup cards show "4 of 11 steps ticked on this phone".
- **Julie isn't handed jobs that aren't hers.** A free-cancellation window that has closed leaves Home ("Free
  cancellation has ended. Nothing to do — it stays booked." on the day); a passed to-do shows only to whoever it
  belonged to. "A question for you" shows only while it's still ahead, with "Tell Larisa your answer ›" (a message
  already started).
- **At the airport:** "Her Guide doesn't say how to get from Narita to Imperial Hotel." now has "Ask Scout the ways to go
  ›" (opens Scout and asks) and "Directions in Maps ↗".
- **Someone else's trains fold to one line** on your day ("Ken & Larisa's trains today (4) ›").
- **After its day, a train's old status is one calm line**: "Paper tickets: Ken & Larisa were to collect these at
  Shin-Osaka on Tue, Oct 6." — the rail sheet's words one tap away. Its "PENDING — SmartEX…" warning goes once you're
  aboard.
- **Her matched-date note is one quiet line**: "Wander placed this plan on this day; a picture in the tab dates it
  differently ›" (the reasoning on a tap) instead of five amber lines above her stops.
- **Oct 29's Home** says the HARUKA difference once (her plan's line points to the train row below).
- **Home's header is one row** ("Japan 2026 ▾ · Oct 5–29, 2026" with the controls), so Today starts near the top; the
  unlabelled ☑ (a second way into Actions) is gone. A one-time welcome on first open: "Hi Julie. This is Larisa's plan
  for the trip, day by day, on your phone. There's nothing you need to do — it's here when you want it."
- **One back control everywhere**: "‹ Back" (goes back, or Home) on History, Help, Profile, Settings and the pickup page.
- **Her tab names read whole**: the saved copy cuts tab names at 31 letters ("Kappabashi & Akihab"); they now end at the
  last whole word with "…".
- **Oct 25: "Taxi to e-bike meeting point" says where** — "Where: Cycle Kyoto — the stop her tab lists for this", with
  Maps (her stop list was one cell with several stops). Needs a fresh read of her Guide.
- **Small things:** "The weather Larisa's Guide expects" (it read as her forecast); map and web links no longer run
  together; Scout's panel: answers use its full width, the waiting line says "Looking in your Guide" to Larisa, the
  greeting says what Scout has actually read, the deadline chip is "Is there anything I need to do soon?".
- **Scout** speaks to the person asking ("your Guide" to Larisa, "your Suica" to Ken), answers the question in its first
  sentence, keeps in-the-moment answers short, never repeats a paragraph, uses no spreadsheet words, says when the rail
  sheet hasn't verified something (the Suica/PASMO seat designations), checks a step's own conditions (the right
  machine) before its fallback, and points to the pickup page.
- Not changed: the panel's 130%-text findings come from enlarging only some text in a test browser; Wander has no text
  size setting, and Safari's zoom scales everything together.
- **After the second pass (four fresh panel members):**
  - **Arrival day has one "Next" at a time.** Just landed: one dark card, "Next · after landing · HARUKA · KIX →
    Shin-Osaka — Buy after immigration/bags", with "Then · Ticket pickup: the steps ›" and "Then · 6:17 PM NOZOMI 77"
    inside it (three cards each looked like what to do next). It gives way once a pickup step is ticked or 90 minutes
    after landing; the pickup card leads until 20 minutes before the train; then the train leads. Before landing, the
    landing is next.
  - **One count for the pickup, in tickets**: "4 of 6 tickets ticked on this phone — next: JR West 5" on the page, Home
    and Now (they said "6 of 11" and "6 of 13"). After Oct 6, on the pickup couple's phones, each train says whether its
    ticket's step was ticked here — "Paper ticket: not ticked on this phone at the Shin-Osaka pickup on Tue, Oct 6 —
    check you have it before boarding." (an unticked ticket read the same as a collected one).
  - **Oct 29 says the HARUKA difference once per screen, in one line under the train**: "Her “Kyoto Thu, 1029 …” tab says
    12:30 PM–1:00 PM; this booking and her Itinerary tab say 1:30 PM." Home shows the train once (her 12:30 line isn't
    Next); the old pickup instructions aren't shown after the pickup day.
  - **The "your" change is finished**: Ideas ("Marked by you"), Actions ("You · working on it", "your Guide"), History
    ("You added …"), her tabs ("A picture you pasted"), Settings (no file name: "Wander's copy, read …"), plans she adds
    ("Added by you · not in your Guide"), and Wander's own notes ("the stop your tab lists"). Ken's Settings: "Your rail
    sheet". Help, written for everyone, still explains Larisa's Guide.
  - **Oct 28, split day**: Now and Home lead with "Next in your plan · 10:35–11:35 · Maruni Toryo — Your Guide doesn't name
    the group for this line; Ken & Andy are at MIHO Museum then.", then "Then · Café ENSOU lunch" (Next had skipped to
    lunch, with Maruni Toryo an amber aside). The day screen's note is a small grey "No group named here".
  - **Home at Narita**: "Getting from Narita to Imperial Hotel: her Guide doesn't say." with "Ask Scout the ways to go ›"
    ("Scout can answer once you have signal" offline) and "Directions in Maps ↗".
  - **The tab bar's five tabs share the width** ("Scout" was cut to "Sc" at Safari's larger zoom). "… interested?"
    questions don't headline their own day. The welcome says "There's nothing to set up" (Ken has tickets to collect).
  - **Scout** never claims more than the sources show ("the only HARUKA booking in the rail sheet is the 1:30 PM" — not
    "the 12:30 isn't a booking").
- **After the third pass (two fresh panel members; no wrong time, place, booking or person found):**
  - **"Her Guide doesn't say" is only said when none of her tabs does.** At Narita, Home and Now quote her own hotel
    notes — “Airport access is good: the hotel has Airport Limousine Bus service from the main entrance … the Narita
    Express runs direct in as little as 53 minutes.” (her “Tokyo Areas & Hotel Options” tab) — beside "Ask Scout" and
    "Directions in Maps". (It said her Guide didn't say; an honesty failure.)
  - **A ticket this phone didn't tick at the pickup is said at the top of Home and Now on the morning it travels**, with
    the rail sheet's own words on where it can still be had: "Paper ticket for the 4:58 PM YAMABIKO 146: not ticked on
    this phone at the pickup. If it's ticked on Larisa's phone, you're set. If not, the rail sheet says: “Pick up before
    Oct 14 boarding at … Shin-Osaka …, or Tokyo Station's JR East Travel Service Center. Tickets cannot be collected at
    Utsunomiya.”" On the pickup evening, Home names what wasn't ticked ("Not ticked on this phone at the pickup: JR West
    5, JR West 6 ›") instead of the pickup link.
  - **Now shows one strong card at a time**: a second card (the train after her Next; the train under the pickup; "Then"
    on the split day) is a step quieter. Her lines that fall during the next booked train's ride ("Arrive KIX") aren't
    offered as Next.
  - **The last third-person lines on Larisa's phone**: Home's "Added in Wander by you", History's subtitle, the trip
    picker ("From your Guide", no file name), Actions ("For you & Andy"). Home's split-day line says who's elsewhere
    ("Ken & Andy are at MIHO Museum then"), and "… interested?" questions leave Home's list on their own day.
- SPEC UPDATE NEEDED (§ Now: what's next by the clock; § Home header; § to-dos and deadlines shown by whose they are).

## 2026-09-30 — Loose Ends Before Release

### Fixed
- **Actions:** Cancel clears what you typed (it came back when you opened the form again); a to-do's note box is 16px (no iPhone zoom) with full-size Cancel and Save; tags read "For everyone" / "For Larisa" instead of "Group" / "LF"; statuses read "working on it" and "not needed" instead of "in progress" and "n/a"; "7 done ›" and "Hide the done ones" are larger.
- **"As Wander last read it on Sep 30"** is the same on every phone — Japan's date, said as such on a phone elsewhere (Julie's California phone said Sep 29, Ken's Sep 30).
- **The day screen says her name the way people say it**, first name first, as Home does (it said it surname first).
- **Profile documents:** the "who can see this" button is read aloud as it reads on screen, followed by what a tap does; field labels are tied to their boxes (a screen reader now names each box) and larger; "+ Add" is larger.
- **A train line on Home opens the day at its trains** (it opened at the top).
- **Pickup steps:** "The station map and where these steps come from ›" near the top (its steps say "the station map link below"; it was at the very end).
- **After a whole-product sweep (round 12: Larisa, Julie, Andy and a designer, four fresh testers):**
  - **Oct 17's two Robuchon restaurants are flagged.** Her day tab books "Gastronomy “Joël Robuchon”" (jackets required) and her Dining Resos booking is "LeTable de Joel Robuchon - 1F" (ties not necessary), both at 6:00 PM; both lines now say "Her tabs differ". Takes effect on the next read of her Guide.
  - **"Sources differ" says which of her tabs differs** — "the rail sheet has HARUKA 31 leaving 1:30 PM, and so does her Itinerary tab (“1:30-2:00p”); her “Kyoto Thu, 1029…” tab has 12:30 PM–1:00 PM" — instead of "Larisa's Guide has 12:30". Her day plan's HARUKA card on Now says the rail sheet has that train at another time, so two countdowns don't read as two trains; the flight card no longer carries the HARUKA note.
  - **A deadline says whose to-do it is:** "Larisa's to do (booked under …)" with her full name to everyone else, "Booked under your name" to Larisa (Julie read the Robuchon reconfirmation as hers).
  - **A question her Guide asks you** ("1 day to Mashiko-Julie interested?") says "A question for you in Larisa's Guide — tell her your answer."
  - **Landing, with nothing in her Guide about getting to the hotel:** "Her Guide doesn't say how to get from Narita to Imperial Hotel. Scout can look up the ways to go."
  - **One map for a place her tabs put in two areas** (Yazawa: Ginza in her day tab, Yaesu in the booking): only the booking's address has a Maps link; the "tabs differ" note says both.
  - **Maps for a day-trip place** searches the town her tab names ("Maruni Toryo, Shigaraki, Kyoto"), not only its city.
  - **Home doesn't jump:** it holds the Today card's place while loading, so the calendar isn't pushed down under a tapping thumb; a flight always shows on Home's Today card (the flight home was under "and 1 more").
  - **The rail sheet's "?" legs say their open question right there** (Oct 23: "Confirm whether Backroads supplies the train tickets…").
  - **Documents:** the profile says what's true — passport, visa and insurance details open with Face ID and no one else ever sees them (the group sees only that you have one); the switch's hint says the same for those.
  - **A "just for me" note stays private.** Home's Recent activity read every note on an idea, so Larisa's private note showed on Ken's phone (and group notes showed twice). It now comes only from the history, which never holds a private note; taking a group note back takes its words out of the history too (on screen and through Scout).
  - **Each trip's data is for its own people.** Sixteen kinds of trip data (the history, days, decisions, stays, bookings, documents' list and more) and the activity feed were served to anyone signed in; every route that names a trip now checks the person is on it.
  - **Maps for her day plan:** a line that is one of her bookings uses the booking's own address (Oct 26's Hassun, in Gion, was searched in Arashiyama); a tab's town is added only when her Itinerary line for the day names it (Shigaraki on Oct 28).
  - **A plan added in Wander that comes first is Home's "Next"**, as on Now; her Guide's next line stays in the list below it.
  - **A to-do done in her Guide can't be un-done here** ("done in Larisa's Guide"); one ticked in Wander can be marked not done.
  - **Her open question for a stay shows up top on the day it's about** ("Still open in her Guide: “WHERE IS BIZEN TOUR STARTING”" on Oct 7), in her words.
  - **"The rest of this day is the others' plan"** only when someone else has lines that day (Oct 5 had none).
  - **"Larisa's Guide, tab by tab" is in her sheet's order**, not A–Z.
  - **Documents open with your PIN or Face ID** — the profile and Help now both say so. A tick with no signal says "No signal — that tick didn't save. Try again when you're back online."
  - **No more trap behind "+ Plan a new trip"** — it opened the old PDF-import screen with no way back but a reload; trips come from Larisa's Guide, so the button is gone.
  - **Home's Today card in time order with the trains:** your trains from Ken's rail sheet sit in the day's list by time (the 6:17 PM train was above the 2:50 PM landing), always shown; her short untimed Itinerary bits share one line ("Her Itinerary for today: “Rikuro Cheesecake” · “Shinkansen”"); a meal her Guide says isn't booked says "No reservation".
  - **After the pickup day, the rail sheet's old "PENDING — collect … Oct 6"** no longer leads Now's next-train card (the day's train list still has it, said as possibly out of date), and the pickup link stops repeating on later days.
  - **The pickup page starts with the steps:** its jump buttons are one row you swipe sideways under "Jump to a step", and the tick count matches the steps shown.
  - **Her pictures open in "tab by tab"** ("See the picture ›") — the Tokyo subway map, the booking screenshots.
  - **Scout with no signal says so:** the question buttons and Send wait, and the box says "No signal — Scout can answer once you're back online".
  - **Recent activity leaves out what was added and taken back** (History keeps both).
  - **People on this trip:** how many phones use Face ID shows only on your own row.
  - **Actions:** "Still to do" instead of "Coming up" (a to-do with no date isn't coming up); a stored "null" date isn't shown as one. **Help** explains Ken's rail sheet. **Profile:** "What Scout has picked up from you" instead of "Your Learnings".
  - **Before the others have landed, Julie's "Right now in Japan" says where they really are** — "Ken & Larisa haven't left home yet — they're due to land at Kansai (KIX) Tue 2:50 PM Japan time", or "should be in the air…" — never the calendar's city ("the others are in Okayama" while they were still home).
  - **A question in her Guide is only "for you" when it really is** — not on Ken & Larisa's Mashiko card quoting "if Julie isn't interested"; someone else's untimed line comes after your own on Home; her open question for a stay shows only on days whose lines are yours ("ASK KENJI…" no longer leads Julie's landing day), and is quoted whole ("…FINISH 3:45-4p AT TRAIN", no stray letter from the next line).
  - **"How to get from Narita"** counts only your own trains in the rail sheet (Ken & Larisa's Mashiko trains hid Julie's line).
  - **The pickup page never slides sideways** on a small phone (its jump row pushed the page 173 points wide).
  - **The same "last read" everywhere:** Settings shows her Guide's copy and Ken's rail sheet with their read times in Japan time ("Where Wander's plan comes from"); the trip picker's old "Guide read …" (an older, different time) is gone.
  - **Small things:** Home's "Opening today…" is a full screen tall, so the calendar never moves in view; a day-trip town's Maps search is "Maruni Toryo, Shigaraki, Japan" (Shigaraki isn't in Kyoto); Scout's no-signal words fit the box and the microphone waits too; the notice about someone else's change goes by itself after 8 seconds.
  - **An old rail-sheet status after its day says whose job it was:** "Collecting these tickets was part of Ken & Larisa's Shin-Osaka ticket pickup on Tue, Oct 6. The rail sheet still said, when Wander read it …: “PENDING — …” — Wander can't see whether that's been done since." (Andy, 20 minutes before his HARUKA, read the old words as "nobody knows if your ticket exists".)
  - **Home's Today card starts with her open question about today** ("Still open in her Guide: “WHERE IS BIZEN TOUR STARTING”" on Oct 7).
  - **History records to-dos** added, ticked off, marked not done and taken out on the Actions screen (only Scout's were recorded).
  - **Someone taking back their own addition doesn't pop a notice** over everyone's screen (screens still update); "Add a note" and Help's "Go to the trip" are full-size.
  - **To-dos added in Wander can be taken out** ("Take out", then "Take this out?"); one from Larisa's Guide can't. The to-do routes now check the person is on the trip (they checked sign-in only — anyone signed in could read or change another trip's to-dos). Scout can list, add, tick off and take out to-dos by the same rules (get_todos, add_todo, set_todo_done, remove_todo).
- **Home's deadlines with a window** add their time and clock ("Any day through Wed, Oct 14, by the end of the day in Japan (Wed 7:59 AM your time)").
- **After the second confirmation round (four fresh testers: Julie, Ken, Larisa, Andy):**
  - **Between landing and arriving** (Home, "Right now in Japan", on Julie's and Andy's phones at home): "Ken & Larisa landed at Kansai (KIX) at 2:50 PM, by the schedule, and are on their way to Okayama — due there about 7:05 PM", timed by their own trains in Ken's rail sheet. It said "the others are in Okayama" from the moment they landed.
  - **Now on the day you fly** counts to your own flight: "You leave today" on the morning Ken & Larisa fly (it said "You leave tomorrow", counting to their first Japan day, and disagreed with Home all week).
  - **The train you're on stays in view** between leaving and arriving: Home says "On the train now, by the schedule · NOZOMI 77 · Shin-Osaka → Okayama, arriving 7:05 PM" with the seats, and Now's top card "On this train now, by the schedule · arriving 7:05 PM" (both dropped it the minute it left). Home no longer lists the "Next" train a second time below it.
  - **Oct 29 at 12:10, Now says the HARUKA difference once**: the rail card, the note under it naming each source, and one line on her plan's HARUKA line — her ~12:30 boarding is no longer a second dark "Next" card. Times already written "12:30 PM" stay that way.
  - **To-dos say who added them and only they can take one out** ("added by you" / "added by Larisa"; Scout follows the same rule). A done one you added can be taken out without un-ticking it. Her Actions tab's "Both" reads "For Andy & Larisa" (her two status columns; it said "For everyone"). *New field: who added a to-do.*
  - **The Four Seasons deadline says whose it is** — "Ken's to do (booked under …)", from the "Dear …" greeting of the hotel's email in her tab (read only when the tab holds one booking). Needs a fresh read of her Guide.
  - **A link cell with two addresses is two links** (Oct 27's "Michelin page" joined a Michelin address and a Google search into one dead link); a Google search is labelled "Google search"; a card with her own map link has no second Maps link.
  - **Stay headings use her dates, check-in to check-out**: "Larisa's note for the Okayama stay, Oct 6–8" (it counted nights, "Oct 6–7").
  - **Wander's own map links in "Larisa's Guide, tab by tab" say they're Wander's** ("Wander's link: live map of Tokyo"); the fixed Tokyo → Kyoto "rail route planner" (none of this trip's trains) is gone.
  - **Scout with no signal:** the box says "No signal right now" on one line (it was cut off), the microphone is faded like Send, and the welcome says why the questions are greyed.
  - **The floating "No signal — showing what this phone saved …" wraps inside the screen** (at large text it ran off both edges).
  - **Small things:** the rail sheet's read time says "Japan time" on every phone; the pickup page's morning times read "08:07 (8:07 AM)"; "Refresh at the Imperial Hotel" searches the hotel itself (not "Ginza"); her Itinerary's short lines read "In her Itinerary for today: “…”" (a room type read as "Her note"); the Profile's privacy sentence reads the right way round; "By when? Oct 20" fits; the add-a-plan example names no one; History no longer quotes notes taken back before Sep 30 (a one-time rewrite).
  - SPEC UPDATE NEEDED (§ on Actions: who can take out a to-do; § on Home's "Right now in Japan").
- **After the third confirmation round (four fresh testers; no blockers):**
  - **Her Tokyo day plans no longer say her tab gives no date when her own picture does.** "Wander matched this plan to Thu, Oct 15, since her tab's words don't give a date. … A picture in her tab labels Day 1 Tue, Oct 13 — a different date; worth checking with Larisa." (Day 2 and 3 point to the map in her “Tokyo Day 1 Ginza” tab.) Her sources' disagreement is said, never settled silently. Needs a fresh read of her Guide.
  - **A room description beside a hotel in her Itinerary isn't the day's line**: Oct 27 opened with "In her Itinerary for today: “Two-Bedroom Heritage Garden Residence”"; it's now listed on the day screen as "Beside Four Seasons in her Itinerary", and her real line (Team Lab) shows. Only room descriptions — the Backroads meeting on the Ritz-Carlton's row is untouched. Needs a fresh read.
  - **The pickup page's "last read" is in Japan time** like everywhere else (a California phone showed Sep 30 there and Oct 1 elsewhere).
  - **Every two-digit rail-sheet time gets its 12-hour words** ("Okayama 10:26 (10:26 AM)").
  - **Oct 29's flight card no longer repeats her HARUKA travel note** when her HARUKA line already quotes it whole.
  - **Ideas shows the notes this phone last saw at once**, then the fresh copy (on a reload, every note looked deleted for a moment).
  - **A ticked to-do keeps "added by …"**; Home's bundled Itinerary line reads "In her Itinerary for today".
- **After the fourth confirmation (one fresh tester across all four people; J1–J8 all passed):**
  - **On a train, arriving is what's next.** On the 1:30 PM HARUKA, Home and Now said "On this train now … arriving 2:50 PM" and, under it, "Next · in 15 min · ~2:00–2:30 Arrive KIX" — her arrival for her own 12:30 departure. While you're on a rail-sheet train, her lines timed before its arrival aren't "Next" or listed on Home (the day screen still has her whole plan).
  - **A train's disagreement goes once the train has.** "The sources differ — HARUKA 31 leaving 1:30 PM…" stopped leading Now at 4 PM at the airport — it shows until every time it names has passed. The flight's Next card on Now no longer carries the train's "Her tabs differ" (the day screen and Home already didn't).

## 2026-09-30 — Ken's Rail Sheet, Beside Her Guide

### Added
- **Wander reads a second source: Ken's rail sheet** ("Japan 2026 — Rail Reservations", his own Google Sheet, written with AI help). Read-only — Wander's robot can only view it, and nothing in Wander writes to it. Wander reads it again every 10 minutes and keeps a new copy only when something changed; if a read fails it keeps the last good copy and says so. It is never merged into Larisa's Guide.
- **Trains on each day screen** ("Trains"): each leg from its "Rail Detail" tab — times, train, class, car and seats, reservation number, how many people, the sheet's own status words ("PENDING — JR West paper tickets: collect at Shin-Osaka Oct 6", "marks this leg “?”"), its notes, and "From Ken's rail sheet, written with AI help — Rail Detail tab, row 6". A leg with no booking says so. Where a note says whose it is ("Ken + Larisa only") that shows up top.
- **The Shin-Osaka ticket pickup, step by step** (its "Tix pick up — Shin-Osaka" tab): a page with every step in the sheet's order and words, numbered sub-steps on their own lines, and a tick for each that stays on that phone. Ken's and Larisa's Home show it before the trip (with the steps for before you go), the day before, and on the day; their Now and Oct 6 screen lead with "Today · Ticket pickup — Shin-Osaka". Anyone can open it from a train whose tickets need collecting. It opens with no signal once it has been seen.
- **Now: "Next train · in 2 hr 57 min"** with seats and reservation number, and **Home: "Train · 6:17 PM NOZOMI 77 …"** — only a person's own trains: a leg with seats for the whole group is everyone's; fewer seats are the sheet owner's couple (Ken & Larisa). Julie and Andy never get Ken & Larisa's trains as theirs.
- **"The sources differ"**, worked out by rule, never settled: on Oct 29 the rail sheet has HARUKA 31 leaving 1:30 PM while her Kyoto day tab has "Board reserved HARUKA" 12:30–1:00 PM — both are shown. A window that holds the time ("ideally around 4:45–5:00 PM" and a 4:58 train) or "leave 6:15 or later" is agreement, not a difference.
- **Scout reads the rail sheet** as its own cited document: it names it ("Ken's rail sheet has…"), never credits it to Larisa, passes its status words on as its words, gives the pickup steps completely and in order, says both sides where it and the Guide differ, and says when Wander last read it. Sources under an answer show "Ken's rail sheet, written with AI help — not Larisa's Guide" with the tab, cell and exact words.
- **Cards by their last four digits only** (Ken's decision, the standard safe way to say which card): "a physical Mastercard ending 1234" is kept as written; a whole card number is cut to "[card ending 1234]"; a phone transit card's full ID is left out entirely. (First built as "ending ••••"; changed the same day.)
- **After a fresh tester (rail round):** a status that names a day already past ("collect at Shin-Osaka Oct 6", seen on Oct 14) now reads "The rail sheet still said, when Wander read it …: “…” Wander can't tell whether that has been done since."; the Trains heading says when Wander last read the sheet; on the day, "The sources differ" is said at the top of Home's train line and the day screen, before either source's "Next"; Now's next-train card carries the sheet's own warning ("PENDING — SmartEX: verify … IC cards"); the pickup page has jump-to-step buttons and, on the day, folds the steps for before you left home, so "2 — decision" is near the top; the sheet's 24-hour times read "17:00 (5:00 PM)"; the pickup link on others' days says whose job it is; "the others' plan" is said only when someone else has lines that day.
- **Ready for more sources:** a source is a row (name, whose, how it was written, what it covers). Tabs are recognized by their header row, not by which sheet they're in — if these two tabs move into Larisa's Guide, Wander reads them the same way (then only as fresh as her latest copy). Any other tab still reaches Scout row by row, cited by cell.

### Tests
- New `backend/tests/other-sources.test.ts` (18, invented data): the card-digit filter, tabs recognized by headers in any column order, "sources differ" (real difference, window, "or later", another leg's time), copies kept only on change, a failed read keeping the last good copy, members-only API with no way to write, and Scout's document with cells.
- Scout rail exam (12 questions written from the sheet before the build): 11/12, then the one failure (24-hour times) fixed and 12/12.

Affects: backend/prisma/schema.prisma (TripSource, SourceCopy), backend/src/services/sources/{filter,googleSheet,shapes,refresh,context}.ts (new), backend/src/routes/sources.ts (new), backend/src/index.ts, backend/src/routes/chat.ts, backend/src/services/guide/{sources,answerSources}.ts, backend/src/services/sheetsSync.ts (new key file), backend/scripts/add-rail-source.ts (new); frontend/src/lib/sources.ts, frontend/src/components/RailSheet.tsx, frontend/src/pages/ChecklistPage.tsx (new), frontend/src/pages/DayPage.tsx, frontend/src/components/{TripGlance,ScoutSources}.tsx, frontend/src/App.tsx.

SPEC UPDATE NEEDED: a new source besides Larisa's Guide (sources, day screen "Trains", the checklist page, Home/Now train lines) — SPEC.md describes the Guide as Wander's only plan source.

## 2026-09-30 — A Flight That Hasn't Left Yet, and Votes That Stick

### Fixed
- **Scout no longer says someone has already left when their flight is still ahead.** Asked the evening before Julie and Andy fly, Scout said they were "having left San Francisco Tue, Oct 13", and in the next sentence that the flight hadn't left. The cause was Wander's own wording: the landing line for a flight that arrives on a later day said "Left San Francisco (SFO) Tue, Oct 13, 12:00 PM" at every moment, and Scout repeated it. It now reads "Takes off from San Francisco (SFO) Tue, Oct 13, 12:00 PM California time", the way a timetable says it; whether the flight is ahead, in the air or landed stays with Wander's own status line, worked out from the time on the phone. On screen, the same words show on the landing card (Narita on Oct 14 for Julie & Andy, Kansai on Oct 6 for Ken & Larisa). Takes effect on the next read of her Guide.
- **Scout says what the schedule says about a flight, never more.** Asked at 5:30 PM whether Julie & Andy had landed, Scout answered "Yes — their flight has landed." Wander can't see the real flight (her screenshot has no flight number), only its timetable, and Wander's own status line had said "has landed" as fact. It now says what the schedule supports: "scheduled to take off …", "should be in the air by its schedule … due to land at 3:00 PM", "was due to land at 3:00 PM" for 12 hours after, and plainly "landed" after that. Scout now answers "they should have landed by now … that's the schedule, not a confirmation."
- **Scout keeps the Guide's Japan dates apart from home dates.** Asked by Julie at home, Scout once said "Oct 13 is the day you're still flying"; on the Guide's Oct 13 (a Japan date) she is still at home. Each such date now tells Scout what it is on the person's own clock ("runs Mon, Oct 12, 8:00 AM to Tue, Oct 13, 8:00 AM California time, all before their flight takes off").
- **Home: "Right now in Japan" on a moving day.** Julie's Home said "the others are in Tokyo" at 10 AM on the day Ken & Larisa travel from Nagoya to Tokyo. It now says "the others travel from Nagoya to Tokyo today", the same route the day screen's header shows.
- **Someone else's flight, at a glance (Home's Today card and the day screen's landing card).** A landing now says where the flight stands by its schedule, in one line: "Takes off from San Francisco (SFO) Tue, Oct 13, 12:00 PM California time — that's Wed 4:00 AM Japan time" before it leaves (the booking's own time read as yesterday on a Wednesday phone), "Should be in the air now — due to take off from San Francisco (SFO) Wed 4:00 AM Japan time and land at 3:00 PM" while it's flying, and "Was due to land at 3:00 PM — that's the schedule; a delay wouldn't show here" for 12 hours after. Home keeps the landing on the card all day (it used to drop off at 3:00 PM, leaving "After landing · Check in" on its own), and a check-in that waits for a landing is listed after it.
- **"On this Japan date you're still at home."** A day screen (and Now's "your first day") for a date when your own flight hasn't taken off yet in Japan's time now says so at the top, with your take-off time: "The rest of this day is the others' plan." Julie's first day (Japan's Oct 13) showed the others' 8 PM Tokyo dinner as if it might be hers.
- **Home's Today card, in the day's order.** The day's own untimed lines ("Day trip from Tokyo to Mashiko") come first, as on the day screen, then the times, then untimed meals and deadlines. Ken's all-day trip used to sit under Julie & Andy's 3 PM landing.
- **Whose clock.** On a phone outside Japan, the day screen's times say "Japan time"; a time on another clock on Home says whose ("California time"), and your flight's line on Home adds when it lands.
- **After a whole-trip test (six fresh testers, round 9):**
  - **Her open questions stay in her notes.** A stay's note now keeps everything she wrote in its heading, not just the part in brackets. Okayama's "WHERE IS BIZEN TOUR STARTING" had been dropped, so the tour looked settled.
  - **"Find in Maps" works for her Day 2 and Day 3 places.** Her pasted links were encoded twice (Gemini's), and Wander's one decode left a dead Maps link on Now's big button for Kappabashi, Origami Kaikan and others. A booked dinner's Maps search no longer uses the restaurant's phone number as its street.
  - **The day you land says so first:** "You land at Narita (NRT) at 3:00 PM Japan time. Anything earlier on this day is the others' plan." Julie's landing day used to open on Ken & Larisa's 8:07 AM Mashiko train.
  - **Take-off times on another clock are said in full:** "Takes off Wed, Oct 14, 4:00 AM Japan time", and the night before, "Take off Wed 4:00 AM Japan time — lands at Narita 3:00 PM Wed".
  - **Your own flight home says "Should be in the air"**, by the schedule, rather than "In the air".
  - **Deadlines say whose booking they are** ("Booked under Larisa Fong") when no one's name is on the line, and Larisa is no longer told to "ask Larisa".
  - **Home's Tomorrow line doesn't pick** between two places her Guide lists for the same time: "8:00 PM · her Guide lists two places".
  - **"see above …" rows from her sheet** are never shown as "Her Itinerary line for today"; a future Backroads day no longer says "With Backroads today".
  - **The calendar stays on Home after the trip**, so any day is one tap away (the Guide's note still said "the days above").
  - **Phone basics:** the Backroads "B" sits beside the date instead of over it, with "B · with Backroads" under the calendar; the map rows in "Larisa's Guide, tab by tab" no longer collapse to a letter per line at large text; History's "Bring back", Actions' done list, ticks and "+ Add", and the profile page's Back and Add are all at least 44 points.
- **After the confirmation round (three fresh testers, round 10):**
  - **Whose a line is, from her own shorthand.** Her Oct 14 line "KL day trip to Mashiko" now marks the unnamed Mashiko day-trip card "For Ken & Larisa", quoting her words. Only a distinctive place counts, only on that date, never over names already there, and never when two couples share the subject ("K/L, J/A depart Osaka"). On her Sep 29 copy it tags exactly that one line.
  - **Deadlines say whose booking they are on Actions and on today's line** too ("Booked under Larisa Fong"). Andy, just landed, was being told "Today is the last day" for Larisa's dinner.
  - **A bare "1/2 day" never shows on Home;** on the day screen it stays only when her note hangs on it.
  - **Web addresses in her notes are short links.** A long address she pasted (often a Google wrapper around the real site) now shows as "site ↗" and opens the real site; phone numbers next to it stay tappable. Seen in a stay's notes and her Guide's tab rows.
  - **Forms on a phone:** the travel-document form (every box, the "who can see this" switch, Save and Cancel), a document's Edit, Remove and Keep, "Unlock to view", and Actions' add box are all at least 44 points, with 16px text so iPhone Safari doesn't zoom the page when you tap a box. The documents note now says where the switch is: "When you add or edit one, tap “Everyone in this trip” to keep it to yourself."
  - **Votes stay with their trip:** someone signed in as a traveler can vote only on their own trips' decisions.
- **After a last-check tester (round 11):**
  - **Now and Home count down on the right clock.** On a phone still in California, "now" was the phone's clock set against her Guide's Japan times: at 1:00 AM, Julie's Now said "Next · in 14 hr — 3:00 PM · Land at Narita", a landing due two hours earlier. Every countdown, "Next", "Now, in Larisa's plan" and faded-out past line now measures now on the clock its time is on (Japan's for her Guide, the flight's own for a flight from home). On a phone in Japan nothing changes.
  - **A landing that's past its time says so:** "Your flight was due to land at Narita (NRT) at 3:00 PM Japan time (Tue 11:00 PM your time) — that's the schedule." On a phone still on home time, the landing status on Home and the day screen names Japan time and adds the phone's own time.
  - **Home names the clock.** On a phone not on Japan time, Home's times say "Japan time" (the day screen already did), including the Tomorrow line.
  - **The morning you fly:** Now leads with "Today · your flight — 12:00 PM California time · United · San Francisco (SFO) → Narita (NRT)", then your first Japan day; Home's Tonight line says "On the plane — lands at Narita 3:00 PM Wed Japan time (Tue 11:00 PM your time)" instead of a second take-off time in Japan's clock.
  - **Phone links only on phone numbers.** A hotel confirmation number, a postal code with a street number, and a fax were tappable "phone numbers"; a Kyoto ryokan's "81-75-…" dialed without its "+"; a restaurant's number ran into its street address. Numbers now link only in a real phone number's shape, the longest leading part that is one, never after "fax", "#" or "Confirmation". The same rule applies to Scout's answers.
  - **"The hotel" on a map is tonight's hotel.** Oct 17's "Strict Formalwear Prep at the Hotel" searched Maps for any hotel in Tokyo; a generic "the hotel" or "the ryokan" in her plan now opens that night's stay, or shows no Maps link when Wander can't tell which.
  - **Links:** "www.robuchon.jp" in a pasted email is a link; Google links say what opens ("Google Maps ↗", "Google Maps route ↗", "Google search ↗") instead of "google.com ↗".
  - **A day in the order it happens, across clocks.** Julie's 12:00 PM California take-off (4:00 AM Wednesday in Japan) was listed above Japan's Tuesday 2:00 PM check-in and 8:00 PM dinner on the Oct 13 screen and Home; a time on another clock is now placed by when it happens.
  - **After take-off time, by the schedule:** the "Today · your flight" card says "should be in the air" and "Take-off was due at …"; Oct 13's banner says "you were still at home — your flight was due to take off …".
  - **"Tonight" means tonight.** "On the plane" is Home's wording (Home runs on your own clock); a Japan date's day screen keeps its own night. A day screen for a date other than today heads its sleeping section "The night of Wed, Oct 14" instead of "Tonight".
  - **Now's Tomorrow line names its clock** on a phone not on Japan time, and **a booking's Maps search** skips the name said again and a half-closed bracket ("Tapas Molecular Bar, Mandarin Oriental", not "… TAPAS MOLECULAR BAR [タパス…").
  - **Julie's travel day, from her phone (a third tester):** after her take-off time Now says "You should be on your way" instead of "You leave today"; Home no longer gives her landing as both Tonight and Tomorrow; Home's Today card says "The rest is the others' plan. On this Japan date you're still at home." above the others' lines; someone else's card on a day screen says "For Ken & Larisa" under its title and folds their long notes behind "Their notes (12 lines) ›", so your own landing and hotel aren't pushed below the fold; "Takes off Wed … Japan time" becomes "Take-off was due …" after that time, on the card and in the night section; a landing's headline becomes "You were due to land at …" after its time; the Tomorrow line keeps "After landing" for a check-in; opened notes can be closed again ("Hide their notes").
  - **The documents' "who can see this" control** is announced by VoiceOver as a switch, on or off, and its hint says what a tap does ("Your travel group can see this — tap to keep it to yourself").
- **Scout:** tool markup written out as words is never shown (it once answered with raw `<invoke …>` text) — Scout is asked again for plain words; a time Scout works out itself (a departure plus a ride) is labelled as its estimate and summed for each end of a range (it said a 1:30–2:00 Haruka reaches KIX "around 3:15–3:30"); and it never names a vehicle her Guide doesn't ("the van" for her "Residence transfer").
- **Importing a new trip keeps it yours.** A trip made with the older import (reading an itinerary) didn't make its maker a member, so since trips became private (Sep 28) its maker got "not found" for the trip they'd just made. The maker is now its planner, as when a trip is started by hand.
- **"Happy with any" is saved.** In a group decision, tapping "happy with any" said "Got it — you're flexible" and then saved nothing, so the "flexible" count never showed the person. It's now kept as their vote, the same way Scout already saved it.
- **A vote for something that isn't one of the choices changes nothing.** It used to wipe the person's earlier votes and then fail with a server error. Now it's refused plainly ("That isn't one of the choices for this decision."), and the earlier votes stay. A repeated pick or rank in a top-3 list is dropped instead of failing. Scout's voting tool follows the same rules.

### Tests
- New `backend/tests/decision-votes.test.ts` (14): votes read back from the database, for the app and for Scout, including someone not on the trip.
- Chaos S111, S116 and S306 now pass (they were real bugs, above). S50 and workflow "Phase 12" pass: their fixed 2026 dates had passed, and the import moves a trip dated in the past to start today; they now always use next year (Phase 12 also found the import bug above).
- Run the browser suite on Playwright's own headless browser (the project config's default), never the installed Google Chrome: Chrome's crash reporter and Google's updater hold the test run open for minutes after the last test.

Affects: backend/src/services/guide/{importSnapshot,scoutContext}.ts (stopNoteOf, unwrapSearchLink), backend/src/services/decisionVotes.ts (new), backend/src/routes/{decisions,chat,import}.ts (withoutToolMarkup), backend/tests/{decision-votes,chaos,workflow,stop-notes,answer-pieces,tabs-differ}.test.ts, frontend/src/lib/guideDisplay.ts (landingStatus, homeOnJapanDate, departureInTripZone, landingTitle, zoneWords, nightOf, mapsQueryFor, unwrapSearchLink), frontend/src/components/{TripGlance,ActionsPanel,SheetNotesCard}.tsx, frontend/src/pages/{DayPage,TripOverview,HistoryPage,ProfilePage}.tsx.

SPEC UPDATE NEEDED: §19/§18 (Home and the day screen show where another party's flight stands, by its schedule, and say Wander can't follow the flight itself; on a phone not on Japan time, every time names its clock and countdowns run on the time's own clock).

## 2026-09-30 — Sources: Where Every Scout Answer Came From

Ken: early on, people decide whether Scout is credible, so every answer needs a way to show its exact source. The requirement that matters most is that Scout records where each fact came from at the moment it answers, and never works a source out afterwards. A wrong source is worse than none.

### Added
- **"Sources" under each Scout answer** (a quiet link in Scout's conversation; nothing shows until it's tapped). It opens "Where this came from":
  - **Her Guide:** each part of the answer that came from Larisa's Guide, with her tab, the cell and exactly what's in it ("Dining Resos · B22 — Tu, 10/27 @ 6:30p"). A long cell (a pasted email, a day's narrative) shows the lines that bear on the answer, marked "part of the cell".
  - **Wander's notes:** Wander's own notes on a line ("The group is split at this time, and her line names no one") are listed apart, as "Wander's note, not her words".
  - **Screenshots:** a fact from a screenshot in her Guide offers **See the picture**, which opens the screenshot itself.
  - **Worked out by Wander:** something Wander calculated (a deadline still open right now, who is still at home on a Japan date, the leave-for-the-airport estimate) says so and lists the cells it came from.
  - **Added in Wander:** a plan someone added in Wander is labelled with who added it, and as not in her Guide.
  - **From the web:** the page's title and full address (tap to open) and the words quoted.
  - **Unmatched times:** when a time Scout said isn't in the words it cited, the panel says so: "Scout worked it out, or got it wrong. Worth checking."
  - **Scout's own words — no source:** whole sentences with no sourced part in them.
  - **Which copy:** the panel names the copy of her Guide it came from, and notes that she may have changed it since.
- **How it's recorded:**
  - Scout reads the Guide as a document it cites line by line (Anthropic citations), and every line carries its source, recorded when the line is written. The API guarantees each citation points at text that's really there.
  - Every Guide line records its exact cells at import: 165 of 165 on her Sep 29 copy, including the day-plan lines and her pasted emails.
  - Each answer's sources are saved with it. The text Scout reads is unchanged byte for byte, except for where it sits.

### Changed
- **Web search is the basic version,** because the newer filtering search dropped the web citations. On the same question it was also slower: 34 s against 13 s.
- Scout's instructions ask it to cite every fact it takes from the Guide.
- **Measured on the same questions, old version against new:**
  - answers from her Guide take about 22% longer (about 1.7 s on an 8 s answer);
  - web answers are about twice as fast;
  - cost per answer is about 10% more (about 6¢ against 5.5¢).
- A false start corrected mid-sentence ("Tomorrow morning — Fri… rather, the Imperial…") is taken out before the answer is shown. It appeared in 1 of 4 tries on one question.

Affects: backend/src/services/guide/{importSnapshot,scoutContext,sources,answerSources}.ts, backend/src/routes/{chat,guide}.ts, backend/prisma/schema.prisma (GuideItem.cells and ChatMessage.sources, both additive), frontend/src/components/{ChatBubble,ScoutSources}.tsx.

SPEC UPDATE NEEDED: Scout's answers carry sources on request (Scout's section).

## 2026-09-29 — Larisa's Detailed Day Plans, Scout on the Web, and Her Sep 29 Copy

Ken defined readiness as two halves: a screen anyone can use without a manual, and taking in Larisa's new Guide information quickly and faithfully. Larisa has started adding a tab per key day (time blocks, sometimes several choices for one block). Her Sep 29 copy ("Japan Oct 2026-2") has eight of them: Tokyo Day 1–3 (no dates in the tabs) and Kyoto Sun 10/25 – Thu 10/29 (dated).

### Added
- **Larisa's plan for the day** (day screen, below the Itinerary's lines). Her day tab, shown in her order with her times as she wrote them ("~8:30–9:15", "After dinner"). Each line shows who it's for when the group splits ("For Larisa & Julie", "Yours · Ken & Andy"). Her longer notes sit under **Larisa's notes ›**. There's a Maps link when a line names a place; lines like "Taxi north" or "Shower/change/rest" get none. The header names the tab. When the tab gives no date, Wander says which day it matched the plan to and why, as Wander's own reading.
- **Choices in a block.** When she lists several places for one time, each has **We're going here**. The pick is a plan added in Wander, and her sheet is untouched. The pick then shows **✓ The group's pick**, and the others offer **Switch to this**, which takes the first pick off so a lunch never has two. The tapped choice says "Saving…" until the server has it.
- **"Now, in Larisa's plan"** on Home and on the Now tab ("MIHO Museum, until about 12:35 PM"). It appears only when a line has your name on it, or when it's for everyone outside a split.
- **Her forecast** (the Lo / Hi / Precip columns) as a quiet line on each day of a stay, in her numbers with no units added.
- **Scout searches the web and reads pages** (Anthropic's built-in search and fetch; no extra key). It says when an answer comes from the web and never passes a web answer off as her plan.

### Changed
- **Next** on Home and Now weighs her plan's times ("~2:00 PM Nishiki Market"). A plan line at the same time as an Itinerary line isn't shown twice. Her own way to the airport (the Haruka) replaces Wander's "leave for the airport" estimate on that day and the night before.
- **Split groups are never guessed.** When the group splits (Oct 28), a line with no name on it inside the split (Maruni Toryo, the wood-firing visit) is never anyone's "Now" or "Next". It still shows in her plan exactly as she wrote it.
- **Two places at one time** (Dining Resos, Oct 28 at 8 PM: Cafe Ensou and Enyuan Kobayashi) are flagged on Home as well as on the day screen, never resolved.
- Rough times keep her "~" on Home.
- **Reading her Guide:**
  - Each tab gets exactly one reader. A reservations tab or a pasted booking email is never read as a day plan.
  - Working notes in a heading ("Tokyo - ASK KENJI…") no longer create a city.
  - Hotel dates written into a hotel's name ("Shiraume (10/25 - 10/27)") win over the date columns, and the report says so.
  - "By 3:45p" is never a start time.
  - A meal's time is copied only from a meal line in her day tab, with the tab named.
- **Scout's honesty rules:**
  - It never reconciles two tabs that disagree ("either way").
  - It never adds units or claims.
  - It knows a check-in time isn't an arrival time.
  - It works out time zones before saying where someone is.
  - It never assigns a split-group line without a name to anyone.
  - It writes no "Message for Larisa" unless asked.
  - A deadline with no time written says so instead of stating a time.
  - It copies her transit directions word for word ("from Hibiya Station, take the Chiyoda Line").
  - It treats a line's time as time spent at that place, never as a time to leave.
  - It names a restaurant by its booking, never by its address.
  - It never says which of two conflicting tabs "to go by".
- **Facts Scout used to work out now arrive already worked out.**
  - Split days: every line with no name on it during a split is marked "whose: not stated".
  - Flights: each flight's time in the air is given in both Japan and California time, with where each party is at the moment of the question.
  - Both were prompt rules before, and in testing Scout sometimes still assigned a line to a group or put Julie and Andy "in the air" hours before they left home.
- **Dining Resos addresses are labelled "Address:"** on the day screen and for Scout. Her address block for La Table de Joël Robuchon (1F) opens with "Château Restaurant Joël Robuchon", the building's other restaurant.

### Fixed
- A mangled day link (for example /day/now) crashed the day screen. It now opens today.
- The Four Seasons cancellation deadline showed as 11:59 PM. Her booking says 3:00 PM Kyoto time, and that's what Wander and Scout now say.

### After test round 6 (five fresh testers on the day-plan screens; Scout not used)
- **Her tabs disagreeing is shown on the line itself, never settled.** Wander marks a line "Her tabs differ" when her day plan and another tab name the same distinctive thing at times 30+ minutes apart (the Oct 29 Haruka: day tab ~12:30–1:00, Itinerary note 1:30–2:00p; Café Ensou: lunch in her Oct 28 tab, 8 PM in Dining Resos). Both lines quote the other, on the day screen, Home and Now. Before, Home showed "~12:30 Board reserved HARUKA" as the plan.
- **Her plan leads the day.** On a day with her detailed plan, it comes first. Her Itinerary line for the day sits in its header as hers ("Her Itinerary line for today: 'Kyoto day 2 - Viator Tour?'"), and bookings, deadlines and flights follow under "Also in her Guide for today". "See Larisa's full plan" lands on it.
- **Where you are in her plan.** Today's plan marks the line you're on ("Now") and dims the ones behind you. Home, Now and the day screen use one rule: a line with no end time runs until her next line ("Collect luggage, until her next line at 12:00 PM").
- **Lines nobody's name is on during a split** say "Her Guide doesn't say who — the group is split here". Home and Now mention one coming up ("At 10:35 AM, her plan has Maruni Toryo — her Guide doesn't say which group") instead of skipping it.
- **Her own map links.** Plan lines use the links from her stop list ("Stop 4: Shoraian"), matched by every distinctive word of the stop's name. Without one, Maps appears only when her words name a place ("to Kyoto Station", "ideally Shoraian"). Before, Wander searched "Ginza Premium Retail Walk, Tokyo" and "Café ENSOU lunch, Kyoto" for a café in Shigaraki. Bookings get Maps from her address, and links say what they open ("Michelin page").
- **Choosing among her places.** A pick is one step that replaces any other pick for that line, on the server. Two changes of mind with no signal had left two "group picks" for everyone. Only the places her line lists can be picked, and a plan someone typed is never replaced. The pick says who made it ("✓ The group's pick · Ken, in Wander"). Home and Now show it on her line ("Lunch — Omen · the group's pick"), or "2 places to choose from" before anyone picks. History says "switched 'Lunch' to Omen" in one line.
- **Home:** her remaining plan lines are listed. Every line opens its day. The noon check-out no longer hides a 12:00 line about something else. The check-out stops showing once her plan's own check-out line has passed. A closed to-do deadline reads "Closed … Wander can't tell whether it was done — ask Larisa if you're not sure", with no strikethrough. A deadline "ending 3:00 PM" holds through 3:00. The Face ID offer sits under Today, so it no longer shoves the day down.
- **Smaller fixes:**
  - Her notes are split into lines ("Transit:", "Experience:"), and short ones like "pending confirmation" show without a tap.
  - "Hide notes" was added.
  - A deadline's quoted policy sits behind "Why this date? ›".
  - Her flight-card notes are on separate lines.
  - The trip subtitle drops the file's copy mark ("Japan Oct 2026-2" becomes "Japan Oct 2026").
  - A note gets a plain dot, not a pencil.
  - "Show all" in Recent activity is a 44-point tap target.

### After test round 7 (four fresh testers; Julie, Andy, Larisa and Ken at moments on Oct 13–29)
- **Her pasted map links open the place.** Some of her links are a Google search whose query is a Maps address (for example, the Four Seasons). Wander now opens the Maps address inside the search. This happens on import and on screen.
- **A booked dinner her day tab places in another neighbourhood than its address** (Yakiniku Yazawa: "(Ginza)" in her Tokyo Day 1 tab, a Yaesu address in Dining Resos) says "Her tabs differ" on both lines.
- A stop name her sheet wraps across two lines still finds its map link.
- **"Leave …" and "Depart …" lines get no Maps link.** Before, "Leave Four Seasons" opened a map of the hotel you're standing in.
- **"Now, in Larisa's plan" ends on a clock time** ("Shower/change/rest, until 7:30 PM"). It used to repeat her range ("until 6:45–7:30").
- The Next card on Now shows the group's pick, or "2 places to choose from", and whether her tabs differ.
- On Home, when two bookings share a time, the one her day plan names comes first (Oct 28: Enyuan Kobayashi before Cafe Ensou). A day with only her note reads "Her note for today", not "Her Itinerary line". "and N more ›" opens her full plan.
- **Scout, from reading every answer word for word:**
  - Every Guide date is read as a Japan date. Each day now says who isn't in Japan yet. Before this, 1 in 5 answers had Julie "in the air" on Japan's Oct 13, while she was still at home. After the fix, 5 of 5 answers were right.
  - Scout says today, tomorrow and yesterday by name, worked out in advance.
  - Answers no longer include "I'll check —" narration, and sentences no longer run together without a space.
  - Scout leads with what to do when something has gone wrong.
  - Scout never credits something it found online to Larisa.
  - Picks made in Wander reach Scout as Wander's additions.
  - The examples in Scout's instructions are placeholders, so its wording can't leak into answers. A made-up "van" came from one of those examples.

### After tester v3 (choosing lunch on two phones, weak signal)
- **Open screens catch up by themselves.** When someone else changes the plan, every open screen (Home, Now, the day) reloads at once. The dark notice at the bottom says what changed, with "Got it". Screens also catch up after a dropped connection, for example a phone waking up. Before, Larisa's open Now card kept the old lunch and its Maps link until she tapped the notice.
- **A pick is never lost to a weak signal.** If the server hasn't answered a pick within 6 seconds, the pick is kept on the phone ("The signal's weak — saved on this phone, and I'll send it as soon as it gets through") and sent on the next open. Before, closing Wander during a long "Saving…" lost the change silently. A newer pick for the same line replaces any older one still waiting on the phone.
- **The pick lives on her line** (the day screen): "✓ The group's pick · Ken, in Wander", with **Undo** and **Tell Larisa** right there. A pick still on the phone says "✓ Your pick · on this phone until there's signal". A pick no longer appears a second time as an "Added in Wander" card. Undo on a pick still waiting on the phone takes it back before it's sent.
- **The Now card says whose is what:** "Her plan lists 2 places · Ken picked Honke Owariya for the group, in Wander".
- **Home always shows a line of her plan that still needs a pick** ("Lunch · 2 places to choose from ›"), even past the first five rows.
- **Recent activity** merges quick changes of mind (picks, switches and Undos by one person, for one line, within half an hour) into the latest one.
- **Maps searches for her plan use her tab's city** ("Honke Owariya, Kyoto, Japan"), not a place's description ("soba since 1465") or just "Japan" ("TeamLab, Japan" could land on the Tokyo teamLab).
- On Now, a line nobody's name is on reads "At 11:35 AM, her plan has…", not her range.
- **Importing a Guide copy can reuse readings made elsewhere.** New options: `import-guide-snapshot.ts --seed <readings.json> --no-ai`, and `export-guide-readings.ts`. The same file goes into production with no AI calls. With `--no-ai`, anything not already read is listed as a warning.

### Scout costs less, with the same answers
- **The prompt Scout rereads is now cached for an hour.** Its instructions and the Guide come first and are identical across people and moments. What changes per question comes last: the time, the page, deadline statuses, which flights are in the air, and when Wander last read the Guide. Measured per question: about $0.05 after the first question in an hour, and about $0.78 for that first one. It was $0.16–0.55 per question before.
- **One step instead of two** when Scout has answered and only opened a screen. The second step reread the whole prompt to add "Tap below".
- Every answer logs its tokens and cost ("Scout usage: …").

Affects: frontend/src/pages/DayPage.tsx, frontend/src/components/TripGlance.tsx, frontend/src/lib/guideDisplay.ts, backend/src/services/guide/dayPlanReader.ts (new), importSnapshot.ts, itinerary.ts, scoutContext.ts, backend/src/routes/chat.ts, backend/prisma/schema.prisma (GuideItem.timeText, additive).

SPEC UPDATE NEEDED: the day screen (a second section for her day plans, choices and picks), Home's Today card and the Now tab ("Now, in Larisa's plan", Next from her plan), Scout's web access and honesty rules, and how Wander reads day-plan tabs.

## 2026-09-28 — Scout Can Show You Things, Letting Someone In, and Wander's Own Additions (test rounds 2–3)

Rounds 2 and 3 of scenario testing (fresh testers, each a specific traveler at a specific moment, scored against a rubric written beforehand) drove most of the fixes below. Ken asked for four new things: Scout that can move the screen and stay nearby afterwards, a short path from "I'll let you in" to a Wander icon on someone's iPhone, a way to pass suggestions to Larisa, and a guarantee that re-reading her Guide never loses what people added in Wander.

### Added
- **Scout can show you things.** "Show me the day Andy and Julie arrive", "take me to the last day", "open the Kyoto ideas", "show me the deadlines", "who's on the trip": Scout opens the screen and says what it opened. Instead of disappearing, the chat steps down to a slim dark bar above the tabs. The bar shows Scout's last words, **↩ Back** (to where you were), the microphone and ✕. Tap the bar and the whole conversation comes back. The phone's Back, the chevron and tapping outside the panel all shrink Scout to the bar; ✕ closes it. "Take me back" typed or spoken works too. Scout says plainly when something doesn't exist ("we never stay in Osaka"; "the trip ends Oct 29"). Pages leave room at the bottom so the bar never covers anything.
- **Plans for today, added in Wander.** On any day, **+ Add a plan for this day** (a time and a few words). On an idea, **Add to a day** (today or a later day). Plans show on the day screen and in Home's Today card under "Added in Wander", with who added them. Each is marked "one of Larisa's ideas" or "not in Larisa's Guide". Scout can add, list and remove them, and each one is logged in History. They work with no signal and are sent when the phone is back online.
- **Tell Larisa.** Each plan added in Wander has **Tell Larisa**, which opens the phone's share sheet with a plain message to her (or copies it). When asked, Scout ends with a ready "Message for Larisa:" line and a Send button. Wander never changes her sheet; the message is how she hears about it.
- **Ideas tab** (bottom bar, replacing Plan): every idea from the Guide, by city, in her order. Filter by who marked it ("Larisa (maybe)" shows as a maybe). Each idea offers a note (for everyone, or just for me), Add to a day, Maps, its link and Ask Scout.
- **Letting someone in.** People → **+ Add someone**: type a name and, when you plan more than one trip, pick the trip. A QR code appears. The other person points their iPhone camera at it. Also there: **Send as a message instead** (the share sheet) and Copy; the link itself is never shown. On an iPhone, the page it opens walks them through Add to Home Screen first. The Home Screen icon then opens Wander signed in as them, and offers Face ID. People lists invites that haven't been used yet. **New phone? New link** makes a fresh one.
- **Home Screen suggestion** on Home, after Face ID is set up on an iPhone in Safari. You can dismiss it.
- **Leaving for the airport** on the last day: an estimate of when to leave (labelled as an estimate), with late states ("if you're not on the way, go now"). The card goes away once the flight has left.
- **Before the trip:** Home says "You leave in N days", shows only your own lines, and says where the others are right now in Japan.
- Stop notes on each day of a stop ("This stop, in Larisa's Guide: tour Karatsu, day trip to Arita").
- Dinner cancellation charges appear on the booking.
- Meals without a time say "No time in the Guide."
- Phone numbers can be tapped to call.
- A lasting "No signal — showing what this phone saved at …" line whenever the phone is offline.

### Changed
- **Trips are private to their people.** You see, open and switch between only the trips you're on. Planners add people only to trips they plan.
- **Scout reads Larisa's Guide.** It never edits her items: it refuses to move, rename or reorder them and points to Tell Larisa instead. It keeps open questions open (for example, two hotels listed on the last nights: it names both, with each one's check-out). It never attaches facts to people the Guide doesn't name. It writes times like "noon" and "3:00 PM", and uses the deadline dates already worked out instead of recomputing them.
- **Two-hotel mornings:** the check-out is shown separately for each hotel, with each one's own time and code. Check-outs come before morning meetings, and check-ins come after the same party lands.
- **Deadlines:** "Today is the last day", "Any day through …" and "Passed". They're shown in the trip's time zone, with "your time" added when the phone is elsewhere.
- **Flights:** titles name the airline, flight number and both airports, and keep Larisa's own words as a Guide line. A flight shows its landing time in words ("Lands at Narita 3:00 PM Wed").
- **Scout's conversation:** each person keeps their own. Only today's conversation is sent to Scout. A cut-off answer offers Try again. Long answers open at their start. The panel shows when there's no signal.
- **Bottom bar:** Home · Ideas · Now · Actions · Scout. Tapping Home on Home closes Actions and Scout and goes back to the top.
- **Easier to read:** light grey text across the app is darker. Titles wrap at large text sizes. Buttons are at least 44 points.
- History is "What's changed in Wander" and includes notes and Scout's additions.
- The day and Home screens update at midnight and whenever the phone is unlocked.

### Fixed
- Wander could go blank after several opens (the offline worker stored the live-update connection). Tested with 62 opens and no blank screen.
- Reloading an inner screen with no signal showed the browser's error page. It now shows the saved copy.
- Saved answers were trimmed to five (one shared limit). Each kind of answer now has its own limit.
- "Weak signal" appeared when the signal was fine but slow. It now appears only when truly offline.
- Scout's replies sometimes lost their main text and kept only the last line.
- A welcome overlay covered Home for new people. It's gone.
- The "please sign in again" message appeared when nobody had been signed in.

### Kept safe on re-read
- **When Wander re-reads Larisa's Guide, nothing people added is lost.** If an idea leaves the Guide, Wander checks whether it carries anything someone added (notes, ratings, reactions, plans on a day, private notes). If the Guide renamed the idea (one new idea in the same city shares a distinctive word), those additions move onto the new one. Otherwise the idea stays, marked "No longer in Larisa's Guide", with everything intact. Plans added in Wander are stored apart from Guide items, so a re-read never touches them.

### After round 4 (10 fresh testers: four judging Scout's panel, six on the invite, day-by-day faithfulness, signal and the last day)
- **Scout's panel, redesigned.**
  - **The bar:** two rows. Row one is a headline Scout writes for it ("Oct 29 · still open: Shiraume or Four Seasons"). Row two has ↩ Back, an "Ask Scout…" box that opens straight to typing, the microphone and ✕. It sits flush on the tab bar.
  - **The full panel:** opens at half height so the page stays readable. It gets a grabber: swipe down to make Scout smaller, up for full height. It has its own ✕. It fits above the keyboard, and screen readers treat it as a dialog.
- **Back always agrees with the phone.** ↩ Back, a typed or spoken "back", and the phone's Back each go one screen. Once you're where you started, the bar steps away. Stepping back to a screen Scout showed brings back what it said there. "Back" is done at once on the phone, with no wait for Scout.
- **Screens keep their place.** A screen Scout opens starts at its top. Going back returns to where you were on it, on every screen.
- **Scout keeps the screen and its words in step.**
  - "Show me the deadlines" opens Actions, even when you're already on Home.
  - "The Kyoto ideas Larisa marked" opens Ideas already filtered to her.
  - Scout never moves the screen while you're typing.
  - A stale error or an old "back" button never comes back.
- **One floating thing at a time.** While Scout's bar shows, the "someone made a change" notice waits and the no-signal line folds into the bar. Phrases moved into the Now header, so nothing floats over the day's cards.
- **Scout's deadline answers.** Scout gets each deadline's status already worked out from the phone's clock: passed, open now, or not open yet. It told one tester free cancellation ended "tonight" when the 60% charge had already begun. It now says flight times with their zone, and leads with the open question when the Guide lists two hotels.
- **Days read in order.**
  - A check-out ahead of an earlier appointment says "Morning" and gives the hotel's check-out time. On Oct 18 that's check out, then meet Backroads at 8:30.
  - A check-in after a landing says "After landing" and "Rooms are ready from 2:00 PM".
  - "Tomorrow" leads with the first appointment or the flight, with the leave estimate.
  - Plans added in Wander are sorted by time.
  - A travel line says "arrive 9:30 AM", not "to 9:30 AM".
- **Larisa's words.**
  - A stay's note ("day trip to Mashiko") appears once, named for the stay and its dates: "Larisa's note for the Tokyo stay, Oct 13–17". It no longer heads every Tokyo day.
  - Her quotes are exact, times included ("6:30p flight - travel day…").
  - A note on the same sheet row as a flight folds into that flight. "ANA part of Star Alliance" no longer shows on its own to everyone.
  - Pictures she pasted are labelled "A picture Larisa pasted — Wander's description".
  - "No time in the Guide" appears only on booked meals.
- **Whose is it.** A check-out the Guide doesn't label shows whose it was, from who slept there, so Julie's first morning no longer opens with Ken and Larisa's check-out. Bookings and their deadlines say whose name they're under ("Booked under …", from the pasted confirmation). A deadline with no time says when the day ends in Japan, in your own time.
- **The last day.** Home splits the two-hotel check-out per hotel, as Now does. Late for the airport: once Wander's estimate has you arriving after check-in usually closes, it says so and says to call the airline, with the confirmation shown.
- **Letting someone in.**
  - Typing a name already in Wander asks "Is this for Julie's new phone?" before any link is made. The link signs its holder in as that person.
  - "+ Plan a new trip" shows only to planners.
  - The trip menu shows the trip's dates and when the Guide was read, instead of "Started… Synced… Opened…".
  - Your own link, opened again on a phone signed in as you, goes straight to the trip.
  - After sharing, it says "Handed to your messages" instead of "Sent".
- **Notes on ideas.** You can take back your own note ("Take this note back?"), and it shows in History. Notes and plans saved with no signal still show as waiting after Wander is closed and reopened. Scout can add a note on an idea, or take back one of your own.
- **Trips are private everywhere.** Notes, and Scout itself, answer only for trips you're on. Scout's fallback trip is your own.
- **Home.** The header shows only the trip's dates; the Today card says where each person is. Home redraws when the phone wakes, so the calendar rings today. Tonight's hotel is one tap to Maps, found by name; a district address had pinned the Imperial Palace. The Tell Larisa message reads like a person wrote it ("Hi Larisa — today around 2:30 PM: …"). Raw dates in History read "Fri, Oct 16". The new-trip page's dates no longer show a day early on US phones.

Affects: backend/prisma/schema.prisma (DayChoice table; GuideItem.windowStart, both additive), services/dayChoices.ts (new), routes/dayChoices.ts (new), routes/people.ts, trips.ts, chat.ts, experienceNotes.ts, index.ts (web app manifest), services/guide/importSnapshot.ts, scoutContext.ts, textReader.ts, itinerary.ts; frontend/src/pages/IdeasPage.tsx (new), DayPage.tsx, PeoplePage.tsx, JoinPage.tsx, TripOverview.tsx, SettingsPage.tsx, HistoryPage.tsx, LoginPage.tsx, GuidePage.tsx, components/InviteSheet.tsx (new), AddToHomeScreen.tsx (new), SavedCopyNotice.tsx (new), ChatBubble.tsx, TripGlance.tsx, BottomNav.tsx, ActionsPanel.tsx, PhraseCard.tsx, SyncIndicator.tsx, lib/guideDisplay.ts, changeWords.ts (new), tellGuideOwner.ts (new), api.ts, sw.ts, main.tsx, App.tsx, index.css.

Round 4 also touched: frontend/src/App.tsx (ScrollKeeper), hooks/useScoutDocked.ts (new), lib/offlineStore.ts (queuedBodies), components/PhraseCard.tsx, SheetNotesCard.tsx, InviteSheet.tsx, CreateTrip.tsx; backend/src/routes/experienceNotes.ts (members only, take back), people.ts (same-name check), chat.ts (add_idea_note, take_back_idea_note, headline and markedBy, member check), services/guide/scoutContext.ts (deadline status), itinerary.ts (her exact words kept). New tests: backend/tests/notes-and-scout-access.test.ts; updated frontend/tests/*.spec.ts to the current design.

SPEC UPDATE NEEDED: §28 (Scout can open screens and stays as a bar; drafts messages to Larisa; never edits Guide items), §18 (day screen: Wander additions, stop notes, leave-for-airport estimate), §5 (invites: Add someone with a QR code, Home Screen first on iPhone, trips private to their members), §22 (offline: lasting no-signal line, additions sent later), §7/§9 (Ideas tab replaces Plan; plans for a day live beside the Guide, not in it), re-read rule (Wander additions survive a Guide re-read).

## 2026-09-28 — On the Road: Every Screen Shows Larisa's Guide (after a 13-person test round)

Thirteen scenario testers (each a specific traveler at a specific moment, on a phone-sized screen, scored against a rubric written beforehand) found that every on-trip screen ignored the Guide: booked days said "Wide open", "today" was yesterday before 9am in Japan, and Scout denied bookings that were in the Guide. This release rebuilds those screens around the Guide.

### Added
- **A day screen.** Tap any day on Home's calendar and that day opens (the address is /day/2026-10-18): everything the Guide says for it in time order — flights and landings, meetings, tours, meals, check-ins and check-outs with each couple's confirmation, deadlines, maybes in Larisa's words — then where everyone sleeps that night. Each line says where in the Guide it came from; the bottom says when Wander last read the Guide. Arrows move a day at a time. It opens instantly (the trip's Guide data is fetched once and kept on the phone).
- **Home leads with today** (from the Guide, on the phone's own date): what's next, the rest of today, tonight's hotel (both, if the Guide lists two), a line for tomorrow, and deadlines in the next few days. Before the trip: when it starts and deadlines in the next two weeks. After: welcome home. Today's square on the calendar is ringed.
- **People on this trip** (Settings, or the line on Home): everyone's status ("Uses Face ID", "Has opened Wander", "Hasn't opened Wander yet"). Ken and Larisa tap **Send link** / **Send a new link**; the phone's share sheet opens with a short note. Link codes never appear on screen or in chat. A person's link stops working once they've set up Face ID.
- If a phone signed in as one person opens another person's link, Wander asks: "This link is for Andy — Stay as Julie / Switch to Andy".
- **Scout knows the Guide and the time.** It reads every hotel by night, every dated item with its source, the ideas and who marked them, and the text of Larisa's other tabs (pasted emails, screenshot summaries), and it's told the person's own date, time and time zone. It answers from the Guide and says so, says plainly when the Guide doesn't have something, never invents plan details, keeps open questions open, never offers to settle or save plan items, gives deadlines by date, and says when Wander last read the Guide (it doesn't read live). It can describe Wander's real screens. In a 11-question check at real trip moments, it answered all correctly (it answered almost none before).
- Scout's example questions can be tapped to ask them.
- Ideas on a city's page show who marked them ("Interested: Julie, Larisa").

### Changed
- **Now** (bottom bar) is today from the Guide, with what's next at the top and how long until it; quick Japanese phrases live here. Before the trip it shows the first day; after, the last.
- Nothing pops up uninvited: the daily greeting overlay, next-up overlay, new-member interest quiz and evening "How was today?" sheet no longer appear. The phrase button is only on Now.
- Home no longer shows planning prompts ("12 days wide open — Build a day", "25 days — all wide open", "Add your first travel leg", April to-dos as "coming up", city idea counts), the Quick start card, or the "edit" and "Learnings" buttons. The Plan tab still has the planning tools.
- The trip menu lists only trips read from Larisa's Guide (not April's placeholder or test trips).
- "From the Guide" is now "Larisa's Guide, tab by tab": a list of her tabs, each opening on its own, with long lines wrapped to the phone's width.
- The to-do list shows dates as "Apr 15"; past-due Guide to-dos move under "Earlier to-dos in the Guide".
- Signing out lives in Settings only, and warns when the phone has no Face ID to get back in.
- A personal link now opens straight to the trip (no help-page detour). The help page (?) describes Wander as it works now.
- Scout's chat box sits above the tab bar (it was hidden under it on Home and Now). Scout remembers only the current conversation (the last six hours). Scout no longer files long pasted text as ideas without reading it.
- Notes on ideas appear the moment they're saved, have a Save button, and say "Everyone on the trip sees this. Larisa's Guide stays as it is." With no signal the typed note stays in the box.
- The Guide reader: two lines about the same moment become one; the time moves out of the words into the time column; bookkeeping like "Noted on Ritz-Carlton" is gone; check-ins use Larisa's hotel names; a deadline window ("reconfirm 3–7 days before") is listed on its last day.

### Fixed
- "Today" was yesterday until 9am in Japan on Now and Home (it used London's date).
- With no signal, Home showed "start a new trip". It now shows the phone's saved copy ("No signal — showing what this phone saved today at 9:12 PM"), or says it can't reach the trip — never a new-trip screen.
- The offline worker answered from its stored copy first, so fresh data (like a just-saved note) could look missing; it now tries fresh first and uses the copy only without signal.
- Opening someone else's link left the old name on screen while signed in as the new person.
- The trip-wide open invitation link (anyone holding it could join under any name) is switched off; old invitation routes are planners-only and no longer list link codes. Scout can no longer add people or change who plans.

Affects: frontend/src/pages/DayPage.tsx (new), PeoplePage.tsx (new), components/TripGlance.tsx (new), lib/guideData.ts (new), pages/TripOverview.tsx, JoinPage.tsx, LoginPage.tsx, SettingsPage.tsx, CityBoard.tsx, GuidePage.tsx, components/ChatBubble.tsx, FaceIdSetup.tsx, ActionsPanel.tsx, SheetNotesCard.tsx, CreateTrip.tsx, contexts/AuthContext.tsx, App.tsx, sw.ts; backend/src/routes/people.ts (new), services/guide/scoutContext.ts (new), routes/chat.ts, auth.ts, trips.ts, experiences.ts, services/passkeys.ts, services/guide/itinerary.ts, importSnapshot.ts, index.ts

SPEC UPDATE NEEDED: §19 (Now screen: now today from the Guide), §18 (Day view: now the Guide's day), §28 (Scout answers from the Guide, cites it, never modifies plan data), §5 (sign-in: links sent from People, retire after Face ID), §22 (offline: saved copy on the phone, labelled).

## 2026-09-28 — Wander Reads Larisa's Guide Faithfully (from a saved copy of the sheet)

### Added
- Wander builds the trip from a saved copy of Larisa's Guide (the .xlsx file downloaded from Google Sheets). It reads every tab, finds itinerary columns by their header names rather than their positions, and keeps her words as written. It reads the Notes column and rows without a date. Sections she marked "SKIP" stay out.
- Pictures pasted into the Guide (flight confirmations, hotel bookings) are read, so facts that exist only in a screenshot reach Wander: confirmation codes, flight times, the Narita arrival, free-cancellation cutoffs. Pasted emails are read for bookings and deadlines. Deadlines worked out from a rule ("reconfirm 3–7 days prior") say so and quote the original words.
- Each day now carries a dated list of what the Guide says about it: flights and landings, check-ins and check-outs (with who each room is for and each couple's confirmation), tours, meetings, meals, notes, and deadlines. Each item names where in the Guide it came from. Times appear only when the Guide states them.
- Where the Guide is undecided, Wander keeps it undecided. A date mark with words ("X, if Julie isn't interested") shows on that day as "Maybe: …" in Larisa's words. Two hotels on the same night are both kept and flagged.
- A new copy of the Guide replaces what Wander read before, and Wander records what changed. A copy that looks broken (no itinerary, no dates, or far fewer hotels or tabs than last time) is refused, and the last good reading stays.
- Hotels now have check-in and check-out dates, so each night has a place to sleep.
- The trip keeps a time zone (Asia/Tokyo for Japan).
- Tests: backend/tests/guide-itinerary.test.ts (built from made-up sheets, never real trip data). The test setup now applies the current database layout to its temporary copy before running.

### Not yet visible
- Home and the Now screen don't show the new day-by-day items yet. That comes with the on-the-road screens (next step). Loading a new copy of the Guide is done by the developer for now; a planner upload screen comes next.

Affects: backend/prisma/schema.prisma, backend/src/services/guide/ (new: reader, itinerary, images, textReader, importSnapshot), backend/src/routes/guide.ts (new), backend/src/index.ts, backend/scripts/import-guide-snapshot.ts (new), backend/tests/vitest-global-setup.ts

SPEC UPDATE NEEDED: SPEC §7 (import: extraction → review → explicit confirm) and §3 (Wander replaces the spreadsheet). Wander now mirrors the Guide: each good copy replaces the Guide layer, changes are recorded, and broken copies are refused. §6 data model gains Guide snapshots, Guide items, and Guide pictures.

## 2026-09-28 — Face ID Sign-In, a Vault That Opens With Face ID, and Scout Respecting the Vault

### Added
- Sign in with Face ID. The login screen (the first screen of Wander) now has one button, "Sign in with Face ID", and one line for a first visit: "First time on this phone? Open your personal Wander link, then set up Face ID."
- After signing in with a personal link, Home shows a small card at the top: "Use Face ID next time?" with "Set up Face ID" and "Not now". It never shows again on that phone once Face ID is set up or dismissed.
- Settings has a Face ID section: set up Face ID on this phone, or see that it's already set up.
- Tests: backend/tests/passkeys.test.ts.

### Changed
- In the live app, tapping a name no longer signs anyone in. The name buttons remain only in local development and tests. Personal invite links still work and are how a new phone gets set up.
- The vault now opens with the same Face ID. The earlier vault Face ID saved credentials in a broken format and always fell back to the PIN; existing credentials are read and repaired automatically, so nobody has to set it up again.
- A planner resetting someone's vault PIN now clears only the PIN. It used to also erase their Face ID, which would now lock them out of Wander.
- A failed sign-in check on a weak signal or during a quick reload no longer signs you out. Only a real "not authorized" answer from the server does.

### Fixed
- Scout no longer reveals passport, visa, or insurance details. They stay in each person's vault; Scout says they're locked and that the vault in Profile opens with Face ID or PIN.

Affects: backend/src/services/passkeys.ts (new), backend/src/routes/auth.ts, backend/src/routes/vault.ts, backend/src/routes/chat.ts, frontend/src/lib/passkeys.ts (new), frontend/src/components/FaceIdSetup.tsx (new), frontend/src/pages/LoginPage.tsx, frontend/src/contexts/AuthContext.tsx, frontend/src/pages/TripOverview.tsx, frontend/src/pages/SettingsPage.tsx

SPEC UPDATE NEEDED: SPEC §5 (Authentication) describes access codes only; sign-in is now Face ID passkeys with personal invite links as the setup path.

## 2026-09-27 — Safety First: Wander Is Downstream of Larisa's Guide

Larisa's Google Sheet is the master plan and Wander reads from it. Wander never changes the sheet, and an app bug or an AI mistake can no longer delete or restructure the trip.

### Removed
- Wander can no longer write to any Google Sheet. The "Sync now", "Pull only", "Push only", and auto-sync interval controls are gone from Settings, and the background auto-sync that ran on every screen is gone. The server routes behind them (import, pull, push, sync settings) were removed, along with every function that wrote cells, appended rows, tinted cells, copied sheets, or pinned versions in the sheet's history.
- Google access is now requested read-only, so Google itself would refuse a write.
- The ✕ "Remove this trip" button in the trip picker (tap the trip name on Home) is gone. Removing a trip wiped every day, place, and its history with no undo.
- Scout can no longer delete or restructure the trip. Withdrawn: deleting places, cities, days, hotels, bookings, route legs, or group choices; shifting or re-dating days; reordering or hiding cities; creating or switching trips. Scout now says plainly that plan changes happen in Larisa's Guide.
- Twelve developer scripts that wrote to Google Sheets were moved out of the project.

### Changed
- Settings now shows the Guide read-only: its name, "Wander reads from Larisa's Guide and never changes it", and when Wander last read it.
- The server refuses to delete any trip that comes from Larisa's Guide.
- Words that described the old behavior now match the new one: Scout's welcome ("ask me anything about it", new example questions), Home's Quick Start ("ask anything about the trip"), the in-app guide's Scout section (the plan lives in Larisa's Guide, so Scout doesn't delete or rearrange it), "Synced with Larisa's Japan Guide" labels → "From Larisa's Guide", and the Actions panel's "will sync to Larisa's Guide" message → "Got it — saved here in Wander".

### Added
- Tests (backend/tests/downstream-safety.test.ts) that pin these protections: a Guide trip can't be deleted and survives the attempt, and no route can write to a sheet.

Affects: backend/src/services/sheetsSync.ts, backend/src/services/sheetImport.ts, backend/src/routes/sheetsSync.ts, backend/src/routes/trips.ts, backend/src/routes/chat.ts, frontend/src/App.tsx, frontend/src/components/AutoSync.tsx (deleted), frontend/src/pages/SettingsPage.tsx, frontend/src/pages/TripOverview.tsx

SPEC UPDATE NEEDED: SPEC §3 describes Wander as replacing the spreadsheet; Wander is now the front end to Larisa's Guide, which stays the master. SPEC §28 (AI never modifies data) is now closer to true for Scout's structural tools.

## 2026-04-09 — Chrome Testing: 10 Bug Fixes

### Fixed
- **ActionsPanel crash (React #310)** — `useState` after early return. Moved hook above loading guard.
- **Backroads B badges on wrong days** — Changed to `dayType === "guided"` detection.
- **Wrong dates on all city pages** — Added `timeZone: "UTC"` to list view date formatters.
- **"by TBD" in Actions** — Hidden when due date is "TBD".
- **Decision cards expand inline** — "See options →" now shows all options with vote counts in list view instead of silently switching to map. "Hide"/"See options" toggle.
- **Idea cards expand inline** — Tapping an idea shows description and exploration zone. Fallback: "No details yet — ask Scout for more info".
- **Day grouping in list view** — Multi-day cities (Nikko, Shirakabeso, Kyoto) now show day headers above each group of activities. Catches misplaced activities too.
- **Accommodation display** — Hotels load from `/api/accommodations` (not day relations which were null). Shows hotel card with name and address on city pages.

### Known Issues (from Chrome testing)
- Blank space on home page between collapsed map and calendar
- Scout/Add button input overlap on some pages
- 6 Backroads experiences assigned to wrong days (data issue, not code)

## 2026-04-07 — UX Polish: Detail Panel, Notes, Geocoding, GroupPulse

### Added
- **Experience notes** — Group and private notes on each activity/hotel. "For group" (default) vs "Just for me" toggle. Others' notes in italic, own notes editable, newest first. Notes included in experience detail API.
- **GroupPulse** — "The group's been busy" narrative on Home page. Shows per-city activity counts, contributors, and open days. Not a checklist — an invitation to join conversations.
- **↔ sync indicator** — Subtle bidirectional arrow on every item synced with Larisa's Japan Guide. Tappable tooltip.
- **Edit warning** — "↔ This syncs with Larisa's Japan Guide. Your changes will update there too." shown when editing synced items.
- **Wander-origin tint** — Light yellow (#FFF9E6) background on spreadsheet cells that Wander wrote. Full row for new items, single cell for votes/interests.

### Fixed
- **Detail panel hidden behind mobile list** — z-index conflict (both z-40) at viewports below 1024px. Detail panel bumped to z-50.
- **Notes not displaying** — Experience detail API wasn't including the notes relation. Added include with traveler info and descending order.
- **ExperienceDetail crash** — `onDataChanged` was undefined; corrected to `onRefresh`.
- **Settings Sign Out occluded** — bottom padding increased to pb-40 for bottom nav clearance.
- **Sync section missing** — added API fallback when no localStorage trip ID.

### Changed
- **"Spreadsheet" → "Larisa's Japan Guide"** — all user-facing strings updated. Warm, specific, not technical.
- **Map dots 50% smaller** — Home page overview map: markers reduced from 40px to 20px, labels from 12px to 9px.
- **All 8 cities geocoded** — map centers correctly per city (was defaulting to Tokyo for all).
- **All 29 experiences geocoded** — "items need a location" warning eliminated.

**SPEC UPDATE NEEDED**: GroupPulse, experience notes, sync indicators, Wander-origin tinting are new UX patterns not in SPEC.md.

## 2026-04-06 — Multi-Leg Travel: Chained Journey UI + Expanded Transport Modes

### Added
- **"Add another leg" button** — After saving a travel segment, a new button appears pre-filled with the previous leg's destination as the origin. Enables chaining like "taxi to station -> shinkansen -> subway to hotel" without re-entering the starting point each time.
- **Connected journey summary** — When segments form a chain (each origin matches the previous destination), a summary line appears above the cards showing the full route (e.g., "Journey: Tokyo -> Kyoto -> Osaka (3 legs)").
- **Visual connectors between legs** — Vertical line and arrow between chained segments so the journey reads as one connected path, not separate cards.
- **Five new transport modes** — subway, bus, taxi, shuttle, and walk are now valid for route segments (Prisma `TransportMode` enum, backend validation, chat tools, and frontend selector all updated). Previously only flight, train, ferry, drive, and other were available.
- **"+ New" button** — Secondary button alongside "Add another leg" for starting a segment from a different origin when needed.

### Changed
- Segment count label changed from "segments" to "legs" — more natural travel language.
- First-segment button text changed from "Add your first travel segment" to "Add your first travel leg."

**SPEC UPDATE NEEDED**: TransportMode enum expansion (subway/bus/taxi/shuttle/walk) and chained-leg UX are new capabilities not in SPEC.md.

## 2026-04-07 — Spreadsheet Sync: Bidirectional Google Sheets Integration

### Added
- **Google Sheets sync service** — Wander reads and writes Larisa's planning spreadsheet via service account (`wander-sheets@actionmgr.iam.gserviceaccount.com`). Structure-aware parsing handles inserted rows, city sections, hotel templates, and activity lists.
- **Clean trip import from spreadsheet** — Creates a new Wander trip populated entirely from spreadsheet data (Option A). 8 cities, 23 days, 15 activities, 11 hotel options in 2 decisions, 3 accommodations, 14 interest marks imported from Larisa's Japan 2026 spreadsheet.
- **Budget data per city** — `costEstimate` JSON field on City model captures cumulative budget (J/A and K/L), hotel costs, and meal estimates from the spreadsheet. Not an accounting tool — conversational cost awareness ("the next few days will be great, but expensive").
- **Conditional day assignments** — `conditionalAssignment` JSON field on Experience handles "I'll go on this day IF someone else isn't interested, otherwise we'll go together later." Used for Mashiko (conditional on Julie's interest). Supports 3-5 similar patterns expected during planning.
- **Sync API routes** — `/api/sheets-sync/pull` (spreadsheet → Wander), `/api/sheets-sync/push` (Wander → spreadsheet), `/api/sheets-sync/status`, `/api/sheets-sync/config`. Pull/push are planner-only.
- **Hotel decision import** — Tokyo (8 hotels) and Kyoto (3 hotels) hotel comparison tabs imported as Wander Decisions with voting columns mapped to DecisionVotes.
- **Sync settings panel** — Planner-only section in Settings page with pull/push buttons, last sync status, and auto-sync interval selector (manual / 15min / 30min / 1hr).
- **Prisma models** — `SheetSyncConfig` (per-trip sync settings, spreadsheet ID, interval), `SheetSyncLog` (sync event history and conflict tracking).
- **Fuzzy name matching** — Jaro-Winkler algorithm for deduplication between spreadsheet and Wander data (threshold 0.85).

### Changed
- Spreadsheet ID is configurable per trip — Ken can swap to Larisa's active version anytime.
- Spreadsheet wins on all data conflicts (last-write-wins with spreadsheet as tiebreaker). Conflicts are logged for Ken to review.

**SPEC UPDATE NEEDED**: Spreadsheet sync, budget awareness, and conditional assignments are new capabilities not in SPEC.md.

## 2026-04-07 — Build-a-Day UX Fixes + Decision Support Polish

### Changed
- **Planning Board button labels clarified.** "+ 10 Thu" (cryptic) → "+ Dec 10" (unambiguous date). Users no longer confuse "10 Thu" with 10am Thursday.
- **Selected day highlighted on desktop.** Active day row has visible tinted background and dark left border (was invisible — same color as page background).
- **Decision options filtered from build-a-day pool.** Hotels being decided by the group no longer show up in the ideas list with assign buttons. Prevents accidentally scheduling an undecided hotel.
- **Map header syncs with board day selection.** Changing the active day in the Planning Board now updates the map header and filmstrip. Was stuck showing the first day regardless.
- **"Mark as set for now" → "Good enough for now."** Clearer intent — the planner signals they're satisfied, not that something is locked.
- **Close button says "← Done" on desktop** (was "← Map" which reads like navigation, not exit).
- **Decision nudge above calendar on Home.** Andy sees the hotel question immediately without scrolling, not buried below the calendar grid.
- **Mobile nudge navigates to list view.** Tapping a decision nudge on mobile now opens list view (where the decision card is) instead of the map.

### Fixed
- **Resolved decisions visible as collapsed cards.** Green "Going with X ✓" cards with "See the conversation" expand link. Uses separate /resolved endpoint to avoid React #310 hook count issue.

SPEC UPDATE NEEDED: Planning Board UX (button labels, day selection, decision filtering) differs from SPEC.md descriptions.

## 2026-04-07 — Group Decision Redesign: Conversation-First

### Changed
- **Decision cards rebuilt conversation-first.** Thoughts/conversation shown chronologically at the top of the card, above option comparison. Options are compact cards with heart (♡/♥) preference signals instead of dominant "Lean" buttons. The conversation is the centerpiece, not voting.
- **Resolve flow is now a two-step proposal.** "Suggest going with X?" → "Yes, go with it" / "Not yet" confirmation dialog. Only appears when there's a clear single leader with 2+ preferences. Ties no longer offer a resolve button (prevents selecting all tied options). Toast names the winner: "Going with Silverland May."
- **Resolved decisions persist as collapsed cards.** Green "Going with Silverland May ✓" card with "See the conversation" to expand full discussion history. Decisions and their conversation no longer vanish after resolution.
- **Map dims non-decision markers during active decisions.** Decision option pins stay at full opacity with labels; other markers dimmed to 35% with labels hidden. Reduces label collision mess during comparisons. Google POI icons no longer clickable.
- **Scout upgraded from Sonnet to Opus.** 4 users, cost immaterial, significant quality improvement for facilitation.
- **"I'm good with whatever" promoted to pill button.** Easier to find and tap, especially for group members who don't have a strong preference. Flexible voters shown by name (not anonymous count).
- **Per-option thought input.** Each option has its own draft text state (no more leaking between options). Placeholder is contextual: "What do you know about [hotel name]?"

### Fixed
- **Plan page crash (TDZ violation).** useEffect referenced useCallback functions before their declarations. Production bundle crashed with "Cannot access 'ge' before initialization."
- **Thoughts appear immediately after sharing.** Fixed stale data bug where thoughts required a full page reload to appear.
- **Home decision nudge navigates to correct city.** Was navigating to /plan without city param — user landed on wrong city and couldn't find the decision.
- **Session expired no longer destroys all state.** 401 response now dispatches an event caught by React (soft redirect + toast) instead of hard window.location redirect that killed in-progress work.
- **NowPage infinite loading on network error.** Added try/catch wrapper around loadData — shows friendly error state with retry button instead of spinning forever.
- **Travel time polling reduced from 15s to 60s.** Matches documented interval, reduces battery drain and API cost on mobile.
- **Toasts on every decision action.** Lean, thought share, flexible, add option, delete — all now give feedback. Previously only errors had toasts.
- **"Cleared" → "Decision removed — options are back in your ideas."** Delete toast now explains what happened.

SPEC UPDATE NEEDED: Decision UX sections (group decisions, voting, resolution flow) now differ significantly from SPEC.md.

## 2026-04-06 — UX Testing Sweep: Overscroll Fix + Terminology + Tone

### Fixed
- **CRITICAL: Dark brown overscroll on every page.** `index.html` set html/body background to `#3a3128`. Changed to `#faf8f5` (sand). Scrolling past content on Home, Now, Profile, and mobile no longer shows a dark void.
- **"scheduled" → "planned" terminology.** Day header, CityBoard, NowPage nudges, and TripPhaseContent all said "scheduled" while sidebar said "PLANNED". Unified to "planned" everywhere.
- **"city board" → "Tap Build to browse ideas."** Empty day guidance referenced "city board" which isn't a visible UI term. Now points to the Build button.
- **"No reservation" was red.** Styled like an error — changed to neutral tan for informational tone.
- **"Log out" → "Sign out"** on Settings page for consistency with home page.
- **AI Observations used analytics language.** Prompt rewritten: "accumulated", "indicating", "categorized" → travel companion tone.
- **Import history showed "Chat paste's recommendations."** Internal label changed to "Scout".

## 2026-04-06 — Interactive Testing: Critical Fixes + Multi-Language Phrases

### Fixed
- **CRITICAL: Scout chat added cities to wrong trip.** When multiple trips existed, `create_trip` didn't archive other active trips, and `findFirst` returned the first-created (Japan) instead of the user's current trip. Cities intended for Vietnam ended up in Japan. Fixed: create_trip now archives others, ChatOverlay reads from localStorage, backend fallback uses orderBy updatedAt.
- **Cities added via chat had no map coordinates.** `add_city` and `create_trip` chat tools now call `geocodeCity()` so markers appear in the correct geography.
- **No "days away" countdown on trips without a map.** Vietnam trip showed dates but no countdown. Fixed: both map and no-map code paths now show the countdown.
- **Unknown routes showed blank page.** `/doesnotexist` now redirects to home.
- **"1 ideas" grammar.** Singular/plural check added to plan page day header.
- **History log tone.** "promoted" changed to "added", raw date `2026-12-10` changed to human-friendly `Thu, Dec 10`.
- **Markdown bold not rendering in Scout chat.** `**text**` was showing as raw asterisks. Added lightweight inline markdown renderer.
- **"Experience name" placeholder inconsistent.** Changed to "What's it called?" to match reservation form tone.
- **No confirmation when saving an experience.** Added toast: "On the plan" / "Saved as an idea" / "Up for a vote".

### Added
- **Multi-language phrase card.** Phrase card now detects trip countries and shows relevant phrases. Supports Japan (Japanese), Vietnam (Vietnamese), Cambodia (Khmer), Portugal (Portuguese). Multi-country trips get language tabs to switch between. Replaces hardcoded Japanese-only card.

### SPEC UPDATE NEEDED
- Phrase card section: now multi-language, not Japan-only. Detection logic and supported languages should be documented.
- Chat markdown rendering: Scout responses now render bold text.

## 2026-04-01 — Planning Board

### Added
- **Planning Board.** New full-screen planning view accessible via "Board" button in the action bar. Split-panel layout: days on the left (desktop) or as pills (mobile), unassigned ideas on the right with theme filters, search, and sort. One tap assigns an idea to the active day. Progress bar shows how many ideas are planned. "Already planned" section (collapsible, grouped by day) lets you unplan items. Optimistic UI — ideas vanish from the pool instantly on tap.
  - City tabs at top with progress counts (e.g., "Kyoto 12/47")
  - Day cards show fullness: "Wide open" → "3 things" → "Full day" → "Packed"
  - Theme emoji filter chips with counts
  - A-Z / Rating sort toggle
  - Warm empty states ("Kyoto is all set — nice work")
- **Build button replaces List** in the bottom action bar, now visible on all screen sizes (was mobile-only). Label "Build" chosen over "Board" for clarity (matches WineTracker convention).
- **Move between days** — planned items show a "move" link that opens an inline day picker. One tap to reassign to a different day without unplanning first.
- **Inactive days show items** on desktop — all days show their assigned items (compact), so you can scan "did I already put this somewhere?" without clicking each day.
- **Touch-friendly add buttons** — "+" buttons increased to 44px height for reliable thumb targeting on mobile.
- **Search always visible on desktop** — search bar shows regardless of pool size on large screens.
- **Map stays visible on desktop** — board shares the screen with a compressed map (35% map, 65% board). On mobile the board is still a full overlay. Lets you check geography while planning.
- **Add idea from the board** — "+ Add" dropdown in board header with full capture menu (Manual, Import, Camera, Group decision) for the current city without leaving the board.
- **Drag and drop** — drag ideas from the pool onto day cards to assign them. Drag between days to move. Drag to "drop here to unplan" zone to remove. Works with mouse (Mac) and touch (iPad/iPhone). Visual feedback: ghost item follows cursor, drop targets highlight.
- **"Set for now"** — planner-driven signal on any day or city. Tap to mark it with a ✨ sparkle and warm amber tint. Not "done" or "complete" — just "I'm happy with this for now." Persists across sessions (localStorage). Sparkles show on day cards, day pills, and city tabs.
- **Narrower idea cards** — pool cards capped at max-w-2xl. Descriptions wrap to 3 lines instead of truncating at 1, so you can read them without opening the detail panel.
- **Cities in chronological order** — city tabs now ordered by arrival date instead of arbitrary database order.
- **Larger expand arrows** — "Already planned" and mobile day card collapse arrows enlarged from dots to visible triangles.
- **"Move" more prominent on desktop** — text is larger, uses visible ink color, appears on hover.
- **Fixed search placeholder** — was showing literal `\u2026`, now shows proper ellipsis.
- **Fixed empty state copy** — no longer says "close the board" when you can add from the board.

Affects: frontend/src/components/PlanningBoard.tsx (new), frontend/src/pages/PlanPage.tsx. SPEC UPDATE NEEDED — planning board is a new primary view not yet in spec.

## 2026-04-01 — Trip Switching, Home Cleanup, Contributor Fix, Vault Polish

### Changed
- **Trip switcher shows all trips.** Tapping the trip name now shows past trips, planning trips, and upcoming trips — not just the active one. Any planner/admin can jump to any trip. Explorers see trips they're part of.
- **Home screen reordered.** "Have something to add?" (Camera/Paste/Scout) is now the first section below the calendar. "Browse ideas" renamed to "Explore by city" with idea counts per city.
- **Contributor badges removed from imported items.** Bulk-imported experiences no longer show the importer's initial — attribution only appears on items someone personally added. The Contributions summary on Home also excludes imports.
- **Map walkable radius more visible.** Dashed circle is thicker (3px), higher contrast, and tighter spacing.
- **Vault PIN setup friendlier.** PIN inputs use `autocomplete="one-time-code"` to suppress browser password manager interference (the "railway" save dialog). Face ID offer uses an in-app prompt instead of browser `confirm()`.
- **Home loads faster.** Re-navigating to Home no longer flashes "Finding your trip..." — data refreshes silently in the background when already loaded.

Affects: frontend/src/pages/TripOverview.tsx, frontend/src/components/MapCanvas.tsx, frontend/src/components/VaultGate.tsx, frontend/src/components/ExperienceList.tsx, frontend/src/components/DayTimeline.tsx

## 2026-03-31 — Phantom Button Fix, Timezone Bug, Chaos Testing Round 3

### Fixed
- **Phantom button on TripOverview**: Removed partial "+" button that was hidden behind the bottom nav bar. Tapping it triggered an infinite "Processing..." spinner because the capture pipeline only works on the Plan screen. The button is disabled until a global capture review panel is built.
- **Day generation timezone bug**: Creating cities with date ranges near DST transitions could generate wrong number of days (e.g., Nov 1–2 creating only 1 day instead of 2). Fixed by switching all date arithmetic from local timezone (`setDate/getDate`) to UTC (`setUTCDate/getUTCDate`) across trips, cities, import, chat, and approvals routes.
- **Phrases FK validation**: Creating a phrase with a non-existent tripId now returns 404 instead of a 500 FK violation.
- **Experience cross-trip dayId**: PATCH and promote endpoints now validate that the target dayId belongs to the same trip as the experience, preventing cross-trip data contamination.
- **Promote race condition**: If a day is deleted while an experience is being promoted to it, the endpoint now returns 404 instead of 500.
- **Reservation type validation**: Creating a reservation without the required `type` field now returns 400 instead of a Prisma 500.

### Added
- 57 new chaos tests (S422–S478) covering date shifting, city overlap days, concurrent operations, personal item/reflection/note ownership, phrase CRUD, cross-trip FK validation, and full trip lifecycle scenarios.

Affects: backend/src/routes/trips.ts, cities.ts, experiences.ts, phrases.ts, reservations.ts, import.ts, chat.ts, approvals.ts, frontend/src/components/CaptureFAB.tsx

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
