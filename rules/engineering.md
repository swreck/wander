# Wander engineering (loaded with CLAUDE.md)

## Production
Ken (Sep 28 2026): "You're authorized to deploy Wander to production whenever ready." It covers schema pushes, merges
to main, imports from trip-data snapshots and invite links. It never covers anything touching Larisa's sheet or a
destructive delete of production data. [Overrides global: commits and pushes inside this authorization are mine.]
Ken (Oct 10): "I'm going to sleep. But andy and Julie will wake soon and are going close to leaving. You are head of
engineering. You are responsible for delivering the product's vision with free or no bugs and a product users can use
fully with no training. You can deploy when ready. Test all features and every hot spot with fresh agents, predefined
rubrics and realistic scenarios. Don't stop. Go."
Ken (Oct 3): "'the goal' hasn't changed. The only change is Wander is in the hands of a user, so it can never be left
unstable." Ken (Oct 4): "be double careful, ask yourself what bad thing can happen with each change since someone else
is in the product."
- (Claude) Changes are additive; one careful deploy per batch; no deploy while travelers are waking or mid-use;
  cosmetic fixes ride with a deploy needed for a real reason. Docs-only commits don't deploy (railway.toml).
- Deploy path: (1) `npx tsx trip-data/session-tools/backup-prod.ts <label>` (Neon branch + JSON in
  ~/Documents/WanderBackups; keeps the 2 newest; Ken, Oct 10: "even 10 backups is more than I would expect");
  (2) schema change → `prisma db push` to production FIRST (preview: schema-diff-prod.mjs); (3) merge 2.0 → main with
  trip-data/session-tools/deploy-merge.mjs: Railway auto-deploys main, so never `railway up` here [Overrides global:
  Railway procedure]; (4) wait-for-deploy.mjs <bundle>; (5) `npx tsx test-functional.ts` against production;
  (6) prod-walk.mjs; (7) update HANDOFF CURRENT and the LIVE line in memory.
- Never run delete-trip.ts, reimport.ts, clean-*, fix-* or final-cleanup scripts. Never commit trip-data/, *.xlsx,
  *.tmp.ts, or the April leftovers in backend/scripts/reimport.ts and package.json.
- New Guide copy during the trip. Ken (Oct 2): "I want you prepared for a new copy anytime during the trip that Larisa
  makes changes to the sheet by phone or iPad. When she does that, I need to download with my phone (only device) and
  give to you over the long distance remote control from Japan to Mac." Procedure:
  trip-data/session-tools/guide-update/README.md (`update-guide.mjs find | test | prod`). Read every warning and
  changed cell before prod; after prod, rewrite only the changed days' summaries and read each before publishing.

## Tests
- Type-check: `frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.app.json` has 93 errors (measured Oct 16
  2026); never add one. Backend: `cd backend && npx tsc --noEmit`. (`cd frontend && npx tsc --noEmit` checks nothing.)
- Backend suite (backend/src or prisma changed): `cd backend && npx vitest run 2>&1 | tail -30`, foreground, timeout 600000 (~45 min). Never in the
  background, never through `tee | grep`, never two runs at once, never start a single vitest file while the suite
  runs (its setup deletes the running suite's Neon branch), never edit backend src during a run.
  tests/vitest-setup.ts's `pg` SELECT 1 warmup must stay: without it nearly every test fails "Can't reach database
  server". Vitest workers bind :3001, so local walks use :3004 / :5182.
- Browser: Playwright on its own headless shell (trip-data/session-tools/playwright.prod.config.ts). Never
  `npx playwright install`. Installed Chrome hangs Playwright at close. Every suite reads BASE; stop old preview servers
  first. Production walks skip Google's map (MAPS=1 to include).
- backend/.env is PRODUCTION. Local walks use the test copy (e2e-backend.mjs: background jobs off unless --warm;
  --stub-scout unless testing Scout's words). Stop servers and previews when idle: they keep Neon's test
  copy awake. Keep them up while a fresh agent is using them.
- Data-changing behaviour gets chaos tests: normal, repeated, invalid or deleted ids, empty input, interaction with
  existing features. Scout tools above all, because people ask unpredictable things.
- Screens and plumbing are tested on synthetic data with Scout stubbed. Real Scout calls only check Scout's own answers:
  exams, and 1–3 questions on a day a new Guide copy changed. Maps also need production data (read-only):
  real coordinates move everything.
- Timing bars: layout shift under 0.1, no freeze over 0.3 s at CPU 2×; time pages through gzip-serve.mjs.

## iPhone
- (Claude) Oct 9, mid-trip: a page-wide tab-bar change for the iPhone keyboard broke Scout's panel. Ken: "Wander is
  not stable." A change touching the keyboard, visualViewport, fixed or bottom elements or scrolling stays inside one
  component; simulate the misreport (session-tools/scout-panel-check.mjs) on every fixed element; tell Ken only his
  phone can confirm it, with the reset (swipe Wander away and reopen).
- Review sizes: 393, 402 and 440 pt wide plus iPad. The 375 SE must work but isn't polished for.
- Every map added or changed: a fresh agent reviews it against a rubric written first, at those sizes, on production
  data. (Claude) Oct 1: a test-copy review passed a map that production's real places covered.

## React hooks
Before committing a component with early returns, read it: every hook sits ABOVE every early return. One below crashes
the app, and no test catches it.
