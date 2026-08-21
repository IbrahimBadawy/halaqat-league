"use client";

// مخزن حالة الدوري — طبقة البيانات المحلية (المرحلة 0).
// كل الكتابات تمر من هنا وتُحفظ في localStorage، والقراءات مشتقة
// (النتيجة من الأحداث، الترتيب من computeStandings) بحيث يُستبدل هذا
// الملف بطبقة Supabase لاحقًا دون تغيير الصفحات.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadSeed, slotToMinutes, type LeagueSeed } from "./seed";
import { computeStandings, deriveScore } from "../standings/compute";
import {
  checkScheduleConflicts,
  conflictsFor,
  structuralSideTokens,
  suggestNearestSlot,
  type ScheduleConflict,
} from "../scheduling/conflicts";
import { computeTeamSuspensions } from "../discipline/suspensions";
import type {
  AuditEntry,
  DerivedScore,
  FixtureOverride,
  Match,
  MatchEvent,
  MatchReport,
  MatchStatus,
  Player,
  Post,
  Prediction,
  StandingAdjustment,
  StandingRow,
  Suspension,
  Team,
} from "./types";
import { buildDemoState } from "./demo";

export type Role = "visitor" | "recorder" | "admin";

export interface ClockState {
  period: "first" | "break" | "second" | "extra" | "ended";
  running: boolean;
  /** ثواني متراكمة للفترة الحالية (بدون الجارية الآن) */
  periodSeconds: number;
  /** ثواني متراكمة للمباراة كلها */
  totalSeconds: number;
  /** طابع بدء آخر تشغيل (ms) لو الساعة تعمل */
  runningSince: number | null;
  extraMinutes: number;
}

export interface ActivePowerCard {
  teamCode: string;
  cardName: string;
  effect: "goal_multiplier" | "extra_time" | "shield" | "extra_substitution";
}

export interface PersistedState {
  role: Role;
  statuses: Record<string, MatchStatus>;
  events: MatchEvent[];
  clocks: Record<string, ClockState>;
  reports: Record<string, MatchReport>;
  adjustments: StandingAdjustment[];
  /** بدلاء دخلوا: matchId -> playerId -> "in" | "out" */
  lineupOverrides: Record<string, Record<string, "in" | "out">>;
  activeCards: Record<string, ActivePowerCard | undefined>;
  usedCards: { teamCode: string; cardName: string; matchId: string }[];
  audit: AuditEntry[];
  /** تعديلات مواعيد/ملاعب فوق الـ seed: matchId -> {matchDay?, slot?, venue?} */
  fixtureOverrides: Record<string, FixtureOverride>;
  /** توقعات صاحب الجهاز: matchId -> نتيجة متوقعة */
  predictions: Record<string, Prediction>;
  posts: Post[];
  /** تشكيلة أساسية مختارة: matchId -> teamCode -> playerIds */
  starters: Record<string, Record<string, string[]>>;
}

const STORAGE_KEY = "halaqat-league-v1";
const ADMIN_PIN = "1234";

function initialPersisted(): PersistedState {
  return {
    role: "visitor",
    statuses: {},
    events: [],
    clocks: {},
    reports: {},
    adjustments: [],
    lineupOverrides: {},
    activeCards: {},
    usedCards: [],
    audit: [],
    fixtureOverrides: {},
    predictions: {},
    posts: [],
    starters: {},
  };
}

function freshClock(): ClockState {
  return {
    period: "first",
    running: false,
    periodSeconds: 0,
    totalSeconds: 0,
    runningSince: null,
    extraMinutes: 0,
  };
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export interface LeagueStore {
  seed: LeagueSeed;
  state: PersistedState;
  hydrated: boolean;

  /** المباريات الفعلية (الـ seed + تعديلات المواعيد) مرتبة (ليلة ← فترة ← ملعب) */
  matches: Match[];
  matchOf: (matchId: string) => Match | undefined;

  // قراءات مشتقة
  statusOf: (matchId: string) => MatchStatus;
  scoreOf: (matchId: string) => DerivedScore;
  eventsOf: (matchId: string) => MatchEvent[];
  clockOf: (matchId: string) => ClockState;
  minuteOf: (matchId: string) => number;
  teamByCode: (code: string) => Team | undefined;
  playersOf: (teamCode: string) => Player[];
  standingsOf: (group: "A" | "B") => StandingRow[];
  groupsComplete: boolean;
  /** حل رموز الإقصائيات (1A، W_semi_1...) إلى فريق فعلي أو تسمية عرض */
  resolveSide: (raw: string) => { team?: Team; label: string };
  onFieldPlayers: (matchId: string, teamCode: string) => Player[];
  benchPlayers: (matchId: string, teamCode: string) => Player[];

  /** تعارضات الجدول الحالية كلها (ملعب محجوز، فريق مزدوج، فجوة، إتاحة) */
  scheduleConflicts: ScheduleConflict[];
  conflictsOf: (matchId: string) => ScheduleConflict[];
  /** أقرب (يوم/فترة/ملعب) خالٍ من التعارضات لهذه المباراة */
  suggestReschedule: (matchId: string) => { matchDay: string; slot: string; venue: string } | null;

  /** كل الإيقافات التلقائية المحتسبة من الكروت */
  suspensions: Suspension[];
  isSuspended: (playerId: string, matchId: string) => boolean;

  // أفعال
  setRole: (role: Role) => void;
  rescheduleMatch: (matchId: string, patch: FixtureOverride, reason: string) => void;
  setPrediction: (matchId: string, p: Prediction) => void;
  addPost: (author: string, text: string) => void;
  likePost: (postId: string) => void;
  setStarters: (matchId: string, teamCode: string, playerIds: string[]) => void;
  startMatch: (matchId: string) => void;
  toggleClock: (matchId: string) => void;
  advancePeriod: (matchId: string) => void;
  recordEvent: (
    matchId: string,
    e: Omit<MatchEvent, "id" | "minute" | "period" | "createdAt" | "value"> & {
      value?: number;
    },
  ) => MatchEvent;
  removeEvent: (eventId: string) => void; // تراجع فوري (خلال 5 ثوان)
  deleteEventWithReason: (eventId: string, reason: string) => void;
  endMatch: (matchId: string) => void;
  setReport: (matchId: string, patch: Partial<MatchReport>) => void;
  approveMatch: (matchId: string, pin: string) => boolean;
  reopenMatch: (matchId: string) => void;
  requestPowerCard: (matchId: string, teamCode: string, cardName: string) => void;
  clearPowerCard: (matchId: string) => void;
  addAdjustment: (adj: StandingAdjustment) => void;
  loadDemo: () => void;
  resetAll: () => void;
}

const Ctx = createContext<LeagueStore | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const seed = useMemo(() => loadSeed(), []);
  const [state, setState] = useState<PersistedState>(initialPersisted);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...initialPersisted(), ...JSON.parse(raw) });
    } catch {
      // بيانات تالفة — نبدأ من الصفر
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // التخزين ممتلئ — نتجاهل
    }
  }, [state, hydrated]);

  const update = useCallback(
    (fn: (s: PersistedState) => PersistedState) => setState((s) => fn(s)),
    [],
  );

  const audit = useCallback(
    (s: PersistedState, action: string, entity: string, detail: string): PersistedState => ({
      ...s,
      audit: [
        {
          id: newId("a"),
          at: Date.now(),
          actor: s.role,
          action,
          entity,
          detail,
        },
        ...s.audit,
      ].slice(0, 300),
    }),
    [],
  );

  const statusOf = useCallback(
    (matchId: string): MatchStatus => state.statuses[matchId] ?? "scheduled",
    [state.statuses],
  );

  const eventsOf = useCallback(
    (matchId: string) =>
      state.events
        .filter((e) => e.matchId === matchId)
        .sort((a, b) => a.createdAt - b.createdAt),
    [state.events],
  );

  // المباريات الفعلية: الـ seed + تعديلات المواعيد، مرتبة (ليلة ← فترة ← ملعب).
  // الفترات بعد منتصف الليل تتبع ليلتها فترتيبها هو ترتيب مصفوفة slots في الـ seed.
  const matches = useMemo(() => {
    return seed.matches
      .map((m) => {
        const ov = state.fixtureOverrides[m.id];
        if (!ov) return m;
        const matchDay = ov.matchDay ?? m.matchDay;
        return {
          ...m,
          matchDay,
          slot: ov.slot ?? m.slot,
          venue: ov.venue ?? m.venue,
          round: seed.matchDays.indexOf(matchDay) + 1,
        };
      })
      .sort(
        (a, b) =>
          a.matchDay.localeCompare(b.matchDay) ||
          slotToMinutes(a.slot) - slotToMinutes(b.slot) ||
          a.venue.localeCompare(b.venue),
      );
  }, [seed, state.fixtureOverrides]);

  const matchById = useMemo(() => {
    const m = new Map<string, Match>();
    for (const match of matches) m.set(match.id, match);
    return m;
  }, [matches]);

  const matchOf = useCallback((matchId: string) => matchById.get(matchId), [matchById]);

  const scoreOf = useCallback(
    (matchId: string): DerivedScore => {
      const match = matchById.get(matchId);
      if (!match) return { home: 0, away: 0 };
      return deriveScore(match, state.events);
    },
    [matchById, state.events],
  );

  const clockOf = useCallback(
    (matchId: string): ClockState => state.clocks[matchId] ?? freshClock(),
    [state.clocks],
  );

  const minuteOf = useCallback(
    (matchId: string): number => {
      const c = clockOf(matchId);
      const extra = c.running && c.runningSince ? (Date.now() - c.runningSince) / 1000 : 0;
      return Math.min(99, Math.floor((c.totalSeconds + extra) / 60) + 1);
    },
    [clockOf],
  );

  const teamByCode = useCallback(
    (code: string) => seed.teams.find((t) => t.code === code),
    [seed],
  );

  const playersOf = useCallback(
    (teamCode: string) => seed.players.filter((p) => p.teamCode === teamCode),
    [seed],
  );

  const approvedGroupMatches = useMemo(
    () =>
      matches.filter(
        (m) => m.stage === "group" && (state.statuses[m.id] ?? "scheduled") === "approved",
      ),
    [matches, state.statuses],
  );

  const standingsOf = useCallback(
    (group: "A" | "B"): StandingRow[] =>
      computeStandings({
        teams: seed.teams.filter((t) => t.group === group),
        matches: approvedGroupMatches,
        events: state.events,
        adjustments: state.adjustments,
        rules: seed.rules,
      }),
    [seed, approvedGroupMatches, state.events, state.adjustments],
  );

  const groupsComplete = useMemo(
    () => approvedGroupMatches.length === seed.matches.filter((m) => m.stage === "group").length,
    [approvedGroupMatches, seed],
  );

  const knockoutWinner = useCallback(
    (stage: "semi_1" | "semi_2" | "third_place" | "final"): { w?: string; l?: string } => {
      const m = matches.find((x) => x.stage === stage);
      if (!m || (state.statuses[m.id] ?? "scheduled") !== "approved") return {};
      const s = deriveScore(m, state.events);
      const rep = state.reports[m.id];
      const resolved = resolveSideRaw(m.home);
      const resolvedAway = resolveSideRaw(m.away);
      if (!resolved.team || !resolvedAway.team) return {};
      let homeWins = s.home > s.away;
      if (s.home === s.away) {
        const hp = rep?.homePens ?? 0;
        const ap = rep?.awayPens ?? 0;
        if (hp === ap) return {};
        homeWins = hp > ap;
      }
      return homeWins
        ? { w: resolved.team.code, l: resolvedAway.team.code }
        : { w: resolvedAway.team.code, l: resolved.team.code };
    },
    // resolveSideRaw معرفة أدناه — الاعتماد الدائري مقصود ومحدود
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, state.statuses, state.events, state.reports],
  );

  const resolveSideRaw = useCallback(
    (raw: string): { team?: Team; label: string } => {
      const direct = seed.teams.find((t) => t.code === raw);
      if (direct) return { team: direct, label: direct.name };
      const placeholderLabels: Record<string, string> = {
        "1A": "أول المجموعة A",
        "2A": "ثاني المجموعة A",
        "1B": "أول المجموعة B",
        "2B": "ثاني المجموعة B",
        W_semi_1: "فائز نصف النهائي 1",
        W_semi_2: "فائز نصف النهائي 2",
        L_semi_1: "خاسر نصف النهائي 1",
        L_semi_2: "خاسر نصف النهائي 2",
      };
      if (/^[12][AB]$/.test(raw) && groupsComplete) {
        const rank = Number(raw[0]);
        const group = raw[1] as "A" | "B";
        const row = standingsOf(group)[rank - 1];
        const team = row ? teamByCode(row.teamCode) : undefined;
        if (team) return { team, label: team.name };
      }
      if (raw.startsWith("W_") || raw.startsWith("L_")) {
        const stage = raw.slice(2) as "semi_1" | "semi_2";
        const res = knockoutWinner(stage);
        const code = raw.startsWith("W_") ? res.w : res.l;
        const team = code ? teamByCode(code) : undefined;
        if (team) return { team, label: team.name };
      }
      return { label: placeholderLabels[raw] ?? raw };
    },
    [seed, groupsComplete, standingsOf, teamByCode, knockoutWinner],
  );

  const onFieldPlayers = useCallback(
    (matchId: string, teamCode: string): Player[] => {
      const overrides = state.lineupOverrides[matchId] ?? {};
      const chosen = state.starters[matchId]?.[teamCode];
      return playersOf(teamCode).filter((p) => {
        const starter = chosen ? chosen.includes(p.id) : p.shirt <= 5;
        const ov = overrides[p.id];
        if (ov === "in") return true;
        if (ov === "out") return false;
        return starter;
      });
    },
    [playersOf, state.lineupOverrides, state.starters],
  );

  const benchPlayers = useCallback(
    (matchId: string, teamCode: string): Player[] => {
      const onField = new Set(onFieldPlayers(matchId, teamCode).map((p) => p.id));
      return playersOf(teamCode).filter((p) => !onField.has(p.id));
    },
    [playersOf, onFieldPlayers],
  );

  // تعارضات الجدول — تُحسب على المباريات الفعلية كلها.
  // موسّع الرموز البنيوي يكشف تبعية النهائي/الثالث على نصفَي النهائي
  // حتى قبل تحدد الفرق.
  const scheduleConflicts = useMemo(
    () =>
      checkScheduleConflicts(matches, seed.venues, seed.slots, structuralSideTokens(matches)),
    [matches, seed],
  );

  const conflictsOf = useCallback(
    (matchId: string) => conflictsFor(scheduleConflicts, matchId),
    [scheduleConflicts],
  );

  const suggestReschedule = useCallback(
    (matchId: string) => {
      const m = matchById.get(matchId);
      if (!m) return null;
      return suggestNearestSlot(
        m,
        matches,
        seed.venues,
        seed.matchDays,
        seed.slots,
        structuralSideTokens(matches),
      );
    },
    [matchById, matches, seed],
  );

  // الإيقافات التلقائية — لكل فريق: مبارياته المحلولة بترتيب الجدول
  const suspensions = useMemo<Suspension[]>(() => {
    const out: Suspension[] = [];
    for (const team of seed.teams) {
      const teamMatches = matches
        .map((m) => {
          const homeCode = resolveSideRaw(m.home).team?.code;
          const awayCode = resolveSideRaw(m.away).team?.code;
          if (homeCode !== team.code && awayCode !== team.code) return null;
          return {
            match: m,
            approved: (state.statuses[m.id] ?? "scheduled") === "approved",
          };
        })
        .filter((x): x is { match: Match; approved: boolean } => x !== null);
      out.push(
        ...computeTeamSuspensions({
          teamMatches,
          teamCode: team.code,
          events: state.events,
          yellowsForSuspension: seed.rules.yellow_cards_for_suspension,
          redSuspensionMatches: seed.rules.red_card_suspension_matches,
        }),
      );
    }
    return out;
  }, [seed, matches, state.statuses, state.events, resolveSideRaw]);

  const isSuspended = useCallback(
    (playerId: string, matchId: string) =>
      suspensions.some((s) => s.playerId === playerId && s.forMatchId === matchId),
    [suspensions],
  );

  // ————— الأفعال —————

  const setRole = useCallback(
    (role: Role) => update((s) => ({ ...s, role })),
    [update],
  );

  const rescheduleMatch = useCallback(
    (matchId: string, patch: FixtureOverride, reason: string) =>
      update((s) => {
        const prev = s.fixtureOverrides[matchId] ?? {};
        const next = { ...prev, ...patch };
        const detail = [
          patch.matchDay ? `الليلة ← ${patch.matchDay}` : null,
          patch.slot ? `الفترة ← ${patch.slot}` : null,
          patch.venue ? `الملعب ← ${patch.venue}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return audit(
          { ...s, fixtureOverrides: { ...s.fixtureOverrides, [matchId]: next } },
          "تغيير موعد مباراة",
          matchId,
          `${detail} — السبب: ${reason}`,
        );
      }),
    [update, audit],
  );

  const setPrediction = useCallback(
    (matchId: string, p: Prediction) =>
      update((s) => ({ ...s, predictions: { ...s.predictions, [matchId]: p } })),
    [update],
  );

  const addPost = useCallback(
    (author: string, text: string) =>
      update((s) => ({
        ...s,
        posts: [
          { id: newId("p"), author, text, at: Date.now(), likes: 0 },
          ...s.posts,
        ].slice(0, 200),
      })),
    [update],
  );

  const likePost = useCallback(
    (postId: string) =>
      update((s) => ({
        ...s,
        posts: s.posts.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)),
      })),
    [update],
  );

  const setStarters = useCallback(
    (matchId: string, teamCode: string, playerIds: string[]) =>
      update((s) => ({
        ...s,
        starters: {
          ...s.starters,
          [matchId]: { ...s.starters[matchId], [teamCode]: playerIds },
        },
      })),
    [update],
  );

  const startMatch = useCallback(
    (matchId: string) =>
      update((s) =>
        audit(
          {
            ...s,
            statuses: { ...s.statuses, [matchId]: "live" },
            clocks: {
              ...s.clocks,
              [matchId]: { ...freshClock(), running: true, runningSince: Date.now() },
            },
          },
          "بدء مباراة",
          matchId,
          "بدأ الشوط الأول",
        ),
      ),
    [update, audit],
  );

  const flushClock = (c: ClockState): ClockState => {
    if (!c.running || !c.runningSince) return c;
    const delta = Math.floor((Date.now() - c.runningSince) / 1000);
    return {
      ...c,
      periodSeconds: c.periodSeconds + delta,
      totalSeconds: c.totalSeconds + delta,
      runningSince: Date.now(),
    };
  };

  const toggleClock = useCallback(
    (matchId: string) =>
      update((s) => {
        const c0 = s.clocks[matchId] ?? freshClock();
        if (c0.period === "ended") return s; // المباراة انتهت — لا تشغيل بعدها
        const c = flushClock(c0);
        const next: ClockState = c.running
          ? { ...c, running: false, runningSince: null }
          : { ...c, running: true, runningSince: Date.now() };
        return { ...s, clocks: { ...s.clocks, [matchId]: next } };
      }),
    [update],
  );

  const advancePeriod = useCallback(
    (matchId: string) =>
      update((s) => {
        const c0 = s.clocks[matchId] ?? freshClock();
        if (c0.period === "ended") return s; // المباراة انتهت — لا فترات بعدها
        const c = flushClock(c0);
        let period: ClockState["period"] = c.period;
        let status: MatchStatus = s.statuses[matchId] ?? "live";
        if (c.period === "first") {
          period = "break";
          status = "half_time";
        } else if (c.period === "break") {
          period = "second";
          status = "live";
        } else if (c.period === "second") {
          period = "extra";
        }
        return audit(
          {
            ...s,
            statuses: { ...s.statuses, [matchId]: status },
            clocks: {
              ...s.clocks,
              [matchId]: {
                ...c,
                period,
                periodSeconds: 0,
                running: period !== "break",
                runningSince: period !== "break" ? Date.now() : null,
              },
            },
          },
          "تغيير فترة",
          matchId,
          period === "break" ? "استراحة" : period === "second" ? "الشوط الثاني" : "وقت إضافي",
        );
      }),
    [update, audit],
  );

  const recordEvent = useCallback(
    (
      matchId: string,
      e: Omit<MatchEvent, "id" | "minute" | "period" | "createdAt" | "value"> & {
        value?: number;
      },
    ): MatchEvent => {
      const s0 = stateRef.current;
      const c = s0.clocks[matchId] ?? freshClock();
      const extra = c.running && c.runningSince ? (Date.now() - c.runningSince) / 1000 : 0;
      const minute = Math.min(99, Math.floor((c.totalSeconds + extra) / 60) + 1);
      const period = c.period === "second" || c.period === "extra" ? c.period : "first";

      // كارت "الهدف بهدفين" النشط لهذا الفريق يجعل قيمة الهدف 2 ويُستهلك
      let value = e.value ?? 1;
      const active = s0.activeCards[matchId];
      const consumeCard =
        e.type === "goal" &&
        active &&
        active.teamCode === e.teamCode &&
        active.effect === "goal_multiplier";
      if (consumeCard) value = 2;

      const event: MatchEvent = {
        ...e,
        id: newId("e"),
        matchId,
        minute,
        period: period === "extra" ? "extra" : period,
        value,
        ...(consumeCard ? { powerCard: active!.cardName } : {}),
        createdAt: Date.now(),
      };

      update((s) => {
        let next: PersistedState = { ...s, events: [...s.events, event] };

        // الإنذار الثاني لنفس اللاعب = طرد تلقائي
        if (e.type === "yellow" && e.playerId) {
          const priorYellows = s.events.filter(
            (x) =>
              x.matchId === matchId &&
              x.playerId === e.playerId &&
              x.type === "yellow" &&
              !x.deleted,
          ).length;
          if (priorYellows >= 1) {
            next = {
              ...next,
              events: [
                ...next.events,
                {
                  id: newId("e"),
                  matchId,
                  teamCode: e.teamCode,
                  playerId: e.playerId,
                  type: "red",
                  subtype: "second_yellow",
                  minute,
                  period: event.period,
                  value: 1,
                  linkedTo: event.id,
                  createdAt: Date.now() + 1,
                },
              ],
            };
          }
        }

        // التبديل: تحديث من في الملعب
        if (e.type === "sub" && e.playerId && e.secondaryPlayerId) {
          const ov = { ...(next.lineupOverrides[matchId] ?? {}) };
          ov[e.playerId] = "out";
          ov[e.secondaryPlayerId] = "in";
          next = {
            ...next,
            lineupOverrides: { ...next.lineupOverrides, [matchId]: ov },
          };
        }

        if (consumeCard) {
          next = {
            ...next,
            activeCards: { ...next.activeCards, [matchId]: undefined },
          };
        }
        return next;
      });
      return event;
    },
    [update],
  );

  /** إعادة بناء من في الملعب لمباراة من أحداث التبديل غير المحذوفة بترتيب تسجيلها */
  const replayLineup = (events: MatchEvent[], matchId: string): Record<string, "in" | "out"> => {
    const ov: Record<string, "in" | "out"> = {};
    const subs = events
      .filter(
        (x) =>
          x.matchId === matchId &&
          x.type === "sub" &&
          !x.deleted &&
          x.playerId &&
          x.secondaryPlayerId,
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const e of subs) {
      ov[e.playerId!] = "out";
      ov[e.secondaryPlayerId!] = "in";
    }
    return ov;
  };

  /** إرجاع آثار حدث ملغى: تبديلات الملعب وكارت الهدف المضاعف */
  const revertEventSideEffects = (
    s: PersistedState,
    removed: MatchEvent,
    events: MatchEvent[],
  ): PersistedState => {
    let next = s;
    if (removed.type === "sub") {
      next = {
        ...next,
        lineupOverrides: {
          ...next.lineupOverrides,
          [removed.matchId]: replayLineup(events, removed.matchId),
        },
      };
    }
    if (removed.powerCard) {
      const card = seed.powerCards.find((c) => c.name === removed.powerCard);
      if (card && !next.activeCards[removed.matchId]) {
        // الهدف المضاعف أُلغي فالكارت لم يُستهلك فعليًا — يعود مفعّلًا لفريقه
        next = {
          ...next,
          activeCards: {
            ...next.activeCards,
            [removed.matchId]: {
              teamCode: removed.teamCode,
              cardName: removed.powerCard,
              effect: card.effect_type as ActivePowerCard["effect"],
            },
          },
        };
      } else {
        // خانة الكارت النشط مشغولة — نرد الكارت لرصيد الفريق ليُفعَّل لاحقًا
        next = {
          ...next,
          usedCards: next.usedCards.filter(
            (u) =>
              !(
                u.teamCode === removed.teamCode &&
                u.cardName === removed.powerCard &&
                u.matchId === removed.matchId
              ),
          ),
        };
      }
    }
    return next;
  };

  const removeEvent = useCallback(
    (eventId: string) =>
      update((s) => {
        const removed = s.events.find((e) => e.id === eventId);
        if (!removed) return s;
        // الأحداث المرافقة المولدة تلقائيًا (طرد الإنذار الثاني) تُحذف مع أصلها
        const events = s.events.filter((e) => e.id !== eventId && e.linkedTo !== eventId);
        return revertEventSideEffects({ ...s, events }, removed, events);
      }),
    // revertEventSideEffects تعتمد على seed الثابت فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, seed],
  );

  const deleteEventWithReason = useCallback(
    (eventId: string, reason: string) =>
      update((s) => {
        const removed = s.events.find((e) => e.id === eventId);
        if (!removed) return s;
        const events = s.events.map((e) =>
          e.id === eventId || e.linkedTo === eventId
            ? {
                ...e,
                deleted: true,
                deletedReason: e.id === eventId ? reason : "تبعًا لحذف الحدث الأصلي",
              }
            : e,
        );
        return audit(
          revertEventSideEffects({ ...s, events }, removed, events),
          "حذف حدث",
          eventId,
          reason,
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, audit, seed],
  );

  const endMatch = useCallback(
    (matchId: string) =>
      update((s) => {
        const c = flushClock(s.clocks[matchId] ?? freshClock());
        return audit(
          {
            ...s,
            statuses: { ...s.statuses, [matchId]: "finished" },
            clocks: {
              ...s.clocks,
              [matchId]: { ...c, period: "ended", running: false, runningSince: null },
            },
          },
          "نهاية مباراة",
          matchId,
          "أنهى المسجّل المباراة — بانتظار الاعتماد",
        );
      }),
    [update, audit],
  );

  const setReport = useCallback(
    (matchId: string, patch: Partial<MatchReport>) =>
      update((s) => ({
        ...s,
        reports: { ...s.reports, [matchId]: { ...s.reports[matchId], ...patch } },
      })),
    [update],
  );

  const approveMatch = useCallback(
    (matchId: string, pin: string): boolean => {
      if (pin !== ADMIN_PIN) return false;
      update((s) =>
        audit(
          {
            ...s,
            statuses: { ...s.statuses, [matchId]: "approved" },
            reports: {
              ...s.reports,
              [matchId]: { ...s.reports[matchId], approvedAt: Date.now() },
            },
          },
          "اعتماد نتيجة",
          matchId,
          "اعتمد الحكم النتيجة بالرقم السري — النتيجة مقفولة والترتيب تحدّث",
        ),
      );
      return true;
    },
    [update, audit],
  );

  const reopenMatch = useCallback(
    (matchId: string) =>
      update((s) =>
        audit(
          { ...s, statuses: { ...s.statuses, [matchId]: "finished" } },
          "إعادة فتح مباراة",
          matchId,
          "أعاد الأدمن فتح مباراة معتمدة",
        ),
      ),
    [update, audit],
  );

  const requestPowerCard = useCallback(
    (matchId: string, teamCode: string, cardName: string) =>
      update((s) => {
        const card = seed.powerCards.find((c) => c.name === cardName);
        if (!card) return s;
        const used = s.usedCards.some(
          (u) => u.teamCode === teamCode && u.cardName === cardName,
        );
        if (used) return s;
        return audit(
          {
            ...s,
            activeCards: {
              ...s.activeCards,
              [matchId]: {
                teamCode,
                cardName,
                effect: card.effect_type as ActivePowerCard["effect"],
              },
            },
            usedCards: [...s.usedCards, { teamCode, cardName, matchId }],
          },
          "تفعيل كارت قوة",
          matchId,
          `${cardName} — ${teamCode}`,
        );
      }),
    [update, audit, seed],
  );

  const clearPowerCard = useCallback(
    (matchId: string) =>
      update((s) => {
        const active = s.activeCards[matchId];
        if (!active) return s;
        return audit(
          {
            ...s,
            activeCards: { ...s.activeCards, [matchId]: undefined },
            // الإلغاء قبل الاستهلاك يرد الكارت لرصيد الفريق
            usedCards: s.usedCards.filter(
              (u) =>
                !(
                  u.teamCode === active.teamCode &&
                  u.cardName === active.cardName &&
                  u.matchId === matchId
                ),
            ),
          },
          "إلغاء كارت قوة",
          matchId,
          `${active.cardName} — ${active.teamCode} (أُعيد للرصيد قبل الاستهلاك)`,
        );
      }),
    [update, audit],
  );

  const addAdjustment = useCallback(
    (adj: StandingAdjustment) =>
      update((s) =>
        audit(
          { ...s, adjustments: [...s.adjustments, adj] },
          "تعديل نقاط",
          adj.teamCode,
          `${adj.points > 0 ? "+" : ""}${adj.points} — ${adj.reason}`,
        ),
      ),
    [update, audit],
  );

  const loadDemo = useCallback(() => {
    setState((s) => ({ ...buildDemoState(), role: s.role }));
  }, []);

  const resetAll = useCallback(() => {
    setState((s) => ({ ...initialPersisted(), role: s.role }));
  }, []);

  const store: LeagueStore = {
    seed,
    state,
    hydrated,
    matches,
    matchOf,
    scheduleConflicts,
    conflictsOf,
    suggestReschedule,
    suspensions,
    isSuspended,
    rescheduleMatch,
    setPrediction,
    addPost,
    likePost,
    setStarters,
    statusOf,
    scoreOf,
    eventsOf,
    clockOf,
    minuteOf,
    teamByCode,
    playersOf,
    standingsOf,
    groupsComplete,
    resolveSide: resolveSideRaw,
    onFieldPlayers,
    benchPlayers,
    setRole,
    startMatch,
    toggleClock,
    advancePeriod,
    recordEvent,
    removeEvent,
    deleteEventWithReason,
    endMatch,
    setReport,
    approveMatch,
    reopenMatch,
    requestPowerCard,
    clearPowerCard,
    addAdjustment,
    loadDemo,
    resetAll,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useLeague(): LeagueStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeague must be used within LeagueProvider");
  return ctx;
}
