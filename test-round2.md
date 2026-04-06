# Wander Test Round 2 — Deep Persona Use Cases
_Execute every item. Fix bugs inline. Only save uncertain items to backlog._

## USE CASE A: Julie joins for the first time
_Julie is Andy's wife. She's never used Wander. Andy sent her a link. She's curious but won't hunt for features._

- [ ] A1. Sign out current user, sign in as Julie
- [ ] A2. What does Julie see first? Onboarding? Welcome? Does she know what to do?
- [ ] A3. Julie wants to see what's planned for the trip. Can she find the calendar? 
- [ ] A4. Julie taps a Siem Reap day — does the planning board make sense to a first-timer?
- [ ] A5. Julie wants to add Angkor Wat. Can she find the add mechanism without instructions?
- [ ] A6. Julie asks Scout "What restaurants do we have?" — does the response help her?
- [ ] A7. Julie opens the Now page — does "Getting ready" make sense for someone new?
- [ ] A8. Julie wants to see what Andy and Larisa have been doing — does the History page help?
- [ ] A9. Julie tries the phrase card — does she understand what it is and how to use it?
- [ ] A10. Visual review: every page Julie visits at iPhone width (375px)

## USE CASE B: Ken builds the Vietnam itinerary from research
_Ken found a blog post about Vietnam food. He wants to paste it into Wander and get experiences extracted._

- [ ] B1. Sign in as Ken, switch to Vietnam trip
- [ ] B2. Find the capture/paste mechanism — is it obvious?
- [ ] B3. Paste text: "Must-try in Saigon: Banh Mi Huynh Hoa on Le Thi Rieng, best banh mi in the city. Pho 2000 near Ben Thanh Market, where Bill Clinton ate. Cafe Sua Da at any street vendor. Bui Vien Walking Street for nightlife."
- [ ] B4. Does AI extraction work? What does it extract? Review each field.
- [ ] B5. Does it correctly identify the city (HCMC/Saigon)?
- [ ] B6. Confirm import — do experiences appear in the right city?
- [ ] B7. Verify on the planning board — all new experiences visible?
- [ ] B8. Try "Look this up" on Banh Mi Huynh Hoa — does it get Google Places data?

## USE CASE C: Larisa checks the trip on her phone
_Larisa is on her iPhone, checking what's planned while commuting. Quick glance, no patience for broken layouts._

- [ ] C1. Resize to 375x812
- [ ] C2. Sign in as Larisa, navigate to home
- [ ] C3. Three-level visual review of home at iPhone width
- [ ] C4. Tap into Dec 15 (Siem Reap) — does the plan page work on mobile?
- [ ] C5. Open Scout chat on mobile — can she type? Is the input accessible?
- [ ] C6. Ask Scout "What should we see in Siem Reap?" — read response, evaluate quality
- [ ] C7. Open phrase card on mobile — does it render properly? Can she switch languages?
- [ ] C8. Navigate to Now page on mobile — readable? Useful?
- [ ] C9. Try the capture FAB on mobile — accessible? Menu clear?

## USE CASE D: Andy deletes an experience and changes his mind
_Andy added something wrong. He wants to delete it, then realizes he shouldn't have._

- [ ] D1. Sign in as Andy, go to Plan for HCMC
- [ ] D2. Click delete on Historical Exhibition Center
- [ ] D3. What's the confirmation? What tone? What happens after?
- [ ] D4. Is there an undo? Can Andy get it back?
- [ ] D5. Check History page — does it show the deletion?
- [ ] D6. Ask Scout "Can you bring back the Historical Exhibition Center?" — does it work?

## USE CASE E: Ken switches back to Japan to verify data integrity  
_After all the Vietnam testing, Ken needs to confirm Japan trip is untouched._

- [ ] E1. Sign in as Ken, open trip switcher
- [ ] E2. Switch to Japan 2026
- [ ] E3. Verify all original cities present (Tokyo through Izu)
- [ ] E4. Click into Tokyo — verify experiences exist
- [ ] E5. Check the planning board — all Tokyo days populated?
- [ ] E6. Verify the map shows Japan, not Vietnam
- [ ] E7. Check phrase card — should show Japanese (not Vietnamese)
- [ ] E8. Switch back to Vietnam — verify Vietnam data still intact
