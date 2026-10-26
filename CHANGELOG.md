# Wander Change Log

SPEC.md is canonical. CHANGELOG.md records implemented behavior changes and flags when SPEC needs updates.

## 2026-10-27 (Tuesday morning in Japan) — Her Oct 27 copy; a plan given to Scout first is said once

Her Oct 27 copy rewrote Tuesday's plan (7:30 leave Shiraume … teamLab 2:00–2:30 … Ristorante Dono 6:30); imported on
production; her Itinerary tab still says teamLab 11:00–11:30, shown as "Tabs differ" on both lines. Larisa had given
Scout the same plan at 11:29 PM the night before (13 of Wander's own plans), so every stop showed twice, hers marked
"not in your Guide".
### Fixed
- A Wander plan at the same time as a line of her plan, naming the same place, is said once: her line, and under it
  what more the plan said ("Larisa added: Bill settled, luggage transferred to Four Seasons, no return to the ryokan").
  Nothing deleted. Day screen (DayPage foldedInto) and Home (TripGlance todayChoices). A plan about something else at the
  same time still shows on its own. SPEC §3 (day screen) — the rule is the day screen's "each fact once".

## 2026-10-26 (Monday in Japan) — Papers: fit the photo before keeping (corners, Crisper), and Edit

Ken: "I thought keep a paper was supposed to have crop? It should, and ideally would have full editing tools to change
parallax and contrast." He said yes to: four corners (crop + straighten) and Crisper, in the keep step and as Edit.
### Added
- "Fit it before keeping" (components/PaperEdit.tsx): after a photo is chosen in Notes — four corner circles with a
  magnifier, Crisper, Turn, Keep the photo as it is, Keep it, Cancel. The page is straightened on the phone (perspective
  from the four corners; its true width ÷ height worked out from them, Zhang & He's whiteboard method) and kept at most
  2000 px, like every paper.
- From the fresh check before shipping: the page came out ~30% too wide (now its true shape, A4 0.707 at 0–45°); each
  Save trimmed 4% (circles now start at the photo's corners); crossed corners kept a smear (corners now ordered); Crisper
  turned beige paper tan (now each colour to white, measured on the page); the magnifier was 1.25× and under the thumb
  (2.5×, beside the finger); a grabbed circle jumped to the fingertip (keeps its offset; 56 pt to grab).
- Edit in a kept paper's viewer (the keeper's, photos only): Save; Back to the original. trip_papers.original,
  original_thumb, edited_at; POST /api/papers/:id/edit and /:id/original; the words are read again after an edit.
- Scout has no matching tool on purpose: fitting corners is a hand gesture, not something said.
SPEC §9.6 updated.

## 2026-10-26 (Monday morning in Japan) — Her Oct 26 Guide copy; a day planned as a table

Ken: "Yes, please analyze that new Excel version for changes, based on the date, I'm not sure there are changes."
Her copy changed three tabs: a new Shigaraki plan for Wed Oct 28 beside the old one (Time | You & Julie | Ken & Andy),
one line on Mon Oct 26 (Gion Tsujiri), one on Flight info. Imported on production after the reader fix below; Ken's
Yazawa ruling re-applied; Oct 15, 26 and 28 summaries rewritten, read and published.
### Fixed
- Wander read both of her Oct 28 plans into the day (two departures, Maruni Toryo at two times, two dinners): the
  "two versions" rule knew only a plan written in one cell. planTableVersions (services/guide/importSnapshot.ts) treats
  two plan tables with the same date as versions and follows the newer; a column per couple becomes each couple's lines
  (Ken & Andy's MIHO Museum morning is theirs), "Together" rows are everyone's, her "you" in their column is Larisa.
- "Enyu-an Kobayashi" (her tab) and "Enyuan Kobayashi" (Dining Resos) were called two restaurants ("Tabs differ").
Backend only, used by the import scripts on the Mac; rides with the next deploy (the server's in-app upload uses it).
SPEC §5 (two versions, a column per couple) updated.

## 2026-10-25 (Sunday evening in Japan) — Papers: open inside Wander, zoom, who sees it, a card when shared

Ken, with a photo of the Baian ryokan's welcome sheet: "Interface messed up? At this screen should be able to zoom in or
change the distribution between self and group. Think through use case" · "If a note added for group alert each person
on next login that the doc is available with a small picture that can expand" · "the current expansion of the paper
image is a dead end with no way to even go back after viewing".
### Fixed
- Tapping a paper opened the bare photo in its own window: in the Home Screen app, no Done, no Back, no zoom. It now
  opens full screen inside Wander (Notes, a day's page, the card): pinch toward the fingers or double-tap to zoom, Done
  or Back closes it, what Wander read under it, **Save or send** (the share sheet). (components/Papers.tsx PaperViewer,
  PictureViewer title/footer/pdf.)
- A pinch in any full-screen picture (her pictures too) zoomed toward the middle; it now zooms toward the fingers.
- A paper with no day printed on it (a welcome sheet, a menu, a temple ticket) went under "No day"; it now goes under the
  day it was kept. Ken's seven such papers are filed that way on production (paper-text-fill.mts).
- Scout saw only Wander's summary of a paper ("the sheet lists the 1F and 2F Wi-Fi networks"), never what it says. The
  words printed on a paper are now kept (trip_papers.text; never a card, booking or passport number, a guest's name or a
  room number) and given to Scout; Ken's 17 papers were read again for them.
### Added
- **Who sees it**, on the paper's screen: Just me · Larisa and me (Ken and Larisa; how theirs are kept) · Everyone.
  Scout: share_paper, keep_paper share. (trip_papers.share; POST /api/papers/:id/share.)
- **Shared with everyone**: each other person's next opening shows a card, "Ken shared a paper", title and a small
  picture that opens full size; Got it / Remind me. Kept back or removed: the card is taken back. (trip_alerts.paper_id;
  services/tripAlerts.ts pendingFor.) "See it or share it" right after keeping one from Notes.
SPEC §9.6, §16 (photos), §19 (privacy), Scout's tools updated.

## 2026-10-24 (Saturday evening in Japan) — Budget: "That's right" takes a checked payment off the box

Ken: "There were only three items that were not shared in the budget, and they're all correct. I don't know how to
remove them from that page. make sure there's a way to remove them, but in the meantime you can remove them."
- Each line in the "not shared — check these" box has **That's right** (anyone on the trip): it leaves the box; its row
  stays, untinted, "Not shared: … owe it all back · checked by Ken". A change of who paid, the amount or who it's for
  puts it back. Logged. Scout: change_expense thatsRight. (trip_expenses.checked_at/checked_by; POST
  /api/expenses/trip/:tripId/:id/right.) SPEC §9 Budget updated. Ken's three marked checked by Ken on production.

## 2026-10-23 (Friday night in Japan) — Budget: shared is the clear default; anything not shared is flagged

Ken: "Folks are sometimes misaligning whether in expense is shared by both parties. Make a shared expense as a clear
default… highlight anything that doesn't shared because it's probably an error. Ask if the intent is unclear." · "Make the
payer color equal the color in the home page. And shared a blue color." The log showed why: today Andy kept four
payments as "for one couple alone" (three for his own couple — not shared at all) under a second row of the couples'
names; Ken changed all four to shared.

### Added
- Scout's one-time note to Andy, Ken's words, in the message card right after his next payment is kept (any path):
  "From Scout", Got it / Tell Scout; only Andy, only once (trip_alerts.to_id and .key; services/tripAlerts.ts
  ONE_TIME_NOTES, afterDoing from services/expenses.ts addExpense). SPEC §13.
- Ken hears how Scout's note went (Ken: "Tell me in an alert when you give andy the message and give me the seconds it
  is open"): a buzz when it's on Andy's screen (POST /api/alerts/:id/shown), and when he answers it, the seconds it was
  on his screen and the button tapped — a buzz and a card for Ken.
- Each phone reports once a day whether it can get the 9 PM question (from the Home Screen icon? allowed? a "No" kept?),
  yes/no only, to the server's log ("[phone] Andy nudge …") — Andy's phones have never allowed notifications.
- Tests and the test copy can never buzz a real phone (empty notification keys; the test copy's phone addresses cleared).
- Scout passes something someone doesn't like about Wander to Ken without asking, and says so (rule 59, tell_ken) — the
  note's promise made true. Each session reads new Tell Ken messages (session-tools/prod-tellken-new.mts).

### Changed
- Budget's add pop-up: who paid in the couple's Home color; "✓ Shared, half each" in blue, already chosen; "Not shared?
  Only <other couple>'s" one tap away, with what it means said and Keep reading "Keep it — not shared". Every row says
  shared in blue or not shared in red-brown on a tinted row; a red-brown box at the top lists anything not shared.
  (pages/MoneyPage.tsx, components/PayNextBadge.tsx partyColor). SPEC §9 (Budget) updated.
- The server refuses a couple paying for themselves alone, with a question (services/expenses.ts). Scout keeps shared
  unless the words plainly say the other couple's, asks when unclear, and names anything not shared in money_so_far.

## 2026-10-21 (Wednesday evening in Japan) — Backroads days summed up from Backroads' plan too

Ken, on Thu, Oct 22's summary ("Her Guide keeps the hours with Backroads and doesn't spell out what fills them"):
"Didn't the backroads pdf give more detail? The day summary odd based on all you know." The summary writer read only her
lines. Now it also reads that day in Backroads' planner (services/guide/daySummaries.ts dayInputs/summaryPrompt), and
says both where they differ. Oct 22 and Oct 24 rewritten by hand from the planner and published (data); days already
past left as they are. No SPEC change (SPEC: a few sentences atop each day).

## 2026-10-18 (Sunday, the Nikko day) — Ken's four asks: Return, Stop, pictures on Next, letting everyone know

Held until Ken and I agree to deploy (Ken: "All can be batched until we agree to deploy. This is to minimize testing and
cost.").

### Added
- Scout's Stop: while Scout answers, the arrow is a Stop; the question goes back into the box, and Wander is told so the
  answer is never saved (POST /api/chat/stop; the answer loop checks it each step). Scout's panel. SPEC §7.5.
- Letting everyone know: tell_everyone and my_alerts (Scout, rule 63); trip_alerts and trip_alert_seen tables; GET
  /api/alerts/pending, POST /api/alerts/:id/seen; the card above the bottom bar (TripAlerts) with Got it / Remind me.
  SPEC §7.7a.
- Pictures on Next: Backroads' stops with photos when nothing timed is left; tonight's hotel photo; a booking's photo on
  the Next card. SPEC §2.4.

### Changed
- Notes (Ken: "adjust notes so I can change after saving… a general note like the latest sake brewery note allowing me
  to add details during the visit… Edit is base requirement"): each of your notes has **Add to it** (your words go under
  the note with the time, "3:05 PM — …") and **Edit** (the whole note in the box, the cursor at its end), first and
  underlined. Scout's change_my_note takes `add` ("add to my sake note: …"). The first wording is always kept. SPEC §9.
- Scout's box on a phone: Return makes a new line; the arrow sends. At a Mac, Return still sends. SPEC §7.5.
- Letting everyone know, Ken's decisions: Scout confirms the words first ("Got it. Here's what I'll send: …"); Remind me
  returns the next day; gone after 3 days or when its moment passes (`until`, trip_alerts.until); looked for whenever
  Wander is on the screen again; Scout's answers carry what everyone was told. SPEC §7.7a.
- Backroads' itinerary is now their travel planner for this departure (data, recorded Oct 18 ~11 AM): Scout says its
  days by date, never "Day 4"; no page numbers for a web page. Oct 23's summary says Backroads' ride and her "hike" line.

## 2026-10-17 (Saturday, ~11:30 PM in Japan) — Scout gives the weather hour by hour, and checks another source when asked

Ken, the night before the Nikko ride, asked the temperature "where we start biking from 1pm to 6pm". Scout said the
forecast had only the day's low and high, guessed the ride's valley "milder", then refused another source: "for
weather in Japan I work only from Wander's forecast".

### Changed
- Scout's get_weather takes hours: each hour's temperature and chance of rain at each of the day's places (or a town),
  the place's height, and how far Europe's and the US forecasts run (services/dayWeather.ts hoursAt). Asked about a
  ride's town (Kanuma), Scout reads it instead of guessing.
- Asked for another source, or to check a weather app or screenshot, Scout searches online and gives both, Wander's
  first; differences worked pair by pair. Unasked, it still gives only Wander's forecast for Japan. Lives in Scout
  (rule 46g). SPEC §7.8 updated.

## 2026-10-17 (Saturday, ~10 PM in Japan) — Notes keeps the box in sight when opened from the evening question

### Fixed
- Notes, opened from Scout's evening question: the box is focused as it's drawn, so tapping it isn't a new focus and the
  hold that keeps the page with the box never started. Ken's first letter threw the page to its foot, the cursor out of
  sight (Oct 17, 9:15 PM). The hold now starts when the box already has the focus, and at a key pressed in it. A scroll
  by hand is still never undone. Lives in NotesPage (frontend). SPEC unchanged.

## 2026-10-17 (Saturday, late evening in Japan) — From the fresh photo check of every day; a note's day can move

A fresh agent looked at all 430 photos on 74 places, every day page: 2 wrong (Kinugawa River's lowland riverbed and
farmland), 1 wrong in spirit (a stranger eating at Shoraian), 2 doubtful (a snowy valley for Irohazaka, a farmhouse for
Café ENSOU). Those five were taken off on production after a look (trip-data/session-tools/photo-drop.mts).

### Fixed
- The photo check leaves out a stranger who is a photo's subject, another stretch of a river, road, trail or coast far
  from where the line goes, and a season that hides the place.
- A Backroads day doesn't show the hotel's photo twice (as their stop, and again as tonight's hotel).
- A to-do marked done isn't shown on the day ("Passed · Reconfirm the La Table… Done — you, Oct 14" sat on Oct 10–14).
- Google's opening hours aren't said on a day already lived ("closed on Wednesdays" under the visit they made).
- "Backroads: Fushimi Inari + Tofuku-ji" looks its photo up by the place, not by "Backroads".
- A saved note can move to another day: Day in its Change editor ("Now for Fri, Oct 16"), and Scout's change_my_note
  takes a day ("that note was about yesterday").

## 2026-10-17 (Saturday, 7:45 PM in Japan) — Notes: the fresh re-check's fixes

### Fixed
- Words typed right after opening Notes from a day page or the evening question, before the box is drawn (slow
  signal), come into the box — they went into the box that held the keyboard up, and were lost.
- A session that began on Notes and went offline found its notes again (it said this phone had none).
- Search finds a note by who wrote it; the chip that shows others' notes reads "From others".
- A note filed under another day says so: "Saved for Fri, Oct 16 — …".
- A citation written out as words in an answer kept earlier never shows.

## 2026-10-17 (Saturday, 7:30 PM in Japan) — Photos on every day

Ken, on Oct 18's page with none: "Why aren't there pictures on the day? Please tell me why then audit every day."
Why: photos went only on lines of her detailed day tab; Backroads' own stops were only in Play; a line naming a place
with no Maps link had nothing to look up by.

### Added
- A day without her detailed plan: each booking, meal, stay, tour and check-in/out line shows its place's checked
  photo, the one Play shows (tap: its photos full screen).
- A Backroads day: their stops are listed on the day's page, each with its photo and length, in place of the one-line
  outline ("Backroads' general itinerary for their Day 2 — Play the day shows each, in their words").
- Tonight's hotel shows its photo on a day without her detailed plan.
- Her plan's lines that name a place with no Maps link ("Confirmed visit with Yosuke Kimura at Bizen KIBIDO") look up
  a photo by the place her words name, in the day's town; Wander's same-place check decides; no Maps link is made from it.
Audit (test copy, every day, two passes): every day but Oct 5 now has photos on its page; Backroads days went from
none to 3–6 lines each.
SPEC updated: §3.5 her stops' photos (photos on every day).

## 2026-10-17 (Saturday, 7:30 PM in Japan) — Notes, from a fresh audit as the travelers

Ken: "If people are going to use notes, the experience has to be easy, fast, seamless, intuitive, delightful. Audit it
as a user… Use a fresh uninformed agent. Use your best judgement without asking me."

### Fixed
- Scout never says someone "hasn't written" or "wrote nothing" about something: it sees only what they've shared, and
  says "nothing they've shared mentions it" (it had told Ken "he hasn't written a note on it" of a private note of
  Andy's). Rule 46e.
- Scout can change one of the asker's own notes — its words, or who sees it — as the note's Change and Share buttons
  do (change_my_note; get_my_notes gives their own notes' ids). The first wording is kept; never someone else's note;
  taking one out stays on the Notes tab. CLAUDE.md §8 chat parity.
- A note kept with no signal stops saying "waiting for signal" as soon as Wander sends it (it said so for 20 s after).
- Writing a note: the day and place in one line, "For Sat, Oct 17, today · Tokyo · change", in place of two
  dropdowns above the box; "Place" for "About".
- Typing while the microphone listens stops the listening (the two ran together mid-word).
- An empty search offers "Ask Scout — it finds a note by what it's about ›".
- Today's page has "✎ A note about today" near its top (the one at the foot stays).
- Opening Notes from the evening question or a day page holds the iPhone's keyboard up from the tap.
- Scout's box says "Listening — tap the mic again when you're done" while the mic listens.
- No "Sources" under a short "In your Notes…" reply; a hand-written citation tag never reaches the screen.
- Home's evening question checks the notes Wander has, not only the phone's copy; "Shared" for "Others'"; no "your
  time" on a note card; a failed Send a copy says to press and hold the words.
SPEC updated: §9.1 Writing a note.

## 2026-10-17 (Saturday, 2:00 PM in Japan) — Scout asks each night, on the lock screen

Ken, on Home's evening question: "It's not even reaching me!"; to a 9 PM notification for everyone: "Yes, build the
request for others"; then: "Ask for notification permission when anyone opens next, e.g., tonight or tomorrow (for
today). At that point ask if you can ask each night. Options: yes, no, ask me again tomorrow."

### Added
- At 9 PM in Japan (10 PM when your plan has a line from 7:30 PM on), once a night, to each phone that allowed Wander's
  notifications: "Scout asks · Anything worth remembering from today? A line or a page, kept word for word." A tap
  opens Notes for that day. Not on the trip's last day or a day you fly; not when you've already written about the
  evening (a note about today after 6 PM, or one from the evening question). services/eveningNudge.ts.
- Home, on the next opening during the trip, on a phone that hasn't decided: "Can I ask you each night what's worth
  remembering from the day?" — Yes (the iPhone's own box), No (final), Ask me again tomorrow. One ask per visit. Its
  yes also lets Scout's answers buzz the phone, and it says so. components/EveningNudgeOffer.tsx.
- Scout: "Select" beside Copy under each answer (Ken: "I see the copy button for a scout message. Can you add a select to
  copy parts"). It opens the answer alone, full screen, in a box that can't be changed: press and hold, drag the handles,
  Copy; "Copy all"; Done or Back closes it. In the panel a long press had "tactile feedback but doesn't actually select
  anything" (Oct 4). components/SelectText.tsx.

### Fixed
- Home's evening question no longer goes away for the day because of a note written earlier in the day (Ken writes
  notes most days, so it never asked him); a note from the question itself, or one kept after 6 PM, still does.
SPEC updated: §9.1 Writing a note (Scout asks each night).

## 2026-10-17 (Saturday, 1:00 PM in Japan) — Second fresh check: her tab's old map off the swapped day

### Fixed
- A day that follows another list of hers no longer offers "See her map from this tab", her Apple Maps guide for the
  day, or her tab's map of the day at the top or in Play — they're the plan set aside (Oct 17's opened Spiral and Louis
  Vuitton at their old times). Days on her tab's own plan keep them.
- The photo check keeps a shop's goods only on its own shelves: every photo must be taken at the place (the On store's
  sixth photo was a pair of On shoes on someone's floor). The On store was checked again on production; I looked at all
  six.

## 2026-10-17 (Saturday, 12:15 PM in Japan) — Fixes from the fresh check of Oct 17

### Fixed
- A place's photos checked again stay on the Google place already found (by its id, never searched again): the re-check
  had moved Onitsuka Tiger's Shinjuku flagship to a small Onitsuka shop in a mall. The check also turns down another
  branch of the same brand nearby. Onitsuka was put back on the flagship on production (photo-repoint.mts) and its six
  photos looked at: the yellow front, the floors inside.
- A day that follows another list of hers no longer offers "Why this plan is on this day" (it explained her tab's plan,
  set aside).
- Her note for a stay no longer shows a part she marked done (Oct 17: "…ASK KENJI TO INTEGRATE THE 2 TOURS AND FINISH
  3:45-4p AT TRAIN — DONE"); Ken (Oct 14): "if it is done or out of date, you don't show it".
- Scout quotes only the few of Ken's words for the day that answer the question.

## 2026-10-17 (Saturday, midday in Japan) — Up to six checked photos for every place; La Table for Robuchon

Ken (Oct 17), on Play's Robuchon dinner with no photo: "I would expect four to six pictures of the restaurant and food";
then "Add to my documentation agreement with your plan that would then apply to the Robichon restaurant as well as the
rest of Wander. And yes, we're at la table."

### Changed
- Every place's photos: Google's up-to-10 are each looked at; only the ones that show the place (its room or food for a
  restaurant) are kept, best first, up to six. Phones are only ever given checked photos — before, the full-screen
  photos showed four of Google's six that were never checked. Places checked before are checked again once, one at a
  time, in the background (services/placePhotos.ts freshenPlaces).
- A line whose place is her booking's ("her booking for it: LeTable de Joel Robuchon - 1F") is checked as that booking:
  Sat Oct 17's dinner shows La Table's room and five of its dishes. "Her tabs differ" stays on the line.
- A "no" is searched once more by her line's own words, and asked again after a day, not a week.
- The check: a food hall inside a department store counts as the store (Mitsukoshi Ginza's depachika now has photos).
- Today's line that stands out: the best photo wide and the rest small beneath; each opens the full-screen photos at
  itself. Play: each moment shows all its checked photos, 2 s each (the pace its two had); the credit follows the photo;
  after a pause it goes on from the photo showing. "N photos" counts checked photos only.
- Phones drop their earlier photo lists once (wander:place-photos:4).
SPEC updated: §3.5 (what's now stands out; her stops' photos; a day that follows another list of hers — the entry
below), §3.7 Play (all its checked photos).

## 2026-10-17 (Saturday, 11:00 AM in Japan) — A day can follow another list of hers

Ken (Oct 17), sending Larisa's Google Maps list "Tokyo Day 3": "Adjust this day on wander to reflect these places.
Remove existing wander places not on the Google map. (Ie, treat as a replacement set). If order is not clear pick an
order that makes sense and we can use the day plan without trusting "next." Robichon is last".

### Added
- A day's plan can follow another list of hers (day_plan_swaps; services/guide/daySwaps.ts). Her tab's lines for that
  day are hidden in Wander, never deleted; her list's places stand in their place, in Wander's order, untimed; lines
  she named to keep follow them (the dinner). Her sheet and Wander's copy of it are untouched; a new Guide copy doesn't
  undo it. Applied wherever a day's lines are read: the day page, Home, Play, Next, Scout, the day's summary.
- Sat Oct 17 follows her "Tokyo Day 3" list: Onitsuka Tiger Shinjuku → Muji → Shinjuku Takashimaya → Takashimaya Times
  Square → mont-bell → Ginza Natsuno (Omotesando) → On Cat Street → Shibuya Crossing → the 6 PM Robuchon dinner. Each
  line shows only her list's word for the place (its kind); each Maps search was checked to land on her pin. Wander's
  straight-line distances between her pins go to Scout, said as Wander's.
- The day's plan heading says "From her Google Maps list "Tokyo Day 3"" (no link to her sheet, which doesn't hold it).
- Scout: the day's plan is her map list, Ken's choice; what was set aside, and that her list's places have no times.
SPEC UPDATE NEEDED: §day screen (a day following another list of hers).

## 2026-10-16 (Friday, 11:30 PM in Japan) — Home's Budget line: the next action only

Ken (Oct 16): "people do not want to be reminded how much they've paid. They simply want to understand the next action,
which is who pays next and what the difference is."

### Changed
- Home's Budget line: "Budget: ¥204,090 shared so far" is gone; it reads "Who pays next: KL Ken & Larisa · ¥23,475 to be
  even" ("Budget: nothing kept yet" before anything is kept). Replaces Ken's Oct 15 "shows the total". SPEC §2.1.
- Scout: "who pays next?", "where are we on money?", and its line after keeping a payment, say who pays next and what
  they'd pay to be even — never the totals unless asked. Rule 61.

## 2026-10-16 (Friday, 11 PM in Japan) — The Budget leads with who pays next

Ken, marking his Budget page: who pays next — "Yellow: top importance"; the "Plus … alone" line — "a result. Not a top
line topic"; the shared total — "not at top. A reminder of spending money which is not what to emphasize. Bottom of
page."

### Changed
- Budget page: at the top, "Who pays next", the couple in large type with its badge, then "To be even now, … would pay
  … ¥…". "¥… shared so far." and the "Plus … paid for … alone" line sit together, small and quiet, at the foot of the
  page under every entry, above Log. Home's Budget line is unchanged (Ken, Oct 15: "a button on the homepage that
  actually shows the total"). SPEC §Budget.

## 2026-10-16 (Friday night in Japan) — Receipts on the Budget

Ken (Oct 16, with his taxi receipt): "We need to be able to take pictures of receipts and add them and simply note who
paid for them and have the option of adding what the item is. This is a good example and it is real. It was paid for by
Ken and Larisa, so you can use it for both testing and functionality."

### Added
- Budget, "+ Add entry": "📷 Photo of the receipt" beside the heading (Take Photo, Photo Library or a file). Wander reads
  the grand total and what it was for ("From the receipt: ¥5,200, Taxi. Check it, then tap who paid."), and its day; who
  paid then waits for a tap (neither couple picked — the one already picked read as taken from the receipt; fresh
  tester), Keep. The photo is kept with the payment (Remove before keeping; "📷 Take another photo", which replaces what
  the last photo filled in — words typed by hand stay). No total found: "Wander couldn't find a total on it. If it's a
  receipt, type the amount; the photo is kept with it." No card number ever goes into words. Data: expense_receipts
  (the picture, beside its payment). SPEC §Budget.
- A payment with a receipt shows "Receipt" on its line, for all four; it opens the photo full screen ("Done"). In its
  Change pop-up: "See the receipt".
- One kept by typing gets its receipt later: its Change pop-up has "📷 Add the receipt's photo" (who kept it, or Ken) →
  "✓ Receipt kept with it: …", the amount untouched; the Log says "Added its receipt (¥…, couple): what · who". (Larisa
  kept tonight's ¥5,200 taxi by typing; Ken had the receipt.) With one kept, "📷 Replace the receipt's photo" sits
  beside "See the receipt" (a wrong picture couldn't be undone); the Log says "Replaced its receipt". A few bytes that
  aren't a photo are refused.
- Scout: a receipt photo with who paid ("Ken and Larisa paid this") is kept with add_expense receipt: true — the photo
  kept as its receipt; never a card number read out.

### Changed
- The add pop-up's hint is one line ("Or tell Scout: “We paid ¥8,000 for lunch.”") so Keep stays above the keyboard.

## 2026-10-16 (Friday evening in Japan) — What Wander costs to run and to change; the last small items

Ken (Oct 16): "Please do a complete audit on architectural changes to reduce the variable cost of running and editing
wander… No other change to functionality." And: "Do the small cleanup items you mentioned above so that you have no
outstanding items."

### Fixed
- Scout: a long answer could be cut off. Scout's model thinks by default, and its thinking counted toward a 4,096-token
  cap; the cap is now 16,000 (billed only as used).
- Budget: "Kept after all: …" when a Keep closed before Wander answered lands after all; "Already kept: …" when the same
  payment is typed again (the phone's own retry still says "Kept"); "Removed: …" without a tick; in the Log, someone who
  can't put a payment back sees who can ("Julie or Ken can put it back.").
- Maybes: no tab for a city with nothing left on its list, or whose days are over (Osaka, Nagoya); "added by you" on your
  own day chip; the filter rows fade at their right edge while more is off to the right.
- Maybes: the city you're in today always has a tab and opens first — in Nikko and Izu, with no ideas of hers, Maybes
  opened on Kyoto and a maybe went on Kyoto's list (fresh tester).
- Today: the "Now / Next · … ↓" line under the summary wraps to two lines — "DINNER RESERVATION: UN…" cut the name off.
- Budget: "✓ Kept / Changed / Already kept" stays 8 seconds (4 was easy to miss in a taxi); the Log's "Changed …" lines
  say what the payment was for, as the others do.

### Changed (nothing people see)
- Scout reads her Guide in a fixed order, so a maybe taken off and put back no longer rewrites Scout's cached Guide.
- Photos: a place's or a city's photo is taken from the phone's saved copy (its address names the photo); Google's
  static maps likewise. The 640-wide photos fetched to choose a place's photo are kept to show it. A city's chosen photo
  (or "none fits") is kept in the database for the week — a restart fetches that one photo, not a search and up to five
  judged by Claude (data: city_photo_picks). Failing background photo and hours checks retry at most daily / six-hourly.
- Database rest: Ken's rail sheet is checked from memory each minute and read only when due, resting while nobody has
  used Wander for half an hour (the first question after waits up to 3 s for a fresh read); her Google map is written
  only when it changed and read only while Wander is in use; the Maybes tab's dot (off) asks nothing; a hidden day page
  stops asking for the storm watch; your own photo's "not changed" no longer loads it; 15 s allowed to wake the database.
- One file for the libraries, unchanged between deploys, so a phone re-fetches only Wander's own code.
- Editing: test servers run without production's background jobs (--warm to keep them) and can stub Scout
  (--stub-scout); docs-only commits don't deploy (railway.toml); production walks skip Google's map; CHANGELOG entries
  before October moved word for word to CHANGELOG-before-2026-10.md.

## 2026-10-16 (Friday afternoon in Japan) — Budget you can trust; Put it back; Maybes; one way to the phrases

Ken (Oct 16): "Please confirm I can trust the financial tracking. There will not be errors. There will not be omissions.
Nothing will be forgotten, and the math will be correct." Then, on "Nothing is lost": "can I assume that means the data
can be brought back into the live flow". And: "fix the Maybes"; on Phrases, one way in.

### Fixed
- Budget: a payment kept twice when its reply was lost on a weak signal ("That didn't save", Keep again). Each Keep now
  carries a one-time tag; the same tag again is the same payment. Data: trip_expenses.client_key (unique). With no
  answer the phone asks once more by itself. If that fails too it says so truthfully ("Wander didn't hear back, so this
  may or may not have saved. Tap Keep it again when you have signal. It won't be kept twice."). From the moment Keep is
  tapped until Wander answers, the phone keeps the tag for those words (on the phone, so it lasts through closing
  Wander); the same payment typed again — after Cancel, or after reopening — is still one payment. A Keep that hangs
  says after six seconds "Still waiting for Wander to answer. You can keep waiting, or Cancel: if it got through, it
  shows in the list, and typing it again won't keep it twice."; if it lands after Cancel, the same words for ten more
  minutes are that payment, and the late answer no longer closes a pop-up opened since (fresh testers). SPEC §Budget.
- Budget: "✓ Kept: …" says what it was for, as Removed and Put back do.
- Maybes: on its own day, a maybe put on that day was folded under "Earlier"; it now stays in view, badged Today.
- Budget: the Log and "✓ Removed: …" now say what a payment was for ("Removed ¥2,000 (Ken & Larisa): coffee at the
  station · Larisa") — which ¥2,000 to put back wasn't clear (fresh tester).
- Maybes: a maybe put on a day showed "Today" beside "Sat, Oct 17 · added by Julie"; the day it's on now decides.
- Budget: payments matched to their couple by its people, not the spelling of its name — "Julie & Andy" and "Andy & Julie"
  are the same couple. Before, a new copy of her Guide naming them the other way round would have dropped every payment
  kept under the old spelling from the sums, unseen. The couples are also read from her Guide in a fixed order, and if a
  copy named fewer than two, the couples already in the Budget still count.
- Budget header: "Plus ¥6,790 paid for one couple alone" when it was ¥4,810 for Ken & Larisa and ¥1,980 for Julie & Andy;
  now each couple is named.
- Maybes: × asked "Remove this maybe? / Take this off…" at the foot of the card, often behind the tab bar ("nothing
  happens"). × now takes it off at once and "Put it back" stands in the card's place.
- Maybes: a maybe taken off the list stayed on the day it had been put on. It now leaves that day's page (and Scout's
  view of the day) while it's off, and comes back with Put it back. The line says so: "… is off Tokyo's list and off
  Sat, Oct 17 for everyone."

### Added
- Budget **Put it back**: beside "✓ Removed: …" right after a removal (12 seconds), and on the removal's line in the Log —
  for whoever kept it, or Ken. It counts again exactly as before; the Log says "Put back ¥… · who". Scout:
  put_back_expense (money_so_far now lists what's taken away). SPEC §Budget.

### Changed
- Maybes: a maybe or one of her ideas whose every day has passed isn't shown (Ken's rule: "if it is done or out of
  date, you don't show it").
- Phrases: one way in, the bar's 日, now with "Phrases" under it (a size smaller than the tabs' labels; it fits at 375,
  393, 402 and 440 pt). The labelled "日 Phrases" at the top of Next is gone (Ken: "Why are phrases now in the upper left
  and bottom right?"). How Wander works and Scout say where it is. SPEC §10.

## 2026-10-16 (Friday, 9:30 AM in Japan) — What's now stands out on today's page

Ken (Oct 16): "In any daily itinerary, be sensitive to current timing in particular way: imagine the full orientation being
visible but the 'now' gets more prominence, e.g., 1-2 point larger text, color change to deep maroon, picture evident,
other best practice. So that exact page changes as hours pass on what pops out. What pops is likely identical or closely
related to what the 'next' button does."

### Changed
- Today's day page: the line that's under way — or, until it starts, your next — stands out: a deep maroon edge and wash,
  its title two points larger in maroon, and above it "Now" or "Next · in 50 min". The rest of the day stays in view;
  lines already past stay quieter. It moves down the day as the hours pass, on the same line Next reckons, on a day of
  her plan and on any other (a Backroads day: the 8:30 meeting). A day that isn't today has none. SPEC §3.4.
- Under the day's summary, today: "Now · Kappabashi Dougu Street ↓" (or "Next · in 50 min …"), a tap down to that line —
  it was one or two screens below the summary, so on opening "now" couldn't be seen (stability walk). It reads the line
  marked on the page, so it never names another.
- The line that stands out shows its place's two checked photos side by side; every other line one (Ken: "one or two
  more visuals to that prominent now that then go back to only one picture when the next itinerary item becomes the
  prominent now").
- A meal under way counts as now, as Next reckons it (two hours from its booking's start): at 7:30 PM on Oct 16 Next said
  "Now · Une Immersion" while the day page marked nothing, her 7 PM line having no end time (stability walk).
- **Next is just next** (Ken: "Next should just be next. It shouldn't then scroll to the equivalent of what is on the
  today tab"): what's now and what's next — each with its place's photos (one or two) and Maps, Next with Walk / Train /
  Taxi — then "All of today ›". The day's list, photos and notes are Today's. Tapping "Now, in Larisa's plan · …" opens
  Today at that line. SPEC §2.

### Fixed (stability walk 2)
- Next at dinner: "Now · Une Immersion, booked for 7:00 PM" had no photo and no Maps; the only Maps on Next went to the
  hotel. It now shows the restaurant's photos and "Maps ↗" to its address, and tapping it opens Today at that line.
- "Now · … ↓" scrolled the line to the very top, with "NOW" and its time behind the sticky header; it now stops clear of it.
- Budget: "Plus ¥5,000 paid for one couple alone" now names the couple ("…for Ken & Larisa alone") when every such
  entry is for the same one. SPEC §Budget.

## 2026-10-16 (Friday morning in Japan) — Today in the bar, where Maybes was

Ken (Oct 16): "Replace 'maybes' with 'full itinerary for today.'"

### Changed
- The bottom bar's second tab is **Today** (a calendar): today's full day page — her plan by the clock with each place's
  photo, its map, and Play the day. It opens the traveler's own today (Japan's date once landed, from the Guide the phone
  keeps; Japan's date on a first open), and is lit there. "Today" fits the bar; "Full itinerary for today" doesn't.
- **Maybes** moved to a row on Home, "Maybes ›", under "To-dos and deadlines" — the group's maybes and her ideas stay one
  tap away; Home's line about something new on Maybes stays. The tour, "How Wander works", and Scout's and the ideas
  helper's picture of the app say so. SPEC §1 (the bar), §5 (Maybes).

## 2026-10-16 (Friday, 9 AM in Japan) — Budget: who it's for; Log

Ken (Oct 16): "Change 'history' to 'Log' and put at bottom (it's an admin log, only for me or moments of audit)". And:
"Julie pays 5000 yen for jacket to help Larisa but that jacket is not split, it is just Larisa's… Split should probably
be an option generally also with split as default and either as full owner of item."

### Added
- Budget: each entry says who it's for — "Shared, half each" (chosen unless changed), or one couple alone. Paid by one
  couple for the other alone, the other couple owes it back in full; paid for one's own couple alone, nothing is owed.
  Who pays next and "To be even now" count both. "¥… shared so far" counts only what's shared; "Plus ¥… paid for one
  couple alone." says the rest. The row says "For Ken & Larisa alone · Ken & Larisa owe it back in full". The Log says
  who it was for, and any change of it. Scout: "the jacket was just Larisa's" keeps or changes it that way. New column
  trip_expenses.for_party. SPEC §9.9.

### Changed
- Budget's "History" is "Log", a quiet link at the foot of the page.

## 2026-10-16 (Friday morning in Japan) — More of the trip in pictures; Play moves on by itself

Ken (Oct 16): "integrated photos are great but don't change the essence of a wall of text that much… 50-100% further";
"Play day should auto advance after a few seconds… Maybe even first change after only 2-3 seconds to teach users about
auto before they tap then slow to 5 seconds for rest. Try hard to have targeted accurate photos… Increase to two photos
in play day only (not on main page)."

### Added
- Home: each of today's lines of her plan shows its place's photo, small at the line's end — the same checked photo the
  day's screen shows (one reading of where a line is, now in lib/linePlaces.ts for both). Next's box shows its place's
  photo on its right side, fading into the box; the box keeps its size, so nothing below moves as photos come
  (measured: the photos add 0.003 to Home's layout shift).
- Play moves on by itself: the first time after 3 seconds, then every 4 (5 at first; Ken: "with more photos, auto
  advance can be 1-2 seconds faster"); the bar at the top fills for the moment showing.
  It waits while a finger rests on the screen, while a moment's full words or its photos are open, and while Wander isn't
  on screen; it stops at "That's the day." and never goes into the next day by itself.
- Play: a second photo of a place, where one shows it too, fades in halfway through its moment, with its own credit.
  Wander's photo check now looks at a place's first five photos and names the best and a second, clearly different
  view (never a menu, sign, receipt, car park or selfie); places checked before today are looked at once more, in the
  background, from the photos already found. A place whose first photo changes gets a new address, so no phone keeps
  the old one under the new credit. SPEC §3.7.

### Known, not this batch
- Home's own layout shift on a first open is over 0.1 on the test copy (0.12–0.17), with or without photos: the "Opening
  today…" card and what's below it moving as the card fills. To look at separately.

## 2026-10-16 (Friday, 8:30 AM in Japan) — Budget rows; one request where there were ten

### Changed
- Budget: each entry you may change is itself the button, with a "›" (no "Change" under every entry — Ken: "Changing
  every button wastes a lot of space"). The couples' totals line is gone; who pays next and "To be even now…" stay (Ken:
  "why do we need to repeat the information?"). SPEC §9.9.
- The same read asked for by several parts of a screen at once is one request, its answer shared for 3 seconds (each
  part gets its own copy); any save, and any change pushed from the server, forgets them. Home asked for the trip 10
  times; now once per screen. Measured on the test copy: 124 → 104 requests for the same walk (most of the rest are
  photos the phone keeps for a week).

## 2026-10-16 (Friday morning in Japan) — Budget: Change, History, and the add pop-up

Ken (Oct 16): "Ok to not require the reason to pay (stay optional). But then add edit button to budget page to go back
and add reason, change total, or change payer with a pop up, or remove item, or from that page add an entry including the
pop up and keyboard for money with tiny pop up for dollars yen (yen default). Add log history button adding date, person,
action only for checking details later." And: "Please add the individuals user who made change at end of record."

### Added
- Budget: "Change" on each entry (for whoever kept it, and Ken) opens a pop-up with the couple who paid, the amount, ¥ or
  $, and what it was for, plus "Remove this entry" (asked first; removing hides it, never deletes). "+ Add entry" opens
  the same pop-up with the cursor in the amount (the number keyboard) and ¥ chosen. The pop-up sits near the top of the
  screen, above where an iPhone's keyboard comes up.
- Budget: "History" lists every add, change and removal, newest first: the day and time, what was done ("Changed ¥2,150 →
  $15"), and who did it at the end of the line. Removals from before History began (Oct 16) say who wasn't recorded.
  New table trip_expense_logs. SPEC §9.9.
- Scout: "the taiyaki was actually ¥1,800" changes that entry (change_expense), with the same people allowed; it never
  adds a second one. Asked on the test copy: it changed the entry, History says Julie.

### Fixed
- Sign-out's question sat under the bottom bar (its buttons hidden when it also warned of an unsaved note; user-ken4): the
  page leaves room for the bar and the question scrolls clear of it. It also says when words waiting in Scout's box go.
- The bar's 日 lines up with the tabs' icons (centred, it was cut off when the bar slides down on scroll).
- Oct 18's check-out reasoning puts her line's name in quotes ("“Meet Backroads, Courtyard by Marriott Tokyo Station” is
  at 8:30 AM, so check out before then"); the comma in the name read as garbled grammar.

## 2026-10-16 (Friday morning in Japan) — Round Four of the Real-User Runs

### Added
- A Backroads day's page says what their itinerary holds, under "The day with Backroads": "Backroads' general itinerary
  for their Day 1: Shuttle to Kanuma (2 hours) · Lunch at a local café · Up the valley toward Nikko (13 or 26 miles by
  bike) · … Play the day shows each, in their words." The ride and the stops were only inside Play ("If I'd only
  scrolled the day page I'd think Sunday was a bus day" — user-andy4). Her own check-out, meeting and dinner stay in
  the list below. SPEC §3.7.

### Fixed
- Scout named Julie's oldest note of the day as "the most recent one" when she asked whether Andy could see the note
  she'd just dictated, and offered to share it (user-julie4) — a yes could have put the wrong private note before the
  trip. Scout's list of notes now says it's newest first and when each was kept, to the minute; it never offers to
  share or un-share a kept note (that's the note's own "Share with the trip" on the Notes tab, which it points to) and
  never keeps one again to share it. Asked again on the test copy: it names the tea-house note, says it's just hers,
  and on "share it with everyone" says where to do it; nothing was shared.
- Scout's Sources: "Ken and Larisa still pay next" is listed as from the trip's Budget (a sentence with no figure was
  "Scout's own words").
- A saved note says "Saved — 23 words, every one kept" (it called typed words "spoken" when the note began spoken).
- The Safety tips card waits for the person's own setting before showing (on a fresh phone it flashed up and went for
  someone who'd put it away on another phone).
- The server's limit on requests per address goes from 200 to 1,000 a minute. One person browsing makes about 250 a
  minute (photos count), and four phones on one hotel Wi-Fi share an address; past the limit, pages lose pieces with
  "Too Many Requests" (seen on the test copy, user-julie4). Scout's own limit is unchanged.
- Play: her dinner line says it's hers ("Your Guide: “Ritz Carlton - Japanese Dinner”", "Larisa's Guide: …" to the
  others), as the 8:30 meeting's does; its title was her words with only Backroads' quote under it (user-larisa4).

## 2026-10-16 (Friday, early morning in Japan) — Round Three of the Real-User Runs

### Fixed
- Play on Oct 18: the check-out moment said only "The hotel's own check-out time is 12:00 PM", which a skimmer read as his
  deadline on the morning they meet Backroads at 8:30 (user-andy3). It now says first "Check out in time for Meet
  Backroads… at 8:30 AM", as the day's card does, then the hotel's own time.
- The end of Play says "Play tomorrow" only when the day played is today; from another day, "Play the next day".
- A booking's looser dress code says so: "Her booking at … gives a looser dress code: “…”" (it said "asks less").
- Photos from the day, with none yet: the line under "Share the ones I add" follows the box ("The ones you add are
  shared with the trip" / "…are just yours"); it said "Just yours unless you share them" with the box ticked.
- Ideas for Wander: Scout's helper knows Next already shows Google's opening hours and the morning's check-out, so it
  doesn't suggest them.
- Talking into a note or Scout's box: words typed while Wander listens were wiped by the next spoken phrase (Julie typed
  " (Yanaka)" between two phrases; user-julie3). What's typed or corrected while listening now stays, and only what's
  said after joins it; after the iPhone's pause, one period between, never two.
- Budget: "+ Add entry" opened before the two couples had loaded showed no couples and said "Which couple paid?" with no
  way to answer. It says "Getting the two couples…" and Keep it waits; choosing a couple clears that line.
- The city's arrival photo no longer appears over a day someone has already scrolled down (it's drawn when the day's
  data comes, which can be seconds after the day opens).
- Oct 18's check-out, on the day's list, its card, Home and Play: "Meet Backroads, Courtyard by Marriott Tokyo Station
  is at 8:30 AM, so check out before then. The hotel's own time is 12:00 PM." Wander's reasoning reads as reasoning,
  and her screenshot's source line sits under her own 12:00 (user-larisa3: "Check out in time for…" over "From your
  Guide — a screenshot…" read as her sentence). Replaces this morning's "Check out in time for…" wording.
- Play: a Backroads moment whose title names two sentences' worth quotes both ("An art tour, the onsen or a massage"
  had only the onsen sentence; 4 of 39 moments change). Her 8:30 meeting and her dinner have their Maps link in Play,
  as on the day's page.
- Scout: says "your Dining Resos tab" to Larisa, never "her" (Wander's own notes say "her … tab"); offers to take a
  payment away only when the asker may (it offered Larisa to remove Andy's repeats, then couldn't).
- Signing out clears Home's kept copy (it named the last person as the trip's owner and planner until the next sign-in)
  and the phrase card's list (user-ken3). With an unsaved note on the phone, sign-out asks first: "Your unsaved note
  on this phone goes too. To keep it, save it in Notes first." The question comes into view (Ken's Settings grows a
  second after opening and had pushed it off-screen). The note about getting back in says which link: "the one you
  first opened Wander with".
- The photo viewer says "Keeping it just for you…" / "Sharing it with the trip…" while that's on its way (on a slow
  signal the tap showed nothing for seconds). Play's countdown says "in 1 hr 15 min", as Next does ("1 h" before).
  "How Wander works" says "AJ for Julie & Andy", as Budget names them.

## 2026-10-16 (Friday, before dawn in Japan) — Round Two of the Real-User Runs

### Fixed
- "Play tomorrow" into a Backroads day opened the day without playing (user-andy2, Oct 17 → 18 and 18 → 19). The day
  drew once with the day before's answer about Backroads' moments, opened a Play of her lines, and lost it when its own
  answer came. The answer now knows which day it's for.
- The photo viewer: a tap on a photo's right side goes on, its left goes back, as in Play (only a swipe worked); its
  words sit on a darker backing. The story shows a photo's caption under it. Play says a booking once (not "7:00 PM ·
  Une Immersion" again under her 7:00 dinner line). Ideas: "Cancel" (not "Not now", which is also a status), and no
  double space after "I wish Wander…".
- The phrase card opened without the trip's added phrases — Julie's allergy line came ~5 s later, with nothing to say it
  was coming, and never with no signal (user-julie2). The server asked who may remove each phrase one by one (18 round
  trips); it asks once now. The phone keeps a copy, so the card opens with them, with or without signal.
- A day's line opened from Home could still slip under the header as the day filled in above it: it's placed again for
  the first second and a half. Its card offers "Directions ↗" (Google Maps, from where you are) beside the map search
  for today and days ahead.
- The story marks your own private notes "You · just you" (Julie: "Did my private note just go into everyone's
  story?" — it shows only in yours). Asking whether someone is the trip's organizer no longer logs an error on every
  other phone. The city's arrival photo says "Tap to continue". Note day links 44 points.
- Scout's Sources: figures that come from Wander's own records — the trip's Budget, the trip's photos, your notes —
  are listed under "From Wander's own records" with which one, not as "Scout's own words — no source" (user-larisa2: a
  correct Budget answer looked unsupported).
- Day summaries for Oct 16–29 rewritten and read before publishing: no stock phrases ("anchors the evening" was on
  three days), "her Guide" not "her lines", Oct 17 names both Robuchon restaurants (her plan's Gastronomy, her booking's
  La Table on the first floor). The summary instructions now ask for the thing itself (user-larisa2).
- Play: a Backroads moment quotes the sentence its title names ("Lake Yumoto and Yudaki Falls" showed Backroads'
  opening line about Lake Chuzenji); a check-out moment says the hotel's own time. The to-dos page is titled "To-dos
  and deadlines", as Home names it; a free-cancellation window reads "Booked under" and the name on the booking, not
  "Ken's to do" over "Nothing to do unless plans change". "Got it" on the safety note is 44 points.
- Signing out left the phone's note of whether the last person was the trip's organizer, so Ken, signing in after Andy,
  was told by Scout to start a message "Tell Ken" (user-ken2). Sign-out clears it with the rest.
- The tour (Show me around) and the Guide page's help name Budget and Google Maps (they still said Actions and Apple
  Maps). Settings' rail sheet line gives the later of when Wander last read it and last looked; the sign-out note
  mentions Face ID only on a phone where it's set up. Profile links to Settings for signing out, and opens "What Scout
  knows about you." (no "to help make every trip better").
- Play on a Backroads day: the cover says "Backroads' general itinerary for their Day 1, with Larisa's Guide's own
  lines…" (no page number; to Andy and Julie it names whose Guide, "Your Guide" to Larisa). "Less" under Backroads'
  words is 44 points wide. Settings' switches are 44 points tall to the touch. "Check out in time for … at 8:30 AM"
  drops "(Wander's reading of the day)".

## 2026-10-16 (Friday, early morning in Japan) — What Four Real-User Runs Found

Ken (Oct 16): "create 4 serial fresh agents to emulate your real users… Fix bugs and confusion reports. Deploy. Rerun
tests until clean." Scenarios and measures written first: trip-data/users4-rubric-2026-10-16.md.

### Fixed
- Scout said "I can't see any photos from Andy for last night" while his shared, captioned photo was there (Julie's
  run). Scout now reads the photos the asker can see — who, when, the caption, shared or just theirs — never anyone's
  private one, and never says there are none when there are.
- Sharing one photo in the viewer turned "Share with the trip" on for everything added after (Andy's run). The box when
  adding is the only thing that sets it now; it reads "Share the ones I add" (beside someone's photo, "Share with the
  trip" read as if it might share what's already there).
- Nothing led to the trip's story during the trip (Julie and Larisa got stuck): Home has "The story so far ›".
- Backroads' words under her own lines ("Ritz Carlton - Japanese Dinner" over "This evening we meet…") read as hers:
  there they're introduced as "Backroads: “…”", and every Backroads moment has "Backroads' words" (one long sentence was
  cut at three lines with no way to read it). Play's cover note says it's about the moments that follow, not the summary
  above it. The Oct 18 meeting moment no longer shows the Courtyard's guest room (they meet in its lobby).
- "Check out before 8:30 AM" sat under her screenshot's source as if hers (it says 12:00): now "Check out in time for
  Meet Backroads at 8:30 AM (Wander's reading of the day)".
- Play's "tabs differ" for Robuchon only quoted the other name at the same time; it now says the plan line's note, which
  names the booking ("her Dining Resos tab's booking at this time is 'LeTable de Joel Robuchon - 1F'").
- Next now says Google's hours when her time runs past them ("…start at 10 AM" for a 9:00 Kappabashi), as the list does.
- Tapping a line on Home (tonight's dinner) no longer opens the day under the city's full-screen photo, and lands with
  the line's name and time below the header, not under it.
- The AJ/KL badge also sits beside "Who pays next" on Home and the budget page, so the bar's letters explain themselves.
- To-dos: "Nothing named for you right now", and a list under a heading of hers reads "Under “LT actions” in your Actions
  tab"; opened, its items no longer say where they're from three more times. Budget's confirm: "Remove it" / "Keep it".
- "Time from the Tokyo Day 2 Kappabashi & Akihab tab." → "The time is from her Tokyo Day 2 Kappabashi… tab."
- Scout's replies to ideas: a current picture of Wander (Budget, photos, Play every day), each source named right
  (Backroads' words aren't hers), and never suggesting what's already there. Phrase-card choices are told apart in plain
  words, not labels. Taps under 44 points made 44.

## 2026-10-16 (Friday, just after midnight in Japan) — Dictation Keeps Going, the Screen Stays On

### Fixed
- Ken (Oct 15): "When dictating a note or message to scout, wander seems to time out and iPhone sleeps while
  dictating." Two causes. An iPhone ends a recording on its own after a pause; Wander's mic then stopped, and let the
  screen sleep. Now it starts listening again for the same person, the words heard so far kept in front, until they tap
  stop (never when they've stopped, when Wander is in the background, or when the phone keeps ending it at once).
  "I'm not hearing any words yet" shows only before the first word. And the keyboard's own microphone is the iPhone's,
  so Wander wasn't told anyone was dictating: now the screen stays on while any box in Wander has the cursor and words
  are coming, and may sleep again when the box is left or after 3 minutes with no new words. Where: Scout's mic, Notes'
  Talk, and every text box.

## 2026-10-15 (Thursday, midnight in Japan) — Map Links Open Google Maps

### Changed
- Every map link Wander makes opens Google Maps: "Maps ↗" on a day's lines, Next's "Find in Maps" and its Walk / Train /
  Taxi, the airport-to-hotel route, Play's Maps, and Scout's directions (now one button, Google Maps). Larisa's own
  Apple Maps search links in her cells open the same search in Google Maps; her Apple Maps guides (maps she made in
  Apple Maps) stay Apple's. Ken (Oct 15): "Apple Maps sent us to the wrong place for dinner tonight. Putting address
  into Google Maps went to right place. Please have the map link go to Google Maps if you can." Wander's links for that
  dinner all held her booking's own address ("Yakiniku Yazawa Tokyo, Toin Yaesu Building 1F, 5-10 Yaesu 1-chome…");
  Apple Maps read it as somewhere else. (Her day plan called it "Yakiniku Yazawa Tokyo (Ginza)"; the booking is in Yaesu,
  by Tokyo Station. Every other booked meal ahead was checked: each address agrees with her plan's area.) Place photos
  are found by the same words as before. SPEC UPDATE NEEDED (maps, directions).

## 2026-10-15 (Thursday, near midnight in Japan) — Budget in the Bar, the Total on Home, Read Aloud on iPhone

### Changed
- Budget takes Actions' place in the bottom bar. Ken (Oct 15): "There seems to be no need for the [Actions] button in
  the main navigation menu, so you can replace that with budget". Larisa's to-dos and the Guide's deadlines (what
  Actions opened) open from a quiet "To-dos and deadlines ›" line on Home. Budget's icon says who pays next: "KL" in
  purple when Ken & Larisa do, "AJ" in orange when Andy & Julie do (Ken: "So it will toggle based on who is the next to
  pay, so it can be done in a glance or tapped to see the total. Make the KL version purple. And AJ version orange.");
  a coin when they're even or nothing is kept. A payment kept or taken away, on the page or through Scout, tells every
  open screen quietly, so the icon turns at once on all four phones.
- Home's money line shows the total. Ken: "a button on the homepage that actually shows the total and then has all the
  detail below it. It should show exactly what the item is if it is included in the entry, but can be blank if the topic
  is never added." It reads "Budget: ¥48,200 shared so far", with who pays next under it; a tap opens the budget page.
- The budget page leads with the total ("¥48,200 shared so far"), what each couple paid, who pays next and what would
  make them even; then "+ Add entry", always there (Ken: "should always be another button that says add entry for another
  one to be added then"), which opens the form; then every entry, with what it was for when someone said and nothing
  when no one did. Where: bottom bar → Budget (/money); Home. Scout's map of the app says so. SPEC UPDATE NEEDED (money,
  bottom bar).

### Fixed
- "Read aloud" under Scout's answers said nothing on Ken's iPhone (volume up, no headphones). Safari drops speech asked
  for in the same moment as a stop, and can let go of words still waiting; the voice now starts a moment after the stop
  and each part is held until it's said. On an iPhone the voice also follows silent mode, which Safari can't report, so
  while it reads a line says: "Hear nothing? Silent mode on your iPhone silences this voice too."

## 2026-10-15 (Thursday, late night in Japan) — Play the Day, Every Day

### Added
- Every day of the trip plays. Ken (Oct 15), on Oct 18: "Looking ahead I don't see it every day… I wanted to see Nikko
  and looked ahead at this backroads day. But nothing." Then: "Create play every day. Use what you have from the
  backroads content." Play had needed two or more of her timed plan lines, so Oct 18–24 and the travel days had none.
  The Backroads days now play Backroads' own itinerary (the PDF Ken gave Wander, dated May 7 2026), moment by moment in
  its order: their words exactly ("Backroads' words" opens the whole passage), a short title, the length they give
  ("13 or 26 miles by bike", "1 hour"), and a photo of each place they name (Nikko Toshogu, Cedar Avenue, the
  Kinugawa River, Senjogahara, Toi Beach, the Jogasaki Coast, Nanzen-ji…), each checked by AI to be that place. Her
  Guide's own lines are those moments where she has them: the 8:30 meeting, each dinner (her names for them), the
  check-outs, Saryo Tesshin at 7 PM. Times only where she gives one; Backroads gives lengths. The cover says it's
  Backroads' general itinerary and details can differ for our departure. Two photos stand in for places Backroads
  describes without naming (Ikadaba's wasabi fields; Mount Daimonji, whose lookout Backroads' website names) and say
  so beside the credit. Larisa's Guide agrees with this PDF on hotels and dinners; Backroads' current web page differs
  (another departure) and isn't used. Any other day without her timed plan plays her lines in the day list's order.
  "Play tomorrow" now goes straight into any next day's Play. Where: day pages ("The day with Backroads" / "The day in
  her Guide" ▶ Play the day). Data: the moments sit with Backroads' itinerary in the trip's documents (server:
  GET /api/guide/day-moments/:tripId/:date). SPEC UPDATE NEEDED (Play).

### Changed
- Play's cover says the day's span ("8:30 AM to 6:30 PM") only when its first and last moments have times.

### Fixed
- Your own photos: on a weak signal, the phone showed its saved copy of a photo its taker had just made private while
  it waited for the server (tourist77). It now waits; the saved copy is only for no signal at all. And a day, Play or
  the story left open now drops a photo within seconds when its taker makes it private or deletes it (a quiet live
  update to everyone's open screens, and a fresh look whenever Wander comes back to the front; tourist77). The story's
  whole-trip list is no longer kept on the phone (nothing read it, and it kept copies of taken-back photos); a photo
  still arriving at sign-out is cleared again once it lands; the story's lead photo shows whole over a soft blur of
  itself (a tall photo lost 40% of itself), and its VoiceOver label says whose it is and whether it's just yours.
  tourist78: on a weak signal, Play showed "Ken's photo · 9:00 PM" and its caption over black, from the phone's old
  list, after Ken had made it private. Someone else's photo now shows (in Play, the day's strip and the story) only once
  its picture has come; a list that didn't arrive is asked for again 15 seconds later. Play on a Backroads day waits for
  Backroads' moments before offering itself (it flashed her lines alone on a slow load); the Oct 18 check-out no longer
  says "This afternoon" (it took the hotel's noon deadline as its time); Backroads' words keep their "…" where a sentence
  runs on; two split moments are one each ("Lake Yumoto and Yudaki Falls"; "Nanzen-ji and Eikando, or a climb to a
  viewpoint", so the choice reads as a choice).

## 2026-10-15 (Thursday night in Japan) — Your Own Photos, on the Day You Took Them

### Added
- Each of the four keeps their own photos on the trip day they took them. Ken (Oct 15): "Yes. Value, delight. Not
  gimmicks. Go", to: "let each of you add your own photos to a day… private by default, with a choice to share with the
  trip". Every photo in Wander had come from Google or the city; Andy comes from Instagram. On a day page (today or
  earlier), "Photos from the day": "+ Add photos" (several at once), each filed under the day its own clock says it was
  taken (else the day you're on), shrunk on the phone; "Share with the trip" starts where you left it last time. A tap
  shows them full screen, a swipe for the next; on your own: share, "Keep it just for me", or delete (for real). Shared
  photos play in "Play the day" right after the moment they were taken in ("Next · 1:42 PM / Andy's photo"), whole and
  uncropped, and lead their day in the trip's story. To Scout: send a photo and say "keep this for today" (just yours) or
  "…share it" — a receipt or ticket stays a paper. Nobody else ever sees a photo its taker hasn't shared. Where: day
  pages, Play the day, /story, Scout (keep_photo, rule 62). Data: trip_photos (a new kind of personal data, Ken's yes).
  "Add a few words" in the viewer gives your own photo a caption, shown under it there and in Play.
- Kept private before it shipped (tourist75 found three gaps on the test copy): the lists the phone keeps are each
  person's own and go at sign-out, so on a shared phone Julie never sees Andy's "just you" photos; each picture link is
  made for one person, and the server checks every time that the photo is still theirs or still shared, so a photo
  made private again or deleted stops showing at once (the phone asks again before showing a saved copy, and the
  service worker drops its copy when the answer is "not there", and never saves the photo lists); the story's
  full-screen viewer follows the live photos, so Delete and "Keep it just for me" show at once. Photos without a clock
  sit after the timed ones everywhere (strip, story, Play); the story's lead photo keeps a portrait's shape; your own
  private ones say "just you" in the story; "one on Oct 14, when it was taken" names the day. tourist76 then found
  one more: Andy's slow list landing after Julie signed in was kept as hers. A list is now tied to the sign-in that
  asked for it, and dropped if someone else is signed in when it lands; the phone's copies of photos no longer in
  your lists go after each fresh list; a picture that's gone hides rather than show a broken tile.
  SPEC UPDATE NEEDED (day screen, Play, story, privacy).

### Fixed
- Signing out while Wander's opening sign-in check was still out brought the person back, half signed in, on "Wander
  can't reach the trip right now" with no way forward but a reload (tourist76). A late answer now counts only while
  the sign-in it asked about is still the phone's. Where: Settings → Sign out.

## 2026-10-15 (Thursday evening in Japan) — Who Pays Next

### Added
- Who pays next — Larisa's idea, through Ken: "one should be able to say to scout it any time that the unit that is Ken
  and Larisa has paid a certain amount of money for something… at the end of the trip… the difference [is] the amount
  that one owes to the other… there should always be a simple button that is something like who pays next and it just
  points to the couple that currently has the smaller total." Ken's answers (Oct 15): shared half and half; "In yen
  (or dollars and you should convert)"; all four see it; "It didn't need to be exact!" Any of the four tells Scout
  ("we paid ¥12,400 for dinner", "Andy just spent 12400", "Larisa got the taxi, $30") or keeps it on the Money page;
  Scout answers "who pays next?" and takes one away when asked. The couples are her Guide's ("Ken & Larisa", "Julie &
  Andy"). Each payment is shared half and half, so the couple that paid less owes the other half the difference. Yen as
  said; dollars kept with that day's yen (the European Central Bank's rate). Taken away only by who kept it or Ken, and
  then hidden, never deleted. Where: Home ("Who pays next: … ›"), /money, Scout (add_expense, remove_expense,
  money_so_far; rule 61). Data: trip_expenses. SPEC UPDATE NEEDED (new: money).

## 2026-10-15 (Thursday night in Japan) — The Story of the Trip

### Fixed
- The trip's story (/story) called every day "A free day" and the trip "0 things done" (a March page that counted
  "experiences", which this trip never had), and nothing in Wander led to it. It's now the days lived, city by city
  under each city's photo: each day in Wander's summary of Larisa's plan, her stops with their photos (or her plan's
  lines in her words, or her Itinerary's lines with their times), the four's own words from Notes exactly, and "Play
  the day" / "Open the day". "The story so far" during the trip, "The story of the trip" after it. No AI writing.
  Whose notes: your own; someone else's only when shared with the trip and its writer said yes to trip stories (the
  note's own choice, else their setting; unanswered is no); never Scout's answers kept in Notes (server: GET
  /api/trip-notes/trip/:tripId/story). Where: Home after the trip ("The story of the trip ›"), and Next after the trip.
- Play's cover gives Larisa Wander's summary in her voice ("your tab"), as the day page does.
- "Google lists … as temporarily closed" (was "closed for now", which read the evening before as "at this hour").
- No sunset line on a moment once the sun is down; "sunset about 5:07 PM" never splits across lines.
  SPEC UPDATE NEEDED (story, Play).

## 2026-10-15 (Thursday evening in Japan) — Play the Day: Rain and Sunset on the Moments They Touch

### Added
- Play the day has no weather band, so the band's own rain hours are said on the moments they touch: "The forecast has
  rain likely 2–6 PM" on the first moment of that span, "One forecast sees showers 9–10 AM" likewise (days up to three
  ahead, from the same forecast as the band); today, only what's still ahead, on the next moment ("… until 6 PM").
- Sunset, worked out on the phone for the day's city: on the cover ("sunset about 5:07 PM") and on the moment the sun
  goes down in ("Sunset about 5:07 PM"). Ken (Oct 15): "the feature or info or view the user would want before they
  realize they want it". Where: day pages → Play the day. SPEC UPDATE NEEDED (Play).

## 2026-10-15 (Thursday evening in Japan) — When a Stop Is Open, Before You Get There

### Added
- A stop whose hours, as Google lists them, don't fit her plan's time says so on its line and in Play the day: "Google
  lists Spiral as opening at 11 AM" (her plan has it at 10:00), "Google lists Espace Louis Vuitton as closed for now",
  "… as closed on Mondays", "… as closing at 4:30 PM" when her time runs a quarter hour or more past it; for a whole
  street or market, "Google's hours for Kappabashi Kitchen Supply Town start at 10 AM" (its listing isn't every shop's);
  only on the line that is the stop itself (not "Taxi to…" or "Finish…"). Also in Play: her map centred in its room, no
  "Getting there" once you're on the train, an open note no longer stops the words scrolling. Ken (Oct 15):
  "the feature or info or view the user would want before they realize they want it". Only for a place Wander has
  already checked is the one her line means (the place of its photo); her plan is never changed; nothing is said when
  her times fit or Google has no hours. Hours come from Google's listing (special days included for the coming week)
  and are looked at again every three days. Where: day pages (her plan's lines), Play the day. Data: place_photos.hours.
  SPEC UPDATE NEEDED (day screen, Play).

## 2026-10-15 (Thursday, late afternoon in Japan) — Play the Day: Her Map Above the Moments Without a Photo

### Changed
- In Play the day, a moment Wander has no sure photo for no longer leaves half the screen empty (fresh checks: 40–50%
  plain brown). Its drawing (a bowl, a gate, a train) sits just above its words. On a Kyoto day, Larisa's own map
  panel for that day fills the upper part, clear, captioned "Larisa's map of the day" ("Your map of the day" to her);
  on other days, a faint pattern of the drawing fades toward the words. Nothing suggests a photo of the stop.
- On board a booked train, its moment leads with the booked times ("1:30 PM → 2:50 PM") and says her plan's time
  beneath ("Larisa's plan: ~12:30–1:00").
- The end of the day has ‹ back to the last moment, as every other screen does.
  Where: day pages → Play the day. SPEC UPDATE NEEDED (Play the day).

## 2026-10-15 (Thursday afternoon in Japan) — Play the Day 2.0; Ideas for Wander, Inviting; Her Kyoto Map by Day; Dictation Kept

### Fixed
- Dictation lost when the screen goes off. Ken (Oct 15): "Larisa was dictating something that started with the phrase,
  ask Ken with a major new feature, and her phone just shut off and lost the dictation, and it was all wasted time.
  There is something about scout getting dictation that needs to keep the phone from turning off". The screen now stays
  on while Wander listens (Scout's mic, Notes' Talk) and may sleep again when listening stops; and Scout's unsent words,
  typed or dictated, are kept on the phone as they come, so a screen that goes off, a reload or an update never loses
  them. They're back in the box the next time Scout opens; sending clears them; each person's are their own. Where:
  Scout, Notes. SPEC UPDATE NEEDED (Scout's panel).

### Added
- Larisa's illustrated Kyoto map, one panel per day, at the top of each Kyoto day (Oct 25–29), under the city band: her
  own panel for that date, whole (a tall panel at most 340 pt, over a soft blur of itself, so the day's summary still
  starts on the first screen), "Larisa's map · tap to see all five days" (Larisa reads "Your map"); a tap opens her
  whole map to pinch and zoom. Each panel was cut once from her picture; her picture is never changed, and if a new
  Guide copy brings a new map, the old cuts stop showing. Those days no longer also offer "See her map from this tab".
  Where: day pages Oct 25–29 (not Next). SPEC UPDATE NEEDED (day screen).

### Changed
- Play the day, 2.0. Ken (Oct 15, at lunch, on the Mitsukoshi moment that had no photo): "Play the day goes here and
  nothing happens. Should something happen or have a button to activate?" and then "treat current as 1.0… make it
  fabulous". Now: a white Next button at the bottom of every moment names what comes next ("Next · 1:30 PM / Ginza
  Premium Retail Walk"), with ‹ for the one before; swipe left and right moves between moments (taps on the picture
  still work; swipe down still closes; nothing moves by itself). A day that isn't under way opens on a cover: the
  date and city over the city's photo, the day in a few sentences, "13 moments · 6:45 AM to 6:30 PM", and Start;
  today it opens on Now with the cover one step back. A moment Wander has no sure photo for is drawn for its kind of
  stop (a bowl for a meal, a gate for a temple, a train, a bed for the hotel…) on a warm colour, never passed off as
  the place. Today each moment says when it is: Now, "in 45 min", Under way (someone else's line), Earlier today.
  "Her full note" shows all her words for the line inside Play. The end of the day offers "Play tomorrow", straight
  into the next day's Play, when the next day has her plan. Photos drift slowly closer and fade into each other; none
  of that under Reduce Motion. After a fresh check: each moment carries the corrections the day's list shows on that
  line, in the list's words (the booked train's arrival, "the sources give two times for this", her tabs differ; never
  a line her Guide marks done), her booking under it (the flight's number), its dress code and the stop her tab names;
  a countdown never picks between two times; the cover uses the day's own first stop photo, her Itinerary line when
  Wander has no summary, and says when her tab has two versions; "Leave …" lines fold in like taxis and "Finish X"
  joins X as "Then:"; moments more than three hours ahead say This morning / This afternoon / This evening; "See
  tomorrow" opens the next day's page when it has no plan of hers; a keyboard stays inside Play; a sideways swipe never
  closes it. Where: day pages with her plan → Play the day. SPEC UPDATE NEEDED (day screen, Play).
- Ideas for Wander, made inviting for Andy (Ken, Oct 15: "make the 'improve wander' function attractive so andy will
  be drawn to offering ideas to improve"): on Home a small amber "Ideas" chip with a sparkle (the Maybes tab is a bulb);
  the page opens with a warm header saying what it's for, a large "Add a screenshot" tile, ways to begin ("I wish
  Wander…", "This confused me:", "More of this:", "This looks off:"), and how to take a screenshot on iPhone; ideas
  show their screenshots as the phone screens they are; Scout's and Claude's answers sit in reply bubbles; where every
  idea stands reads as New / Talking / Planned / Built counts that filter the list; a built idea says "✓ In Wander now".
  After a fresh check as Andy: once there are ideas, they lead the page and the box for a new one is one bar ("+ A new
  idea"); after Post the new idea scrolls into view, with "Scout is reading it…" and then Scout's answer; a status that
  moves is said on the idea ("Ken marked it Built"), counts as new for the other member (Home's dot, "new" on the
  card) and brings the idea to the top; "✓ In Wander now, from your idea" on the author's own; Scout answers in two or
  three sentences without markdown, and calls the same person's earlier idea "you posted this"; an example idea and
  answer on the empty page; "I loved this:" among the ways to begin; the Home chip reads "Wander ideas"; Back from
  Ideas opened on its own goes Home. Where: Home (Ken and Andy only), Ideas for Wander. SPEC UPDATE NEEDED (Ideas for
  Wander).

## 2026-10-15 (Thursday, afternoon in Japan) — The Day as Moments; Play the Day

### Added
- Her plan's stops are led by photos of each exact place: under the stop's name, a 16:9 photo from Google's listing
  of the very place its Maps button searches, kept only when a check reads her line (and the stop her tab names) and
  Google's place and says they're the same place; trains, walks and "refresh at the hotel" stay compact text rows. A
  tap opens that place's photos full screen (swipe across, the time, name and Maps pinned below). Ken (Oct 15): "simply
  adding a photo on each day page does not seem to fulfill Andy's social media vision of a visual flow… It might be an
  option when you see a picture to see more pictures". The time column stays on the left; nothing of her plan moves
  or is reordered. Where: day pages with her plan. Table place_photos; GET/POST /api/place-photos. SPEC UPDATE NEEDED.
- "Play the day": the same moments full screen, one per screen, in her order — the photo, the time, the name, a line
  of her note, a train's booking, Maps, "6 photos". Tap right for the next, left for the one before; it never moves
  on by itself; ✕, Back or a swipe down closes it. Today it opens on the moment you're in; it ends on "That's the day."
  Her travel lines (taxi, transfer, return) fold into the moment they lead to as "Getting there: 9:15 AM · Taxi back
  to Shiraume" (nothing dropped, her order kept); a small photo shows whole over a blur of itself.
  Ken: "'Play the day' feels right". Where: "▶ Play the day" beside "Larisa's plan for the day". SPEC UPDATE NEEDED.

## 2026-10-15 (Thursday, 10:25 AM in Japan) — The City's Photo on Every Day; "Wander idea:"

### Added
- Each day's city band (the city's name, the forecast, "Send this day") now sits on the city's photo, with the words
  in white and the photographer credited ("Meiji Jingu · Photo: …"). Andy loved the opening photo and wanted more of
  it; Ken: "Do it… the look was beautiful". The band keeps its height, so nothing below moves; until the photo is ready,
  or with no signal, the band is as before. Same photo as the arrival, already chosen for the season. Where: day pages
  (cities in Japan). "Wander in pictures", idea 1. SPEC UPDATE NEEDED.
- "Wander idea: …" to Scout posts to Ideas for Wander (Ken and Andy; Ken, Oct 15: think whether the entry is "as
  smooth as it can be") — two taps and your words from any screen, the screen and any pasted screenshot going along.
  "Any ideas for dinner?" stays a question. Where: Scout (rule 60).

## 2026-10-15 (Thursday, 10:10 AM in Japan) — Ideas for Wander, Polished

### Fixed
- On Ideas for Wander the bottom bar marked Maybes as the screen you're on ("/ideas-for-wander" began with Maybes'
  "/ideas") and hid the Maybes dot (verify62). Where: the bottom bar.
- What's new since you last looked is marked "new"; every button is at least 44 pt; choosing seven screenshots says
  six is the most; the header scrolls away; Claude's replies are signed "Claude, who builds Wander with Ken". Scout
  says where a repeated idea stands ("already planned") and asks one question about a bug report. Where: Ideas for
  Wander.

## 2026-10-15 (Thursday, 9:45 AM in Japan) — Ideas for Wander; Updates Wait for Unsent Words

### Added
- Ideas for Wander: Ken and Andy's place for screenshots and ideas to make Wander better, apart from the trip. Ken
  (Oct 15): "a place used most by andy and me to place screenshots and ideas to improve wander… Should not get in the
  way of travel flow. Product focused only. With all inputs durable and optimized to support planning. So ideally you
  or Scott are a participant" and "it should be easy and evident for Andy and me without conflicting with daily
  reference use". Each idea keeps its words exactly, up to six screenshots, the screen it came from, replies, and a
  status (New, Talking, Planned, Built, Not now) with filters. Scout answers each new idea in about ten seconds ("I
  get the goal… What about…?"), reading only Wander's features and the idea list (about 2 cents a reply); Claude,
  Wander's engineer, answers in its working sessions and moves statuses. Words being written are kept as a draft.
  Where: "Ideas" at the top of Home (members only, a dot when something's new) and a row in Settings; Scout ("For
  Ideas for Wander: …", rule 60, tool add_wander_idea). Tables wander_ideas, wander_idea_pictures,
  wander_idea_members. Tell Ken stays Ken's alone. SPEC UPDATE NEEDED.

### Fixed
- A new version of Wander reloaded the page the moment it arrived, even while someone was typing to Scout (whose box
  keeps no draft). It now waits until no box on the screen holds unsent words. Where: everywhere (UpdatePrompt).

## 2026-10-15 (Thursday, 10:00 AM in Japan) — Scout Stays Ready for Less; Scout's Weekdays

### Changed
- Scout's reading (its instructions, tools, her Guide and Ken's rail sheet, ~197,000 tokens) is kept in Anthropic's
  cache between questions: after any question, a one-token request every 55 minutes for the next four hours, between
  7 AM and 11 PM in Japan. A question after a quiet hour cost ~$2 (storing it all again); within those hours it's now
  ~$0.10–0.30. Answers are unchanged. Ken (Oct 15): "I want Scout to
  be brilliant, and I want Scout to be cheap… keep good model and better architecture please." Where: the server
  (services/scoutWarm.ts); the log's "Scout keep-warm" lines.

### Fixed
- Scout gave a wrong weekday ("through the night of Fri, Oct 17" — a Saturday): every date in Scout's Guide reading
  now carries its weekday, so Scout copies it instead of working it out. Where: Scout.
- Home's "Guide, tab by tab": under her Tokyo day tabs' map picture, "The dates in this picture are from an earlier
  plan. Her text in this tab is the plan Wander follows." (verify61). Where: Home.
- Home's calendar: with Google's maps unreachable, each day's small map hides instead of showing a broken-picture
  mark (verify61). Where: Home.

## 2026-10-15 (Thursday, 9:00 AM in Japan) — Her Old Tokyo Map Steps Aside; Morning Weather; Home Without Google's Map

### Changed
- Her Tokyo day tabs (Day 1 Ginza, Day 2 Kappabashi, Day 3 Omotesando) open with one illustrated map labelled with the
  old dates ("Day 1 – Tue, Oct 13"); the text under it is her plan. Ken (Oct 15): "The map is old and should not be the
  target. Text under is correct". When Wander's reading says a picture dates the day differently, the day page no longer
  offers "See her map from this tab" or "(a picture in her tab shows another)", and Scout isn't handed that note; asked
  about the picture, Scout says it's her earlier plan. Where: day pages Oct 15–17; Scout.

### Fixed
- No weather anywhere in Wander from midnight to 9 AM Japan time: the forecast service counts its 16 days from the
  date in UTC and refused the whole request. Wander now asks for 15 days. Where: Home, day pages, Scout, packing.
- Home's map when Google won't load it (Andy, Oct 15 morning: an error where the map goes): Home now opens at the
  trip's name without the map, and the phone tells Wander's server why. Where: Home.

## 2026-10-14 (Wednesday, 10:00 PM in Japan) — Tell Ken

### Added
- "Tell Ken": Larisa, Andy or Julie say or type "Tell Ken…" to Scout, and Scout passes their words to Ken exactly, with
  their name, the time, the screen they were on and any picture they attached. Ken (Oct 14): "if they would like a
  feature added to wander or anything about the way wander works is confusing, they can speak or type at that moment
  what they want and it will become a message to Ken to try to fix. It cannot be a nuisance, and it should be very
  easy". Scout sends only on a clear "Tell Ken" or a yes to its offer ("Want me to pass that to Ken, word for word?"),
  and never a personal message. Ken's phone buzzes ("Julie, about Wander") when it allows Scout's buzz. Where: Scout
  (tell_ken tool, rule 59); Settings (tell_ken table, /api/tell-ken). SPEC UPDATE NEEDED.
- A quiet line inside Scout for everyone but Ken, with "Start one": the first day they open Scout, two days later, and
  three days after that; never again once they've sent one; ✕ closes it for the day. On a day it shows, the paperclip
  tip waits.
- Settings: for Ken, "About Wander, from the others", newest first, pictures opened in place, "Mark as read"; for the
  others, a "Tell Ken about Wander" row that opens Scout ready to write.
- The offer when someone seems lost: "Not finding something? Tell Ken ›" just above the bottom bar, at most once a day,
  gone after 20 seconds. Ken (Oct 14): "perhaps even signals based on them seemingly clicking around and not getting
  value and treating that as a trigger to offer." The signs (quick screens, Scout opened and shut with nothing asked,
  taps on words that aren't buttons, opening How Wander works) are added up on the phone itself and never sent or kept.
  It needs two different kinds of sign, never in the first half minute, never for Ken, and waits while Scout is open.

## 2026-10-14 (Wednesday, 7:30 PM in Japan) — Ask Them What You Can Have

### Added
- Show large has "Ask them a question ›": the line's own next questions, each shown large in Japanese with its English
  at the top, "‹ Back to the card" and "Ask another ›"; and "Ask something else" — say or type any question in English,
  and it's shown large in Japanese, its English saying exactly what it says (not saved). Ken (Oct 14), after a ramen
  restaurant where every main had garlic and they ordered plain rice and noodles: "think thru Ux and make it a smart
  option for the user to ask what they want". Lines to show made by Add or Scout carry their own questions. Where: the
  日 card's Show large (trip_phrases.follow_ups, new; POST /api/phrases/one-off). SPEC UPDATE NEEDED.
- The allium card asks for what can be made: "Please tell me any dishes that don't have them, or that you can make
  without them." Its questions: which dishes have nothing from the onion family; can you make this without it; is it
  in the soup or sauce; plain rice or plain noodles would be fine.

### Changed
- A very long card is a size smaller in Show large, so all of it is in view.

## 2026-10-14 (Wednesday, 7:00 PM in Japan) — Japanese to Show, "Show Large", and Remove That Asks

### Added
- A phrase card line can carry its Japanese writing, to show a server or a driver, with "Show large": the Japanese
  across the whole screen until Close, the screen kept lit where the phone allows. Ken (Oct 14): "notes should include
  kanji when helpful… plus tappable "Show large" (button resulting in larger kanji version that stays until "close"
  button)". Add writes it when a line is more useful shown (an allergy, a diet, a medical need, an address); Scout's
  add_phrase can too. Its small English says what the Japanese says, sentence for sentence. Ken (Oct 14): "make sure
  the small type English always makes it clear to the user what they are giving to the Japanese reader". Never a fact
  they didn't give (no address from memory). Ken's "Allium allergy" line added to everyone's card: "I'm allergic to the
  onion family, like onions, green onions, garlic and garlic chives. I can't eat them in sauces, dipping sauces or
  soups, or as extracts or powders, either. Could you please not use them in my food? Thank you." and
  玉ねぎ・ねぎ・にんにく・ニラなどのネギ類にアレルギーがあります。ソース、たれ、スープに入っているものや、エキス・粉末も食べられません。
  料理に使わないでいただけますか。よろしくお願いします。 Where: the 日 card (trip_phrases.script, new). SPEC UPDATE NEEDED.

### Changed
- Remove on the phrase card takes a line off your own card. For a line you added (or any added line, for the
  organizer) it asks: "Just my card" (first), "Everyone's card", or "Keep it". Ken (Oct 14): "ensure just your card is
  default. I don't want Larisa or Julie to accidentally remove for andy!" SPEC UPDATE NEEDED.

## 2026-10-14 (Wednesday, 6:15 PM in Japan) — "Remember That", Then "Bring It Back"

### Changed
- Scout brings back what it kept. Ken (Oct 14): "1. Ask or tell 2. Scott responds with something useful for future 4.
  Remember that let's use say something later like "A that thing we discussed? Bring it back. 5. Scott brings it back
  by finding in notes what would have been gone." Asked for something from before ("that thing we discussed", "bring
  it back", "what was that list", even garbled by dictation), Scout looks in what it kept and the person's notes first,
  brings back the best fit word for word (the newest when nothing points elsewhere), says when it was kept, and names
  the others in a few words. "Bring it back" means a removed maybe or phrase only when they name one. Before, "A that
  thing we discussed? Bring it back." got a guess about removed maybes. Where: Scout (rule 41b).
- The Notes tab's empty Scout view says "Ask Scout anything, then say "remember that", and its answer is kept here.
  Later, ask Scout to bring it back." (was "Ask Scout for a list…"). How Wander works says the same, with an example.
- Scout's notes search (get_my_notes) works newest first, matches any of the asked words ("coffee list" finds "coffee
  places"), and says when each was kept; another person's shared kept answer is said as kept for them, never as theirs
  or yours (verify55). "Bring it back" never restores a deleted trip item unless one is named.
- Asked to take a phrase off the card, Scout takes it off the asker's own card; off everyone's only when they say so.
  Ken (Oct 14): "ensure just your card is default. I don't want Larisa or Julie to accidentally remove for andy!"

## 2026-10-14 (Wednesday, 5:00 PM in Japan) — The Phrase Card in English First, With Add; Fixes Before Andy and Julie See Wander

### Changed
- Every line on the phrase card leads with its English title, then the Japanese and how to say it: "Hello", then
  "Konnichiwa (Koh-nee-chee-wah)". Ken (Oct 14): "all phrases titles should be English to find what is needed". A
  line for characters to find on a device leads with what it's for: "Toilet flush", then "大 for full flush; 小 for
  light flush". Phrases added on the trip now keep how to say them (trip_phrases.pronunciation, new); the ones already
  on the card were filled in. Where: the 日 card. SPEC UPDATE NEEDED (phrase card).
- The card's buttons are "Add" and "Edit/Reorder" (was "Edit"). Ken: "'Add' allows add where person types or speaks
  English and scouts fill in the fine print Japanese and pronunciation. If the translation is questionable or
  problematic or can be done in two ways with different nuance, give an option with super brief context and tappable
  choice." Add takes English typed or said (Talk), finds the Japanese and how to say it, and offers two or three ways
  only when the Japanese really differs, each with a few words of context; tapping one adds it, first on your card.
  One already on the card, in any wording, says so ("The check" → already there as "Check please"); one you took off
  your own card offers "Put it back". A double tap adds it once. While typing on an iPhone the card sits above the
  keyboard and its ˄ ˅ ✓ bar. Lines for signs and machines are only the characters and their meanings.
  Where: the 日 card; POST /api/phrases/suggest (services/phraseSuggest.ts). SPEC UPDATE NEEDED.
- Scout's phrases: English title, romaji and its pronunciation; asked how to say something, it gives both.

### Fixed
- "Still open in her Guide: ASK KENJI TO INTEGRATE THE 2 TOURS AND FINISH 3:45-4p AT TRAIN" showed on Home and Oct 14's
  page though her own line ends "— DONE". Ken (Oct 14): "You don't change her sheet. You add value to it. So if it is
  done or out of date, you don't show it." A question her line marks done ("— DONE", "DONE —", "(done)", a tick) is
  no longer shown as open. Where: Home's Today card, the day's "Don't miss". lib/guideDisplay openQuestionsIn.
- Scout offered twice more to draft Larisa a note after Ken's "No", and told him Wander "can't hide a line". Once
  someone says no, it doesn't offer again; told something is done or out of date, it agrees Wander shouldn't show it.
- Scout told Julie the Imperial room is "booked under your name"; it's under Andy's. Only the person a booking is under
  hears "your name" (verify52).
- A maybe removed and added again within 10 minutes said "On Tokyo's maybes." and showed nothing (verify52).
- The landing card ("Your flight was due to land…", "Getting from Narita to…") stayed on top of the day's page all
  evening; three hours after the landing it goes, as on Next. The landing stays in the day (verify52).
- "45% chance of rain (0")" read as a contradiction: an amount that rounds to nothing beside a chance of 20% or more
  is "(under .01")" (day page, Home, Scout).
- History said "You Andy: maybe — …"; it says "You added a maybe — …".
- Scout's tips spoke of dragging a file in "on a Mac" to iPhone users; that's said only on a computer. Settings' tour
  line no longer counts "six buttons" (there are seven, with 日).

## 2026-10-14 (Wednesday, 3:30 PM in Japan) — The Weather Stays Current While Wander Is Open; Talk Keeps Sentences Apart

### Changed
- The phrase card holds characters to recognize, as well as phrases to say. Ken (Oct 14): "Language list should
  generally not use kanji. But in this case (and possibly future ones) the purpose is finding something on a Japanese
  device." Scout keeps a phrase to say in romaji, and keeps the characters themselves for something to spot on a sign,
  button or machine (a toilet's 大 / 小, a ticket machine's 大人), large, with the person's own words under it. One
  request is one line (Scout had made "Dai", "Shou" and "Dai / Shou" from one ask). Ken's "Toilets: 大 for full flush;
  小 for light flush" added to the card; "Dai / Shou" off it (Put back restores it). Where: the 日 card, Scout
  (add_phrase, rule 27). SPEC UPDATE NEEDED (phrase card section).

### Fixed
- Talking into Notes or Scout: an iPhone hears a long recording in pieces, one per pause, and Wander joined them with
  nothing between, so Ken's note read "we met todayThe wife…" and "her husbandMarried into…". Now a space always goes
  between pieces, and a period when the piece before ends on an ordinary word and the next starts with a capital (the
  iPhone's sign of a fresh start); after words a sentence seldom ends on ("to", "the", "and", "her"…) only a space, so a
  name keeps its capital. A pause mid-sentence can still get a period ("her husband. Married into…"). The words
  themselves are never changed. Where: Notes' Talk, Scout's microphone. lib/voice.ts joinSaid. No SPEC change.
- Home's weather line and the day page's forecast lines kept the numbers from when the screen first drew. An iPhone
  keeps Wander open for hours, so at 2:52 PM Home still showed 11 AM's forecast (Mashiko rain 94%) while Scout gave the
  current one (86%). Ken: "almost same?" Now both ask again whenever the phone shows Wander again (unlocked, switched
  back to), once more a minute later, when the signal comes back, and every 5 minutes while it's in view. A copy under 30 minutes old is reused, the same time Wander's server
  keeps one, so the phone is never a refresh behind Scout. An older forecast never replaces a newer one that Scout read.
  Where: Home (under the trip's dates), each day page (under the town name). lib/forecast.ts askAgainWhenSeen,
  TodayWeather.tsx, DayForecast.tsx. SPEC: §weather (no SPEC change in behaviour beyond "current").

## 2026-10-14 (Wednesday, 9:00 AM in Japan) — Storm, Warning and Train Watch

### Added
- A watch on Japan's weather agency (JMA) for each person's own places, today through 5 days ahead (Ken, Oct 13:
  "yes"; live before the Oct 21 Shinkansen). Silent unless the agency has a Level 3+ warning in force for the town
  they're in today (all of it, or "part of" it), a medium or high chance of warning-level weather there (by region
  for the next day or two, then by prefecture — said as the prefecture's — as far as the agency's outlook goes, about
  5 days), or a typhoon or tropical storm forecast within about 190 miles of them within 5 days (checked hour by hour
  along its track, the distance to its center). Its places are the day page's (where they sleep, a day trip, a travel
  day's start), the airports in her plan that day, and the areas a travel day's road route crosses. A day with a train
  in it (her Guide's lines, or Backroads' words for that day) adds JR's rule: planned stops are usually announced the
  day before, and a cancelled train is refunded in full. Where: the day page's "Don't miss", first, with
  a link to the agency's English warning or typhoon map (or the Shinkansen's status page, in Japanese — its English
  page sends people to the Japanese one; JR East's status pages refuse requests from outside Japan, so they aren't
  linked). Scout: get_weather returns the watch, and when it has a line it's in what Scout sees with every question,
  so a typhoon on a travel day is said even when asked only "anything I should know about the 21st?". When a part of
  the agency's data can't be read, Scout says so and never gives an all-clear; it never says whether a train will run.
- JMA's old warning file still answers but has been frozen since May 28, 2026 (the day before its overhaul); the watch
  reads the new one (warning/data/r8) and refuses a file that has stopped updating. Server: services/stormWatch,
  GET /api/weather/trip/:tripId/watch; dayWeather's places split out as dayPlaces (the day page's forecast unchanged).
- SPEC UPDATE NEEDED: weather (§ day screen "Don't miss", § Scout).

### Fixed
- Days with no forecast in Scout's answers. Asked about a week, Scout made about 21 calls to Open-Meteo at once, and
  Open-Meteo refused most ("Too many concurrent requests", "The service is overloaded"); those days read "no forecast
  just now", and a failed day was remembered for 30 minutes. Now each place's 16 days come in three calls (all days at
  once — the same numbers as day by day, checked), asked once however many people want it; every call waits its turn
  (three at a time) and is tried again when Open-Meteo is busy; a failure is remembered for 2 minutes; and the forecasts
  for each traveler are made ahead every few minutes. A cold burst of 60 person-days: 60/60 (was 0–4 of 15 per person).
  Server: services/meteo.ts, dayWeather.ts, packingWeather.ts.

### Changed
- On a day with a flight in her plan, Scout also has the airport's own forecast ("Narita's own forecast for today:
  63–76°F, 91% chance of rain"). Asked "what's the weather when we land?", it had stretched the hotel's rain hours
  over Narita, 60 km away. Not on the day page. Where: Scout (get_weather).

## 2026-10-14 (Wednesday, 8:20 AM in Japan) — Scout's Weather Is the Day Page's Weather

### Changed
- Scout answers the weather from Wander's own forecast, the one on the day pages and Home (Ken, Oct 13: "yes. One
  unified and correct source"). Before, it searched the web: asked "Is it going to rain in Mashiko today?" it gave a
  Norwegian site's "2.6 mm, 24°/17° C" while the day page said 94% (.13"), most likely 10 AM–7 PM. Now it gives the day
  page's numbers, hours and places for the person asking: both places on a day trip or a travel day, the day's place
  first; "early outlook" only for days more than a week out. No ranges of Scout's own ("high 40s"), the day's range
  never called tonight's, and a place's rain hours never tied to somewhere else (verify43: the Imperial's hours had
  been said to "overlap your landing at Narita"). A town in Japan that isn't on their plan ("Kanazawa on
  Friday?") gets Wander's forecast for it, said as not where their plan has them. Only weather outside Japan is
  searched online. Where: Scout (get_weather, prompt rule 46g); server: services/dayWeather (townWeather).
- The forecast Scout read for an answer becomes the phone's copy for that day, so the day page and Home show the numbers
  Scout just said, at once if they're on screen (an older forecast never replaces a newer one). Where: ChatBubble,
  lib/forecast keepDayForecast, DayForecast, TodayWeather.
- The forecast's words live in one file used by both the day page and Scout (forecastWords.ts, a copy on each side; a
  test fails if they differ). The day page's lines read exactly as before (checked against the live build, 11 views).
- SPEC UPDATE NEEDED: Scout's weather answers (§ Scout, § weather).

## 2026-10-13 (Tuesday, 11:15 PM in Japan) — Notes Keeps Your Words in View

### Fixed
- After the keyboard had been up elsewhere, iOS could leave its screen moved; in Notes the cursor then wasn't drawn and
  the first letter threw the page to its foot, the box out of sight (Ken, 10:56 PM; swiping Wander away cured it). Now,
  while the Notes box is being typed in on a phone, a move that throws the box out of sight with no finger on the screen
  is put straight back and the cursor drawn again (at most six times per tap). iOS's small moves to keep the cursor above
  the keyboard, and scrolling by hand, are untouched. The phone logs the numbers ("notes-caret") to see it act.
  Where: NotesPage; server: routes/phoneReports.

## 2026-10-13 (Tuesday, 10:30 PM in Japan) — Scout's Box Clear of the iPhone's Keyboard Bar

### Fixed
- Typing to Scout on an iPhone, the bar iOS floats over the page above the keyboard (˄ ˅ ✓) covered Scout's box, and
  Paste appeared up by the clock (Ken's screenshot, 10:06 PM). While typing on an iPhone, the box now sits 52 pt higher
  and the bar floats over empty space under it. Android, iPad and the keyboard down are unchanged. Where: Scout's panel
  (ChatBubble).

## 2026-10-13 (Tuesday, 8:15 PM in Japan) — Kept Forecasts From an Older Wander

### Fixed
- Ken's phone showed no rain hours on Oct 14 right after the update: the old app had kept that day's forecast a minute
  earlier, and the new one reused the copy for up to an hour. A kept copy is now reused only when it was kept by this
  Wander; an older one is fetched again (still drawn at once, and still used with no signal). Where: lib/forecast.ts.

## 2026-10-13 (Tuesday, 4:40 PM in Japan) — When the Rain Comes (weather plan item 3)

### Added
- On a day up to 3 days ahead with a 30%+ chance of rain, the day page says when it's most likely: "90% chance of rain
  (.09"), most likely 3–7 PM, with showers possible 8–10 AM". Also "until 10 AM", "from 6 PM", "likely through most of
  the day", "on and off 8 AM to 6 PM". On today, only the hours still to come ("likely for the rest of the day";
  nothing once it's past), worked out on the phone so a copy kept from the morning stays right with no signal. Each
  place on a two-place day has its own hours.
- How: an hour is "most likely" when the main forecast gives it a 50%+ chance, or two of Japan's, Europe's and the US
  models put measurable rain in it; "showers possible" when one model alone puts 0.02"+ in it at a 25%+ chance (Japan's
  own model had Mashiko's morning showers alone). Open-Meteo's hourly figures are for the hour before their time stamp
  (verify34 caught every hour an hour late before release). Between 7 AM and 10 PM Japan time.
- On a travel day, the town where the day starts gets its hours to 1 PM, and tonight's town from noon. Rain under way
  says when it ends ("until 10 PM", verify35). Rain running past the 1 PM cut says "from 10 AM" or "for the rest of the
  morning", never a made-up end (verify36).
- Where: day page forecast lines (DayForecast). Not on Home: Ken asked for one line there. services/dayWeather.ts
  (wetHours, showerHours), lib/forecast.ts (rainWhen). SPEC: weather section (SPEC UPDATE NEEDED).

### Fixed (verify33)
- A note could still be filed under a day it wasn't written for. After a day page's note, a reload (or Back then
  Forward) put the box back on that day; now saving clears the day from the address. The evening question's mark is
  cleared the same way, so the next note isn't filed as its answer.
- Notes left open overnight kept yesterday's date for the morning's note. A date Wander set itself now moves on with
  the trip's clock; a day picked by hand, a day page's day, or words already in the box keep theirs. Scout's evening
  question (or today's day-page button) opened at night and left empty moves on too (verify36). Changed: before 4 AM
  the night belongs to the evening — a new note, the next note after a save, and the overnight move all use the
  evening's date until then, so two notes about tonight's dinner written after midnight both stay with tonight
  (verify37, verify38). Where: NotesPage.
- Two-word headlines with a plan word ("Rest Day", "Free Day", "Fly Home") are never taken for a town.

## 2026-10-13 (Tuesday, 4:30 PM in Japan) — verify32's Fixes

### Fixed
- After a note from a day page, the next note on the same screen kept that day's town ("Oct 13 · Karatsu"); now it's
  today and where you are. Where: NotesPage.
- A future headline like "Kyoto day 2 - Rest" or "Departure" won't be taken for a town; a second place must also be in
  Japan. Where: services/dayWeather.ts.
- The rain amount stays beside its chance at 375 pt ("47% (1.91")" no longer wraps apart).

## 2026-10-13 (Tuesday, 4:10 PM in Japan) — Two-Place Weather, Fixed by verify31

### Fixed
- A long first weather line on Home grew upward over the trip's dates (Oct 23 "Izu Peninsula …" at 402 pt): the lines
  now grow downward; Go to today keeps 44 pt by reaching up over the dates.
- "Kyoto day 4 - Shigaraki" (her day-plan headline naming the place alone) now gives Shigaraki's weather too; a second
  place counts only when it's over ~15 miles from where you sleep, so a neighborhood never does.
- On a travel day, from noon in Japan, Home leads with tonight's town (it led with "Nagoya this morning" at 3:47 PM).
- Words: each line is the town's whole day, so Home just names the towns; the day page says "where the day starts" and
  "where you sleep". Screen readers hear "Today's weather." once, not the town twice.

## 2026-10-13 (Tuesday, 4:00 PM in Japan) — How Much Rain

### Added
- Every forecast says the day's expected rain in inches right after the chance: "rain 90% (.09")" on Home, "90% chance
  of rain (.09")" on the day page. Ken (Oct 13): "rain percentage is important, but especially in Japan, the quantity
  of rain matters, so can you in parentheses right after the percentage put the quantity of rain in inches? E.g.,
  (.0x")". Open-Meteo's precipitation_sum. Phones' saved copies without it are fetched again. Where: TodayWeather,
  DayForecast, lib/forecast rainInches, services/dayWeather.ts.

## 2026-10-13 (Tuesday, 4:10 PM in Japan) — A Note for Any Day

### Added
- Each day page has **+ Add a note for this day**: Notes opens on that day and its town, ready to write. Ken (Oct 13):
  "there also should be a button on each day page that says, add a note for this day" · "That would create another
  way to go back to a day and then add a note there in addition to a date picker on the notes page or asking Scout to
  assign something to a day based on a date or an activity on a date that it could look up".
- Notes' writing box has a **Day** choice (any trip day, or "No particular day"); About follows the day's town unless
  chosen. Scout already files a note on the day it's about ("the first ryokan"). Where: DayPage, NotesPage, help.
  SPEC UPDATE NEEDED.

## 2026-10-13 (Tuesday, 3:45 PM in Japan) — Both Places' Weather When the Day Goes Somewhere Else

### Added
- When her plan takes you somewhere other than where you sleep, both forecasts show, each named, in the order the day
  is lived. Ken (Oct 13): "staying at the Imperial Hotel, but the day plan is to go to Mashiko, so both weathers should
  be there, even if it means an additional line of small text with the same standard spacing between lines. That
  should always be true if you can identify a different location from the plan." A day trip in her plan for you ("Day
  trip from Tokyo to Mashiko"; her initials before it — "KL day trip" — say whose) → "Mashiko: …" then "Tokyo: …"; a
  travel day (last night in one town, tonight in another) → "Tokyo this morning: …" then "Nikko tonight: …". Where:
  Home's line under the dates (a second line, 4 pt below), the day page's forecast (two lines). services/dayWeather.ts
  (also, town), lib/forecast, TodayWeather, DayForecast. SPEC UPDATE NEEDED.

### Fixed
- Asking Scout to add a phrase you'd taken off your own card puts it back on yours (verify30).

## 2026-10-13 (Tuesday, 3:15 PM in Japan) — Scout in Notes' View; Export With or Without; Tighter Weather Line

### Added
- Notes: a fourth choice, **Scout**, beside Everyone's / Mine / Others' — only what Scout kept at your asking; Mine and
  Others' are people's own words. Ken (Oct 13): "Memory notes works. Add scout to this view".
- **Export mine** asks **Just my words** or **With Scout's notes too** when you have notes kept from Scout. Ken: notes
  are source material for a journal, "so exporting should allow with or without Scout's notes".
- Help: the phrase card's Edit; "remember that"; the Scout choice and the export choice (verify29).

### Changed
- Home's weather line sits as close under the trip's dates as the dates under "From Larisa's Guide". Ken: "reduce the
  space in the yellow to what is the standard between 'from Larisa's…' and dates". Go to today keeps 44 pt to tap,
  reaching up over the dates, never over History or ⚙.
- Scout no longer judges duplicate phrases by shared words ("Where is the toilet?" was refused for "Where is the
  station?", verify29): the server refuses only the same phrase (everyday ones included), and Scout sees the card's
  phrases to judge meaning. A list Scout keeps about another city goes under that city in Notes.

### Fixed
- Quick taps on ↑ could leave the old order on the server and bring it back on reopening (saves crossing): saved one at
  a time, newest last. The Edit note says what Remove does for the trip's organizer too.

## 2026-10-13 (Tuesday, 2:55 PM in Japan) — Your Own Phrase Card; Scout Keeps What You Ask It To

### Added
- The phrase card has **Edit**: ↑ and ↓ to move a phrase, **Remove**, and a Removed list with **Put back**. Ken (Oct 13):
  "Need to be able to remove phrases. And to rearrange the order. No need to designate original or not." · "Anything
  added by one adds to bottom for others no matter where placed by the person adding it. It goes to top for the one
  who adds it." Each person's order is their own. A phrase you added (any added one, for the trip's organizer) comes
  off everyone's card when you remove it; anything else comes off only yours (the Maybes rule). Nothing is deleted.
  One list: no "Added on this trip", no "added by". Where: the 日 card (PhraseCard), routes/phrases.ts,
  services/phrasePrefs.ts; trip_phrases.removed_at/removed_by. SPEC UPDATE NEEDED.
- Scout arranges the card in words (arrange_my_phrases): "put Sumimasen first", "take Konnichiwa off it", "bring it
  back", by the same rules. Ken: "Good job ensuring scout can reorder like a user."
- "Remember this" for Scout's own answer: kept in your Notes word for word, marked "kept from Scout" (keep_in_my_notes
  fromScout); Scout sees what it kept with every question and uses it when you ask for options. Ken, Oct 13: "Can you
  remember all that for when I ask for options each day?" Where: Notes ("· kept from Scout"), Scout.

### Fixed
- Scout reached for April's "learnings" tool when asked to remember, and it never saved anything; it's withdrawn.
- Scout promised to hold a list "as long as this conversation runs"; it sees only the last 10 messages of today's
  conversation, and now says what lasts is your Notes.
- Scout added "not feeling well" to the card four ways in one morning; a second way of saying what's already there is
  added only when asked for.
- The old phrase delete deleted for good, by anyone on the trip; it now hides by the same rule (nothing called it).

## 2026-10-13 (Tuesday, 2:25 PM in Japan) — Today's Weather Under the Dates; Help for People Already In

### Changed
- Home's weather moves out of the Today card to one line just under the trip's dates: "63‑73°F, rain 18%" with
  "Go to today ›" at its right. Ken (Oct 13): "Can it be one line of: 63‑74°F, rain 6%      Go to today ›", in the
  space between the dates and "? History ⚙ Ken". Shown only on the days the Today card is (your days in Japan), so it
  needs no place name; a screen reader hears where it's measured. Where: Home (TripOverview slot, TodayWeather from
  TripGlance). SPEC UPDATE NEEDED: Home carries today's weather under the trip's dates.
- How Wander works: "Getting In" moved to the bottom as "A New Phone, or Someone New" (Ken: "They are in now and can't
  read it unless they are in already!"); added today's weather and Go to today, the 日 phrases, the day's forecast,
  sending Scout photos and files, keeping papers (who sees them, said per person), Use my location, Copy and Read
  aloud. Where: How Wander works (GuidePage).

## 2026-10-13 (Tuesday, 12:30 PM in Japan) — Phrases From Every Screen; Today's Weather on Home

### Added
- A small 日 at the right end of the bottom bar, on every screen, opens the Japanese phrase card in one tap. Ken (Oct
  13): "a clear convenient but subtle way to have phrase button always available". Next keeps its labelled
  "日 Phrases", where people learn what the 日 means; both open the same one card (never two). The card closes on Back,
  Close, a tap on the page, or a change of screen, and sits at the screen's foot when iOS has left the screen moved.
  Where: bottom bar (BottomNav), PhraseCard (one card mounted beside the bar, App.tsx). The bar keeps the 日's room
  from its first drawing (the phone remembers the trip's languages), so the tabs never slide (verify27). How Wander
  works has a "Japanese Phrases" entry, Show me around a seventh step for the 日, and Scout says where the card is when
  asked (prompt rule 27). SPEC UPDATE NEEDED: the phrase card is reached from the bottom bar on every screen, not only
  Next.
- Home's Today card says the day's weather in small type with a "Go to today ›" button beside it: "Weather at the
  Imperial Hotel today: 63‑74°F, 6% chance of rain". Ken (Oct 13): "Home should have small type saying something like
  'Today's weather: xxxx     Go to today [active button]'". The same forecast as the day page (where you sleep that
  night), named so nobody reads another city's weather as theirs; with no forecast to be had, only the button. Where:
  Home, Today card (TodayWeather). SPEC UPDATE NEEDED: Home's Today card carries the day's weather.

## 2026-10-13 (Tuesday, 11:40 AM in Japan) — The Bars and Scout's Panel at the Screen's Foot After Typing

### Fixed
- After the keyboard had been up, the bottom bar, Scout's slim bar and Scout's panel sat high on the screen with the
  page bright below (Ken, 11:29 JST: "After refresh, still broken!" — the bar at 595 of 874 on Home). His phone's own
  numbers showed why: iOS leaves the screen moved down the page (288 pt at 10:56) after the keyboard goes, and
  everything pinned to the screen is drawn that much too high; the earlier fixes measured the screen's height, never
  this. On an upright iPhone Home Screen app, with nothing being typed in, the bar, the slim bar, Scout's panel and its
  dimmed backdrop are now placed for that move (0 normally: then nothing changes). The phone tells Wander's log when
  it acts ("placed-for-moved-screen"). Where: BottomNav, ChatBubble, lib/screenShift.ts. No SPEC change.
- Scout's panel made full size with the keyboard up put its top 8 pt from the screen's top, under the iPhone's clock,
  where its Close and "Make Scout small" buttons couldn't be reached (Ken, 11:51 JST: "expanded scout and couldn't
  shrink again"). Its top now stays below the clock's strip at every size. Where: Scout's panel (ChatBubble). No SPEC
  change.
- On a long page scrolled more than one screen down, the bar could still be lost off the screen after the keyboard
  (verify26); the allowance now covers the page's whole length. Where: lib/screenShift.ts.

### Changed
- Scout's slim bar (Scout made small) is the open panel's cream with dark words, no longer dark brown. Ken (Oct 13):
  "change to dark is confusing. So please keep scout color same at all three sizes." Where: Scout's slim bar.
  No SPEC change (SPEC doesn't describe the slim bar).

## 2026-10-13 (Tuesday, 11:10 AM in Japan) — Each Train Its Own Seats; Each Paper Its Own Photos; Scout's Bar Stays Down

### Fixed
- A ticket carrying two trains gave both the first train's seats: the YAMABIKO 146 home would have shown the 127's
  "Car 10, seats 3-A and 3-B". Each train now takes the car and seats written after its own name. Where: train cards.
- Two photos sent to Scout (a Yamabiko set and a Haruka set) were each kept with both photos. Scout now names which
  photos are each paper; one photo of tickets for two days is kept under each day, each paper saying only its own
  tickets. Ken's two mixed entries were put right (the wrong copies hidden, nothing deleted).
- Scout's slim bar floated mid-screen after typing (Ken, 10:53 JST): on an upright iPhone Home Screen app the bottom bar
  and the slim bar are now placed from the top by the phone's own screen height — normally the very same place.
  Where: BottomNav, Scout's slim bar.

## 2026-10-13 (Tuesday, 11:05 AM in Japan) — Your Seat, From the Ticket You Kept

### Added
- A train's card shows the car and seat from a ticket kept in Papers for that day that names the same train: "Car 9,
  seat 11-D, on the ticket you kept" (Larisa: "on the ticket Ken kept"). Ken, on the NOZOMI 6: "I know Scout knows my
  seat, and I can't read it, and it's not showing up." Where: Next's train card, the day's train. RailSheet KeptSeat,
  lib/papers seatOnTicket.

## 2026-10-13 (Tuesday, 10:50 AM in Japan) — The Page Under Scout Holds Still; Phrases Scout Adds Are Shown

### Fixed
- The page jumbled after typing in Scout on the iPhone (Ken, Oct 13: iOS's Paste menu under the Dynamic Island,
  Scout's panel left high with the day bright below, the bottom bar mid-screen — "The mixed page info is bad and
  confusing"). His phone's numbers showed iOS scrolling the page underneath Scout 380 pt when the box was tapped, and
  everything pinned to the screen was then placed from the scrolled page. While Scout's box is being typed in on a
  phone, the page is put straight back. Where: Scout's panel (ChatBubble only).
- The phrase card shows the phrases added on the trip ("Added on this trip", with who added them) under the
  essentials. Scout said "Both are on the shared phrase card now" and no screen showed them. Where: Next → Phrases.

## 2026-10-13 (Tuesday, 10:40 AM in Japan) — A Cursor You Can See; Measuring Scout's Box on the iPhone

### Fixed
- The text cursor in every box is iOS's own blue; it was too faint to find on the beige boxes (Ken, Oct 13: "Cursor
  there but faint!"). Where: every text box (index.css).

### Added
- Scout's panel tells the server's log, in numbers only, where the iPhone thinks its box and panel are — when the box
  is tapped, when the keyboard settles, and when the keyboard goes up or down (Ken, Oct 13: iOS's Paste menu under the
  Dynamic Island; Scout's panel stuck near the top with the day bright below). Nothing changes on screen; the fix is
  built from these numbers. Where: ChatBubble; phone reports "scout-caret".

## 2026-10-13 (Tuesday late morning in Japan) — A Paper's Send That Breaks Partway Is Sent Again

### Fixed
- Keeping a paper failed with "Wander couldn't keep it just now — the signal may have dropped" while Ken had full bars
  (Oct 13 10:01 JST; the server saw the send cut off partway through the photo; his second try worked). Wander now
  sends it again by itself, up to three tries, waiting while it's in the background; a send cut off partway keeps
  nothing, so it can't make two. If all three break: "The paper didn't finish sending. Try again in a moment." The
  signal is blamed only when the phone says it's offline. Each retry's outcome goes to the server's log (numbers
  only) so the cause shows next time. Where: Notes "Keep a paper"; lib/papers.ts, phone reports.

## 2026-10-13 (Tuesday in Japan) — The Day's Forecast Where You Sleep, and a Note About Japan's Warning App

### Changed
- Each day page's forecast line is for the hotel you sleep in that night, from Wander's server (Ken's weather plan,
  Oct 12–13): "Forecast at the Ritz-Carlton, Nikko: 48‑66°F, 68% chance of rain, but the forecasts disagree". The
  town's forecast only when there's no stay that night. Nikko's lake hotel runs 5–10°F colder than Nikko town, which
  the line used before. More than 7 days out the line says "Early outlook". When the main forecast gives a 30%+ chance
  of rain, Europe's, Japan's and the US models are compared: "though other forecasts show little rain" when none of
  them shows any to speak of, "but the forecasts disagree" when some do. Not before a person's own first night (Andy
  and Julie's Oct 13 is Tokyo's forecast, not the Imperial's: they're on the plane). The phone keeps a copy
  for no signal, and falls back to the town's forecast straight from Open-Meteo if Wander can't answer. Where: day
  pages (city band); new GET /api/weather/trip/:tripId/day/:date, services/dayWeather.ts. SPEC sections: day page.
  SPEC UPDATE NEEDED.

### Added
- A quiet note on Home for Larisa, Andy and Julie, under the day's own card (Ken, Oct 13: "Messages should be gentle"):
  Ken got an alert pointing him to Safety tips, the free warning app from Japan's Tourism Agency (earthquake, typhoon
  and heavy-rain warnings in English); he installed it, and you're with him; "Here's how" shows three steps and an App
  Store button; "Got it" puts it away for good on every phone. Until the trip ends. Where: Home; SafetyTipsNote.tsx.

### Fixed
- Scout's packing answer said the day pages show the town's forecast; they show the hotel's now, and it no longer says so.
- Scout's offer is taken the moment its question is asked: reopened mid-answer, it showed again and could be asked twice.

## 2026-10-13 (Tuesday morning in Japan) — Scout Offers Andy and Julie the Weather Packing Tips

### Added
- A one-time offer in Scout for Julie and Andy, until 8 AM Tuesday in California (Ken, Oct 12: "Yes… Don't just do the
  obvious… data is good"). Its words come from their own forecast when Scout opens: "The forecast for your hotels is
  in. At the Ritz-Carlton, Nikko (Sun, Oct 18 – Tue, Oct 20), the highs look like 57–66°F, against 73–75°F at the
  Imperial Hotel in Tokyo. Want the few things worth packing for that?" One tap asks "What should I pack for the
  weather?"; Later and No thanks as before. Offers now come one at a time, in order: Julie's earlier packing-list offer
  first, then this one. Where: Scout's panel; services/scoutHello.ts. SPEC sections: AI chat.

### Changed
- Weather packing items never say a stop is simply mild or warm, or to bring ordinary clothes for it.

## 2026-10-12 (late night) — Packing Rain Said Only As Sure As the Forecasts Are

### Fixed
- Packing tips called rain "likely" from one forecast model alone: Mon, Oct 19 at the Nikko lake hotel read "68%"
  from Europe's model while Japan's showed almost none and the US model none. Each rain day is now checked against
  Europe's, Japan's and the US forecasts; Scout says "likely" only when all three show rain, otherwise "may", and says
  the forecasts disagree. Where: Scout (packing_tips); services/packingWeather.ts. SPEC sections: AI chat.

## 2026-10-12 (night) — Papers: Receipts, Tickets and Bills, Kept by Day

### Added
- Papers. A receipt, a bill, a ticket or a booking can be kept in Wander instead of carried: "Keep a paper" in Notes
  (take a photo, choose one, or a PDF), or send it to Scout and say "keep this". Wander reads it and files it under the
  trip day it belongs to ("Kept 'Yōyōkaku bill, Karatsu' under Oct 9 · Karatsu" — a stay sits on its last night), with
  a one-line description and the total as printed; never a card, confirmation or passport number in the words. Seen by
  whoever kept it; Ken's and Larisa's are visible to each other (Ken, Oct 12). Shown in Notes (newest days first) and at
  the end of that day's page; tapping one opens it in the phone's own viewer (zoom, share, save). Remove: the person who
  kept it; nothing is deleted. Scout knows the papers a person may see ("what did the ryokan cost?"). Where: Notes,
  day pages, Scout; new /api/papers routes, trip_papers table, keep_paper / remove_paper tools.
- In Notes, "Keep a paper" sits in one row under the writing box ("3 kept ↓"); the list itself comes after the notes,
  so nothing moves as it loads. Keeping one like a paper already kept that day says so.
- Scout answers questions about a stay from her Guide and the papers together (Ken: "what was the name of the ryokan…
  When were we at the ryokan, what did we pay at the Ryokan per night"): asks which when more than one place fits, says
  what a bill's total was for, and never makes a price per night the paper doesn't show (a ryokan bill often lists only
  dinner and drinks, the room paid when booked).

### Changed
- Packing tips carry the weather where that person will actually sleep (Ken, Oct 12: "Adjust your packing tips for
  this. Don't say obvious things. Be helpful."). From the live forecast at each of their hotels, from their own first
  night: up to three items tied to their dates and to what her Guide and Backroads have them doing (Nikko's cold, wet
  biking and hiking days against Tokyo's warmth), then the checked list, seven in all. Nothing Backroads already tells
  them (rain gear, layers, gloves), no umbrella to pack (convenience stores sell them), anything past a week said as
  "may". Where: Scout (Julie's packing offer, and anyone asking what to pack); packing_tips tool, services/packingWeather.ts.

### Fixed
- The bottom bar floating mid-screen on the iPhone (Ken, Oct 12 8:50 PM): iOS had shortened the page without any of
  the events the bar's own repair waits for. Scrolling now makes the bar check again and sit at the phone's real bottom.
- SPEC sections: Notes, day page, AI chat. SPEC UPDATE NEEDED.

## 2026-10-12 (evening) — Places Near You, and a Buzz When Scout Answers

### Added
- "Is there somewhere to sit down for a coffee?", "a pharmacy I can walk to?": when Larisa's pins have nothing of that
  kind near them, Scout looks for the closest real ones near the phone (Google Places) and answers like "Doutor Coffee,
  about 20 m to the north-east, open now", said as found on Google, with a walking button to the closest open one
  (Google's exact point). Answers in about 7–15 seconds instead of ~25 (it was a web search, by town, a mile or two
  off, with no distances). The phone's position goes to Google only for these questions, rounded to about 100 m, never
  stored (Ken approved Oct 12). Where: Scout; new places_near_me tool.
- When the phone is moving fast (a train), Scout says so and that "near" is changing, and offers no walking button
  (the place is behind them). Scout no longer points to a Shinkansen food cart (the Tokaido line ended it in Oct 2023).
- "Scout answered" on the lock screen, with the phone's buzz, for any answer that takes 8 seconds or more. Each phone is
  asked once, ever, the first time an answer takes a while ("Want your phone to buzz when an answer is ready?" · Turn
  on / No thanks). Tapping the notification opens Scout on the answer. The lock screen shows the answer's first line,
  unless it holds a booking code or a long number ("Your answer is ready. Tap to read it."). iPhone: from the Home Screen icon only (Apple's
  rule for web apps). Where: Scout's panel; new /api/push routes, push_subscriptions table, service worker.
- SPEC sections: AI chat (Scout's tools, Scout's panel), notifications. SPEC UPDATE NEEDED.

## 2026-10-12 — "Use my location" Under Scout's Answer

### Added
- When Scout needs to know where someone is and can't see it, its answer carries a "📍 Use my location" button. One tap
  brings up the iPhone's location box when it's needed and asks the same question again with where the phone is; the
  question shows again with "📍 with my location" under it. This works for any wording, because Scout decides when an
  answer depends on where they are standing ("is there somewhere to sit down for a coffee?", "we got turned around and
  need the station"). iOS forgets a Home Screen app's location answer each time it's opened, so this is the usual way
  on a fresh open. If they say no, or the phone can't find itself (a station, underground), a short reply says so and
  the button stays for another try; a second "no" in the same opening says how to change it (swipe Wander away and open
  it again). Never offered once they've said no, when Scout already has their location, or for a question that doesn't
  need it. An answer that says "tap Use my location" always has the button. Scout keeps that answer to a sentence or
  two, and the panel shows the answer down to the button. A question typed while the iPhone's box is up doesn't lose
  the tap: the location question goes after it. Where: Scout's panel; Scout's new offer_location tool.

### Fixed
- A rough new location reading (a station's 1.8 km cell-tower guess) no longer replaces a sharp one from the last five
  minutes when the sharp one sits inside it.
- A "near me" question asked just under ten minutes after the last reading carries that reading instead of "unknown".
- Once location is allowed, a question waits at most 10 seconds for the phone (was 20 when the phone never answered).
- More ways of asking where they are get the phone's location at once: "near us", "the nearest train station",
  "closest thing on Larisa's map", "how far to the Marriott", "I'm lost", "where exactly are we", "within a short walk".
  "While we're here", "is Kyoto nearby Osaka" and "within walking distance of Tokyo Station" no longer bring up the
  location box. Wordings that also fit ordinary questions ("which way…", "where can I get…", "walk back to the hotel")
  are left to the "Use my location" button, so "Where can I get a Suica card?" never asks for their location.
- The note under a directions button that only searches Maps says just that ("Maps will search for … Check it's the
  right place before you go."). It said "Larisa's Guide has no address for this" even under a place found online.
- Scout says "you haven't shared your location since opening Wander" in place of "your phone didn't send it".
- An answer that says there's a button below it now always has one: when Scout writes "the button below routes you
  there" without making the button, Wander asks it once to make the button or take the words out (Ken's Tokoname
  station question, in a check).
- A question that merely ends in "here" ("Is tap water safe to drink here?", "When do Andy and Julie get here?") no
  longer brings up the location box; nor do "nearby our Kyoto hotel", "festivals in the area while we're in Kyoto" or
  "where do we go from here". "What's good to eat here?", "around here" and "from here" still do.
- Scout no longer measures "a walk" from the hotel when it can't see where someone is, and when a directions button
  goes with an answer it says the button gives the walking time.
- Directions to a place she pinned go to her pin when another of her pins has a longer name holding it ("Tokoname
  Station" beside "Tokoname Station Bicycle Parking" made the button only search Maps).
- SPEC sections: AI chat (Scout's panel, Scout's tools). SPEC UPDATE NEEDED.

## 2026-10-11 — Location Asked Only When It Matters; No Waiting for It; Scout's Panel Keeps Its Swipes

### Fixed
- The phone asks for location only for a question about where they are ("what's near me?", "anything good around
  here?", "is there an ATM around?", "how far is my hotel?") — no longer for any question with "close", "far" or "here"
  in it ("when does the pool close?", "how far is Nikko from Tokyo?", "here's a photo of the menu"), which brought up
  the iPhone's location box in the middle of an unrelated question. Where: Scout's panel.
- Once location is allowed, an ordinary Scout question never waits for a location reading: it carries what the phone
  knew in the last ten minutes and reads it again in the background. A "near me" question asked within a minute of
  another uses the position it has. (Before, every question could wait up to 2.5 s in a station or basement.)
- A swipe on Scout's panel moves only the panel, even with a short conversation — it moved the page behind (Ken,
  iPhone, Oct 11).
- Larisa's map link reads "Open the Google map" (she saw "her" map for her own); a web address inside bold text can be
  tapped.
- A pin of hers far from every town of the trip is no longer called misplaced outright: Scout is told how far it is from
  the nearest town and weighs it against her plan (a Kyoto street pinned outside Kyoto is misplaced; a day trip's pin
  may be right). Directions still never use such a pin; someone standing near one sees it among "nearby".
- "Toward your hotel" only for places within 30° of the hotel's direction (Ginza Itoya, due north with the hotel
  north-west, was "toward the hotel").
- (later the same morning, from a second check) Once location is allowed, Wander reads it when the app opens or comes
  back to the front, so the first question after opening has it too. A "near me" question in a station, where a fresh
  reading doesn't come, carries the last one from the past ten minutes with its age instead of "unknown". Fewer
  questions bring up the location box by mistake ("is it easy to get around?", "the area code") and more real ones get
  it ("what's good to eat here?", "anything close?", "how far is it to my hotel?"). The paperclip tip in Scout's panel
  no longer passes a swipe to the page behind.
- SPEC sections: AI chat (Scout's panel, Scout's context). SPEC UPDATE NEEDED.

## 2026-10-11 — "What's Near Me?" From Larisa's Pins; Her Misplaced Pin Is Never a Destination

### Added
- Scout answers "what's nearby?", "anything good around here?" and "how far is my hotel?" from where the phone is: the
  closest of Larisa's pinned places (her Google map and her Apple Maps guides), each with how far in the words people
  use ("about 400 m — roughly 4 blocks", "1.5 miles"), which way, and "toward your hotel" when it is (her own pin for
  the hotel). Straight lines, never a walking time. Far from all of her places (Nagoya tonight, California) Scout says
  so plainly and names the closest. Ken asked Oct 11. Where: Scout's panel.
- The phone sends its location with a Scout question only when the question is about what's near or around them, or
  when location is already allowed for Wander — no location prompt for other questions. Said no: Scout says it can't
  see where they are and asks what they're near. The location is used for that answer only and never saved.

### Fixed
- A pin of hers that sits far from every town and place of the trip (her "Sannenzaka-dori Street" pin is in Wakayama,
  100 km from Kyoto — Google matched a street of the same name) is never used for directions or "nearby", and Scout
  says the pin looks misplaced. Before, Scout's walking-directions button would have gone there.
- Citation markup Scout occasionally writes out as words (`<ricite index="…">`) never shows in an answer.
- Try again (or the same question typed again) on a bad line no longer loses the answer the first try got: the new try
  looks for the earlier tries' answers too (tries of the same words in the last half hour that never got an answer).
  Try again in a tunnel keeps the promise to show the answer once the signal is back. (Since this morning's deploy the
  first try's answer could end in "I couldn't get an answer".)
- Web addresses in Scout's answers can be tapped, shown by a short name — Larisa's map is "Open her Google map ↗"; a
  link Scout names ("JR Central") is that name, tapped to open. Before, her map's address was plain text.
- Home, for Julie and Andy: "Right now in Japan" says the others "are in Nagoya now" once the day's booked train has
  arrived, not only from 6 PM.
- Words no longer run together where Scout's sourced pieces meet ("in her order:6:45 AM", "about 8:30.9:15").
- "How far is my hotel?" gets the distance to tonight's hotel (last night's on a moving day) whenever they're within
  100 km of it — Ken, at the Marriott, was told "I can't measure the distance": the hotel line was only written when
  her places were near.
- SPEC sections: AI chat (Scout's context, directions, Scout's panel); Home. SPEC UPDATE NEEDED.

## 2026-10-11 — Scout Knows Larisa's Google Map; Every Question Carries Its Own Tag

### Added
- Larisa's Google map (her "My Maps" map with every location of the trip, in layers she named) is something Scout
  knows: anyone asking for "Larisa's map", "her detailed map" or "her Google map" gets the link (it opens in Google Maps),
  and Scout uses her pins for "where is…", what's close to what (straight-line, never minutes) and directions when her
  sheet gives no address. A layer's name is hers, never a date. Wander reads her map again every few hours, read-only
  (its public export — nothing can change her map), and keeps the last good reading. Ken asked Oct 11; Larisa had set
  it to "anyone with the link can view". Where: Scout; Sources says "Her Google map".

### Fixed
- Scout's recovery of an answer the line dropped now asks Wander for the answer to exactly that question — each
  question carries a tag from the phone, saved with it and its answer. Words and times couldn't tell menu page 1's
  "What does this say?" from page 2's (a second photo's answer was lost even with no dropped line) or survive a phone
  clock running fast.
- Try again on a photo only while the photo is still on the phone; otherwise "send the photo again and I'll read it".
- After Start fresh on another device, no waiting line or Try again is left with no question above it.
- An answer found after the line dropped refreshes the screens (a note Scout added shows at once).
- Home: Julie's and Andy's "Right now in Japan" says "the others are in Nagoya tonight, after the trip from Hakata"
  from 6 PM Japan time (it said they "travel today" at 11 PM); the "Last day" of a free cancellation says until when
  ("Until 11:59 PM Japan time").
- Next: a booked train that has arrived folds into "Earlier today" once you've reached tonight's place.
- Scout calls her "LT actions" list a heading, never a person.
- SPEC sections: AI chat (Scout's sources, Scout's panel); Home; Next. SPEC UPDATE NEEDED.

## 2026-10-11 — Scout's Recovery, Finished: Later Reopens, Two Photos, Typed With No Signal

A second fresh check (verify9) of the Scout work found what was still missing, and one problem the last deploy caused.

### Fixed
- (Caused by the last deploy) A long answer still arriving could be cut short by the check for a stalled line, losing
  "Show me", the screens' refresh and the action chips. Found saved, the real reply now gets 15 seconds more; only a
  truly stuck line gets the saved copy, and showing it also refreshes the screens.
- Reopened long after a dropped answer (iOS drops a pocketed app): Scout looks once and shows the answer, instead of
  "couldn't" under it.
- Two photos sent without words (both "What does this say?"): each keeps its own answer; a second photo is never taken
  for the first asked again.
- Typed with no signal at all: said plainly at once ("No signal right now, so I can't answer…"); when the signal goes
  mid-answer and comes back, "No signal" turns to "I'm still on it".
- "Want me to try again?" always comes with its Try again button; Try again leaves when its question isn't on screen
  (Start fresh on another device).
- Past Oct 8 no longer says Hakata → Karatsu three times: her stay's travel note is left out when the day's own line
  already names that trip and says how long or how.
- The phone-report route takes only the fields the app sends, in their own shapes, small bodies only, at most 30 per
  person in 10 minutes.
- Where: Scout's panel; the day screen. SPEC sections: AI chat (Scout's panel). SPEC UPDATE NEEDED.

## 2026-10-11 — Scout Keeps Looking for the Answer; "via Meitetsu" on the Tokoname Morning; Honest Weather Lines

A fresh check of the morning's deploy found Scout's recovery worked only in the simplest case, plus a few smaller gaps.

### Fixed
- Scout, when the phone loses the line mid-answer, now keeps looking for Wander's saved answer however the moment
  plays out: the app reopened (iOS often reloads a Home Screen app after another app is used), a line that stalls
  instead of breaking (the saved answer shows as soon as it's there, without waiting out the 150-second limit), a long
  answer (looked for past Scout's own limit), the same question asked again or "Try again" (that ask takes over —
  never "I couldn't get an answer" beside it), a different question asked meanwhile (the first answer still arrives),
  a photo whose file name has brackets. With no signal at all (a tunnel), it says "No signal right now. If your question
  got through before the signal went, I'll show the answer here once you're back" and looks once the signal returns.
  Wander now saves each question as of when it was asked, so answers stay under their own questions in order.
  Where: Scout's panel.
- Ken's Tokoname morning: Next said "Nagoya → Tokoname · Local train · no booking" and never "Meitetsu" — her
  "Nagoya -> Tokoname (~40 min) via Meitetsu" was hidden as if the rail sheet's unbooked leg already said it. Only a
  booked train now counts as saying her travel note. Where: Next and the day screen.
- The day's weather: a day that's over shows no forecast (Oct 7 said "Forecast for Okayama" on Oct 11); on a phone
  not on Japan time, when the forecast was fetched is said on the phone's own clock, "your time". Where: the day
  screen and Next, the city band.

### Added
- Wander's server is told, in one short line, when the tab bar finds iOS's screen keyboard-short and what it did, and
  when Scout finds (or doesn't find) an answer the line dropped — numbers and short words only, never anyone's words,
  nothing shown on screen. So a real phone's ordinary use shows whether these fixes act (POST /api/phone-reports).
- SPEC sections: AI chat (Scout's panel); Next/day screen (travel notes, weather). SPEC UPDATE NEEDED.

## 2026-10-11 — The Tab Bar Stays at the Bottom; Scout Finds an Answer the Line Dropped; No False "Tabs Differ"

### Fixed
- The tab bar floated mid-screen (Ken's iPhone on Next, 8:43 AM Japan, half an hour after typing a note). An iPhone
  Home Screen app keeps its screen keyboard-short after the keyboard has been up, until the app is closed — an iOS
  behavior, on iOS 27 too — and the bar sat on that false bottom. Now, only in that state (iPhone Home Screen app,
  upright, nothing being typed), Wander first asks the iPhone to measure the page again (where you were reading stays
  put); if the screen is still short, the bar places itself at the phone's real bottom. Everywhere else the bar is as
  it was; Scout's panel is untouched. Where: the tab bar, every screen. Only a real iPhone can confirm it.
- Scout said "I couldn't get an answer just now" for questions it had answered (Ken on the Shinkansen: three
  questions asked twice — every first one answered and saved; the phone had lost the line). Now, when the line drops
  mid-answer (or the wait runs out, or Railway's gateway gives up), Scout says "The connection dropped while I was
  answering — I'm still on it, and the answer will show up here", looks for the saved answer for up to a minute and a
  half, and shows it — once. "Try again" stays there meanwhile. An error Wander itself sends back is said at once, as
  before. Where: Scout's panel.
- Her new day tab for Oct 7 ("107 Bizen") made every line that day say "her tabs say two different things" — the
  Itinerary's "Okayama → Bizen" at 8:30 shared a town's name with breakfast at the Okayama hotel, the Bizen studio, and
  the rest, though both tabs have the 8:30 train. A day's own towns (its city, its travel legs' ends) no longer make two
  lines "the same thing"; a line that is the same trip (both towns, the same way) at another time still differs, and a
  distinctive name (the HARUKA, Cafe Ensou) still does. One cell holding two plans with two times ("9:30a Bizen Tour +
  2p Kibido…") is read as two. Where: the day screen, Next, Home, Scout (her Guide's lines).

### Changed
- Larisa's Guide: the "-7" copy (Oct 11) — Cafe Ensou on Oct 28 at 1 PM (her Shigaraki tab agrees now), the Shigaraki
  question gone, her "DONE" notes, the Oct 7 Bizen tab. Day summaries for Oct 7, 9, 17, 28 and 29 rewritten and read.
- SPEC sections: Navigation (tab bar); AI chat (Scout's panel); Guide reading (tabs differ). SPEC UPDATE NEEDED.

## 2026-10-10 — What's Behind You Folds Away; Dinner Keeps Its Name; Larisa Is "You"

Ken's question, and three fresh testers walking the whole trip as Ken, Larisa, Andy and Julie, each on a fixed rubric.

### Fixed
- Ken, in the evening at the Hakata hotel, tapped Next and was told about the local train to Hakata. Once you've reached
  tonight's place (the evening, tonight's check-in time, or the booked train here has arrived), the morning's check-out
  and the lines with no time that only got you here fold into one quiet "Earlier today: … ›" row on Next and the day,
  and leave Home. The check-out goes once your first booked train has left. (Next tab, day screen, Home's Today.)
- Larisa was "her" and "she" in her own view, in about 20 places: the day summaries ("her tabs", "Ken and Larisa have a
  Nagoya day"), "Her Dining Resos tab lists this…", "the one she added most recently". To her they now say "your" and
  "you". Every day summary says "you" to the person reading it when it names them ("You and Ken have…", "with you and
  Andy still at home"). (Day screen: the summary, line details, two-versions note.)
- The two-versions note no longer names her cells ("Wander follows A46… A44 has other times"): "Wander follows the one
  she added most recently; the other has different times".
- On Robuchon night the restaurant on top changed at 6:00 PM, lost its confirmation, and was gone by 6:30. A booked meal
  under way is now "Now · LeTable de Joel Robuchon - 1F, booked for 6:00 PM" with its confirmation, for two hours, ahead
  of her plan's line at that hour. (Home, Next.)
- At dinner on Oct 28, Next said "NOW — 8:00 PM · Cafe Ensou" (the Shigaraki lunch café her Dining Resos tab also lists at
  8 PM) under "Now · Enyuan Kobayashi". A line her other tab puts at another hour, while this hour's line agrees, is
  never Next or Now; it stays in the day with its difference said, listed after. (Home, Next.)
- Oct 29 at 2 PM, on the HARUKA, Ken was told "Now · Arrive KIX, until about 2:30". While you're on a booked train, her
  plan's "now" line waits. Her "Arrive KIX" line says "Timed for the train in her tab — the booked train arrives 2:50 PM"
  on the day screen too.
- Julie and Andy's "12:00 PM California time" flight sat in Ken's midday on Home; it's at 4:00 AM Wednesday for him and is
  now listed after the evening.
- The rebooked HARUKA's details said "collect at an e5489 machine" under "car and seats are on the paper tickets". Once
  tickets are in hand (rebooked paper tickets, or after the pickup day) the collection steps are left out.
- "Rebooked on the new card" → "on Ken's new card"; "its OLD — Rail Detail tab" → "its Rail Detail tab"; "REBOOK —
  ACTION" → "rebooking"; "OLD — Pickup Plan" → "Pickup Plan"; links to two of her tabs no longer show cell names
  ("A57:B57"); Actions says "Other to-dos in her sheet (marked “LT”)"; "(Japan's date)" → ", Japan time"; "On this Japan
  date you're still at home" → "You're still at home".
- On California mornings before their flight, Andy and Julie were asked "Anything worth remembering from today? / Not
  tonight" (Japan's evening) — the morning Julie flies, right under "You leave today". Scout's evening question is never
  asked on a Japan date you're still at home, nor on a visit something else has asked, nor during a booked dinner; when
  it asks, the tour offer waits for another visit.
- Julie's Oct 13 said "The others · Julie & Andy depart SFO, Ken & Larisa arrive in Tokyo": a line naming you is never
  "the others'".
- "Larisa's words: “You land at Narita”" — Wander's sentence quoted as hers. Only her own words are quoted as hers.
- Maybes opened on "Osaka" for Andy and Julie at home. It opens on the next city ahead of you that has ideas (Tokyo).
- Shigaraki's "that “you” is her map's, not you": now "a picture in her tab puts it under “You & Julie (morning)” — your
  name is in it" for Julie, "(her picture's words)" for others.
- "Wander placed this plan on this day; a picture in the tab dates it differently ›" read as a warning: "Why this plan is
  on this day (a picture in her tab shows another) ›".
- A note written at home was stamped with Japan's date and the phone's clock: it says "written Sat, Oct 10, 9:00 PM your
  time".
- Evenings: no "check in any time from 3:00 PM" at 8 PM, and Home drops tonight's check-in row once you're there.
- The whole trip page gave Hotel Granvia Okayama the Imperial Hotel's confirmation and cancel-by dates (it matched hotels
  on "Hotel"). Hotels are matched by the words that name them.
- "Send this day" left out the booked trains (Oct 11 was only "Sleeping at: Nagoya Marriott"); they're in it, in time
  order.
- Notes jumped 300 pt when the story question arrived after the list; it's in the first drawing or waits for another
  visit.
- With no signal, Home offered Ken the first-time welcome he'd seen three times. Wander keeps the answer on the phone and
  never offers it on a guess.
- The arrival photo for a new city played before you'd left the old one (Nagoya's at 8:30 AM in Hakata). On a travel
  day it waits until the booked train in has arrived, or you've reached tonight's place.
- Scout said the Robuchon cancellation charges "started yesterday" on the day they started. Its deadline status now says
  the day in words ("that's TODAY").
- (follow-up) Home's map marked the others' city as "today's stop" (a dark chip on Nagoya, then Tokyo) while Julie and
  Andy were at home; no city is today's for someone still at home on that Japan date. Two phone numbers side by side
  ("03-5424-1338 / 03-5424-1347") are each their own full-height row, so a tap on one never dials the other; the day's
  "Map ↗", Scout's "Copy" and a note's date link are finger-sized.
- (follow-up, from a fresh check of the above) Day summaries name the travellers as written again: turning "Ken and
  Larisa have…" into "you and Larisa have…" left the next sentence's "They check out…" pointing at Julie and Andy. To
  Larisa, Wander's words about her Guide still say "your" ("your tabs name two…", "which you note is likely kaiseki").
- (follow-up) On the morning Julie and Andy fly (Japan's evening), Home said "Now · Tapas Molecular Bar" — Ken and
  Larisa's table for two in Tokyo — and earlier "Next · 8:00 PM … Tapas". On a Japan date you're still at home, Home's
  now/next only take lines that name you. In the air, Home said "You hadn't left home yet": now "You were still at home
  for this day of their trip."
- (follow-up) "Send this day" lists a time on another clock with its clock ("12:00 PM California time") after the day's
  Japan times. On a day trip, the morning's train out folds into "Earlier today" with the evening's return; a transfer to
  tonight's hotel folds too. The arrival photo waits until you've landed on your landing day.
- (follow-up, from a second fresh check) The morning Julie and Andy fly, Japan's date is already their landing date, and
  Home's map marked Tokyo as their "today's stop" from 8 AM California time: no city is theirs until their plane is due
  to land. Larisa's Oct 5 summary said "Ken and your flight": the second of two names keeps its "Larisa's".
- (follow-up) "Ken & Larisa were to collect these at Pickup Plan" (a tab's name read as a place) → "at Shin-Osaka".
  A train's "Green" class says "Green Car (JR's first class)". On Home a free-cancellation date is "Last day … Nothing
  to do unless plans change", not a gold "Deadline". The whole-trip page says a flight's clock ("12:00 PM California
  time").
- (follow-up, from a third fresh check) No arrival photo before you've landed, whichever day is opened (in the air with
  the phone on Japan time, tapping Tokyo on the map opened Oct 13 and used up the photo). "Green" says "Green Car (JR's
  first class)" on the Next tab's train card and every train row too. Before you land, Notes doesn't call Tokyo "where
  you are" and Maybes doesn't call it "today". A line tapped on Home opens on its day and stays open (it closed by
  itself after 2.5 s and the day jumped 158 pt), opened before it's brought into view, so nothing moves.
- (Ken, Oct 10) The day's weather is the live forecast for where you are (Open-Meteo, °F, chance of rain, and when it
  was fetched — with its day when that wasn't today), kept on the phone for no signal. Her sheet's pre-trip line shows
  only when there's no live forecast, labelled "Her pre-trip estimate". (Next tab and day screens, the city band.)
- Actions quotes her Actions tab's heading as written: "Her “LT actions” list" (it isn't a person's list).
- Scout no longer has the train-status tool: it read an old, empty route list and told Scout "No train segments in your
  itinerary". For delays Scout looks up the railway's own status page and says it found it online.
- On landing day, "Getting from Narita to the hotel" leaves Next three hours after landing (was four).
- SPEC sections: Day screen (weather), Actions, Scout tools. SPEC UPDATE NEEDED.
- SPEC sections: Next, Home, Day screen, Notes, Maybes, Whole trip, Actions, Scout. SPEC UPDATE NEEDED.

## 2026-10-10 — The Second Audit's Fixes: a Still Day, No Freeze on Opening, One Ask at a Time

A second independent check, signed in as each real person, found what the first round hadn't fixed. All of it:

### Fixed
- **The day screen moved under the reader, and the 10:36 NOZOMI was briefly missing** (it drew, then the summary and
  the train arrived and pushed it down 200–400 pt — even on a day opened before). Everything the day draws (her Guide,
  the rail sheet, Wander's summaries, her other tabs, her maps and pictures, plans added in Wander) is asked for at once
  and drawn in one step; the phone keeps a copy of each. On a very slow first open the day waits up to 4 s, then says
  "Still getting the train times from the rail sheet…" rather than look trainless. The Next tab's Phrases button no
  longer arrives late and moves the header. Day screen, Next tab.
- **"Started · … charges start" over "Ended"** on Next and the day's short line: both now say "These charges apply now.
  Nothing to do — it stays booked." (A closed free-cancellation window: "Free cancellation has ended…")
- **Julie's and Andy's Home on their flight day** listed Larisa's Robuchon reminder, and "Nagoya to Tokyo" above their
  own flight. Home's Today card lists only your deadlines; on a Japan date you're still at home, her lines sit under
  "The rest is the others' plan."
- **Opening the app froze Home** (up to 1 s at a time, 2–9 s in all) while the map worked out where its names and lines
  go. That work now happens in the background (a worker), and the finished map is kept on the phone with the view it
  settled on: reopening draws it at once, nothing worked out. The map looks exactly as before. Home.
- **Hakata's arrival photo was a Christmas scene; Okayama's a winter garden.** The photo check now looks at the whole
  picture (Christmas or New Year decorations, snow, bare trees, brown lawns, cherry blossoms) and names what it sees;
  if no photo of the city's sights fits October, there's no photo. Hakata's is now Ohori Park.
- **The arrival photo landed over a day being read.** It shows only in the day's very first drawing (asked for ahead:
  Home readies today's city's photo); otherwise it waits for the next visit. Phones can't keep showing a replaced photo.
- **Actions led with "Free cancellation ends… Nothing to do"** for everyone. Deadlines that ask nothing sit below as a
  quiet line ("Nothing to do unless plans change"); "LT's to-dos" (initials no one on the trip has) reads "To-dos marked
  “LT” in her sheet"; a tick and its Undo no longer show in Recent activity; the tick confirmation sits above the tab
  bar, the screen's width (it covered the tab bar in a half-width box).
- **Julie's question read like spreadsheet cells.** Now: "Larisa is asking whether you're interested in Mashiko
  (ceramics town) — her Guide has it on Tue, Oct 13: “X, if Julie isn't interested”." "Tell Larisa your answer" says
  "Copied — paste it…" when the phone copies instead of sharing (it used to do so silently).
- **Two asks at once on a first visit** (Safari: the tour offer and "Set up Face ID"; the Home Screen app: the leaving
  card and "Set up Face ID"). One per visit, in order: the leaving card, then Face ID, then the tour.
- Small: in the air, Next says the take-off once (it said it in California and Japan time); Scout's packing answer names
  days by date (not Backroads' "Day 4") and each place once; a note told to Scout about a shop in Arita is filed under
  Arita (not the day's city); "The whole trip on one page" says "Yours (Julie & Andy)" for your own lines.
- SPEC sections: Home (Today card, map, asks), Day screen / Next, Actions, arrival photo, Scout (packing, notes).
  SPEC UPDATE NEEDED.

### Fixed (what the independent check found after that deploy)
- A passed "reconfirm" line on a day's short list said only "Ended." under "Started · … charges" — it now says Wander
  can't tell whether it was done, and to ask Larisa, as the opened card does.
- Charges that have started: Home lists them under "Now in effect" (not "Just passed"), described by whose name the
  booking is under (not "Larisa's to do"); the whole-trip page says "These charges apply now" too.
- "Done ✓" under a deadline read as already done: it says "Mark it done".
- The welcome ("Hi Andy… Show me around") arrived a moment late at the top of Home and pushed the page down a third of
  a screen: it now comes up as a card just above the tab bar, over Home, buttons on one row. Nothing moves.
- On a phone's first open the map settled late and shrank, moving the page: it never shrinks under someone reading;
  it keeps its height that visit and opens at the right height every time after.
- A tick in Actions shows on the line at the same moment as its message; "Recent activity" isn't a heading over
  nothing; Home doesn't scroll behind the "You leave in N days" card.
- Julie's Oct 13 day: her take-off said once (the Tonight box says she's on the plane and when she lands); Ken &
  Larisa's 8 PM dinner no longer opens by itself on a date she's still at home.
- A "from her … tab" line is a link from the day's first drawing (it became one a moment later and moved the list).
- A question in her Guide isn't put to someone on a Japan date they're still at home (Ken: "is Julie even in Japan when
  the event happens?" — Mashiko on Oct 13, "X, if Julie isn't interested", while she flies). The line stays listed;
  Shigaraki (Oct 28, when she's in Kyoto) is still asked.

### Fixed (a fresh tester walking Andy's, Julie's, Ken's and Larisa's next days, scored on a fixed rubric)
- Next said "Tomorrow · 6:30 PM · Yakiniku Yazawa" the evening before Andy's Ginza day, which starts at 8:30 AM at
  Tsukiji; Ken's evening said "Tomorrow · Check out" with the 10:36 NOZOMI unmentioned. Tomorrow's first thing is now the
  earliest of her Itinerary, her detailed day plan and your booked trains — on Next and Home; Home's "and N more" counts
  every stop.
- Just landed, Julie's Home first said "her Guide doesn't say" how to reach the hotel, then quoted her hotel notes. It
  never says that before her tabs are known, and keeps a copy of them on the phone.
- Cards that arrived late and pushed the page: "Set up Face ID" now comes up above the tab bar like the welcome; Scout's
  evening question is decided in the first drawing; Home draws the rail sheet's lines and plans added in Wander with the
  rest.
- On a date Julie is still at home, the others' unnamed lines (the 8 PM Tapas dinner) are said to be the others'.
- Larisa's own words ("our arrival… your arrival") are said to be hers; "In her Itinerary for this day" on days other than
  today; tapping your flight on Home opens the day at your flight; Actions says "In her list for Andy & Julie" (not
  "AB / JD Actions") and "your" list to Larisa.
- A Scout answer showed a link as "[JR Central](https://…)": it shows the name.
- SPEC sections: Next, Home, Actions, Scout. SPEC UPDATE NEEDED.
- SPEC sections: Home (welcome, deadlines, map), Day screen, Actions. SPEC UPDATE NEEDED.

## 2026-10-10 — The Leaving Card Never Pops Over What You're Doing

### Fixed
- Ken: "conflict in the UI since both are early and unexpected info… Overlap, race condition". On a slow signal the
  "You leave in N days" card came seconds late — over Scout's packing offer if Julie had tapped Scout, or over Home she'd
  started reading. Now it shows only if it's ready before she's touched anything, with nothing else open; otherwise on
  her next visit (not used up). It reads the phone's saved copy of the trip at once, so a slow signal doesn't delay it.
- Tapping Scout in the first second after opening Wander lost Julie's packing offer for that visit (opening Scout cut
  off the read bringing it, and the next read waited 15 s). A cut-off read is redone at once.
- SPEC sections: Home (leaving card), Scout. SPEC UPDATE NEEDED.

## 2026-10-10 — The Independent Audit's Fixes

An independent check, signed in as each real person, found what the day's work hadn't fixed or had missed. All of it:

### Fixed
- Julie was told she's in the air after landing (3:00–4:00 PM Japan time on Oct 14, phone still on California time):
  "today" for a person is Japan's date from their scheduled landing until their flight home (travelerToday) — Next and
  Home. Home also said "Should be in the air" then.
- Home froze 4–9 s after every return: the map worked its layout out ~9 times because Home handed it a fresh copy of the
  same lists on each redraw. The layout is kept per trip, contents and view; the map counts only a real change of view;
  Home keeps a fresh copy that changed nothing. Back on Home: map and calendar drawn at once, no freeze.
- Julie's first open stacked three asks: one ask per visit (20 minutes) — the "You leave in N days" card goes first,
  the "Show me around" offer waits for a later visit (not counted against its three offers).
- Notes: a note tidying left alone said "tidying would have changed more than a few words" (untrue) — now "Left exactly
  as you said it."; "Change" on a tidied note opened the lower-case words as said — it opens the tidied words read.
- Actions: yours first — your deadlines ("Yours (Julie & Andy)", as Home says it), the ones asking something on top;
  others' folded by whose they are ("Larisa's deadline · 1 ›"). Ticking a to-do says so, with Undo.
- Julie's Oct 13 "A question for you" now shows Larisa's words ("X, if Julie isn't interested").
- Another party's to-do (Larisa's Robuchon reminder) is off Julie's and Andy's day lists and Home; Ken still sees it.
- Oct 11 read out of time order (deadlines above the 10:36 NOZOMI): a deadline with no time waits for every train.
  "Free cancellation ends" is no longer under "Don't miss" (it asks nothing).
- A passed "cancellation charges start" said "Ended" (read as the dinner being over): "Started · … These charges apply
  now."
- The day's summary dropped in late and pushed the day down: shown at once from the phone's saved copy.
- The city photo landed over a day being read (2.6 s late): it shows by itself only if ready within ~1.2 s; a photo
  showing another season (Hakata's had Santas) or not a view of the place is passed over for the next sight's.
- Scout's packing answer: a rule for some trains isn't stretched to the HARUKA; each place named once.
- "Tap Sources to see where in Larisa's Guide…" only under answers that quote her Guide.
- Notes header solid; a waiting note's word count follows a change; the story question has "Not now" (a day).
- A phone signed in under an old name ("Andy B") takes the current one from Wander (the Maybes dot).
- Wording: "Loading..." → "Finding what needs doing…"; "Couldn't save/add" → "That didn't save/add — try again?"
- SPEC sections: Home, Next/day screen, Actions, Notes, Scout, arrival photo. SPEC UPDATE NEEDED.

## 2026-10-10 — Scout Keeps What You Tell It; Its Panel Stays Put While You Type; Julie's Packing Offer

### Fixed
- Scout's panel went off the screen while typing to it, and the tab bar floated mid-screen behind (Ken's screenshot at
  Okawachiyama). Typing, the panel was placed from the page's height, which an iPhone can misreport; it's now placed from
  the visible part of the screen itself, and the dimmed page behind covers all of what you see. iPad likewise.
- Andy's and Julie's own lines read as someone else's (since ~Oct 3): their accounts were "Andy B" and "Julie D.", and
  Wander looked for the whole name in her Guide's "Julie & Andy". Now the first name counts too (lib/guideDisplay.ts
  samePerson / hasName) — Home's "yours", the day screen's "Yours · Julie & Andy", their flights and landings, the
  "You leave in N days" card with its Japan fact (it never showed for them), Actions' "yours first", the rail sheet's
  "your next train", "Booked under your name", Notes and the evening question. The accounts are renamed "Andy" and
  "Julie" (as they know themselves); the server now takes a person's name from their account, not from the phone's
  sign-in, so a renamed person is known by the new name at once (middleware/auth.ts).
- Saving one personal setting no longer replaces the others (the server keeps what isn't sent). The unused new-member
  welcome screen sent only interests, which would have wiped the tour answer and notes settings.

### Added
- Scout keeps what you tell it about the trip — what happened, what you saw, why the day went as it did — in your Notes
  for that day, marked "told to Scout". Only your own words are kept: the server checks every word Scout passes is in
  what you said (a part of your message, or an earlier one in the conversation), exactly as you wrote it; Scout's
  rewording is refused. Private unless you ask to share. With "Tidy my dictation" on, it's tidied like a spoken note
  (misheard words, punctuation, "um"s — the original one tap away). Scout replies in one line ("In your Notes for today —
  just you."), adding one sentence only when a booking is touched. New Scout tool keep_in_my_notes.
- Julie's first visit to Scout (until Oct 13 ends, Japan time): "Ken mentioned your quip about packing…" with one question
  to tap, and Later / No thanks (Ken: "people are in a hurry … there should be a show me later option"). Later brings it
  back six hours on, at most three offers (the last without Later); asking Scout something else first counts as Later;
  No thanks ends it ("ask me what to pack" still works). With a conversation already under way it comes after it, shown
  from its first words. The answer comes from a checked list of what Americans most often say they wish they'd brought to Japan
  (services/packing.ts, official sources for the rules), tied to her own days where the Guide shows it. Andy (or anyone)
  can ask Scout for the same list; it's never put in front of him. New Scout tool packing_tips.

### Changed
- Scout no longer says "Larisa's Guide is unchanged" every time it adds a plan — only when asked.
- "Tidy my dictation" never adds feeling: no exclamation marks, emphasis or emoji the writer didn't give (Ken: an "!" he
  never said "could leak into an eventual trip story"); a tidy that adds one is thrown away, the original kept.
- The tour answer and the profile's interests are saved on their own, never the whole set of choices (a copy read a
  moment earlier could undo a newer choice).
- Settings → Tidy my dictation, Notes and How Wander works say that Scout can keep your words in Notes.
- SPEC sections: Trip notes; AI chat (Scout tools); Scout panel on iPhone. SPEC UPDATE NEEDED.

## 2026-10-09 — Actions: Yours First, Others' Lists Folded, Done Marked in Wander

### Changed
- Actions (Ken: "it seems to include old actions, non actions, and actions not for me"):
  - Your to-dos (and everyone's) come first; each other person's list is one quiet row ("Andy & Julie's to-dos · 4 ›",
    "LT's to-dos · 1 ›") that opens in place. With nothing of yours open: "Nothing for you right now."
  - A to-do from Larisa's Guide can now be marked done in Wander by the people it's for (and the trip's lead). Her lists
    with no status column ("AB / JD Actions") could never finish before. It's Wander's record — never written to her
    sheet — said with who and when ("done — Andy, Oct 14"), with "Not done after all".
  - A deadline that asks something (reconfirm, pay, book…) has "Done ✓" for whoever it's for, or the trip's lead.
    Marked done, it leaves Actions' deadlines, the day's "Today, don't miss" and Home's deadlines; its card on the day
    says "Done — Larisa, Oct 14 (marked in Wander)". "Free cancellation ends" asks nothing and has no Done.
- Scout: told which deadlines were marked done (never reminds anyone of them); its to-do list says who marked one done.
  Its "set_todo_done" on one of her to-dos now marks it in Wander instead of changing her list (which every re-read of
  her Guide rebuilt); new "set_deadline_done" ("I reconfirmed Robuchon").
- New table action_marks (key per her to-do's place in her list, or a deadline's words and date — stable across re-reads).
- SPEC sections: Actions; deadlines; AI chat parity. SPEC UPDATE NEEDED.

## 2026-10-09 — Scout's Panel Stays on the Screen; the Day's Tab Bar Changes Withdrawn

### Fixed
- Ken: "Wander is not stable. Tapped scout… Tried to expand scout panel and got second (scout gone)" — the expanded
  panel sat above the top of the screen. After typing (a note), an iPhone can go on reporting a keyboard-sized screen
  with no keyboard; Scout lifted its panel over that keyboard. Now Scout believes the keyboard is up only while a box in
  Scout is being typed in; otherwise it uses the page's full height. Rechecked when typing starts or stops.

### Removed
- Both of the day's tab bar changes (stepping away while typing; moving itself to the measured bottom) are withdrawn —
  they acted on the same misreported screen as Scout's panel. The bar is as it was before Oct 9. The floating bar Ken
  saw comes from the same iPhone misreport; to be solved without touching Scout.

## 2026-10-09 — The Tab Bar Comes Back to the Bottom (withdrawn — see above)

### Fixed
- The tab bar still floated mid-screen on Ken's iPhone after the first fix. It now finds where the screen really ends —
  from where it's actually drawn and the part of the page on screen — and moves itself there whenever iOS changes
  either (after the keyboard, a scroll, coming back to Wander). It still steps away while you type.

## 2026-10-09 — Home's Map Shows at Once When You Come Back

### Changed
- Home: the trip map was built from nothing on every visit to Home (Ken: "every time I go to home, there is a delay in
  showing the map"). Now the map built the first time is kept and used again while Wander is open, with the view it
  settled on — height, zoom and middle — so coming back to Home it's there at once, at the same size (it had also changed
  height a moment after showing). In a test browser: back to Home in about 60 ms instead of 0.7–3 s. The first Home
  after opening Wander still builds the map. The calendar was already shown from the phone's copy, its little maps kept.
- SPEC sections: Home map. No spec change in behavior beyond speed.

## 2026-10-09 — Notes Waiting for Signal Catch Up, and Can Be Changed; the Tab Bar Stays Put

### Fixed
- Notes: Ken's two notes said "waiting for signal" on full LTE though Wander already had them — the reply had been slow,
  the one quick retry was slow too, and nothing tried again until the phone went offline and back. Now, while Notes is
  open, waiting notes try again every 20 seconds and whenever Wander comes back to the front; a note Wander has leaves the
  waiting list.
- The tab bar floated mid-screen over his notes after typing (iOS leaves a bottom bar where the keyboard pushed it). It
  now steps away while you type in any box, and comes back at the bottom when the keyboard goes.
- Wander's sending of things kept on the phone runs one at a time, so nothing is sent twice when two tries overlap.

### Added
- Notes: a note still waiting for signal has "Change it" (Ken: "I wanted to edit the last note I added and could
  not"). The change goes with the note; if its first words already reached Wander, it arrives as an edit — the first
  words kept as the original — and a late resend never undoes an edit made since.
- SPEC sections: notes (offline queue). SPEC UPDATE NEEDED.

## 2026-10-09 — Rebooked Trains Said as Rebooked; the Line That's Now Opens Itself

### Fixed
- Ken's rail sheet gained a "REBOOK — ACTION" tab: five trains (Oct 11, Oct 13, both Oct 14, Oct 29) cancelled and
  rebooked on a new card, the old tabs renamed "OLD — …". Wander didn't read the new tab, so it kept showing the
  cancelled bookings' seats, and Scout could give their reservation numbers. Now a rebooking tab is recognized by its
  header (cancelled, rebooked, date, train — whatever else it has), and for each train it marks cancelled:
  - its old reservation #, seats, cost, notes and boarding note are kept only as "the cancelled booking's" — never on a
    screen or from Scout as current;
  - the train card, the Next tab's train card and Scout say "Rebooked on the new card — car and seats are on the paper
    tickets" (a paper-ticket booking; Ken: tickets picked up before cancelling, nothing outstanding); the new number and
    seats show once they're in the sheet;
  - a train cancelled but not rebooked says there's no booking for it; one not yet cancelled keeps its booking.
  - The old Shin-Osaka pickup's "not ticked" warning no longer applies to these trains.
- The sheet's "Reso #" column is read as the reservation number, like "Reservation #".
- Tapping the Next tab's train card or a "Don't miss" line brings a tall, opened line in at its top, clear of the
  header (centered, its name and time went above the screen).

### Changed
- Day screen (day design step 3): on today's screen the line that's now opens by itself — the train you're on, else the
  sooner of your next booked train and her next timed line for you, the same reckoning as the Next tab. Earlier timed
  lines turn a quieter color (still easy to read; never hidden); lines with no time never do. On a day ahead, its first
  timed line opens; a day looked back on stays short. Days with her plan keep their own "Now".
- SPEC sections: day view; Ken's rail sheet. SPEC UPDATE NEEDED.

## 2026-10-09 — Each Line of the Day Is Short Until Tapped

### Changed
- Day screen (Ken: "an absolute yes" to the layered day; designed with a UX-expert agent): each line of the day is a
  short row — its time and what it is — and a tap opens the rest in place ("Show less ‹" closes it). Only what you
  can't be without stays in sight on the short row:
  - a booked train: its times ("8:07 AM → 9:00 AM"), name and route, car, seats and reservation #, any check before
    boarding, and her Guide's other time for it;
  - a car, taxi or local leg with no booking: one thin row joined to the day ("After train · Utsunomiya station →
    Mashiko town · Car / taxi · no booking");
  - her lines: the title, a still-open question or her tabs disagreeing, a question for you (with what the rail sheet
    says about it), check-out timing, a flight's status, take-off on Japan's clock and confirmation;
  - a meal: its name, whether it's booked, and its Map; a to-do: its window and phone numbers.
  Class, "Booked · from your rail sheet", "Ken + Larisa only", addresses, sources and her notes open on a tap.
- A booking under a line of her plan (Oct 15's Yazawa) is short the same way, its disagreement still in sight.
- "Today, don't miss": tapping a line with ↓ now opens the line it points to, not just scrolls to it.
- Tapping someone else's one-line row opens it fully in one tap.
- SPEC sections: day view. SPEC UPDATE NEEDED.

## 2026-10-08 — The Day Reads in the Order It's Lived

### Changed
- Day screen, on days without Larisa's detailed day tab: everything now sits in one list in the order the day happens.
  - A car, taxi or local leg from Ken's rail sheet with no booking sits beside the booked train it connects to: right
    after the train before it, or just ahead of the next train when it goes to where that train leaves. On a day with
    no booked train, it sits by her line about the place it goes to or leaves from. (Oct 14's two Mashiko taxis were
    under "More trains"; Oct 12's Tokoname trains and Oct 23's train to Kyoto were in a separate Trains section.)
  - Her lines with no time sit right after the train or leg that goes where they name: her Mashiko day after the taxi
    to Mashiko, "Nagoya to Tokyo" after the NOZOMI 6, "Okayama → Hakata…" after the NOZOMI 9.
  - Her Itinerary's own heading for the day ("day 1 - JA Arrive (evening), KL day trip to Mashiko", "travel day") is
    one quiet line at the top, "In her Itinerary for today: …", as on days with her plan, not another card.
  - A long travel note of hers on a line folds behind "Larisa's travel note ›".
  - Her stay note's travel lines aren't repeated at the top when a train or leg in the day already makes that journey
    (Oct 8's "PT1/PT2"); they stay in the stay's note at the bottom.
  - A rail leg whose notes say only "Ken + Larisa only" says it once.
  - A line from two of her tabs names them quietly ("From Larisa's Guide — Itinerary ↗ · Activities Template ↗").
- "Today, don't miss" now includes a to-do ending today that belongs to someone in your own party, said as theirs
  ("Larisa's to-do, last day today: Reconfirm … Robuchon …"). Others on the trip don't get it. The to-do card itself
  says "Booked under Larisa Fong", not "Larisa's to do" a second time.
- The city's photo on the first visit to a city stays 1.5 seconds longer (3.1 s before it fades). Tapping the city's
  name at the top of any of its days brings the photo back; a faint picture mark beside the name hints at it.
- SPEC sections: day view / itinerary display; city arrival photo. SPEC UPDATE NEEDED.

### Fixed
- Oct 13 showed Julie & Andy's take-off as "12:00 PM" in Ken's Japan-time list, after his 8 PM dinner. That was
  California time; it now says "Wed 4:00 AM" (Japan). Any other person's one-line row on another clock is said on the
  trip's clock.

## 2026-10-08 — A Plan Added in Wander Sits at Its Time in the Day

### Changed
- On a day screen, a plan added with "+ Add a plan for this day" that has a time now sits at that time among Larisa's
  lines, marked "Added by you · not in Larisa's Guide" (or by whoever added it), with Tell Larisa and Take off this day
  on it. On a day with her detailed plan it is a row in "Larisa's plan for the day"; on other days it is a card between
  her lines and trains. A plan with no time stays under "Added in Wander" further down. Home, the Next tab and Scout
  already treated added plans as part of the day; the day screen now matches.
- Where: the day screen (tap a day from Home). Nothing is written to her sheet.
- SPEC sections: day view / itinerary display. SPEC UPDATE NEEDED (added plans interleave with Guide lines by time).

## 2026-10-05 — Scout Says "Larisa's Guide" to Everyone but Larisa

### Fixed
- Scout once told Ken "your Guide has dinner at Une Immersion". Its instructions said Larisa hears "your Guide" but not,
  outright, that everyone else hears "Larisa's Guide"; now they do. Re-asked as Ken: "Larisa's Guide has Une Immersion
  at 7:00 PM"; as Larisa: "your Dining Resos tab … your own transit note".

## 2026-10-05 — "Say This in Japanese" Gets Only the Japanese

### Changed
- Asked to put something into Japanese for someone ("ask the waiter if…", "tell the taxi driver…", "translate this into
  Japanese"), Scout replies with only the Japanese — no English, no lead-in, no pronunciation — so what's shown or read
  aloud is just the sentence for the other person (Ken: "if Scout is asked to translate something, it should assume it
  should only give the Japanese"). It uses the trip (the booking's time, the hotel and its address, an allergy). Asked
  how to pronounce it, it adds the pronunciation; asked what something means, it answers in English; Japanese into
  English (a menu, a sign) is unchanged. A request that also asks something for you gets the Japanese, a line, then the
  English.

Where: Scout's answers.

Tested: real Scout, six questions (test copy): the dinner reservation (only Japanese; 7 PM checked against her Oct 16
plan), pronunciation (Japanese + how to say it), a closed-for-a-private-event sign (English), the taxi to the Imperial
Hotel (only Japanese, with its address), Andy's allergy with "broth is fine" (only Japanese, the exception kept), a
mixed request (Japanese, then English for Ken); full backend suite.

## 2026-10-05 — Read a Scout Answer Aloud

### Added
- **"Read aloud" under each Scout answer**, beside Copy (Ken: "put a button into Scout's answer to make it read the
  answer"). The phone's own voice, nothing sent anywhere. It reads the whole answer — from that bubble to the next
  question, since an answer can come in two bubbles (one button per answer) — as words: no ** marks, a web address said as
  "a link". Japanese in an answer (a menu line, the words to show staff) is read in a Japanese voice. "Stop reading" stops
  it; closing Scout or reading another answer stops it too.

Where: Scout's panel, under an answer.

Tested: in the browser with the phone's voice stood in (7/7 — the words said, Japanese in a Japanese voice, Stop, end,
closing Scout); Scout's panel checks 32/32; Playwright 20/20. On a real iPhone: not yet heard.

## 2026-10-05 — Ask Scout From a Link (for a Siri Shortcut)

### Added
- **wander.up.railway.app/?ask=<question>** opens Wander with Scout asking that question (Ken: the fastest way to ask
  Scout with Siri — a Shortcut that dictates the question and opens this link). The question leaves the address at once,
  so a reload or Back never asks it twice. Signed out, the link opens the sign-in first and the question isn't asked.

Where: any page's address; Scout's panel opens with the answer.

Tested: in the browser, signed in — the question reaches Scout once, word for word; Scout open with the answer; the
address cleaned; a reload doesn't ask again (4/4); Playwright 20/20.

## 2026-10-04 — "Show me around", Offered Up to Three Times; Kyoto Mon and Tue Tabs Open Exactly

### Changed
- **"Show me around" is offered up to three times** (Ken: "I'd like it offered at least 3x with Yes, Next time, No
  Thanks"). The welcome card on Home offers it with "Show me around", "Next time" and "No thanks". "Next time" brings it
  back on a visit at least 12 hours later; an offer not yet answered stays on Home for the rest of that visit. The second
  and third offers are one line ("Want a quick look at the buttons along the bottom, Julie? Six short steps."); the third
  has no "Next time" and says it's the last, and that it's always in Settings. The answer is kept per person on Wander,
  so a new phone or the Home Screen app doesn't ask again (and an answer this phone kept but never sent goes the next
  time). Before, one tap of "Got it" retired it for good on that phone. Anyone who saw the old card counts it as the
  first offer.
- **Larisa's Kyoto Mon 10/26 and Tue 10/27 tabs** now open at the exact spot from Sources (Ken's links; 17 of her 28
  tabs have their address — the rest are reference tabs, opened with the tab and cell said in words).

Where: Home's welcome card; Sources links.

Tested: the three offers across visits in the browser (11/11 — Next time, the 12 hours, the last offer, No thanks kept on
Wander with her other preferences, a new device not asked again, the tour starting); Sources walk with the Kyoto tabs;
all walk-throughs; Playwright.

## 2026-10-04 — A Status Settled by Hand Reads as Done

### Fixed
- Ken finished designating the IC cards for the Oct 6 NOZOMI 77 and changed the rail sheet's status cell from
  "PENDING" to "Done (my suica and her pasmo are confirmed in the reservation) — SmartEX: verify …", keeping the rest of
  its words. Because the leftover words still said "verify", Wander would have kept the reminder under "Today, don't
  miss" in amber. A status that starts with Done, Complete, Confirmed, Verified or ✓ is now settled: it shows on the
  train in the color of a thing done, never under "Today, don't miss", and Scout is told it's done.

Where: the day's trains, "Today, don't miss", the Next tab's train card; Scout's view of the rail sheet.

Tested: his real cell, read into the test copy — the status shown as he wrote it, in green, no reminder; the day-page
risk check now follows the sheet either way (20/20); rail-sheet tests 18/18; Playwright 20/20.

## 2026-10-04 — Scout's Conversation on Every Device; Reading Larisa's Oct 4 Copy

### Added
- **Your Scout conversation is the same on every device** (Ken: "When I change devices or change between a webpage
  and web app … I seem to lose the history"). Each answer was always saved on Wander; the screens showed only the copy
  on that device — and an iPhone's Home Screen app keeps its own, apart from Safari. Scout's panel now reads the saved
  conversation when it opens and when the app comes back to the front: your own questions and answers on that trip,
  with each answer's sources, place cards, screens and directions. What only that device has stays in its place — a
  question that didn't get through, a just-arrived answer not saved yet. "Start fresh" now asks "Clear this
  conversation on all your devices?" and starts fresh on all of them (a marker; what was said stays saved). Reading the
  conversation back never counts against Scout's "a moment to catch up" limit.

### Fixed (her Oct 4 copy, kept as "Japan Oct 2026-6")
- **A sentence in her Hotel column is her note, not a hotel.** Itinerary T40 — "AI estimates our arrival to the hotel
  (6:15-6:45p) and your arrival (6-6:30p) and to aim for dinner between 7-7:30p" — was read as a second hotel for
  Oct 14–17 ("more than one place to sleep tonight"). Now it's a note on Oct 14, in her words; a hotel name with a
  bracketed note ("Hotel Granvia Okayama (chk in 3p, chk out 12p)") stays a hotel.
- **A pasted copy of Ken's rail sheet** (her new tab "COPY of Ken Rail sheet") is known by its column headings. Its rows
  had been read as her words — credited to her Guide, and pinned to the Four Seasons ("Four Seasons: 'HARUKA 31'"). The
  tab is kept, with one line saying what it is; Scout says it's a backup and answers trains from Ken's sheet itself.
- **Personal email addresses and US phone numbers in her tabs are left out** (the Four Seasons tab holds a forwarded
  confirmation email with Ken's and Larisa's addresses and Ken's phone, which Scout read as they were). A hotel's or
  restaurant's own address and Japanese numbers stay.
- **The rail sheet's answer under a question put to you** shows for any such question, not only one ending in "?"
  (Julie's Oct 13: the Mashiko question now lives only as "X, if Julie isn't interested" in her Activities tab).

Where: Scout's panel; every screen reading her Guide. Server: GET /api/chat/history, POST /api/chat/fresh;
guide/itinerary.ts (hotel note), guide/importSnapshot.ts (rail copy, personal contacts), sources/filter.ts.

Tested: conversation tests 7/7 (your own only, in order, with cards and files; others refused; Start fresh everywhere,
nothing deleted); three browsers as three devices 9/9; reader tests (hotel note, rail copy) 4/4; personal-contacts
tests 3/3; her copy imported into the test copy and read back line by line (no second hotel; one line for the rail
copy; no personal address left, hotel numbers kept); real Scout on Oct 14's note and on the rail copy (both right);
every walk-through; Playwright; full backend suite 1178/1178.

## 2026-10-04 — Scout Never Gives a Link or a Website Step It Hasn't Seen

Ken, collecting his JR West tickets with Scout's help: Scout told him "under 'Regular Ticket Online Reservations' the
third option is 'Reserve Lookup'" and gave a link it had never opened — the link was dead and the steps a guess. It
also sent him to Larisa's emails for a number he had set himself, and kept answering at length while he worked one
screen at a time.

### Fixed
- **Links:** a link in Scout's answer must be one Scout saw while answering — in her Guide, the rail sheet, a document,
  a file sent, a tool's result, a search result or a page it opened. Wander checks every answer: a link Scout never saw
  sends Scout back once to open it or take it out; one it keeps anyway is marked "(Wander couldn't check this link —
  Scout didn't open it)". Scout's own earlier words never count as having seen a link.
- **Website and app steps** come only from a page Scout opened, the rail sheet's steps or the person's screenshot; asked
  for a page, Scout searches the service's own site and opens it first. Otherwise it says it can't see that screen and
  asks for a screenshot.
- **Who did it:** who booked, paid, set a number or holds an email only when a source says so — a booking's contact or
  card owner isn't who made it.
- **Hedges are claims:** "it should be in the email" only with where it comes from; otherwise "I don't know".
- **Step by step:** while someone works through a screen ("next", "one step", screenshots), Scout gives only the next
  step asked for.

Where: Scout's answers (backend/src/routes/chat.ts rules; backend/src/services/links.ts check).

Tested: link-check tests 6/6; real Scout on Ken's three failed questions (test copy), asked again after each change —
final: every link opened and live (200), no invented screens or steps, no guessed booker, one step when asked. Measured
Scout thinking before answering (test server only, SCOUT_THINKING): the same honesty, the same time, about the same
cost — not turned on.

## 2026-10-04 — Scout's "Working" Words Say What It's Doing

### Fixed
- While Scout worked on an answer it always said "Looking in Larisa's Guide…" — a fixed line from when her Guide was
  its only source. Ken, asking about a paper-ticket screenshot, read it as Scout checking the wrong place. Every question
  goes with all of its sources at once (her Guide, Ken's rail sheet, Backroads' itinerary, anything sent, the web when
  Scout looks), so it now says "Reading your picture" (or "pictures"), "Reading what you sent" for a PDF or document, or
  "Going through the trip". After a while it still says "Still working — a long answer takes a minute or two".

Where: Scout's panel, while an answer is on its way.

Tested: the file-attachment browser check 32/32 (the words for a PDF, a picture and a plain question), Playwright 20/20.

## 2026-10-04 — The Day Screen, Second Pass: Trains in Place, "Today, Don't Miss", Quieter Links

The rest of the UI review, built rather than listed (Ken: "build what you know must be built unless you need me"), each
change checked for what could go wrong for someone using Wander on the trip.

### Changed
- **Each of your trains is drawn once, in the day itself:** under her line when it names the train (Oct 29: HARUKA 31
  under "Board reserved HARUKA"), else at its time; on your landing day the airport leg follows the landing. The line
  keeps what you need on the platform — car, seats, reservation number, anything still to check ("PENDING — SmartEX…")
  — and "Reservation, notes and steps ›" opens the rest in place (the sheet's notes, the ticket pickup's steps, its tab).
  The Trains section keeps only what isn't in the day (the others' trains, folded; a leg with no booking) and is called
  "More trains" then, or is gone. On another day, where her Guide has the train at another time is said with the train;
  her line doesn't repeat it in amber. The rail sheet's "as Wander last read it …" moved to the foot of the day ("The
  trains are from your rail sheet, as Wander last read it Sat, Oct 3, 5:02 AM Japan time."). The Next tab's train card
  and Home's links to a day's trains go to the train itself.
- **"Today, don't miss"** (or "Don't miss" on another day), right under the summary: the ticket pickup card on its day,
  then each thing to check once — today's disagreement between the sources, her open question for the day, a train
  still marked to verify, your own deadline ending that day, a line where her tabs name two places — each with ↓ to its
  line. Four show; more open in place. (On Oct 6 the SmartEX check had been on the third screen; on Oct 25 the two e-bike
  meeting points on the second.) The Next tab keeps its own order.
- **Quieter source links:** "From Larisa's Guide — the Itinerary tab ↗" in small gray, a faint underline, still a 44-pt
  tap; when it opens her sheet at the exact cells, the words no longer spell them ("F7:Q7"), and a screen reader still
  hears them. A tab Wander has no address for still names its cell, so it can be found by hand.
- **Someone else's line on a split day** is one quiet row at its time ("Ken & Larisa · Day trip from Tokyo to Mashiko ›"),
  opened in place; opened from Home, it shows whole.

Where: the day screen (trains, the cards and the folded rows on the Next tab too). SPEC sections: Day view.
SPEC UPDATE NEEDED: trains in the day, "Today, don't miss", others' lines folded on split days.

Tested: a risk check written from Ken's question "what bad thing can happen" (21/21: car, seats and reservation in sight
without a tap; NOZOMI 77 and HARUKA 31 each drawn once; every ↓, the Next tab's train card and Home's #trains link land
on the train; Julie's landing and hotel help still up top; Larisa's to-do not amber on Julie's page; "ASK KENJI…" still
on Ken's Oct 14 and the Bizen question on Oct 7; links 44 pt with their cells for a screen reader); every fact on the
seven reviewed days before the change is still on screen without a tap (only Ken & Larisa's Kenji note is one tap away on
Julie's and Andy's days, by design); every walk-through; Playwright; the file-attachment check.

## 2026-10-04 — The Day Screen, Reordered: The Day in Brief First, Each Booking Said Once

Ken asked for a fresh opinion on the order and layout of each day page (his six points on Oct 6: the landing line, her
note, the weather, the summary, the actions, the order). A UI reviewer with no part in building it read seven days as
Ken, Larisa, Andy and Julie and found the same booking said two to four times and the top of the page set by whatever
data the day had. Its rule, now the page's: first the day in a few sentences, then what you can't get wrong, then the
day by the clock; reference goes last.

### Changed
- **The city band carries the day's quiet facts:** her forecast as one line ("Larisa's forecast: lows 64, highs 80",
  with its small picture), "With Backroads · day N of 8" on a Backroads day, and "Send this day ›" beside the city's
  name. The separate weather row and the Backroads card are gone.
- **Wander's summary of the day comes first** under the band (on Oct 6 it began about 435 pt down).
- **The "You land at …" box** shows on the day screen only when it says something the day doesn't: that earlier lines
  are the others' (a split day), or how to get from the airport to the hotel. On Oct 6, with no one else in Japan, it
  only repeated the 2:50 PM line. The Next tab keeps it as what's next.
- **Her note for a whole stay** folds to one row at the bottom of each of its days ("Larisa's note for the Okayama stay,
  Oct 6–8 ›"), opened in place. On a stay's first day it used to lead the page (Oct 6 began with tomorrow's Bizen). Its
  open question still rises to the top on the day whose lines name it.
- **On your landing day, lines with no time come after you land**, in her sheet's order, and the airport leg with no
  booking sits right after the landing (Oct 6: land 2:50 → HARUKA to Shin-Osaka → her Osaka → Okayama line, Rikuro,
  Shinkansen → 6:17 PM NOZOMI 77). The airport train had been only under Trains, two screens down.
- **Each booking said once, under her line for it:** a booking at the same time naming the same thing (the 6:35 PM
  flight, Yazawa, Shiraume, "Backroads ends" with the $250 tip) and a check-out beside her line that says "check out"
  at that hotel are drawn under her line, smaller; "Also in her Guide for today" keeps only what has no line of hers.
- **A sources' disagreement said at the top today** is not repeated in amber on her line; the line points up ("The
  sources give two times for this — see the top of the day ↑"). Oct 29's HARUKA times had been said four times.
- **Someone else's to-do isn't amber:** a deadline booked under another traveller reads "Larisa's to-do · …" in plain
  colours; amber stays for the person who must act.
- **A check-out on a morning you leave earlier** says "Check out before 8:30 AM · Meet Backroads, Courtyard by Marriott
  Tokyo Station", with the hotel's own 12:00 PM below, smaller (only a leaving line counts: a train, a flight, a
  transfer, meeting Backroads). Day summaries are told the same: a hotel's check-out time is only the latest allowed.
- **The footer** ("Larisa's Guide, as Wander last read it …") is always gray; amber is kept for things to check.

Where: the day screen (and the Next tab where they share parts: the band, the stay note, deadlines, check-outs).
SPEC sections: Day view / execution screens.
SPEC UPDATE NEEDED: the day screen's order (band facts, summary first, stay note folded, bookings under her lines).

Tested: the reviewer's seven days photographed before and after; every walk-through; Playwright; type checks.

## 2026-10-04 — Give Scout Anything: Drag It In on a Mac, Paste It on an iPhone

Ken: "User should just drag (Mac) or paste (iOS) anything and Scout should parse and make sense of it: picture with
text, pdf, text, etc." Learned from Maria's attachments.

### Added
- **Drag a file anywhere onto Wander (Mac, iPad):** the screen says "Drop it here — Scout will read it"; dropping it
  opens Scout with the file waiting by name above the box, ready for a question.
- **Paste a file into Scout's box (iPhone, Mac):** a picture shows as a small copy of itself; a PDF or document by its
  name. Pasted words stay words. A picture copied from a web page, or a file copied in the Finder, comes in as the file
  (the clipboard's HTML or file name alone isn't taken as words).
- **The paperclip now takes files too**, not only photos: PDFs, Word documents (.docx), text, CSV, email (.eml) and web
  pages, several at once (up to 6 per question; 10 MB each).
- **What Scout does with them:** pictures are read (and translated); PDFs are read page by page; Word and text files by
  their words. Sent with no question, Scout says what it is and what in it matters for this trip — the day, place or
  booking in Larisa's Guide it touches, and whether they agree. Where a file and her Guide differ on a time, a place or a
  booking, Scout shows both and never picks one. A file Scout can't open (an iPhone HEIC photo, a zip) is named as unread,
  never guessed at; a very long text is read in part and Scout says so.
- **Sources show a sent file as that file:** "PICKUP-EMAIL.TXT — NOT LARISA'S GUIDE", with its page for a PDF and the
  words quoted, and "Sent with the question — Wander doesn't keep it." Nothing sent is stored; the saved conversation
  keeps only the file names.
- Scout's hello, the paperclip tip and the Show-me-around Scout step say how to give Scout a file.

### Fixed
- **Escape closes the Sources panel, and only it** (Mac or iPad keyboard). Before, Escape made Scout small behind the
  panel, or did nothing, depending on where the focus was.

### Removed
- The old document-wide paste/drop capture on the Trip Overview and Plan screens (it sent pasted text to the old import
  extractor). Dropping or pasting now always goes to Scout. The hook's code is kept, unused.

Where: Scout panel (box, paperclip, the row of waiting files), anywhere on screen for a drop, Sources panel.
Server: `backend/src/services/attachments.ts`; `/api/chat` takes `attachments` (25 MB request limit on that route only).
SPEC sections: Scout / AI assistant; capture ("Capture never blocks" — capture by paste/drop now goes through Scout).
SPEC UPDATE NEEDED: Scout reads files dragged in, pasted or attached; paste/drop capture on Overview and Plan removed.

Tested: attachments unit tests 16/16 (pictures, PDFs, a real Word document, broken and unknown files, limits, citations
to a sent file); a browser check 29/29 — a PDF dragged onto a Mac screen and sent byte for byte with Enter, two dropped
and one taken off, a picture sent with no words, a file too large, a pasted picture on iPhone (WebKit), the paste rules,
the paperclip with five files, Try again after a failure resending the files, Escape on Sources; real Scout, three
questions: Backroads' PDF (recognized, cited by page, nothing conflicting), an email whose meeting time and hotel
differ from her Guide (both shown with sources, nothing picked), and a Japanese menu photo for Andy (each dish
translated, allium dishes named, words to show staff).

## 2026-10-04 — Copy a Scout Answer; Selecting Its Words Works on iPhone

### Fixed
- **Selecting words in a Scout answer on iPhone.** Ken: "a long press gives tactile feedback but doesn't actually
  select anything." After asking, the typing box keeps focus; every small move of the iPhone's visible area (a long press
  makes several) put the cursor back in the box — which takes any selection away — and scrolled the conversation to its
  end. Now that happens only when the keyboard actually rises or falls, never while words are selected elsewhere, and the
  conversation never jumps while someone is selecting in it. (A WebKit check reproduces the old loss of the selection
  and passes now.)

### Added
- **Copy under every Scout answer**, beside Sources: the whole answer as plain words, for pasting anywhere ("✓ Copied the
  answer").

Tested: a WebKit check of selection with the box focused (fails on the previous build, passes now), Copy in the browser
(the whole answer, plain), Scout one-tap 3/3, iPad Scout 8/8, Sources panels, Playwright 20/20.

## 2026-10-04 — A Date When Charges Start Is Not a Last Day

### Fixed
- **Cancellation deadlines that say when charges start.** Her new copy's reading of the La Table de Joël Robuchon
  booking says "… (Oct 17): free cancellation ends — 60% charge from this date" on Sat, Oct 10 (the policy charges 60%
  from 7 days before). On Oct 10 the screens labelled it "Today is the last day", and Scout's status line said "OPEN NOW —
  last chance Oct 10" — Scout would have told Larisa she could still cancel free that day. A deadline whose own words say
  charges start that day now closes as the day begins: Scout's status says "free through the end of Oct 9; charges start
  Oct 10" (then "PASSED — charges apply"), and the screens show it as ended on Oct 10, never "Today is the last day".
  Oct 10's day summary on production says "from today, cancelling the October 17 Robuchon dinner costs 60%".

Tested: charges-from tests 3/3, a browser check of Larisa's Home and Actions on Oct 9 and 10, Playwright 20/20, all
walk-throughs, full backend suite.

## 2026-10-04 — Larisa's Oct 3 Copy: Her New Lists, Backroads Dinners, and a Renamed Stop

Her Oct 3 copy (kept as "Japan Oct 2026-5") added things in new shapes. Each was read cell by cell before production.

### Added
- **Her informal to-do lists in the Actions tab.** Under her Actions table, in the Notes column, she started
  "AB / JD Actions" (Train to Hotel · Cash at ATM · Using Suica cards for train · Let Chase know we will be in japan)
  and "LT actions" (Chase Sapphire). Rows with nothing in the Actions column were skipped, so they reached neither the
  Actions screen nor Scout. Now a cell ending "actions" or "to do" heads a list, and the cells under it are its
  to-dos, in her words, each noted "In her “AB / JD Actions” list". Her initials become names on the Actions screen and
  in Scout's to-do list — "AB / JD" is "For Andy & Julie" (JD is new); initials no one has, like "LT", stay as she
  wrote them.
- **Her Backroads dinners, by day.** Her Dining Resos tab now has a "Backroads" section of dinners labelled "Day 1" …
  "Day 7" instead of dates (Ritz Carlton, the Bar Lounge's ramen, Shirakabeso, "Dine on Your Own — we're eating soba…",
  Six Senses). Each is now on its day screen — Day 1 is the first Backroads night in her Itinerary (Sun, Oct 18) — and
  says so: "Her Dining Resos tab lists this under Backroads, Day 3 — Wander dated it from the first Backroads night in
  her Itinerary." The note beside one ("see below") is shown as her note, not as an address.

### Fixed
- **A renamed stop keeps its place on the map.** Her Itinerary now says "Nikko → Izu Peninsula" where it said
  "Shirakabeso". Wander matches stops by name, so "Izu Peninsula" was a new stop with no location, and the Home map
  would have lost stop 7. A stop with no location now takes it from Wander's note on its stay — Shirakabeso, placed at
  1594 Yugashima from Backroads' description. A stop is never given an old stop's pin by its dates alone.

Tested: actions-lists tests 6/6 (her layout, invented to-dos and dinners), a browser walk as Andy 11/11 (the four
to-dos "For you & Julie", Oct 20's ramen and Oct 23's soba with the dating line), the Home map at 402 pt (stop 7 "Izu
Peninsula", nothing overlapping), real Scout 2/2 on the new copy (read word for word), Playwright 20/20.

SPEC UPDATE NEEDED: reading her Guide — informal lists in her Actions tab; Backroads "Day N" dinners.

## 2026-10-04 — Backroads' Itinerary, a Source for Scout

### Added
- **Backroads' detailed itinerary is a source Scout reads and cites.** Ken gave Wander Backroads' 18-page itinerary
  (a PDF). Larisa's Guide gives the Backroads week a line a day ("day 7 - hike, lunch"); the itinerary gives each day in
  full — where to meet and what to bring on Oct 18, the rides and hikes with their distances, rafting and a sake
  brewery, which dinners are included, the bullet train to Izu, how the trip ends — plus meals and dietary rules,
  trains and airports, weather, documents and terrain.
  - Transcribed from the PDF in reading order, Backroads' words as written (kept privately in trip-data); its days
    dated from Day 1 = Sun, Oct 18, the day her Guide meets Backroads. Recorded on the trip with
    scripts/set-trip-document.ts; every new Guide copy keeps it (proved with a re-import).
  - Scout reads it as its own section, "Backroads' own words, given to Wander by Ken — NOT Larisa's Guide", and calls it
    Backroads' itinerary. It's their general itinerary (dated May 7, 2026), not one for the exact departure; Scout says
    so when it matters, and says both when it and her Guide differ.
  - "Where this came from" shows it as "Backroads' itinerary — not Larisa's Guide", with the day and page and their
    words, and "Backroads' general itinerary, dated May 7, 2026. Details can differ for your departure."
- **"Open at this spot in her sheet" opens 15 of her 26 tabs exactly** (Ken's links, Oct 4): the Itinerary, Flight info,
  Tokyo Hotel Info, Dining Resos, the Tokyo day tabs, three Kyoto day tabs, both Kyoto hotel tabs, Mark & Steve's email,
  Activities and Actions.

Tested: real Scout 5/5 on Backroads days (written from the PDF before running; every answer read word for word and its
facts checked — the rail-sheet quote it used is in Rail Detail T17), trip-documents tests 4/4, a re-import that keeps
it, the Sources panel in the browser 5/5.

SPEC UPDATE NEEDED: sources — documents given to Wander (Backroads' itinerary).

## 2026-10-04 — People's Own Travel Numbers Stay Out of Wander

### Changed
- **People's own travel numbers are left out of everything Wander shows or says.** Ken: "unless the info passes
  through the vault in a safe way, Wander should not surprise people by surfacing their personal info." Her Flight info
  tab holds a picture of United's confirmation for Julie and Andy; Wander reads every word of a picture, so their Known
  Traveler, eTicket and MileagePlus numbers, a phone number, an email and the total paid were on Home's "tab by tab",
  in Find, and in what Scout reads.
  - Known Traveler, Redress, eTicket, frequent-flyer, passport numbers and birth dates: the number goes, the label stays
    ("KTN [left out by Wander]"). In a record that carries one of those, its phone, email and total go too. A hotel's
    phone in an ordinary picture stays; so do flight times, confirmation codes and names.
  - A picture holding them isn't shown in Wander: "Wander keeps this one to Larisa's sheet — it has people's own travel
    numbers on it." (Home's tab by tab; Scout's "Where this came from"; the day screen doesn't offer it.) The server
    won't send it to a phone at all.
  - Every new Guide copy leaves them out; the words already saved were cleaned once on production
    (scripts/mask-personal-numbers.ts — one row, Flight info). Scout had never said any of them.
- **"Open at this spot in her sheet" opens her current sheet.** The address Wander recorded in April was her earlier
  spreadsheet. Ken's links (Oct 4) are from "Japan Oct 2026", the one she works in; Wander now uses it, with exact tabs
  for Dining Resos and the three Tokyo day tabs; other tabs open her sheet with the tab and cell named in words.

Tested: personal-numbers tests 9/9 (invented numbers: words, the three picture routes, Find), a browser walk as Andy
and as Larisa (one picture held back, the other three open, no number on screen) 10/10, Playwright 20/20.

SPEC UPDATE NEEDED: privacy — people's own travel numbers and the pictures holding them.

## 2026-10-04 — "Taken Off the List" Counts What You Just Removed

### Fixed
- **Maybes:** right after removing something, the bottom of the city's list didn't say so. Ken took TeamLab off Tokyo's
  list on his iPhone, scrolled down, and found no "Taken off the list"; the slim "Put it back" line where the card was
  was the only sign. The fold now counts everything off the list, the one just removed too. (The Maybes tab, bottom of
  each city's list.) Tested: Maybes walk 54/54, Playwright 20/20.

## 2026-10-03 (night, last) — Remove Anything From Maybes; One Warning, Not Two; a Quieter Home Feed

### Added
- **Remove on any item in Maybes, for the person who put it there and the trip's organizer.** Ken: "I know we're going
  to TeamLab in Kyoto, so I can remove it as a maybe for Tokyo" — and "It is for the person who added it and me."
  - Larisa can remove her Guide's ideas; anyone can remove their own maybe; Ken (the trip's first member) can remove
    anything. Nobody else sees the button.
  - Removing takes the item off that city's list for everyone. Nothing is deleted: notes, "I'm in"s and a day it was
    put on all stay. Larisa's Guide never changes, and a new copy of it keeps the item off (a renamed idea too).
  - Where the card was, a slim line: "“…” is off Tokyo's list for everyone. Put it back". At the bottom of the list,
    "Taken off the list · n ›" shows what's off and who took it off; Put it back is there for the same people.
  - The button is a quiet × at the end of the card's name line. As a word it took a row of its own on every card
    Larisa and Ken see. It asks first: "Remove this maybe?", "Take Andy's maybe off the list for everyone?", or "Take
    this off Tokyo's list for everyone? Larisa's Guide keeps it."
  - Scout: remove_from_maybes and put_back_on_maybes, same rules (take_back_maybe still works). Schema:
    experiences.removed_by, removed_at (pushed to production and the test copy before deploy).

### Fixed
- **A dinner's "Her tabs differ" said twice on the day screen** (Yazawa, Oct 15: on her plan's line and again on the
  booking below it). It's said once, on the booking beside its address; the plan line says "Her tabs differ on where
  this is — her booking, with its address, is below ↓" and scrolls there.
- **"…this address is her Dining Resos tab's" where no address shows** (Home, the Now and Next cards). There it says
  "her Dining Resos tab gives another address — on the day's screen" (or "— below").
- **Home's Recent activity**: "… is no longer in on …", an "I'm in" taken back, and taking a maybe off or putting it
  back are no longer posted there. An item taken off the list keeps none of its lines there until it's put back.
- **Actions' link to Maybes said "Ideas ›"** (the tab's old name). Scout's own descriptions of the Maybes screen
  ("in Ideas", "Take back") now match what's on screen.
- **"Ken's in too" flashed on Larisa's cards** for a moment while the list of who's on Wander loaded.
- A quick Put it back → Remove could reach the server in the wrong order and undo the removal; the two now go in the
  order they were tapped.

Where: the Maybes tab (every card; the bottom of each city's list), the day screen's plan, Home's Today card and
Recent activity, Actions.

Tested: Maybes tests 20/20 (who may remove, put back, a new Guide copy, Scout, Home feed), Maybes walk 53/53 (Andy,
Ken and Larisa in three browsers), real Scout 4/4 on the Maybes actions from plain speech (a maybe, "I'm in" on the
right one of two similar ideas, Ken removing Tokyo's TeamLab and not Kyoto's, Andy refused on Larisa's idea with who
can) — every reply read and its facts checked against her Guide, Playwright 20/20, all walk-throughs.

SPEC UPDATE NEEDED: Maybes — Remove and Put it back, who may; the day screen's single "tabs differ" note.

## 2026-10-03 (night, later) — Maybes: Shorter Cards, Today/Tomorrow, Filters by Day and Kind

### Changed
- **Shorter Maybes cards, with every word and button kept.** A plain card went from about 241 pt to 159 pt (34%), and
  Tokyo's list is 22% shorter overall. People's notes and Larisa's longer comments keep their full space.
  - A short place ("Ginza") sits on the name's line at the right.
  - "Interested" and the day it's on share one line, with the day as a small chip ("Her plan · Thu, Oct 15 ›") whose
    tap area is still 44 pt.
  - "Seen by" joins the Interested line.
  - The buttons sit closer, so they take two rows instead of three. "Remove" on your own note sits at its line's end.

### Added
- **Today / Tomorrow tags** beside an idea's name when it's on that day's plan, someone put it on that day, or it's a
  small maybe said today.
- **Filters**, in one sideways-scrolling row under "Show:":
  - **Next 2 days**.
  - **Themes**: Food & drink · Temples & history · Art & craft · Shopping · Nature · Other.
  - One theme at a time; tap again to clear. If nothing matches, the screen says so, with "Show everything".
- **Themes:** her restaurant section is Food & drink. Everything else is read once by a fast, inexpensive model:
  her ideas once (scripts/tag-themes.ts), a maybe when it's posted, in the background. A theme is only ever a filter,
  never stated as a fact. "Other" when unsure. A new Guide copy keeps themes it used to clear.
  New theme value "shopping" (schema).

### Fixed
- **Home map, the Karatsu/Hakata marker:** the line from Okayama now comes into Karatsu's "2" from above. The line to
  Nagoya leaves Hakata's "3" below. Before, the line from Okayama ran along the bottom of the marker under "3", and the
  trip seemed to go from Okayama into Hakata. Each line has one more shape to try: a long, straight lead into a shared
  marker's own half. Checked by eye at 393, 402 and 440 pt and on the iPad. A fresh review runs once helper agents
  are available again.

Tested: Maybes walk 40/40 (filters, Today tag, Tell the group, Remove), Playwright 20/20, all walk-throughs, map walk
72/72.

SPEC UPDATE NEEDED: Maybes card layout, filters by day and theme.

## 2026-10-03 (late night) — Tell the Group on Anything; Remove; Okayama's Name Off the Line

### Changed
- **Tell the group** is on every item on Maybes, including Larisa's ideas. Hers go out as "From Larisa's Guide: …" and
  a group maybe goes out under its writer's name (Ken, Oct 3: "any item, with the original source").
- **"Take back" is now "Remove"**, for your own maybe ("Remove this maybe?") and your own note ("Remove your note?").

### Fixed
- **Home map, iPhone 17 Pro width:** the line from Karatsu/Hakata to Nagoya no longer runs under "Okayama start".
  When a name has a line under it, that line and a neighbouring one may take other curves together, with no new
  crossing. Each candidate is screened quickly and named carefully, and if none comes out clear, the old layout stays.
  Fresh review: the Pro Max and iPad pass. On the 17 Pro and iPhone 16, the line into Karatsu still runs along the
  bottom of the 2|3 marker, which is next. On the plain iPhone 16 the Okayama line remains too.

Tested: Maybes walk 36/36, Playwright 20/20, all walk-throughs.

## 2026-10-03 (night) — Asking Scout in One Tap

### Fixed
- **Asking Scout starts in one tap.** The Scout tab, and any "Ask Scout" button, opens Scout with the cursor already
  in the box and the keyboard up, in the same tap. Ken: asking took two or three taps, one to open, one to raise the
  keyboard, sometimes another before the cursor showed. When the panel resizes around the keyboard, Wander sets the
  cursor again, because an iPhone can keep the box focused but stop drawing the cursor.
- **On an iPad, Scout's panel sits above the bottom bar**, held either way, and above the on-screen keyboard. It used
  to cover the bar's Scout button.
- **Scout no longer repeats Wander's own labels** such as "(no time given)". It says "Larisa's plan doesn't give a time
  for it". Scout's description of the screens says Maybes, not Ideas.
- **Home map:** a stop's name set on two lines ("Okayama" over "start") lines up on the left.

Tested: WebKit (Safari's engine), one tap to type (3/3); iPad sideways and upright (8/8); backend 1116/1116;
Playwright 20/20; Maybes walk 34/34. The real iPhone keyboard can't be simulated, so Ken checks that on his phone.

## 2026-10-03 (later) — Tell the Group, on Every Maybe

### Changed
- **Tell the group is on every maybe card**, anyone's, not only beside "On Tokyo's maybes." just after Send. Ken looked
  for it a minute later and it was gone, and someone else's maybe couldn't be passed on. It sends the writer's name, the
  words, the link and the city ("Andy: maybe kakigori… (on Wander's maybes for Tokyo)") to the iPhone's share sheet.
- A late reply to I'm in no longer wipes the line another tap just showed ("Copied — paste it into your group text.").

Tested: walk-through 34/34 (Ken forwards Andy's maybe under Andy's name), Playwright 20/20.

## 2026-10-03 — Maybes: the Group's Shared List of "Maybe We Should…"

### Added
- **Maybes** (the bottom-bar tab that was Ideas; Ken: "a shared list of maybes"). Each city's list starts with a box:
  "Maybe we should…". A few words, a link if there is one, Send, and it's on that city's list for everyone.
  - A link in the words is kept as its link ("Instagram post ↗").
  - With no signal it waits on the phone and goes out when signal is back.
  - Saying it means you're in on it.
  - **Tell the group** (after Send) opens the iPhone's share sheet with the words and link, for the group text.
- **The group's maybes**, newest first, above Larisa's ideas ("Things to do · from Larisa's Guide").
  - Each says who and when ("Andy · 12 min ago · New").
  - "Seen by" lists the others who have looked at that city's list since.
  - A small maybe from a day before today (no link, not on a day) folds into "Earlier · n ›".
- **I'm in** on any maybe or any of her ideas. Tap again to take it back.
  - "Interested:" is one line: her Activities tab's X marks and Wander's I'm in together, one name a person, "you"
    for yourself, in the order people said so.
  - "Julie's in too" appears for the person beside you in her Guide who isn't on Wander ("Julie (via Andy)").
  - Your own X in her Guide already counts, so it has no button.
- **Take back** your own maybe (with "Take this maybe back?"). A day it was put on keeps its plan.
- **Something new**: a dot on the Maybes tab, and one quiet line on Home ("Andy has a maybe for Tokyo: “…” · and
  1 more ›"). No phone alerts.
- **Scout**: "maybe we should…" → add_maybe. "I'm in", "count me in", "Julie's in too" → im_in. "Never mind the ice
  cream" → take_back_maybe. "Flag this for the group" is now I'm in.
- Server: routes/maybes.ts and services/maybes.ts (one rule for the screen and Scout); tests/maybes.test.ts (16).

### Changed
- "+ Note" on an idea is now **Say something**. The filter is **Show: Everyone · What you're in on · Julie's…**, kept
  apart from the box. Maps shows only for her places, never to search a sentence.
- The tour, How Wander works, the Guide-tabs card and Scout's description of the screen say Maybes.

### Fixed
- **A new copy of her Guide no longer wipes Wander's I'm in.** It replaces her X marks only
  (importSnapshot.replaceGuideMarks). A renamed idea carries Wander's I'm in across.
- Scout's "take back" can no longer remove an X from her Guide or someone else's I'm in.
- "In Larisa's plan for …" is matched for her ideas only (a maybe's words could match her lines by chance).

Tested: tests/maybes.test.ts 16/16. A walk-through on the test copy, 33/33: Andy in a Tokyo side street, Ken's Home line
and dot, Seen by, I'm in, Earlier, no signal then signal, Take back, SE and Pro Max, cleaned up. Tour (Maybes stop),
Playwright 20/20. Fresh review: two fixes applied (filter moved and relabelled, plainer header).

SPEC UPDATE NEEDED: Ideas → Maybes (the group's own list, I'm in, Seen by, Tell the group); Scout tools add_maybe,
im_in, take_back_maybe.

## 2026-10-02 (late night) — Before Julie and Andy Leave

### Added
- **A card once a day before they leave home** (Home, over the page, the first time it opens that day). It says how
  many days until they leave ("You leave in 10 days", "You leave tomorrow", "You leave today · Safe travels."). It
  shows their flight as her Guide has it (day, time with its time zone, airline and route) and one fact about Japan,
  Tokyo or Kyoto, a different one each day.
  - For anyone whose own first flight is after the trip begins (Julie and Andy).
  - The day is the one Home counts to: one shared rule (lib/leavingSoon.ts), now also used by Home's countdown.
  - Gone once their plane has left, and after the day.
  - Not shown while someone new is still setting up Face ID.
  - Thanks, Escape or a tap outside puts it away until the next day.
- **Ken's preview:** someone with the previewLeavingCard setting sees the same card once a day, headed "If Julie and
  Andy open Wander today, this is what they'll see:". It counts on their date at home, even from Japan.
- **The twelve facts:** each one was checked against published sources first (Japan's island recount, the bullet
  train's record, Kyoto and the atomic-bomb list, Ise's rebuilding, Meiji Shrine's forest and others). A
  fact-checker corrected eight. Kyoto's temple count was dropped because no official source supports it. Sources are
  in the code.

Tested: Andy on every day Oct 2–13 (the card and Home's countdown agree, and both match her flight), after take-off
and the day after (nothing), once a day, Julie, Larisa (never), and Ken without and with the setting, including from
Tokyo (70/70). Fresh review: SHIP.

SPEC UPDATE NEEDED: Home — the before-you-leave card for travelers who join later, and the organiser's preview.

## 2026-10-02 (night) — Shirakabeso Is on the Izu Peninsula

### Added
- **Wander's own note on one of her places.** Her Guide names "Shirakabeso" (a Backroads stay) and nothing more. Backroads describes it as a ryokan in a forested valley on the Izu Peninsula, at 1594 Yugashima,
  Izu, Shizuoka (added by Ken). Wander now keeps that as its own note, apart from her Guide:
  - **Scout** reads it beside her stay, marked as Wander's addition with where it came from, never as her Guide.
    Sources lists it separately, as Wander's note.
  - **Walk / Train / Taxi** goes to its location when nothing of hers gives one.
  - **The Home map** puts it on Izu as stop 7 (Kyoto becomes 8). The "isn't on the map" note is gone.
- A new Guide copy keeps these notes. backend/src/services/guide/placeNotes.ts, scripts/set-place-note.ts;
  tests/place-notes.test.ts (3).

### Fixed
- **Home map, iPhone SE and 15:** with Shirakabeso placed, "Kyoto end" sat on marker 1's ring and read as stop 1's
  name. A stop's name may now stand over its "start" or "end" ("Kyoto" over "end"). Once the legs are drawn, a name
  on a marker or another name weighs more than any line. A crowded name can move a neighbour aside. "Kyoto end" now
  sits under 8, and "Okayama start" sits beside 1. Pro Max and iPad are unchanged.

SPEC UPDATE NEEDED: places — Wander's own notes on her places (kept apart from her Guide, with their source).

## 2026-10-02 (night) — The iPad's Window Controls Corner

### Fixed
- **"‹ Home" sat under the iPad's window controls** (iPadOS 26 puts the "•••" / red-yellow-green controls in the
  top-left corner of every app; Ken's iPad, the day screen). On the iPad Home Screen app only, the top bar's left edge
  now starts 80 pt in — clear of the controls, same place and height, no space taken. Day, Notes, Ideas, People,
  Settings and the whole-trip page; History, Profile and How Wander works already sit in a centred column clear of
  them. The iPhone is unchanged. (Safari doesn't tell a web page where the controls are, so Wander recognises the
  iPad Home Screen app and leaves the room itself.)

Tested: every screen's top-left control measured on an emulated iPad Home Screen app (landscape and portrait: all at
80 pt or more) and on the iPhone (unchanged) — 23/23.

No SPEC change.

## 2026-10-02 (night) — The Day in a Few Sentences

### Added
- **A short summary atop each day** (day screen, under the weather line, above her plan; not on the Next tab, where
  the next stop leads). Two or three sentences: what kind of day it is, its shape, what anchors the evening — e.g.
  Oct 28: "A full day out of Kyoto: the van leaves the Four Seasons at 8:00 AM for Shigaraki. The morning splits,
  with Ken and Andy at the MIHO Museum and Larisa and Julie at a traditional ceramics stop…". Labelled "Wander's
  summary of Larisa's plan" (to Larisa, "your plan").
- Written from the same day Scout reads (her lines, the city, "with Backroads", who isn't in Japan yet) and her
  pictures' words — only what they say; names the people actually there; says Backroads leads its days; states her
  disagreements neutrally ("her tabs name two places"); times like 2:50 PM. Every day's summary was read against her
  lines and corrected before publishing (the first drafts had a flight landing on the wrong day, "everyone" on days
  Julie and Andy are still at home, and "open" evenings on Backroads days).
- Shown only while the day is exactly what it was written from: a new Guide copy that changes a day hides its
  summary until it's rewritten and read (procedure: guide-update/README.md). Kept on the phone for no signal.
- backend/src/services/guide/daySummaries.ts, scripts/day-summaries.ts (--write for review, --publish),
  GET /api/guide/day-summaries/:trip; tests/day-summaries.test.ts (4). 22 days (Oct 19, 20, 22 have no lines of
  hers — the day screen already says Backroads leads).

SPEC UPDATE NEEDED: day screen — Wander's summary of the day.

## 2026-10-02 (evening) — Every Word on Her Pictures

Ken: "Everything earning a place in the spreadsheet is important… every word, image, and number" is data.

### Fixed
- **Scout knows everything on her pictures, not just what they are.** Wander always read every word of the pictures
  in her tabs, but gave Scout only a one-line summary — her illustrated Kyoto map was "a five-panel illustrated
  itinerary map", while it says MIHO Museum is Ken & Andy's and the Oct 28 morning potters are Larisa & Julie's (her
  tab names no one for those), the van's times, and the flight time. Scout now has each picture's full words (card
  numbers masked, as in her cells); a picture she put in several tabs is read out once. A picture can be older than
  her tab (her Tokyo map still has the earlier Day 2 times and dates the days Oct 13–15): Scout gives her plan first
  and then says what the picture shows — "her map picture in that tab still shows Tokyodo at 2:15".
- **Find a word searches every word on her pictures** (it searched only their summaries).

### Added
- **"See her map from this tab"** on a day whose tab holds a picture of hers (her Tokyo and Kyoto illustrated maps,
  on each of those days): it opens full screen — pinch or double-tap to zoom, Done to close.

Tested: real Scout — Julie's Shigaraki day (her map's split, the Dining Resos 8 PM disagreement said), Tokyodo's
time on her newer plan with the picture's older time noted, the e-bike tour's end; browser 5/5;
backend/tests/picture-words.test.ts.

No SPEC change.

## 2026-10-02 (evening) — Her Apple Maps Guides: One Tap to Her Map, and What's Close to What

### Added
- **"See her Apple Maps guide for the day ↗"** (day screen and the Next tab, under "See her route for the day in
  Google Maps"; to Larisa "your"). Larisa made a map in Apple Maps for some days (so far Tokyo Days 1–3: Oct 15,
  16, 17), apart from her sheet. The button opens her map as it is now — Wander never changes it.
- **Scout knows what's on her maps, and what's close to what.** Each map's places and addresses, read from her
  share links (view-only — Ken's OK: a share link can't change her guide), and Wander's straight-line distances
  between them. Her map's places aren't in visiting order (Ken: "Scout might add value by saying what's close and
  what isn't"): Scout says which are close together and which need a train or taxi — always as straight-line
  distance ("about 250 m apart in a straight line"), never as a walking time, and never reordering her day (her
  tab's order is the plan). Where her map and her tab differ — a stop on one and not the other, or a different
  branch (her Day 3 tab's Onitsuka Tiger is the Shibuya flagship; her map pins Omotesando) — Scout says both and
  suggests checking with Larisa. Sources shows "Her Apple Maps guide — not Larisa's Guide" with the places, when
  Wander read it, and "Open her map ↗"; distances are marked as worked out by Wander.
- **Walk / Train / Taxi uses her map's own location** for a place her sheet gives no pin or address for, by its
  name (the Umeno Vase Shop) — never a different branch.
- Her maps are kept by every new Guide copy (checked by re-importing her real copy), and each map's day follows
  her day tab as the current copy dates it. A map is matched to its tab by name ("Tokyo 2026 - Day 2" → "Tokyo Day
  2 Kappabashi…"); a map no tab matches isn't put on a day.
- Tools: trip-data/session-tools/read-apple-guides.mjs (reads share links → trip-data/apple-guides.json, private),
  backend/scripts/set-apple-guides.ts (records them for a trip; prints names and days only).
  Tests: backend/tests/apple-guides.test.ts (6).

Tested with real Scout, 5 questions: the Akihabara day's close and far stops (her own train words for each leg,
straight-line distances, her order kept); "Yazawa — Ginza or Yaesu?" (both of her tabs, her map agreeing with
Yaesu); "Onitsuka Tiger near Omotesando Hills?" (150 m on her map, the tab-vs-map store difference — first answer
said "a couple of minutes on foot"; the rule now forbids turning a distance into minutes, and the re-ask was
clean); Tokyodo to Umeno with Sources showing her map. Browser: the button on her three days and no others, for
Andy and Larisa.

SPEC UPDATE NEEDED: a second source of hers — Apple Maps guides — beside the Guide.

## 2026-10-02 (evening) — Getting In on an iPhone: Face ID First, Then the Home Screen

### Fixed
- **A new iPhone could end up at a sign-in with no way in.** Larisa's phone: the invite opened in Safari and said to
  put Wander on the Home Screen first; the icon was meant to open her invite (Wander pointed the icon's start there),
  but iPhone Safari didn't take that — the icon opened Wander signed out, where only Face ID signs in, and she had
  no Face ID for Wander yet. A dead end. On her iPhone, setting up Face ID in Safari and then opening the icon signed
  her in — a Face ID key made in Safari works in the Home Screen app. So that is now the way in:
  - **The invite** (Safari): **Let's go** is the button again, with "Next, you'll set up Face ID, then put Wander on
    your Home Screen." The Home Screen steps are no longer the first thing, and Wander no longer tries to point the
    icon at the invite.
  - **Home in iPhone Safari**: **Set up Face ID** is right under the welcome ("One thing to set up: Face ID, just
    below."), above Today; once it's done, **Put Wander on your Home Screen**, whose last step is "Open Wander from
    your Home Screen and tap Sign in with Face ID."
  - **The sign-in screen inside the Home Screen app** says where setting up happens: "First time on this phone? Open
    the link or code you were sent. It opens in Safari: tap Let's go, then Set up Face ID. After that, Face ID works
    here too." (It used to say to open the link — which opens Safari, not the app: a circle.)
  - The invite sheet (People → Show their invite), its message, How Wander works → Getting In, and Scout's own
    instructions all describe the new order.
  - The Face ID card says "Set up Face ID — then a glance opens Wander on this phone, here or from your Home Screen."
- **Find a word says when "Open Larisa's sheet" can't land on the spot.** Wander knows the tab ids of 11 of her 26
  tabs (none of her day tabs or Dining Resos); for the others her sheet opens on its first tab. Under "Found in N
  places", once: "“Open Larisa's sheet” opens it on its first tab. Then go to the tab and cell named on the card."
  (A spot Wander can open directly says "Open this spot in Larisa's sheet".)

Tested: a new person from invite to Home Screen sign-in on an emulated iPhone (Safari, then the Home Screen app with
its own storage and the Face ID key made in Safari): 15/15. Playwright 20/20, walk-throughs.

No SPEC change (sign-in order is described in How Wander works).

## 2026-10-02 — Show Me Around, and Tips at the Moment They Help

### Added
- **"Show me around"** — six short steps, one for each button along the bottom (Home, Ideas, Next, Notes, Actions,
  Scout). The screen dims, the button stays lit, and a sentence or two says what it's for, with Back, Next and Skip.
  Only when asked: the first-time welcome card on Home now offers **Show me around** beside **Got it**; it's also in
  Settings ("Show me around — a quick look at the six buttons along the bottom of the screen") and at the top of
  How Wander works. Nothing starts on its own. To Larisa it says "your Activities tab", "your Guide".
- **Two one-time tips in Scout**, each shown once and put away by ✕ or by using the thing: under the newest answer
  that has Sources ("Tap Sources to see where in Larisa's Guide this answer came from…"), and above the box for
  someone already talking with Scout ("Tap the camera button to send Scout a photo of a menu, a sign or a ticket…").
  Scout's hello now says it reads photos too.

### Changed
- **Scout's directions say when they're only a search.** When her Guide has no pin or address for a place, the
  button under Scout's answer says "Larisa's Guide has no address for this, so Maps will search for “Tokyo Tower”.
  Check it's the right one before you go," and Scout says the place isn't in her Guide. Her own places never carry
  the note.
- How Wander works → Quick Start names Next and Notes (it still said Now, and left out Notes).

### Removed
- The old `frontend/public/guide.html` (a March help page nothing links to; a full reload of /guide on a preview
  server showed it instead of How Wander works).

Tested in the browser: Julie at 390 points and Larisa at 320 — each step lights the right button, the card never
covers it and fits the screen, Back/Next/Skip/Done/Escape, gone after a reload, Settings and How Wander works start
it; Scout's tips once each. `tests/scout-directions.test.ts` (11).

SPEC UPDATE NEEDED: first-time help (Show me around, one-time tips).

## 2026-10-02 — What's Next, When, and How to Get There

### Added
- **"Get there from where you are": Walk, Train, Taxi** (Next tab, the dark "Next" card, under "Find in Maps").
  Each opens Apple Maps with directions from wherever the phone is to the next stop — walking, trains and subway,
  or a driving route a taxi driver can read. Nobody types an address into a map app. It goes to her own place:
  Tokyodo opens on the pin of the Google Maps place she linked; dinner at Une Immersion on the address she wrote.
  Not shown for a flight, or when the stop has no map place (her "Evening Prep" block).
- **Scout gives directions** (Scout panel, buttons under the answer: "Walk to Tokyodo Main Showroom ↗" with
  "Google Maps ↗" beside it). Asked how to get somewhere, the way to the next stop, walking, train or taxi
  directions — or just "what's next?" on a trip day when the next stop is a real place — Scout names the stop and
  its time, quotes her own route for that leg when she wrote one, and adds a button: the way they asked for,
  otherwise the way her plan names (her Tokyodo leg is a train, then a 4-minute walk: Train and Walk), otherwise
  Walk and Train both. Scout never writes turn-by-turn steps or travel times of its own. The destination is hers,
  best first: the pin of a place she linked, the address she wrote, a hotel's booked address (the Imperial), the
  place her map link names, and only then Scout's words and the town. It never sends you to a different place
  of hers: "Ginza" isn't her "ART AQUARIUM MUSEUM GINZA", a town alone isn't any of her lines in it, and two of
  her lines with different pins for one name give the plain name instead. New Scout tool: `directions`.
  Tested by `backend/tests/scout-directions.test.ts` (10).

### Changed
- **The Now tab is now "Next"** (bottom bar) — the question it answers: what's next, when, and how to get there.
  A screen opened from it says "‹ What's next" (a "‹ Next" read as going forward). Scout's offline message,
  the Help page's section and Scout's own description of the screen say Next.

Tested on the test copy with real Scout, on scheduled days: Larisa at 2 PM Oct 16 (Tokyodo at 3:30, her train
route quoted, Walk and Train buttons on her pin); Ken at 6:20 PM ("taxi probably": dinner at 7:00, a Taxi
button to 1-28-8 Hommachi); Ken in Kyoto at 1 PM Oct 26 ("what's next?": Nishiki Market, buttons without being
asked, and the Four Seasons cancellation deadline, checked against her Guide); Julie at 4:40 PM (the Imperial by
train, as her plan says). In the browser at 390 and 320 points: the Next card's row, 44-point buttons, Scout's
Taxi button with Google Maps beside it.

SPEC UPDATE NEEDED: the Now screen is now called Next and offers walking, train and taxi directions; Scout's
tools include directions.

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

## 2026-10-02 — Scout Reads Your Photos, and Translates

Ken, from the car: "Can Scout accept and process images? Can it include translate?" It couldn't — a picture pasted into
Scout's box was dropped.

### Added
- **A photo with your question** (Scout: the camera button beside the mic, or paste a picture into the box). Take one
  or choose one; it shows above the box with ✕ until sent; your question shows it; a photo with no words asks "What
  does this say?". Shrunk on the phone first (longest side 1568 px) so it goes quickly on hotel wifi. Never kept — the
  saved conversation says "(with a photo)" only.
- **Scout reads and translates it**: a menu or sign line by line with the Japanese beside the English; says what came
  from the photo, never passing it off as the Guide; checks it against her Guide and Ken's rail sheet when they meet
  (a ticket against the booking); says what it can't make out instead of guessing. For Andy's allium allergy it points
  out what may contain onion, scallion or garlic, gives the Japanese to show a server, and says a menu photo can't
  prove what's in a dish — confirm with the staff. Sources: "Read from your photo, or Scout's own words — not from
  the Guide".
- Tested end to end with real photos: a Japanese menu (Andy, at dinner) and a train ticket pasted in (Ken, at
  Shin-Osaka — Scout caught that the test ticket's car and seats didn't match his booking).

SPEC UPDATE NEEDED: Scout (photos).

## 2026-10-02 — Her Oct 2 Revision ("Japan Oct 2026-3"): a Day Planned Twice, and Her Exact Place

Larisa's latest download changed one tab: "Tokyo Day 2" gained a revised day plan (A46 — Akihabara moved to midday,
lunch 1:45, Tokyodo 3:00, Umeno 4:05, prep 4:45) below the old one (A44, kept), and Tokyodo's exact Google Maps place
(G39) beside its stop. DEPLOYED Oct 2 (main 7097d50) with everything below from Oct 2, and her copy imported on
production — the same result as on the test copy.

### Changed
- **A day her tab plans twice** (Day screen, Scout). Wander follows one version, the same way every time — the one she
  added most recently (new since Wander's last copy; with no last copy, the one lower in the tab) — keeps that choice
  on later re-imports while both stay as they were, and says so at the top of her plan for the day: "Your tab has 2
  versions of this day's plan: Wander follows A46 (the one she added most recently); A44 has other times — worth a
  second look which is current." Only that version is read into the day. Scout sees the earlier one marked as the
  earlier version, so its times are never given as the plan.
- **A map place she puts beside a stop is that stop's link** (Day screen, Now, Home): Tokyodo opens her exact Google
  Maps place instead of a search for its name.

### Verified
- Import: accepted; 165 lines, 26 tabs, 26 pictures (all from cache); changes exactly the six Oct 16 times; a second
  import of the same file changes nothing. Every Scout line's cells checked (484 of 552 fully in their cells, the rest
  Wander's own words — as before). All 12 walk-throughs pass on the new data. Scout: 3 new questions on the revision,
  3/3, each citing A46.

## 2026-10-02 — Where the Sheet Won: Find a Word, the Whole Trip on One Page

A fresh reviewer went through all 26 tabs of her Guide asking, for each section, when someone would rather open the
sheet than Wander (ux-round16). Two of its top answers, built. Not deployed.

### Added
- **Find a word in your Guide** (Home → "Your Guide, tab by tab", the box at its top — no need to open the list).
  Every tab searched on the phone, no accents needed ("osaka" finds "Shin-Ōsaka"); each find shows the tab and cell,
  her words around it with the word marked, the day it belongs to ("Wed, Oct 28 ›" — a booking's email belongs to the
  dinner, not its cancel-by date), and "Open this spot in your sheet ↗". Pictures are found by what Wander read in
  them (their summaries — never a booking screenshot's ticket or traveler numbers); card numbers never show. After
  the first search it works with no signal. A word she never wrote: "Nothing in your Guide says '…' — at least in the
  copy Wander has."
- **The whole trip on one page** (Home → "The whole trip on one page", under the calendar). Day by day (where, her
  line for the day in her words, where you sleep, meals booked); where you sleep (dates and nights, whose, check-in
  and check-out times, confirmation, free-to-cancel-until with whose); every meal in her Dining Resos tab, with any
  disagreement between her tabs; flights and booked trains from Ken's rail sheet in one list; every date to keep in
  mind, not only the next two weeks. A table on a laptop, a list on a phone; every row opens its day.

- **Her pictures, full screen** (Home → tab by tab → "See the picture", and Scout's Sources → "See the picture"). Tap
  the picture or "See it full screen ›": it fills the phone on black; pinch or double-tap to zoom, drag to look
  around, double-tap to see it whole, Done or the phone's Back to close. Her five-panel Kyoto map (2048 px, shown 308
  points wide) is readable on a phone.

- **Send this day, or a booking, to someone outside the four** (Day screen: "Send this day ›" at the top; "Send ›"
  beside Maps on a booked meal, check-in or tour). The phone's share sheet, or a copy. A day goes as her plan in her
  order with her times and whose each line is, her Itinerary line, where they sleep, and "— from Larisa's plan for the
  trip" — no confirmation numbers, and a time her tabs dispute goes out marked "her tabs differ on this; check before
  relying on it", never as fact. A booking goes as name, day and time, address and confirmation (for a concierge).

No SPEC change beyond the new pages; SPEC UPDATE NEEDED: Home (two new entry points).

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

## Before October 2026

Every earlier entry, word for word: CHANGELOG-before-2026-10.md.
