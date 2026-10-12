# Wander's words (read before writing or changing any words people see, and when auditing them)

The core test lives in CLAUDE.md §5. This file holds the full rule (written Mar 2026, kept as written) and what was
learned since. Its examples predate the Poetry Pass (Oct 3: no gratuitous mid-sentence em dashes). In new strings use a
period or a comma: "That didn't stick. Give it another try."

Wander's voice is a thoughtful, warm travel companion — never software.
This rule applies when writing new strings AND when auditing existing ones.
It is not optional. It does not drift. Apply it every time, every string.

### Three tiers of strings

**1. Messages that speak to the user (MUST sound human)**
Toasts, errors, empty states, confirmations, status messages, completion
messages, offline notices, sync results. These are the app's voice. They
must sound like a friend who's good at travel — not software reporting
a status change.

Wrong → Right:
- "Save failed" → "That didn't stick — give it another try"
- "Changes saved" → "Got it" (or just a visual check — no words needed)
- "Import complete" → "All set — take a look"
- "Trip complete" → "Welcome home"
- "No reservations yet" → "Nothing booked yet"
- "Couldn't save changes" → "That didn't save — try again?"
- "Are you sure you want to delete X? This cannot be undone." → "Remove X from your trip?"
- "Loading..." → Context-specific: "Finding your trip..." or just a spinner
- "Saved offline — will process when back online" → "Saved for now — I'll finish when you're back online"
- "Decision cancelled" → "Cleared"
- "Extraction failed" → "Couldn't make sense of that — try pasting the text directly?"
- "Location confirmed" → "Found it" or just show on map
- "Ratings updated" → "Updated" or silent visual confirmation

**2. Functional labels (clarity first, warmth where natural)**
Form field labels, button text, input placeholders. "Notes," "Depart,"
"Save," "Cancel" are fine — they're scannable UI, not conversation.
But when a label could be warmer without losing clarity, prefer warm:
- "Add Reservation" → "Add a reservation"
- "Update location & ratings" → "Look this up"
- "Restaurant or activity name" → "What's it called?"

**3. Accessibility labels (clarity only)**
Aria-labels and title attributes serve screen readers. Clarity and
accuracy matter here, not personality.

### Patterns to always avoid
- **Database terms in UI:** "confirmed," "pending," "resolved," "segment,"
  "zone," "reorder" — users don't think in schema
- **Programmer shorthand:** "e.g.," "#," abbreviations with parenthetical
  examples — write like a person, not a spec
- **Passive completion:** "Reservation added," "Order applied," "Notes saved"
  — either use present tense ("Got it") or skip the toast entirely
- **Legal/formal warnings:** "This cannot be undone," "Are you sure?" —
  just say what will happen plainly
- **One-word status toasts:** "Saved," "Copied," "Deleted," "Retracted"
  — either add enough warmth to sound human or use silent visual feedback

### When auditing existing code
Run every user-visible string through the test above. Fix violations in
the same pass — don't just flag them for later. Group fixes by file to
minimize churn.

### When changing how a feature works
Search for every user-facing string that *describes* the changed feature
— onboarding tips, quick start text, guide pages, tooltips, chat system
prompts, first-time cards. These strings don't reference the feature in
code; they describe it in words. That semantic connection is easy to miss
because it's not a dependency graph — it's meaning. Look anyway.

### Learned since
- No pressure. Planning isn't "completing" anything: "All set" is the register; never "complete", "done", "100%".
  Would this make someone feel behind? Then rewrite it.
- Deadlines are friends pitching in, not a corporate to-do (Apr 9): ""around 4/15" not "by 4/15". "was aiming for" not
  "was due"."
- No ambiguous nouns. Ken (Oct 2): "remember to use table for two, and don't use ambiguous nouns." (Claude) My tour
  draft said Notes is "a place for what you want to remember"; in a travel app "place" reads as a location. Name the
  thing itself.
- Speak to the person: Larisa sees "your Guide", Ken sees "your rail sheet"; Wander's own lines never talk about
  them in the third person.
