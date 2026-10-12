# Wander — how we work on it

Ken's instructions for every project are in ~/.claude/CLAUDE.md. This file holds Wander's product truths and Wander's
engineering. Where it differs from the global file it says so with [Overrides global: …]. Each rule has one home.
Ken's words are quoted and dated; anything marked (Claude) is my judgement beside them. This repo is PUBLIC: no ids,
links, keys, booking codes or people's personal details here. Those live in trip-data/ (git-ignored) or private memory.
A git hook blocks commits that add them. After a compaction or /clear, read trip-data/HANDOFF.md's CURRENT block first.

@rules/engineering.md

## 1. What Wander is

Ken (Apr 11 2026, reconfirmed Sep 27): "Wander is a value-add front end to Larisa's Japan Guide."
Ken (Oct 1 2026): "be creative… friends travelling to a new location with new culture, style, foods… hand built for
the individuals instead of mass appeal… 10 or more exciting yet safe-to-implement ideas."
Ken's ambition (Sep 27; my close paraphrase, his exact words weren't recorded): Wander seduces people, Larisa included,
into seeing it as a parallel tool that earns its place as the main window into the plan through its charm, its ease
and its usefulness. Larisa is the final judge, comparing it with her own sheet.

The people: Ken and Larisa (she owns the Guide, her Google Sheet), Andy and Julie. Accounts are named Ken, Larisa,
Andy, Julie. Ken (Oct 10): "They see themselves as andy and Julie. The initial was yours. And the initial seems to have
caused a problem". They carry iPhone 16 or later. Ken (Oct 3): "pretty sure all are 16 or later. And not SE."

## 2. Downstream of Larisa's Guide (HARD RULE, Sep 27 2026)

Her sheet is the master. Wander reads it and never changes it. Ken (Oct 2): "The ONLY reason for non-live connections
is the danger of you changing something or deleting something or destroying something she created."
- Never reach her online Google Sheet. Ken's words for it: "never reach her online sheet". Read only the snapshot
  copies Ken exports into trip-data/. Changing that is Ken's call alone.
- Her view-only share links (Apple Maps guides, her Google map) may be read; say so first. Ken's own rail sheet is
  read live, read-only.
- Never use the Google Drive connector for Wander. Nothing in Wander writes to any sheet.
- Scout never deletes or restructures the trip. The tools in WITHDRAWN_TOOLS (backend/src/routes/chat.ts) stay
  withdrawn. Wander's own additions (notes, maybes, spur-of-the-moment plans, lookups) are editable.
  Ken (Sep 27): "May change while on the road, but it's the right start."
- Lightweight planning only, inside her plan's open space. Ken (Sep 27): "which of 3 restaurants", "what Andy and Ken
  do on the spur of the moment while Larisa and Julie are at a ceramics demonstration". Days, cities, hotels and tours
  are her Guide's job. Ken: "no non-Wander workflows".
- The trip freeze is Ken's to set and lift. Inside it I fix real bugs, wrong time/place/yours-vs-theirs, Scout honesty
  failures, and what he asks for.

## 3. Faithfulness with judgement

Ken (Oct 2): "everything in the spreadsheet is data". And: "Larisa has spent a great deal of time on that spreadsheet. She is precise and intentional. Everything
earning a place in the spreadsheet is important… every word, image, and number [is] 'data' that is valuable… the
mindset is 'anything in the spreadsheet' (or any other source given to Wander like my Rail reservation spreadsheet) is
worth knowing and being ready for both asking and enriching responses."
Ken (Oct 4): "I want to reinforce that this smart parsing of her unstructured (sometimes random) entries are the power
you bring. That intent and requirement should stay durable across sessions please."
Ken (Oct 4, on a new copy): "an early test of your ability to smoothly import a new version… unstructured information
you need to parse accurately."
Ken (Oct 10): "Faithfulness continues to be Key. But your judgement as head of engineering with faithfulness as a goal
is just as important. Perhaps more because 'you are the head of engineering creating a great product that has
faithfulness at its core.' This optimization would be clear to a human."
- (Claude) What happened Oct 10: her pre-trip forecast showed as the day's weather for days. Ask two questions of every
  fact on screen: is her word kept exactly, and is this the best a traveler can have right now? Show both when they
  differ (live first, hers labelled hers). Never trust "accepted" on an import: a sentence she typed in the hotel
  column became a second hotel (Oct 4). Fix the reader with a general rule tested on her real cells; never her sheet.
- Ken approved (Oct 11): everything she wrote is data Wander holds and Scout can answer from; how much screen work each
  piece gets is proportionate. I work out her meaning from her cells and ask Ken only when two readings would give a
  different time, place or booking. Conflicts between her tabs are shown, never silently resolved.
- Before asking Ken about her sheet, read the cell. Ken (Oct 10): "There is no lt. why do you keep asking?" ("LT
  actions" is a heading in her Actions tab.)
- Personal information. Ken (Oct 4): "unless the info passes through the vault in a safe way, Wander should not surprise
  people by surfacing their personal info."

## 4. Scout never lies (Sep 29 2026)

Ken: "one scout error when asked when or where something is happening can overwhelm multiple correct answers."
Ken (Oct 2): "if they go to the airport on the wrong day because of Wander, I will never hear the end of it"
Ken (Oct 2, directions): "Scout cannot lie… we could end up in the wrong place"
Scout may honestly not know. It never states a time, place, booking or fact it can't support. It gives the Guide's
answer with its tab; the web when the Guide is silent, labelled as found online, not the plan; plain words for what's
unknown. (Claude) Oct 4: past his rail sheet it described a JR West page it never opened and gave a dead link. The
web is where it lied, so links and website steps are only ones it has seen.
- Sources. Ken (Sep 30): "make sure we're not trying to surface the sources unless they're requested." Ken (Oct 2): "be
  sure the source button goes to the right tab and right cells… a button to open it". Recorded at answer time.
- "What's near me?". Ken (Oct 11): "the two closest places that attracted Larisa are X about 4 blocks from you and Y a
  1.5 mile walk in the direction of your hotel". Her pins first, blocks and miles, direction; straight-line only.
- Exams are written from her text before building, never from Wander's output. Rerun the exams a change can affect
  after any change to the reader, Scout's context or its prompt. Read every answer word for word. When Scout passes
  one, write a harder one. An honesty failure is a blocker.
- Spending. Ken (Sep 29): "use api when needed. Use synthetic Prisma data when checking bugs or plumbing or user
  interface." Name the exams and the rough question count before a run; each question once; full runs only before a
  deploy; stop at once if Ken raises cost.
- Voice: a Backroads guide, knowledgeable and warm. Ken (Apr) on those guides: "some of the best employees in any job
  I've ever seen." The test: would a world-class trip guide say this, in this tone, at this moment?

## 5. Words in the app

The test: could this string appear unchanged in Jira, a banking app, or a form builder? If yes, it's wrong for Wander.
Rewrite it. Ken (Oct 2): "remember to use table for two, and don't use ambiguous nouns." The full tone rule, with its
three tiers and examples, is in rules/tone.md. Read it before writing or changing any words people see, and when
auditing them.

## 6. Ken's product decisions (each stands until he changes it)

- Day screen (Oct 4, Oct 8): first the day in a few sentences, then what you can't get wrong today, then the day by the
  clock in ONE list in the order it's lived; reference last; never category sections. Chips may filter that list in
  place. Each fact once. Before changing it, run day-risk-check.mjs and lost-facts.mjs (trip-data/session-tools). Ken (Oct 8): "the general principle is an absolute yes to your ideas… create an agent that is an expert in user
  experience and discuss options… you are the head of engineering, so you can sequence it"
- Next goes by the clock. Ken (Oct 10, Hakata): "given the time of day that you know, I would think you would realize
  that when I tapped on next, you would know that I was already in Hakata at the hotel, and so when I tapped on next,
  it would not tell me we were taking a local train to Hakata."
- Maybes: Ken (Oct 2): "a shared list of maybes", light enough for "tea or ice cream?". No polls, votes or alerts.
  Ken (Oct 3): "I should be able to remove items on any list, e.g., Maybes… I know we're going to TeamLab in Kyoto, so
  I can remove it as a maybe for Tokyo." Then: "remove is NOT for everyone. It is for the person who added it and me."
  Remove hides for everyone and never deletes.
- Scout takes any file. Ken (Oct 4): "Yes on all the builds. Learn from Maria is needed. User should just drag (Mac) or
  paste (iOS) anything and Scout should parse and make sense if it: picture with text, pdf, text, etc. And build a UI
  expert agent so you have a fresh opinion to discuss the order and layout of each day page and build it. Continue"
- Trip notes are kept word for word, the original always kept. Ken (Oct 1) called notes and summaries "a major topic
  for me". Ken (Oct 8): "I like notes function. It will become source info for an ai assisted summary later. I'm sure I
  want it integrated with the activities from Larisa's spreadsheet." Telling Scout something counts as a note. The
  summaries design is in memory (project_trip_notes_and_summaries).
- Invitations live inside Wander. Ken (Sep 28) on links pasted in chat: "does nothing. it just scrolls away."
- Scout's mic: tap to start, tap to stop, words wait in the box (Oct 1). No auto-send, no hold-to-talk.
- Ken (Oct 3): "stop the map" (no more spending on the Home map's polish). Ask him before building Scout streaming,
  before using "Team Fun", and never bring back the travelerProfiles nudges (they invent facts).
- Old April trips are placeholders. Ken (Sep 27): "No need to worry about keeping existing data in Wander. No one is
  using the old version. That data was placeholder data to learn how to create an effective Wander."
- The design standard. Ken (Apr): "UX for non-technical users resulting in delight without having to be trained".

## 7. Head of engineering: Wander specifics (Ken, Oct 11)

The charter is in the global file. In Wander, these are also Ken's:
- Anything that would change Larisa's Guide being the master.
- What Larisa, Andy and Julie are told, and when.
- Any new kind of the travelers' personal data (location, photos, documents). Raise it in one line before building.

Mine, for example: Scout's "Use my location" button, so "what's near me?" works for any wording.
Ken's actions list: trip-data/KEN-ACTIONS.md. Deploy authorization: rules/engineering.md.

## 8. Docs

- SPEC.md is the canonical product spec (v3.0, March 2026). Never edit it during feature work. Where Ken's later
  decisions differ (sheet is master, Scout can't change the Guide, show what changed), his decisions win.
- After any change in behaviour, add an entry at the TOP of CHANGELOG.md under the date: what changed (behaviour), where
  it lives in the UI, which SPEC sections it touches, and "SPEC UPDATE NEEDED" when behaviour now differs from SPEC.
  Use Added / Changed / Fixed / Removed headings as they apply. Never rewrite old entries.
- Chat parity: "anything that can be done by the visual UI should be able to be done by the agent" (Apr), now only for
  Wander's own additions. When a UI action changes Wander-owned data, Scout gets a matching
  tool (definition, executeTool case, numbered prompt rule), and the reverse. Never for Guide-derived data.
