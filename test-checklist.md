# Wander Interactive Test Plan — 2026-04-05
**App:** https://wander.up.railway.app
**Method:** Every item verified through Chrome browser interaction. No code review as evidence.

---

## USE CASE 1: Ken creates a new trip (Vietnam/Cambodia, Dec 2026)
_Persona: Ken — trip organizer, power user_

- [ ] 1. Open Scout chat, type "Create a new trip called Vietnam December 2026 from December 10 to December 24, 2026" — VERIFY: Scout confirms trip created
- [ ] 2. Check home page — VERIFY: New trip exists, can switch to it via dropdown
- [ ] 3. Switch to Vietnam trip — VERIFY: Home shows empty trip with correct dates
- [ ] 4. Open Scout chat, type "Add Ho Chi Minh City from December 10 to December 14" — VERIFY: City appears
- [ ] 5. Ask Scout "Add Siem Reap from December 15 to December 18" — VERIFY: City appears
- [ ] 6. Ask Scout "Add Hanoi from December 19 to December 24" — VERIFY: City appears
- [ ] 7. Visual review of home page with 3 cities — map shows all 3? Calendar shows days? Markers?
- [ ] 8. Check map markers — do they show on the map in correct geographic locations?
- [ ] 9. Scroll calendar — all days populated with correct cities?

## USE CASE 2: Ken adds experiences to Vietnam trip
_Persona: Ken — has been researching restaurants and sights_

- [ ] 10. Tap Ho Chi Minh City on map or calendar — VERIFY: City board opens
- [ ] 11. Visual review of empty city board — inviting or blank? Tone check empty state message
- [ ] 12. Find "add experience" mechanism — is it obvious?
- [ ] 13. Add experience manually: "Bún Chả Hương Liên" (Obama's bún chả place), category: food — VERIFY: appears in list
- [ ] 14. Check how the Vietnamese name renders — any character encoding issues?
- [ ] 15. Add a very long experience name: "The War Remnants Museum and Historical Exhibition Center of Ho Chi Minh City" — VERIFY: renders without overflow
- [ ] 16. Open Scout, type "Add Phở Thìn to Ho Chi Minh City, it's a famous pho restaurant" — VERIFY: experience created via chat
- [ ] 17. Navigate back to Ho Chi Minh City board — VERIFY: all 3 experiences visible
- [ ] 18. Check map — any pins showing? (Geocoding should be attempted)
- [ ] 19. Tap an experience card — VERIFY: detail view shows name, category, any notes
- [ ] 20. Edit the experience: add notes "Opens at 6am, cash only" — VERIFY: notes save and persist after refresh

## USE CASE 3: Ken uses the planning board for Vietnam
_Persona: Ken — assigning experiences to specific days_

- [ ] 21. Navigate to Plan page (/plan) — VERIFY: planning board loads for Vietnam trip
- [ ] 22. Visual review of planning board — days visible? Unassigned ideas section?
- [ ] 23. Try to assign "Bún Chả Hương Liên" to December 11 — VERIFY: mechanism works, card moves to that day
- [ ] 24. Verify the assignment persisted — go to the day view for Dec 11, is the experience there?
- [ ] 25. Try to unassign it — VERIFY: moves back to unassigned
- [ ] 26. Scroll through days on planning board — smooth? Touch scrolling works?
- [ ] 27. Check "Set for now" functionality if available
- [ ] 28. Navigate back with browser back button — VERIFY: expected destination

## USE CASE 4: Ken uses capture to add from pasted text
_Persona: Ken — found a blog post about Vietnam restaurants_

- [ ] 29. Find the capture FAB button — VERIFY: visible, clear purpose
- [ ] 30. Open capture menu — VERIFY: options appear (manual, paste, URL, camera)
- [ ] 31. Select paste option
- [ ] 32. Paste text: "Cơm Tấm Kiều Giang - Best broken rice in Saigon, located on Hai Ba Trung Street. Must try the grilled pork chop. Open 6am-9pm." — VERIFY: AI extraction runs
- [ ] 33. Review extraction results — VERIFY: name, category, notes extracted correctly
- [ ] 34. Confirm/save the extraction — VERIFY: experience appears in the right city
- [ ] 35. Check the experience details — did it capture all the info from the paste?

## USE CASE 5: Switch trips — verify Japan data untouched
_Persona: Ken — paranoid about data integrity_

- [ ] 36. Switch back to Japan 2026 trip — VERIFY: all cities still there (Tokyo, Kyoto, Okayama, Karatsu, Nagoya, Nikko, Izu Peninsula)
- [ ] 37. Check Tokyo experiences — still intact?
- [ ] 38. Check calendar — same dates, same structure?
- [ ] 39. Switch back to Vietnam — VERIFY: all added data still there

## USE CASE 6: Larisa explores the Vietnam trip
_Persona: Larisa — Ken's partner, wants to see what's planned, medium patience_

- [ ] 40. Sign out as Andy
- [ ] 41. Sign in as Larisa — VERIFY: login works
- [ ] 42. Can Larisa see the Vietnam trip? — VERIFY: trip switching shows Vietnam
- [ ] 43. Larisa opens Ho Chi Minh City — VERIFY: sees Ken's added experiences
- [ ] 44. Larisa taps an experience — VERIFY: detail view works for her
- [ ] 45. Larisa opens the map — pins visible? Can she tap them?
- [ ] 46. Larisa opens Scout chat — VERIFY: chat works for her
- [ ] 47. Larisa asks "What restaurants do we have in Ho Chi Minh City?" — VERIFY: Scout lists the right experiences
- [ ] 48. Evaluate Scout's response — tone, accuracy, completeness

## USE CASE 7: Andy checks what's planned
_Persona: Andy — low patience, wants quick answers_

- [ ] 49. Sign out as Larisa, sign in as Andy
- [ ] 50. Can Andy see and switch to Vietnam trip?
- [ ] 51. Andy opens Now page — VERIFY: what does it show for a future trip? Meaningful or confusing?
- [ ] 52. Andy tries the planning board — VERIFY: can he see the days and experiences?
- [ ] 53. Andy asks Scout "What's happening on December 11?" — VERIFY: response includes assigned experiences

## USE CASE 8: Navigation and cross-cutting UX
_Testing as whoever is logged in_

- [ ] 54. Bottom nav: Home tab — navigates to /
- [ ] 55. Bottom nav: Plan tab — navigates to /plan
- [ ] 56. Bottom nav: Now tab — navigates to /now
- [ ] 57. History page — navigate via top bar, check content
- [ ] 58. Settings page — navigate via gear icon, check layout
- [ ] 59. Profile page — navigate via name button, check layout
- [ ] 60. Guide page — navigate via ? button, check content and tone
- [ ] 61. Trip Story page — navigate to /story, check content
- [ ] 62. Phrase card — tap floating button, check 7 romaji phrases, no Japanese chars
- [ ] 63. Browser back button: from city → home — correct?
- [ ] 64. Browser back button: from plan → home — correct?
- [ ] 65. Page refresh on home — stay logged in? Data reloads?
- [ ] 66. Page refresh on plan — stay on plan? Data intact?
- [ ] 67. Direct URL: /plan — loads correctly when logged in?
- [ ] 68. Direct URL: /doesnotexist — what happens?

## USE CASE 9: Visual and tone audit
_Reviewing every page visited for design quality_

- [ ] 69. Home page: Level 1/2/3 visual review (already done above, note any issues)
- [ ] 70. City board: Level 1/2/3 visual review
- [ ] 71. Plan page: Level 1/2/3 visual review
- [ ] 72. Now page: Level 1/2/3 visual review
- [ ] 73. Settings page: Level 1/2/3 visual review
- [ ] 74. Profile page: Level 1/2/3 visual review
- [ ] 75. History page: Level 1/2/3 visual review
- [ ] 76. Guide page: Level 1/2/3 visual review + tone audit
- [ ] 77. All toast messages encountered: tone audit
- [ ] 78. All empty states encountered: tone audit

## USE CASE 10: Edge cases and stress
_Breaking things intentionally_

- [ ] 79. Double-click a submit button — does it fire twice?
- [ ] 80. Very long text in experience name — display OK everywhere?
- [ ] 81. Special characters in name: "Café Sài Gòn & Bar (Rooftop)" — saved and displayed correctly?
- [ ] 82. Delete an experience — confirmation? Tone? Actually deleted?
- [ ] 83. Try deleting a city — what happens?
- [ ] 84. Resize browser to 375px width (mobile) — layouts adapt?
- [ ] 85. Open app in narrow viewport, check Plan page specifically

## USE CASE 11: Cleanup
- [ ] 86. Delete the test Vietnam trip (via Scout or UI)
- [ ] 87. Verify Japan trip is still fully intact
- [ ] 88. Final bugs and issues list

---

## BUGS FOUND
| # | Severity | Description | Status |
|---|----------|-------------|--------|
| B1 | Low | Onboarding modal: "Remind me later" vs "Skip for now" — unclear distinction | Open |
| B2 | Medium | Nudge card overlaps Quick start card on home page | Open |
| B3 | Medium | "GROUP INTEREST · 9D AGO" — programmer shorthand, not human language | Open |
| B4 | Medium | Nudge card has no dismiss control | Open |
| B5 | Needs verify | Keyboard shortcuts may intercept chat input (Chrome automation artifact or real bug) | Open |
| B6 | Medium | No "Create Trip" button in UI — only via chat | Open |

## BACKLOG (delight ideas, not bugs)
_(to be populated during testing)_
