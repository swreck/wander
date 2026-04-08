# Wander Backlog — Items for Discussion
_Updated 2026-04-06. Only items where I'm unsure of the right approach._

## Needs Design Discussion

1. **Nudge card redesign** — "Ken is interested in Jōya-machi Street" cards overlap the Quick start card, use programmer shorthand ("9D AGO", "GROUP INTEREST"), and have no dismiss control. Already flagged in memory as a known issue. Needs dedicated placement + dismiss + human language. What's the right spot for these?

2. **Trip overview map for cities without experiences** — Currently no map shows until experiences are geocoded. Should city markers (from city geocoding) show on the overview map? This would give a "route preview" for new trips. Or is the calendar-only view intentional for early planning?

3. **Plan page map default location** — When a city has no geocoded experiences, the map defaults to Tokyo (cached position from Japan trip). Should it center on the city's geocoded coordinates instead? Requires cities to be geocoded (fix deployed but existing cities need re-geocoding).

4. **"45 cities" count in trip switcher** — Japan shows "45 cities" which includes many hidden/candidate cities. Should the count only show visible cities? Or is the total useful for planners?

5. **Mobile: empty walking radius circle** — On mobile Plan page, when a city has no geocoded experiences, a large dashed circle renders over a blank map. Should the circle be hidden when there's no map context?

6. **GPS-based phrase auto-switching during trip** — Currently the phrase card has manual language tabs. During the actual trip, should it auto-detect which city/country the user is in and switch languages? This could use the existing GPS integration from the Now page.

## Low Priority Polish

7. **Dark brown overscroll background on Now page** — Body background color shows through as dark brown when scrolling past content. Should match the cream/beige app palette.

8. **Onboarding modal dismiss simplification** — "Remind me later" vs "Skip for now" — one dismiss button is enough.

9. **"Other" category for museums** — Theme system has ceramics, architecture, food, temples, nature, other. Museums default to "other". Should there be a "History & culture" theme?
