# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# دوري الحلقات — Halaqat League Platform

## What this is

Mobile-first Arabic (RTL) PWA for running the real community football league
"دوري الحلقات — صيف 2026" (10 teams, 2 groups, 24 matches, 4 Friday nights),
built to grow into the full multi-league platform described in the spec.

**Read these before non-trivial work:**
- `docs/league-platform-spec.md` — full functional spec v1.1 (Arabic; behavior, roles, data model §7, page map §5, poster-driven amendments §14).
- `docs/design_handoff_halaqat_league/README.md` — design tokens, screen inventory, interaction notes. `Halaqat League Design.dc.html` (open in browser with `support.js` beside it) is the hi-fi reference for every screen.
- `docs/prompt-claude-code.md` — the phased build kit (T1–T10 task prompts for later phases).

## Commands

- `npm run dev` — dev server (localhost:3000)
- `npm run build` — production build
- `npm run typecheck` — `tsc --noEmit` (strict mode; no ESLint configured)
- `npm run test` — Vitest unit tests for the pure engines (`tests/`)
- Run a single test file: `npx vitest run tests/standings.test.ts`

## Current architecture (Phase 0 — local-first, no backend)

The app runs entirely without external services so it works out of the box:

- **Seed**: `data/first-league.json` (the real league: teams, fixtures, slots, rules,
  power cards). Parsed by `lib/league/seed.ts` into typed objects; placeholder players
  (7 per team, shirts 1–7, first 5 are starters) are generated there.
- **State**: `lib/league/store.tsx` — a React context (`LeagueProvider`/`useLeague`)
  holding all mutable state (events, match statuses, clocks, reports, adjustments,
  audit log, current role), persisted to `localStorage` key `halaqat-league-v1`.
  All pages are client components consuming this store. **This file is the seam for
  the future Supabase swap** — pages only talk to the store API, never to storage.
- **Pure engines** (no DB/UI imports, unit-tested in `tests/`):
  - `lib/standings/compute.ts` — `deriveScore` (score = sum of goal event `value`s)
    and `computeStandings` (tie-breakers: points → head-to-head → GD → GF → fair play → draw).
  - `lib/scheduling/conflicts.ts` — `isVenueAvailable`, `checkScheduleConflicts`
    (venue double-booked / venue unavailable / team double-booked / slot gap < 1 /
    >2 matches per team per night) and `suggestNearestSlot`. Parallel matches in the
    same slot on DIFFERENT venues are valid — this is a core domain rule.
  - `lib/discipline/suspensions.ts` — `computeTeamSuspensions` (red = next match out;
    2 cumulative yellows = next match out; a second-yellow red consumes its yellows).
  The full T1 scenario *generator* is still future work — fixtures come from the seed.
- **Demo data**: `lib/league/demo.ts` — loaded only via the "تعبئة بيانات تجريبية"
  button on `/me`; never auto-loaded.
- **Roles** are a local switcher on `/me` (visitor / recorder / admin) — real auth
  (username+password over Supabase Auth) is a later phase. Referee approval PIN is
  `1234` (constant `ADMIN_PIN` in the store).

### Key invariants (from the spec — do not break)

1. **Score is derived from events**: `match_events.value` (default 1; the
   "الهدف بهدفين" power card sets value=2). Never store a score that can't be
   recomputed from events.
2. **Standings are computed**, never stored: `computeStandings` over approved
   matches only + `standing_adjustments` (visible with a ★ and reason).
3. **Logical match day** (`matchDay`) ≠ actual timestamp: after-midnight slots
   (00:00–00:40) belong to the previous evening's night. All grouping/labels use
   `matchDay`; only the clock uses real time.
3b. **Every match always shows its (day, slot, venue) triple** — several matches may
   run in the same slot on different venues, so the venue is never hidden
   (`components/match/VenueChip.tsx`). Pages must consume `store.matches` (the
   EFFECTIVE schedule = seed + `fixtureOverrides` from the admin schedule editor at
   `/admin/schedule`), never `seed.matches` directly. Reschedules are audited and
   validated live via `store.scheduleConflicts` / `conflictsOf` / `suggestReschedule`.
4. **Knockout sides are placeholders** (`1A`, `2B`, `W_semi_1`…) resolved at render
   time by `store.resolveSide()` once group results / semis are approved.
5. **Two taps for any event** in the console (event → player), 5-second undo,
   second yellow auto-red, edits/deletes require a reason and land in the audit log.
6. Sensitive mutations (start/end/approve/reopen match, delete event, point
   adjustments, power-card use) must write an audit entry via the store.

## Non-negotiable UI rules

1. Arabic RTL first (`<html lang="ar" dir="rtl">`). Numerals are Latin (0-9) inside
   LTR isolation — use the `.num` class (sets `direction:ltr`, tabular-nums, Changa).
2. Mobile first: every screen must work at 390px width. Touch targets ≥ 44px
   (console buttons 62–64px). Bottom sheets, not modals, on mobile.
3. Design tokens live as CSS variables in `app/globals.css` — do not invent colors.
   Dark theme = public/player/live surfaces; `.admin-theme` (light, high-contrast) =
   admin desktop only. Gold is the single primary accent (≤10% of a screen);
   flame-orange is exclusive to power cards; shield-blue exclusive to team shields.
4. Fonts: Changa (headings/numbers/scores), IBM Plex Sans Arabic (body) — loaded
   from Google Fonts in `app/layout.tsx`.
5. Team shields are CSS `clip-path` (see `components/ui/Shield.tsx`), never images.

## Workflow for every task

1. Read the relevant spec section + design screen first. 2. Implement. 3. Extend
tests when touching `lib/`. 4. Run `npm run typecheck && npm run test && npm run build`.
5. Verify at 390px viewport. Keep Arabic strings inline for now (a `/messages/ar.json`
extraction is planned when English is added).

## Roadmap (from the build kit — keep the seam clean)

- **Next**: Supabase (Postgres+RLS, Auth username→internal email, Realtime) replacing
  the local store; `lib/scheduling/` generator (T1, Circle Method, acceptance case =
  this league's constraints); league setup wizard (desktop); social feed + moderation;
  push notifications; graphics studio (poster/result cards via HTML→image).
- `docs/prompt-claude-code.md` part 4 has the exact task prompts (T1–T10) with
  acceptance criteria — follow them one task per session.
