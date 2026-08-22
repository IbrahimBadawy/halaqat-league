"use client";

// مخزن حالة الدوري — الآن فوق Supabase (القراءة مباشرة بمفتاح publishable
// عبر RLS للقراءة العامة، والكتابة حصريًا عبر Edge Function «live-write»
// بتحقق PIN، والتحديث الحي عبر Realtime). الصفحات لم تتغير: نفس واجهة
// useLeague() ونفس أشكال LeagueSeed/PersistedState بمفاتيح الأكواد m1../A1..
// الدور والتوقعات ومنشورات المجتمع لا تزال محلية على الجهاز (المرحلة 0).

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
import { supabase } from "../supabase/client";
import {
  deviceKey,
  emptyLive,
  fetchRemote,
  liveWrite,
  queueWrite,
  type CardUsageLite,
  type RemoteIds,
  type RemoteLive,
} from "./remote";
import { droppedWrites, pendingWrites, startQueue, subscribeQueue } from "./queue";
import type { ActivePowerCard, ClockState } from "./live-types";
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

export type { ActivePowerCard, ClockState } from "./live-types";

export type Role = "visitor" | "recorder" | "admin";

export interface PersistedState {
  role: Role;
  statuses: Record<string, MatchStatus>;
  events: MatchEvent[];
  clocks: Record<string, ClockState>;
  reports: Record<string, MatchReport>;
  adjustments: StandingAdjustment[];
  /** بدلاء دخلوا: matchId -> playerId -> "in" | "out" (مشتقة من أحداث التبديل) */
  lineupOverrides: Record<string, Record<string, "in" | "out">>;
  activeCards: Record<string, ActivePowerCard | undefined>;
  usedCards: { teamCode: string; cardName: string; matchId: string }[];
  audit: AuditEntry[];
  /** لم تعد مستخدمة — إعادة الجدولة تُكتب في جدول matches مباشرة */
  fixtureOverrides: Record<string, FixtureOverride>;
  /** توقعات صاحب الجهاز: matchId -> نتيجة متوقعة */
  predictions: Record<string, Prediction>;
  posts: Post[];
  /** تشكيلة أساسية مختارة: matchId -> teamCode -> playerIds */
  starters: Record<string, Record<string, string[]>>;
}

/** ما يبقى خاصًا بالجهاز: الدور فقط (التوقعات والمنشورات صارت في القاعدة) */
interface LocalState {
  role: Role;
}

const LOCAL_KEY = "halaqat-league-local-v1";
const LEGACY_KEY = "halaqat-league-v1";
const ADMIN_PIN = "1234";

function initialLocal(): LocalState {
  return { role: "visitor" };
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

function eventUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export interface LeagueStore {
  seed: LeagueSeed;
  state: PersistedState;
  hydrated: boolean;

  /** المباريات الفعلية (من القاعدة) مرتبة (ليلة ← فترة ← ملعب) */
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

  /** كتابات لم تصل القاعدة بعد (انقطاع شبكة) — تُرسل تلقائيًا عند العودة */
  pendingWrites: number;
  /** كتابات أُسقطت نهائيًا بعد رفض متكرر — تستدعي تدخلًا يدويًا */
  droppedWrites: number;

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
  // الـ seed المدمج fallback فوري حتى وصول بيانات القاعدة (أو عند انقطاع الشبكة)
  const bundledSeed = useMemo(() => loadSeed(), []);
  const [seed, setSeed] = useState<LeagueSeed>(bundledSeed);
  const [live, setLive] = useState<RemoteLive>(emptyLive);
  const [local, setLocal] = useState<LocalState>(initialLocal);
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(0);
  const [dropped, setDropped] = useState(0);

  const liveRef = useRef(live);
  liveRef.current = live;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const localRef = useRef(local);
  localRef.current = local;
  const idsRef = useRef<RemoteIds | null>(null);
  const localLoaded = useRef(false);

  const applySnapshot = useCallback(
    (s: { seed: LeagueSeed; live: RemoteLive; ids: RemoteIds }) => {
      idsRef.current = s.ids;
      setSeed(s.seed);
      setLive(s.live);
    },
    [],
  );

  // طابور الكتابة: يستأنف ما لم يُرسل من جلسة سابقة ويعيد المحاولة تلقائيًا.
  // ما يُسقطه الطابور نهائيًا يُعرض للمستخدم بدل ابتلاعه صامتًا.
  useEffect(() => {
    const stop = startQueue(liveWrite, () => setDropped(droppedWrites()));
    const unsub = subscribeQueue(setPending);
    setPending(pendingWrites());
    setDropped(droppedWrites());
    return () => {
      unsub();
      stop();
    };
  }, []);

  // تحميل الدور المحفوظ على الجهاز ثم الجلب الأول من القاعدة
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        setLocal((s) => ({ ...s, ...(JSON.parse(raw) as Partial<LocalState>) }));
      } else {
        // ترحيل الدور من مخزن المرحلة المحلية القديم
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const p = JSON.parse(legacy) as Partial<PersistedState>;
          if (p.role) setLocal((s) => ({ ...s, role: p.role! }));
        }
      }
    } catch {
      // بيانات تالفة — نتجاهل
    }
    localLoaded.current = true;

    let cancelled = false;
    (async () => {
      try {
        const snapshot = await fetchRemote();
        if (cancelled) return;
        applySnapshot(snapshot);
        setConnected(true);
      } catch (e) {
        console.error("تعذر الاتصال بقاعدة البيانات — عرض بيانات الـ seed المدمجة", e);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!localLoaded.current) return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(local));
    } catch {
      // التخزين ممتلئ — نتجاهل
    }
  }, [local]);

  // التحديث الحي: أي تغيير في الجداول الحية يعيد الجلب (مع دمج التغييرات المتقاربة)
  useEffect(() => {
    if (!connected) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        // لا نستبدل الحالة ما دامت هناك كتابات لم تصل القاعدة بعد — وإلا
        // محت اللقطةُ القادمةُ حدثًا سجّله المسجّل للتو وما زال في الطابور
        if (pendingWrites() > 0) {
          refetch();
          return;
        }
        try {
          applySnapshot(await fetchRemote());
        } catch {
          // سيُعاد المزامنة مع التغيير التالي
        }
      }, 350);
    };
    const channel = supabase.channel("league-live");
    for (const table of [
      "matches",
      "match_events",
      "match_lineups",
      "match_reports",
      "standing_adjustments",
      "card_usages",
      "audit_log",
    ]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refetch);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [connected, applySnapshot]);

  // ————— الحالة المركبة بنفس شكل PersistedState القديم —————

  // من في الملعب: مشتق من أحداث التبديل غير المحذوفة بترتيب تسجيلها —
  // فالتراجع عن تبديل يصحح التشكيلة تلقائيًا
  const lineupOverrides = useMemo(() => {
    const out: Record<string, Record<string, "in" | "out">> = {};
    for (const e of live.events) {
      if (e.type !== "sub" || e.deleted || !e.playerId || !e.secondaryPlayerId) continue;
      const ov = (out[e.matchId] ??= {});
      ov[e.playerId] = "out";
      ov[e.secondaryPlayerId] = "in";
    }
    return out;
  }, [live.events]);

  const activeCards = useMemo(() => {
    const out: Record<string, ActivePowerCard | undefined> = {};
    for (const u of live.usages) {
      if (u.status !== "approved") continue;
      out[u.matchId] = {
        teamCode: u.teamCode,
        cardName: u.cardName,
        effect: u.effect as ActivePowerCard["effect"],
      };
    }
    return out;
  }, [live.usages]);

  const usedCards = useMemo(
    () =>
      live.usages
        .filter((u) => u.status === "approved" || u.status === "applied")
        .map((u) => ({ teamCode: u.teamCode, cardName: u.cardName, matchId: u.matchId })),
    [live.usages],
  );

  const state: PersistedState = useMemo(
    () => ({
      role: local.role,
      statuses: live.statuses,
      events: live.events,
      clocks: live.clocks,
      reports: live.reports,
      adjustments: live.adjustments,
      lineupOverrides,
      activeCards,
      usedCards,
      audit: live.audit,
      fixtureOverrides: {},
      predictions: live.predictions,
      posts: live.posts,
      starters: live.starters,
    }),
    [local, live, lineupOverrides, activeCards, usedCards],
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  // ————— القراءات المشتقة (لم تتغير عن النسخة المحلية) —————

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

  const matches = useMemo(
    () =>
      [...seed.matches].sort(
        (a, b) =>
          a.matchDay.localeCompare(b.matchDay) ||
          slotToMinutes(a.slot) - slotToMinutes(b.slot) ||
          a.venue.localeCompare(b.venue),
      ),
    [seed],
  );

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

  // ————— مساعدات الكتابة البعيدة —————

  /** يسجل قيد تدقيق محليًا فورًا ويرسله للقاعدة */
  const pushAudit = useCallback((action: string, entity: string, detail: string) => {
    // معرّف من العميل حتى تكون إعادة الإرسال بلا تكرار (upsert في البوابة)
    const entry: AuditEntry = {
      id: eventUuid(),
      at: Date.now(),
      actor: localRef.current.role,
      action,
      entity,
      detail,
    };
    setLive((l) => ({ ...l, audit: [entry, ...l.audit].slice(0, 300) }));
    const ids = idsRef.current;
    if (ids) {
      queueWrite("insert_audit", {
        entry: {
          id: entry.id,
          league_id: ids.leagueId,
          actor_role: entry.actor,
          action,
          entity,
          entity_id: entity,
          detail,
        },
      });
    }
  }, []);

  const writeMatch = useCallback(
    (matchId: string, patch: Record<string, unknown>) => {
      const ids = idsRef.current;
      if (!ids) return;
      queueWrite("update_match", { id: ids.matchByCode[matchId], patch });
    },
    [],
  );

  const toDbEvent = useCallback((e: MatchEvent) => {
    const ids = idsRef.current!;
    return {
      id: e.id,
      match_id: ids.matchByCode[e.matchId],
      team_id: ids.teamByCode[e.teamCode],
      player_id: e.playerId ? ids.playerByCode[e.playerId] : null,
      secondary_player_id: e.secondaryPlayerId ? ids.playerByCode[e.secondaryPlayerId] : null,
      type: e.type,
      subtype: e.subtype ?? null,
      minute: e.minute,
      period: e.period,
      value: e.value,
      note: e.note ?? null,
      linked_to: e.linkedTo ?? null,
      power_card: e.powerCard ?? null,
      created_at: new Date(e.createdAt).toISOString(),
    };
  }, []);

  const writeUsage = useCallback(
    (u: CardUsageLite, patch?: { minute?: number; appliedAt?: number }) => {
      const ids = idsRef.current;
      if (!ids || !u.teamCardId) return;
      queueWrite("upsert_card_usage", {
        usage: {
          id: u.id,
          team_card_id: u.teamCardId,
          match_id: ids.matchByCode[u.matchId],
          status: u.status,
          minute: patch?.minute ?? null,
          effect_snapshot: { team_code: u.teamCode, card_name: u.cardName, effect: u.effect },
          applied_at: patch?.appliedAt ? new Date(patch.appliedAt).toISOString() : null,
        },
      });
    },
    [],
  );

  /** إلغاء هدف مضاعف: يعيد الكارت مفعّلًا لو خانة المباراة فارغة، وإلا يرده للرصيد */
  const revertCardForEvent = useCallback(
    (removed: MatchEvent) => {
      if (!removed.powerCard) return;
      const usages = liveRef.current.usages;
      const applied = usages.find(
        (u) =>
          u.matchId === removed.matchId &&
          u.teamCode === removed.teamCode &&
          u.cardName === removed.powerCard &&
          u.status === "applied",
      );
      if (!applied) return;
      const slotTaken = usages.some(
        (u) => u.matchId === removed.matchId && u.status === "approved",
      );
      const status: CardUsageLite["status"] = slotTaken ? "cancelled" : "approved";
      setLive((l) => ({
        ...l,
        usages: l.usages.map((u) => (u.id === applied.id ? { ...u, status } : u)),
      }));
      writeUsage({ ...applied, status });
    },
    [writeUsage],
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

  // ————— الأفعال —————

  const setRole = useCallback(
    (role: Role) => setLocal((s) => ({ ...s, role })),
    [],
  );

  const rescheduleMatch = useCallback(
    (matchId: string, patch: FixtureOverride, reason: string) => {
      const days = seedRef.current.matchDays;
      setSeed((s) => ({
        ...s,
        matches: s.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                matchDay: patch.matchDay ?? m.matchDay,
                slot: patch.slot ?? m.slot,
                venue: patch.venue ?? m.venue,
                round: patch.matchDay ? days.indexOf(patch.matchDay) + 1 : m.round,
              }
            : m,
        ),
      }));
      const ids = idsRef.current;
      if (ids) {
        const dbPatch: Record<string, unknown> = {};
        if (patch.matchDay) dbPatch.match_day = patch.matchDay;
        if (patch.slot) dbPatch.slot = patch.slot;
        if (patch.venue) dbPatch.venue_id = ids.venueByName[patch.venue];
        queueWrite("update_match", { id: ids.matchByCode[matchId], patch: dbPatch });
      }
      const detail = [
        patch.matchDay ? `الليلة ← ${patch.matchDay}` : null,
        patch.slot ? `الفترة ← ${patch.slot}` : null,
        patch.venue ? `الملعب ← ${patch.venue}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      pushAudit("تغيير موعد مباراة", matchId, `${detail} — السبب: ${reason}`);
    },
    [pushAudit],
  );

  const setPrediction = useCallback((matchId: string, p: Prediction) => {
    setLive((l) => ({ ...l, predictions: { ...l.predictions, [matchId]: p } }));
    const ids = idsRef.current;
    if (!ids) return;
    queueWrite("upsert_prediction", {
      prediction: {
        league_id: ids.leagueId,
        match_id: ids.matchByCode[matchId],
        device_key: deviceKey(),
        home: p.home,
        away: p.away,
      },
    });
  }, []);

  const addPost = useCallback((author: string, text: string) => {
    const ids = idsRef.current;
    const post: Post = { id: eventUuid(), author, text, at: Date.now(), likes: 0 };
    setLive((l) => ({ ...l, posts: [post, ...l.posts].slice(0, 200) }));
    if (!ids) return;
    queueWrite("insert_post", {
      post: {
        id: post.id,
        league_id: ids.leagueId,
        author_name: author,
        text,
        created_at: new Date(post.at).toISOString(),
      },
    });
  }, []);

  const likePost = useCallback((postId: string) => {
    setLive((l) => ({
      ...l,
      posts: l.posts.map((p) => (p.id === postId ? { ...p, likes: p.likes + 1 } : p)),
    }));
    queueWrite("like_post", { id: postId });
  }, []);

  const setStarters = useCallback(
    (matchId: string, teamCode: string, playerIds: string[]) => {
      setLive((l) => ({
        ...l,
        starters: {
          ...l.starters,
          [matchId]: { ...l.starters[matchId], [teamCode]: playerIds },
        },
      }));
      const ids = idsRef.current;
      if (ids) {
        queueWrite("set_starters", {
          match_id: ids.matchByCode[matchId],
          team_id: ids.teamByCode[teamCode],
          players: playerIds.map((pc) => ids.playerByCode[pc]).filter(Boolean),
        });
      }
    },
    [],
  );

  const startMatch = useCallback(
    (matchId: string) => {
      const clock: ClockState = { ...freshClock(), running: true, runningSince: Date.now() };
      setLive((l) => ({
        ...l,
        statuses: { ...l.statuses, [matchId]: "live" },
        clocks: { ...l.clocks, [matchId]: clock },
      }));
      writeMatch(matchId, { status: "live", clock });
      pushAudit("بدء مباراة", matchId, "بدأ الشوط الأول");
    },
    [writeMatch, pushAudit],
  );

  const toggleClock = useCallback(
    (matchId: string) => {
      const c0 = liveRef.current.clocks[matchId] ?? freshClock();
      if (c0.period === "ended") return; // المباراة انتهت — لا تشغيل بعدها
      const c = flushClock(c0);
      const next: ClockState = c.running
        ? { ...c, running: false, runningSince: null }
        : { ...c, running: true, runningSince: Date.now() };
      setLive((l) => ({ ...l, clocks: { ...l.clocks, [matchId]: next } }));
      writeMatch(matchId, { clock: next });
    },
    [writeMatch],
  );

  const advancePeriod = useCallback(
    (matchId: string) => {
      const c0 = liveRef.current.clocks[matchId] ?? freshClock();
      if (c0.period === "ended") return; // المباراة انتهت — لا فترات بعدها
      const c = flushClock(c0);
      let period: ClockState["period"] = c.period;
      let status: MatchStatus = liveRef.current.statuses[matchId] ?? "live";
      if (c.period === "first") {
        period = "break";
        status = "half_time";
      } else if (c.period === "break") {
        period = "second";
        status = "live";
      } else if (c.period === "second") {
        period = "extra";
      }
      const next: ClockState = {
        ...c,
        period,
        periodSeconds: 0,
        running: period !== "break",
        runningSince: period !== "break" ? Date.now() : null,
      };
      setLive((l) => ({
        ...l,
        statuses: { ...l.statuses, [matchId]: status },
        clocks: { ...l.clocks, [matchId]: next },
      }));
      writeMatch(matchId, { status, clock: next });
      pushAudit(
        "تغيير فترة",
        matchId,
        period === "break" ? "استراحة" : period === "second" ? "الشوط الثاني" : "وقت إضافي",
      );
    },
    [writeMatch, pushAudit],
  );

  const recordEvent = useCallback(
    (
      matchId: string,
      e: Omit<MatchEvent, "id" | "minute" | "period" | "createdAt" | "value"> & {
        value?: number;
      },
    ): MatchEvent => {
      const l0 = liveRef.current;
      const c = l0.clocks[matchId] ?? freshClock();
      const extra = c.running && c.runningSince ? (Date.now() - c.runningSince) / 1000 : 0;
      const minute = Math.min(99, Math.floor((c.totalSeconds + extra) / 60) + 1);
      const period = c.period === "second" || c.period === "extra" ? c.period : "first";

      // كارت "الهدف بهدفين" النشط لهذا الفريق يجعل قيمة الهدف 2 ويُستهلك
      const active = l0.usages.find((u) => u.matchId === matchId && u.status === "approved");
      const consumeCard =
        e.type === "goal" &&
        active !== undefined &&
        active.teamCode === e.teamCode &&
        active.effect === "goal_multiplier";
      const value = consumeCard ? 2 : (e.value ?? 1);
      const now = Date.now();

      const event: MatchEvent = {
        ...e,
        id: eventUuid(),
        matchId,
        minute,
        period: period === "extra" ? "extra" : period,
        value,
        ...(consumeCard ? { powerCard: active.cardName } : {}),
        createdAt: now,
      };
      const newEvents: MatchEvent[] = [event];

      // الإنذار الثاني لنفس اللاعب = طرد تلقائي مرافق (يُلغى مع أصله)
      if (e.type === "yellow" && e.playerId) {
        const priorYellows = l0.events.filter(
          (x) =>
            x.matchId === matchId &&
            x.playerId === e.playerId &&
            x.type === "yellow" &&
            !x.deleted,
        ).length;
        if (priorYellows >= 1) {
          newEvents.push({
            id: eventUuid(),
            matchId,
            teamCode: e.teamCode,
            playerId: e.playerId,
            type: "red",
            subtype: "second_yellow",
            minute,
            period: event.period,
            value: 1,
            linkedTo: event.id,
            createdAt: now + 1,
          });
        }
      }

      setLive((l) => ({
        ...l,
        events: [...l.events, ...newEvents],
        usages: consumeCard
          ? l.usages.map((u) => (u.id === active.id ? { ...u, status: "applied" as const } : u))
          : l.usages,
      }));

      if (idsRef.current) {
        queueWrite("insert_events", { events: newEvents.map(toDbEvent) });
        if (consumeCard) {
          writeUsage({ ...active, status: "applied" }, { minute, appliedAt: now });
        }
      }
      return event;
    },
    [toDbEvent, writeUsage],
  );

  const removeEvent = useCallback(
    (eventId: string) => {
      const removed = liveRef.current.events.find((e) => e.id === eventId);
      if (!removed) return;
      // الأحداث المرافقة (طرد الإنذار الثاني) تُحذف مع أصلها — والقاعدة تكرر
      // ذلك تلقائيًا (linked_to on delete cascade)
      setLive((l) => ({
        ...l,
        events: l.events.filter((e) => e.id !== eventId && e.linkedTo !== eventId),
      }));
      if (idsRef.current) queueWrite("delete_event", { id: eventId });
      revertCardForEvent(removed);
    },
    [revertCardForEvent],
  );

  const deleteEventWithReason = useCallback(
    (eventId: string, reason: string) => {
      const l0 = liveRef.current;
      const removed = l0.events.find((e) => e.id === eventId);
      if (!removed) return;
      const linkedIds = l0.events.filter((e) => e.linkedTo === eventId).map((e) => e.id);
      const linkedReason = "تبعًا لحذف الحدث الأصلي";
      setLive((l) => ({
        ...l,
        events: l.events.map((e) =>
          e.id === eventId || e.linkedTo === eventId
            ? { ...e, deleted: true, deletedReason: e.id === eventId ? reason : linkedReason }
            : e,
        ),
      }));
      if (idsRef.current) {
        const nowIso = new Date().toISOString();
        queueWrite("update_events", {
          rows: [
            { id: eventId, patch: { deleted_at: nowIso, deleted_reason: reason } },
            ...linkedIds.map((id) => ({
              id,
              patch: { deleted_at: nowIso, deleted_reason: linkedReason },
            })),
          ],
        });
      }
      revertCardForEvent(removed);
      pushAudit("حذف حدث", eventId, reason);
    },
    [revertCardForEvent, pushAudit],
  );

  const endMatch = useCallback(
    (matchId: string) => {
      const c = flushClock(liveRef.current.clocks[matchId] ?? freshClock());
      const clock: ClockState = { ...c, period: "ended", running: false, runningSince: null };
      setLive((l) => ({
        ...l,
        statuses: { ...l.statuses, [matchId]: "finished" },
        clocks: { ...l.clocks, [matchId]: clock },
      }));
      const match = seedRef.current.matches.find((m) => m.id === matchId);
      const score = match ? deriveScore(match, liveRef.current.events) : { home: 0, away: 0 };
      writeMatch(matchId, {
        status: "finished",
        clock,
        home_score: score.home,
        away_score: score.away,
      });
      pushAudit("نهاية مباراة", matchId, "أنهى المسجّل المباراة — بانتظار الاعتماد");
    },
    [writeMatch, pushAudit],
  );

  const setReport = useCallback(
    (matchId: string, patch: Partial<MatchReport>) => {
      setLive((l) => ({
        ...l,
        reports: { ...l.reports, [matchId]: { ...l.reports[matchId], ...patch } },
      }));
      const ids = idsRef.current;
      if (!ids) return;
      const matchPatch: Record<string, unknown> = {};
      if (patch.homePens !== undefined) matchPatch.home_pens = patch.homePens;
      if (patch.awayPens !== undefined) matchPatch.away_pens = patch.awayPens;
      if (Object.keys(matchPatch).length > 0) {
        queueWrite("update_match", { id: ids.matchByCode[matchId], patch: matchPatch });
      }
      const report: Record<string, unknown> = { match_id: ids.matchByCode[matchId] };
      let hasReport = false;
      if (patch.motmPlayerId !== undefined) {
        report.motm_player_id = patch.motmPlayerId ? ids.playerByCode[patch.motmPlayerId] : null;
        hasReport = true;
      }
      if (patch.refereeNotes !== undefined) {
        report.referee_notes = patch.refereeNotes ?? null;
        hasReport = true;
      }
      if (hasReport) queueWrite("upsert_report", { report });
    },
    [],
  );

  const approveMatch = useCallback(
    (matchId: string, pin: string): boolean => {
      if (pin !== ADMIN_PIN) return false;
      const now = Date.now();
      setLive((l) => ({
        ...l,
        statuses: { ...l.statuses, [matchId]: "approved" },
        reports: {
          ...l.reports,
          [matchId]: { ...l.reports[matchId], approvedAt: now },
        },
      }));
      const match = seedRef.current.matches.find((m) => m.id === matchId);
      const score = match ? deriveScore(match, liveRef.current.events) : { home: 0, away: 0 };
      const ids = idsRef.current;
      if (ids) {
        writeMatch(matchId, { status: "approved", home_score: score.home, away_score: score.away });
        queueWrite("upsert_report", {
          report: { match_id: ids.matchByCode[matchId], approved_at: new Date(now).toISOString() },
        });
      }
      pushAudit(
        "اعتماد نتيجة",
        matchId,
        "اعتمد الحكم النتيجة بالرقم السري — النتيجة مقفولة والترتيب تحدّث",
      );
      return true;
    },
    [writeMatch, pushAudit],
  );

  const reopenMatch = useCallback(
    (matchId: string) => {
      setLive((l) => ({ ...l, statuses: { ...l.statuses, [matchId]: "finished" } }));
      writeMatch(matchId, { status: "finished" });
      pushAudit("إعادة فتح مباراة", matchId, "أعاد الأدمن فتح مباراة معتمدة");
    },
    [writeMatch, pushAudit],
  );

  const requestPowerCard = useCallback(
    (matchId: string, teamCode: string, cardName: string) => {
      const card = seedRef.current.powerCards.find((c) => c.name === cardName);
      if (!card) return;
      const used = liveRef.current.usages.some(
        (u) =>
          u.teamCode === teamCode &&
          u.cardName === cardName &&
          (u.status === "approved" || u.status === "applied"),
      );
      if (used) return;
      const usage: CardUsageLite = {
        id: eventUuid(),
        matchId,
        teamCode,
        cardName,
        effect: card.effect_type,
        status: "approved",
        teamCardId: idsRef.current?.teamCardId[`${teamCode}|${cardName}`] ?? "",
      };
      setLive((l) => ({ ...l, usages: [...l.usages, usage] }));
      writeUsage(usage);
      pushAudit("تفعيل كارت قوة", matchId, `${cardName} — ${teamCode}`);
    },
    [writeUsage, pushAudit],
  );

  const clearPowerCard = useCallback(
    (matchId: string) => {
      const active = liveRef.current.usages.find(
        (u) => u.matchId === matchId && u.status === "approved",
      );
      if (!active) return;
      // الإلغاء قبل الاستهلاك يرد الكارت لرصيد الفريق
      setLive((l) => ({
        ...l,
        usages: l.usages.map((u) =>
          u.id === active.id ? { ...u, status: "cancelled" as const } : u,
        ),
      }));
      writeUsage({ ...active, status: "cancelled" });
      pushAudit(
        "إلغاء كارت قوة",
        matchId,
        `${active.cardName} — ${active.teamCode} (أُعيد للرصيد قبل الاستهلاك)`,
      );
    },
    [writeUsage, pushAudit],
  );

  const addAdjustment = useCallback(
    (adj: StandingAdjustment) => {
      setLive((l) => ({ ...l, adjustments: [...l.adjustments, adj] }));
      const ids = idsRef.current;
      if (ids) {
        queueWrite("insert_adjustment", {
          adjustment: {
            id: eventUuid(),
            league_id: ids.leagueId,
            team_id: ids.teamByCode[adj.teamCode],
            points: adj.points,
            reason: adj.reason,
            source: adj.source,
          },
        });
      }
      pushAudit("تعديل نقاط", adj.teamCode, `${adj.points > 0 ? "+" : ""}${adj.points} — ${adj.reason}`);
    },
    [pushAudit],
  );

  const loadDemo = useCallback(() => {
    // القاعدة السحابية مشتركة بين كل الأجهزة — لا بيانات تجريبية فيها
    console.warn("البيانات التجريبية معطلة في وضع Supabase المشترك");
  }, []);

  const resetAll = useCallback(() => {
    // القاعدة مشتركة — لا نمسحها من جهاز؛ نعيد ضبط ما يخص هذا الجهاز فقط
    setLocal(initialLocal());
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // لا شيء
    }
  }, []);

  const store: LeagueStore = {
    seed,
    state,
    hydrated,
    matches,
    matchOf,
    pendingWrites: pending,
    droppedWrites: dropped,
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
