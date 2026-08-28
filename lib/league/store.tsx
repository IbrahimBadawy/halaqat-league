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
import { computeStandings, deriveScore, resolveMatchSides } from "../standings/compute";
import {
  checkScheduleConflicts,
  conflictsFor,
  structuralSideTokens,
  suggestNearestSlot,
  type ScheduleConflict,
} from "../scheduling/conflicts";
import { computeTeamSuspensions } from "../discipline/suspensions";
import { supabase, usernameToEmail } from "../supabase/client";
import {
  accountsCall,
  deviceKey,
  emptyLive,
  fetchLeagues,
  fetchRemote,
  liveCall,
  liveWrite,
  queueWrite,
  type BanInfo,
  type CardUsageLite,
  type JoinRequestInfo,
  type LeagueInfo,
  type ProfileInfo,
  type RemoteIds,
  type RemoteLive,
} from "./remote";
import type { GeneratedFixture } from "../scheduling/generate";
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

/** هوية المستخدم الحالي — تأتي من الحساب لا من مبدّل محلي */
export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  /** أدوار الدوري الخام: admin / moderator / referee / recorder */
  roles: string[];
  isPlatformAdmin: boolean;
  /** أُنشئ الحساب (أو أُعيد تعيينه) من الأدمن — يجب تغيير كلمة المرور */
  mustChangePassword: boolean;
  accountType: string;
}

/** حمولة معالج إنشاء دوري جديد — تُرسل كما هي لبوابة live-write */
export interface NewLeaguePayload {
  name: string;
  season: string;
  slogan: string;
  groups: { name: string; teams: string[] }[];
  match_days: string[];
  slots: string[];
  venues: string[];
  rules: {
    halves: 1 | 2;
    half_minutes: number;
    slot_minutes: number;
    qualify_per_group: number;
    yellow_cards_for_suspension: number;
    final_duration_override_minutes: number;
  };
  knockout: boolean;
  power_cards: boolean;
  fixtures: GeneratedFixture[];
}

const ACTIVE_LEAGUE_KEY = "halaqat-active-league";

const LEGACY_KEY = "halaqat-league-v1";
const LEGACY_LOCAL_KEY = "halaqat-league-local-v1";

/** الدور الوظيفي في الواجهة مشتق من أدوار الحساب */
function roleOf(user: SessionUser | null): Role {
  if (!user) return "visitor";
  if (user.roles.includes("admin")) return "admin";
  if (user.roles.some((r) => r === "referee" || r === "recorder")) return "recorder";
  return "visitor";
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
  standingsOf: (group: string) => StandingRow[];
  /** حروف مجموعات الدوري النشط بالترتيب (A, B, ...) */
  groupNames: string[];
  groupsComplete: boolean;
  /** حل رموز الإقصائيات (1A، W_semi_1...) إلى فريق فعلي أو تسمية عرض */
  resolveSide: (raw: string) => { team?: Team; label: string };
  onFieldPlayers: (matchId: string, teamCode: string) => Player[];
  benchPlayers: (matchId: string, teamCode: string) => Player[];

  /** هل وصلت بيانات القاعدة؟ (false = نعرض seed مدمجًا والكتابة غير ممكنة) */
  connected: boolean;
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

  /** المستخدم الحالي — null = زائر (الدخول الافتراضي بلا حساب) */
  user: SessionUser | null;
  /** هل الحساب الحالي حكم أو أدمن؟ (الاعتماد النهائي حكر عليهما) */
  canApprove: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** تسجيل ذاتي (زائر/لاعب) ثم دخول تلقائي — يُرجع نص الخطأ أو null */
  register: (
    username: string,
    password: string,
    display: string,
    type: "fan" | "player",
  ) => Promise<string | null>;
  /** تغيير كلمة مرور الحساب الحالي — يُرجع نص الخطأ أو null */
  changePassword: (newPassword: string) => Promise<string | null>;

  // الدوريات (المنصة متعددة الدوريات — المبدّل في الواجهة)
  leagues: LeagueInfo[];
  activeLeagueId: string | null;
  setActiveLeague: (leagueId: string) => void;
  /** إعادة الجلب اليدوية بعد فعل تفاعلي */
  refresh: () => Promise<void>;

  // الانضمام للفرق
  /** فريق المستخدم الحالي في الدوري النشط (لو لاعبًا مرتبطًا) */
  myTeamCode: string | undefined;
  /** الفرق التي المستخدم كابتنها في الدوري النشط */
  captainOf: string[];
  joinRequests: JoinRequestInfo[];
  /** teamCode -> كود الانضمام (يراه الكابتن والأدمن فقط) */
  joinCodes: Record<string, string>;
  /** teamCode -> userId كابتن الفريق (null = بلا كابتن) */
  captains: Record<string, string | null>;
  requestJoin: (code: string) => Promise<string | null>;
  decideJoin: (requestId: string, approve: boolean) => Promise<string | null>;

  /** الدوري النشط مقفول (مؤرشف): لا تسجيل أحداث ولا انضمام */
  leagueLocked: boolean;

  // إدارة الأدمن
  profilesAll: ProfileInfo[];
  memberRoles: Record<string, string[]>;
  setCaptain: (teamCode: string, userId: string | null) => Promise<string | null>;
  /** تعديل صلاحيات مستخدم في الدوري النشط (فارغة = إزالة العضوية) */
  adminSetRoles: (userId: string, roles: string[]) => Promise<string | null>;
  adminDeleteAccount: (userId: string) => Promise<string | null>;

  // الإشراف على المجتمع
  /** أدمن أو مشرف — يظهر له أزرار الحذف والحظر في المجتمع */
  canModerate: boolean;
  bans: BanInfo[];
  deletePost: (postId: string) => Promise<string | null>;
  /** يحظر صاحب المنشور (جهازًا وحسابًا) ويحذف المنشور */
  banPoster: (postId: string, reason: string) => Promise<string | null>;
  unbanPoster: (banId: string) => Promise<string | null>;

  /** تعديل اسم/رقم قميص لاعب — أدمن أو كابتن فريقه */
  updatePlayer: (
    playerCode: string,
    patch: { shirt?: number; name?: string },
  ) => Promise<string | null>;
  /** مدة مخصصة لمباراة بالدقائق (null = مدة الدوري الافتراضية) */
  setMatchDuration: (matchId: string, minutes: number | null) => void;
  /** عدد أشواط مخصص لمباراة: 1 أو 2 (null = افتراضي الدوري) */
  setMatchHalves: (matchId: string, halves: 1 | 2 | null) => void;
  /** قفل (archived) أو فتح (active) دوري */
  setLeagueStatus: (leagueId: string, status: "active" | "archived") => Promise<string | null>;
  /**
   * تصفير دوري (مدير المنصة فقط): مسح كل ما نتج عن اللعب وإرجاع المباريات
   * «مجدولة». لا يمس الفرق واللاعبين والحسابات والجدول. لا رجعة فيه.
   */
  resetLeague: (
    leagueId: string,
    includePosts: boolean,
  ) => Promise<{ error?: string; detail?: string }>;
  /**
   * حذف دوري بالكامل (مدير المنصة فقط): الدوري وفرقه ولاعبوه وجدوله وكل
   * بياناته. لا رجعة فيه، ولا يُسمح بحذف آخر دوري على المنصة.
   */
  deleteLeague: (leagueId: string) => Promise<{ error?: string; detail?: string }>;
  adminCreateAccount: (
    username: string,
    password: string,
    display: string,
    roles: string[],
  ) => Promise<string | null>;
  adminResetPassword: (userId: string, newPassword: string) => Promise<string | null>;
  adminCreateLeague: (payload: NewLeaguePayload) => Promise<{ error?: string; leagueId?: string }>;

  // أفعال
  rescheduleMatch: (matchId: string, patch: FixtureOverride, reason: string) => void;
  setPrediction: (matchId: string, p: Prediction) => void;
  addPost: (author: string, text: string) => void;
  likePost: (postId: string) => void;
  setStarters: (matchId: string, teamCode: string, playerIds: string[]) => void;
  /** بدء المباراة. atSeconds: البدء من ثانية محددة (لو فتحت الكونسول متأخرًا).
   *  paused: يبدأ متوقفًا (للإدخال اليدوي/المتأخر لمباراة انتهت بلا تسجيل). */
  startMatch: (matchId: string, opts?: { atSeconds?: number; paused?: boolean }) => void;
  toggleClock: (matchId: string) => void;
  advancePeriod: (matchId: string) => void;
  /** ضبط ساعة المباراة يدويًا لدقيقة محددة (الأدمن/الطاقم) — للتصحيح أو البدء بوقت مخصص */
  setClock: (matchId: string, minute: number, running: boolean) => void;
  recordEvent: (
    matchId: string,
    e: Omit<MatchEvent, "id" | "minute" | "period" | "createdAt" | "value"> & {
      value?: number;
      /** دقيقة يدوية (حدث فائت/إدخال متأخر) — بدل دقيقة الساعة الحالية */
      minute?: number;
      period?: MatchEvent["period"];
    },
  ) => MatchEvent;
  removeEvent: (eventId: string) => void; // تراجع فوري (خلال 5 ثوان)
  deleteEventWithReason: (eventId: string, reason: string) => void;
  /** تعديل حدث (دقيقة/قيمة/ملاحظة/الهدّاف) بسبب — يُعيد حساب النتيجة لو المباراة انتهت/اعتُمدت */
  editEvent: (
    eventId: string,
    patch: { minute?: number; value?: number; note?: string; playerId?: string },
    reason: string,
  ) => void;
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(0);
  const [dropped, setDropped] = useState(0);

  const liveRef = useRef(live);
  liveRef.current = live;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const userRef = useRef(user);
  userRef.current = user;
  const idsRef = useRef<RemoteIds | null>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeLeagueId;

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

  // الجلب الأول: قائمة الدوريات ← الدوري النشط (المحفوظ أو الأول) ← بياناته.
  // الزائر يرى كل شيء بلا حساب.
  useEffect(() => {
    try {
      // مبدّل الدور المحلي القديم لم يعد له معنى بعد الحسابات الحقيقية
      localStorage.removeItem(LEGACY_KEY);
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    } catch {
      // لا شيء
    }

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchLeagues();
        if (cancelled) return;
        setLeagues(list);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(ACTIVE_LEAGUE_KEY);
        } catch {
          // لا شيء
        }
        const active =
          list.find((l) => l.id === stored)?.id ?? list[0]?.id ?? null;
        setActiveLeagueId(active);
        activeRef.current = active;
        const snapshot = await fetchRemote(active ?? undefined);
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

  // متابعة جلسة المصادقة: الدور يُشتق من الحساب، وانتهاء الجلسة يعيدنا زائرًا
  useEffect(() => {
    let cancelled = false;

    const loadUser = async (uid: string | undefined) => {
      if (!uid) {
        if (!cancelled) setUser(null);
        return;
      }
      const [profileQ, memberQ] = await Promise.all([
        supabase.from("profiles")
          .select("username, display_name, is_platform_admin, must_change_password, account_type")
          .eq("id", uid).maybeSingle(),
        supabase.from("league_members").select("roles").eq("user_id", uid).eq("status", "active"),
      ]);
      if (cancelled) return;
      const p = profileQ.data;
      const roles = (memberQ.data ?? []).flatMap((r) => r.roles as string[]);
      if (p?.is_platform_admin && !roles.includes("admin")) roles.push("admin");
      setUser({
        id: uid,
        username: p?.username ?? "",
        displayName: p?.display_name ?? p?.username ?? "",
        roles,
        isPlatformAdmin: p?.is_platform_admin ?? false,
        mustChangePassword: p?.must_change_password ?? false,
        accountType: p?.account_type ?? "fan",
      });
    };

    void supabase.auth.getSession().then(({ data }) => loadUser(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void loadUser(session?.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

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
          applySnapshot(await fetchRemote(activeRef.current ?? undefined));
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
      "posts",
      "predictions",
      "join_requests",
      "teams",
      "players",
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
      role: roleOf(user),
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
    [user, live, lineupOverrides, activeCards, usedCards],
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
      return deriveScore(resolvedSides(match), state.events);
    },
    // resolvedSides معرفة أدناه (تعتمد على resolveSideRaw) — نفس نمط knockoutWinner
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    (group: string): StandingRow[] =>
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
      const rep = state.reports[m.id];
      const resolved = resolveSideRaw(m.home);
      const resolvedAway = resolveSideRaw(m.away);
      if (!resolved.team || !resolvedAway.team) return {};
      // الاشتقاق بعد حلّ الرموز — الأحداث لا تعرف «1A» بل كود الفريق
      const s = deriveScore(
        { ...m, home: resolved.team.code, away: resolvedAway.team.code },
        state.events,
      );
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
      // وصف الرمز قبل حسمه — مولَّد لا مكتوبًا، فيصح مع أي عدد مجموعات (A-D)
      const RANK_WORDS = ["", "أول", "ثاني", "ثالث", "رابع"];
      const describe = (code: string): string | undefined => {
        const g = /^([1-9])([A-D])$/.exec(code);
        if (g) return `${RANK_WORDS[Number(g[1])] ?? g[1]} المجموعة ${g[2]}`;
        const d = /^([WL])_semi_([0-9]+)$/.exec(code);
        if (d) return `${d[1] === "W" ? "فائز" : "خاسر"} نصف النهائي ${d[2]}`;
        return undefined;
      };
      if (/^[1-9][A-D]$/.test(raw) && groupsComplete) {
        const rank = Number(raw[0]);
        const group = raw[1];
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
      return { label: describe(raw) ?? raw };
    },
    [seed, groupsComplete, standingsOf, teamByCode, knockoutWinner],
  );

  /** المباراة بأطراف محلولة (مباريات المجموعات تعود كما هي) */
  const resolvedSides = useCallback(
    (m: Match): Match => resolveMatchSides(m, (raw) => resolveSideRaw(raw).team?.code),
    [resolveSideRaw],
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
      // اسم الفاعل الحقيقي في التدقيق بدل الدور المجرد
      actor: userRef.current?.displayName ?? userRef.current?.username ?? "زائر",
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
      // عقوبة الطرد تسافر في meta — لا عمود مخصص لها
      meta: e.penaltyScope
        ? {
            penalty_scope: e.penaltyScope,
            penalty_minutes: e.penaltyMinutes ?? null,
            penalty_until_sec: e.penaltyUntilSec ?? null,
          }
        : {},
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

  /** تسجيل الدخول باسم مستخدم — يُرجع نص الخطأ أو null عند النجاح */
  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (!error) return null;
    return error.message.toLowerCase().includes("invalid")
      ? "اسم المستخدم أو كلمة المرور غير صحيحة"
      : `تعذّر تسجيل الدخول: ${error.message}`;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  /** إعادة جلب لقطة الدوري النشط (بعد فعل تفاعلي يغيّر بيانات لا يبثها Realtime فورًا) */
  const refresh = useCallback(async () => {
    try {
      applySnapshot(await fetchRemote(activeRef.current ?? undefined));
      setLeagues(await fetchLeagues());
    } catch {
      // سيتكفل Realtime أو المحاولة التالية
    }
  }, [applySnapshot]);

  const setActiveLeague = useCallback(
    (leagueId: string) => {
      if (leagueId === activeRef.current) return;
      setActiveLeagueId(leagueId);
      activeRef.current = leagueId;
      try {
        localStorage.setItem(ACTIVE_LEAGUE_KEY, leagueId);
      } catch {
        // لا شيء
      }
      setLive(emptyLive());
      void (async () => {
        try {
          applySnapshot(await fetchRemote(leagueId));
        } catch (e) {
          console.error("تعذر تحميل الدوري المختار", e);
        }
      })();
    },
    [applySnapshot],
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      display: string,
      type: "fan" | "player",
    ): Promise<string | null> => {
      const res = await accountsCall("register", {
        username,
        password,
        display_name: display,
        account_type: type,
      });
      if (!res.ok) return res.error ?? "تعذّر التسجيل";
      return signIn(username, password);
    },
    [signIn],
  );

  const changePassword = useCallback(async (newPassword: string): Promise<string | null> => {
    if (newPassword.length < 8) return "كلمة المرور 8 أحرف على الأقل";
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return error.message.toLowerCase().includes("different")
        ? "اختر كلمة مختلفة عن الحالية"
        : `تعذّر التغيير: ${error.message}`;
    }
    const uid = userRef.current?.id;
    if (uid) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", uid);
      setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
    }
    return null;
  }, []);

  const requestJoin = useCallback(
    async (code: string): Promise<string | null> => {
      const res = await liveCall("request_join", { code });
      if (!res.ok) return res.error ?? "تعذّر إرسال الطلب";
      await refresh();
      return null;
    },
    [refresh],
  );

  const decideJoin = useCallback(
    async (requestId: string, approve: boolean): Promise<string | null> => {
      const res = await liveCall("decide_join", { request_id: requestId, approve });
      if (!res.ok) return res.error ?? "تعذّر الحسم";
      await refresh();
      return null;
    },
    [refresh],
  );

  const setCaptain = useCallback(
    async (teamCode: string, userId: string | null): Promise<string | null> => {
      const teamId = idsRef.current?.teamByCode[teamCode];
      if (!teamId) return "الفريق غير معروف";
      const res = await liveCall("set_captain", { team_id: teamId, user_id: userId });
      if (!res.ok) return res.error ?? "تعذّر التعيين";
      await refresh();
      return null;
    },
    [refresh],
  );

  const adminCreateAccount = useCallback(
    async (
      username: string,
      password: string,
      display: string,
      roles: string[],
    ): Promise<string | null> => {
      const res = await accountsCall("create_account", {
        username,
        password,
        display_name: display,
        roles,
        league_id: idsRef.current?.leagueId,
      });
      if (!res.ok) return res.error ?? "تعذّر الإنشاء";
      await refresh();
      return null;
    },
    [refresh],
  );

  const adminResetPassword = useCallback(
    async (userId: string, newPassword: string): Promise<string | null> => {
      const res = await accountsCall("reset_password", {
        user_id: userId,
        new_password: newPassword,
      });
      if (!res.ok) return res.error ?? "تعذّرت إعادة التعيين";
      return null;
    },
    [],
  );

  const adminSetRoles = useCallback(
    async (userId: string, roles: string[]): Promise<string | null> => {
      const leagueId = idsRef.current?.leagueId;
      if (!leagueId) return "لا دوري نشطًا";
      const res = await liveCall("set_member_roles", {
        user_id: userId,
        league_id: leagueId,
        roles,
      });
      if (!res.ok) return res.error ?? "تعذّر التعديل";
      await refresh();
      return null;
    },
    [refresh],
  );

  const adminDeleteAccount = useCallback(
    async (userId: string): Promise<string | null> => {
      const res = await accountsCall("delete_account", { user_id: userId });
      if (!res.ok) return res.error ?? "تعذّر الحذف";
      await refresh();
      return null;
    },
    [refresh],
  );

  const setLeagueStatus = useCallback(
    async (leagueId: string, status: "active" | "archived"): Promise<string | null> => {
      const res = await liveCall("set_league_status", { league_id: leagueId, status });
      if (!res.ok) return res.error ?? "تعذّر التغيير";
      setLeagues(await fetchLeagues().catch(() => []));
      return null;
    },
    [],
  );

  const resetLeague = useCallback(
    async (
      leagueId: string,
      includePosts: boolean,
    ): Promise<{ error?: string; detail?: string }> => {
      const res = await liveCall("reset_league", {
        league_id: leagueId,
        include_posts: includePosts,
        confirm: "RESET",
      });
      if (!res.ok) return { error: res.error ?? "تعذّر التصفير" };
      await refresh();
      return { detail: String(res.data?.detail ?? "") };
    },
    [refresh],
  );

  const deleteLeague = useCallback(
    async (leagueId: string): Promise<{ error?: string; detail?: string }> => {
      const res = await liveCall("delete_league", {
        league_id: leagueId,
        confirm: "DELETE",
      });
      if (!res.ok) return { error: res.error ?? "تعذّر الحذف" };
      const remaining = await fetchLeagues().catch(() => []);
      setLeagues(remaining);
      // لو المحذوف هو المعروض حاليًا ننتقل لأقدم دوري باقٍ حتى لا تبقى الواجهة
      // معلّقة على معرّف لم يعد موجودًا
      if (activeRef.current === leagueId && remaining[0]) {
        setActiveLeague(remaining[0].id);
      } else {
        await refresh();
      }
      return { detail: String(res.data?.detail ?? "") };
    },
    [refresh, setActiveLeague],
  );

  const adminCreateLeague = useCallback(
    async (payload: NewLeaguePayload): Promise<{ error?: string; leagueId?: string }> => {
      const res = await liveCall("create_league", { league: payload });
      if (!res.ok) return { error: res.error ?? "تعذّر الإنشاء" };
      const leagueId = String(res.data?.league_id ?? "");
      setLeagues(await fetchLeagues().catch(() => leagues));
      return { leagueId };
    },
    [leagues],
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
        // هوية الجهاز — تسمح للإشراف بحظر المسيء حتى بلا حساب
        author_device: deviceKey(),
      },
    });
  }, []);

  const deletePost = useCallback(
    async (postId: string): Promise<string | null> => {
      setLive((l) => ({ ...l, posts: l.posts.filter((p) => p.id !== postId) }));
      const res = await liveCall("delete_post", { id: postId });
      if (!res.ok) {
        await refresh();
        return res.error ?? "تعذّر الحذف";
      }
      return null;
    },
    [refresh],
  );

  const banPoster = useCallback(
    async (postId: string, reason: string): Promise<string | null> => {
      setLive((l) => ({ ...l, posts: l.posts.filter((p) => p.id !== postId) }));
      const res = await liveCall("ban_poster", { post_id: postId, reason });
      await refresh();
      if (!res.ok) return res.error ?? "تعذّر الحظر";
      return null;
    },
    [refresh],
  );

  const unbanPoster = useCallback(
    async (banId: string): Promise<string | null> => {
      const res = await liveCall("unban_poster", { ban_id: banId });
      if (!res.ok) return res.error ?? "تعذّر إلغاء الحظر";
      await refresh();
      return null;
    },
    [refresh],
  );

  const updatePlayer = useCallback(
    async (
      playerCode: string,
      patch: { shirt?: number; name?: string },
    ): Promise<string | null> => {
      const playerId = idsRef.current?.playerByCode[playerCode];
      if (!playerId) return "اللاعب غير معروف";
      const res = await liveCall("update_player", {
        player_id: playerId,
        ...(patch.shirt !== undefined ? { shirt_number: patch.shirt } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
      });
      if (!res.ok) return res.error ?? "تعذّر التعديل";
      // تحديث متفائل للاسم/الرقم في الـ seed المعروض
      setSeed((s) => ({
        ...s,
        players: s.players.map((pl) =>
          pl.id === playerCode
            ? { ...pl, shirt: patch.shirt ?? pl.shirt, name: patch.name ?? pl.name }
            : pl,
        ),
      }));
      return null;
    },
    [],
  );

  const setMatchDuration = useCallback(
    (matchId: string, minutes: number | null) => {
      setSeed((s) => ({
        ...s,
        matches: s.matches.map((m) =>
          m.id === matchId ? { ...m, durationOverrideMinutes: minutes ?? undefined } : m,
        ),
      }));
      const ids = idsRef.current;
      if (ids) {
        queueWrite("update_match", {
          id: ids.matchByCode[matchId],
          patch: { duration_override_minutes: minutes },
        });
      }
      pushAudit(
        "تغيير مدة مباراة",
        matchId,
        minutes ? `المدة ← ${minutes} دقيقة` : "عادت للمدة الافتراضية",
      );
    },
    [pushAudit],
  );

  const setMatchHalves = useCallback(
    (matchId: string, halves: 1 | 2 | null) => {
      setSeed((s) => ({
        ...s,
        matches: s.matches.map((m) =>
          m.id === matchId ? { ...m, halvesOverride: halves ?? undefined } : m,
        ),
      }));
      const ids = idsRef.current;
      if (ids) {
        queueWrite("update_match", {
          id: ids.matchByCode[matchId],
          patch: { halves_override: halves },
        });
      }
      pushAudit(
        "تغيير أشواط مباراة",
        matchId,
        halves ? (halves === 1 ? "شوط واحد" : "شوطان") : "عادت لافتراضي الدوري",
      );
    },
    [pushAudit],
  );

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
    (matchId: string, opts?: { atSeconds?: number; paused?: boolean }) => {
      const at = Math.max(0, Math.round(opts?.atSeconds ?? 0));
      const running = !opts?.paused;
      const clock: ClockState = {
        ...freshClock(),
        periodSeconds: at,
        totalSeconds: at,
        running,
        runningSince: running ? Date.now() : null,
      };
      setLive((l) => ({
        ...l,
        statuses: { ...l.statuses, [matchId]: "live" },
        clocks: { ...l.clocks, [matchId]: clock },
      }));
      writeMatch(matchId, { status: "live", clock });
      pushAudit(
        "بدء مباراة",
        matchId,
        at > 0
          ? `بدأ الشوط الأول من الدقيقة ${Math.floor(at / 60) + 1}${opts?.paused ? " (إدخال يدوي)" : ""}`
          : opts?.paused
            ? "فُتحت للإدخال اليدوي (الساعة متوقفة)"
            : "بدأ الشوط الأول",
      );
    },
    [writeMatch, pushAudit],
  );

  /** ضبط ساعة المباراة يدويًا للدقيقة المعروضة (1 = بداية المباراة) */
  const setClock = useCallback(
    (matchId: string, minute: number, running: boolean) => {
      const c0 = liveRef.current.clocks[matchId] ?? freshClock();
      const disp = Math.max(1, Math.round(minute));
      const sec = (disp - 1) * 60;
      const next: ClockState = {
        ...c0,
        period: c0.period === "ended" ? "first" : c0.period,
        periodSeconds: sec,
        totalSeconds: sec,
        running,
        runningSince: running ? Date.now() : null,
      };
      setLive((l) => ({ ...l, clocks: { ...l.clocks, [matchId]: next } }));
      writeMatch(matchId, { clock: next });
      pushAudit("ضبط الساعة", matchId, `الساعة ضُبطت على الدقيقة ${disp}`);
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
      // مباراة الشوط الواحد: بعد الشوط الوحيد ننتقل للوقت الإضافي مباشرة
      const seedMatch = seedRef.current.matches.find((m) => m.id === matchId);
      const halves = seedMatch?.halvesOverride ?? seedRef.current.rules.halves;
      if (c.period === "first" && halves <= 1) {
        period = "extra";
      } else if (c.period === "first") {
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

  /** يعيد كتابة النتيجة المخزّنة من الأحداث لو المباراة انتهت/اعتُمدت (تعديل ما بعد المباراة) */
  const settleScore = useCallback(
    (matchId: string, events: MatchEvent[]) => {
      const st = liveRef.current.statuses[matchId];
      if (st !== "finished" && st !== "approved") return;
      const match = seedRef.current.matches.find((m) => m.id === matchId);
      if (!match) return;
      const score = deriveScore(resolvedSides(match), events);
      writeMatch(matchId, { home_score: score.home, away_score: score.away });
    },
    [resolvedSides, writeMatch],
  );

  const recordEvent = useCallback(
    (
      matchId: string,
      e: Omit<MatchEvent, "id" | "minute" | "period" | "createdAt" | "value"> & {
        value?: number;
        minute?: number;
        period?: MatchEvent["period"];
      },
    ): MatchEvent => {
      const l0 = liveRef.current;
      const c = l0.clocks[matchId] ?? freshClock();
      const extra = c.running && c.runningSince ? (Date.now() - c.runningSince) / 1000 : 0;
      // دقيقة يدوية (حدث فائت/إدخال متأخر) تتقدّم على دقيقة الساعة
      const manual = e.minute != null;
      const minute = manual
        ? Math.min(99, Math.max(1, Math.round(e.minute!)))
        : Math.min(99, Math.floor((c.totalSeconds + extra) / 60) + 1);
      const period: MatchEvent["period"] =
        e.period ?? (c.period === "second" || c.period === "extra" ? c.period : "first");
      const baseSec = manual ? (minute - 1) * 60 : c.totalSeconds + extra;

      // كارت "الهدف بهدفين" النشط لهذا الفريق يجعل قيمة الهدف 2 ويُستهلك
      const active = l0.usages.find((u) => u.matchId === matchId && u.status === "approved");
      const consumeCard =
        e.type === "goal" &&
        active !== undefined &&
        active.teamCode === e.teamCode &&
        active.effect === "goal_multiplier";
      const value = consumeCard ? 2 : (e.value ?? 1);
      const now = Date.now();

      // طرد مؤقت بالدقائق: نثبّت ثانية انتهاء العقوبة على ساعة المباراة الآن
      const penaltyUntilSec =
        e.type === "red" && e.penaltyScope === "minutes" && e.penaltyMinutes
          ? Math.round(baseSec + e.penaltyMinutes * 60)
          : undefined;

      const event: MatchEvent = {
        ...e,
        id: eventUuid(),
        matchId,
        minute,
        period: period === "extra" ? "extra" : period,
        value,
        ...(consumeCard ? { powerCard: active.cardName } : {}),
        ...(penaltyUntilSec !== undefined ? { penaltyUntilSec } : {}),
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
            // طرد الإنذار الثاني = خروج لباقي المباراة (لا يمتد لمباراة تالية)
            penaltyScope: "match",
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
      // لو المباراة انتهت/اعتُمدت (إضافة حدث بعد المباراة) نعيد حساب النتيجة المخزّنة
      settleScore(matchId, [...l0.events, ...newEvents]);
      return event;
    },
    [toDbEvent, writeUsage, settleScore],
  );

  const removeEvent = useCallback(
    (eventId: string) => {
      const removed = liveRef.current.events.find((e) => e.id === eventId);
      if (!removed) return;
      // الأحداث المرافقة (طرد الإنذار الثاني) تُحذف مع أصلها — والقاعدة تكرر
      // ذلك تلقائيًا (linked_to on delete cascade)
      const remaining = liveRef.current.events.filter(
        (e) => e.id !== eventId && e.linkedTo !== eventId,
      );
      setLive((l) => ({
        ...l,
        events: l.events.filter((e) => e.id !== eventId && e.linkedTo !== eventId),
      }));
      if (idsRef.current) queueWrite("delete_event", { id: eventId });
      revertCardForEvent(removed);
      settleScore(removed.matchId, remaining);
    },
    [revertCardForEvent, settleScore],
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
      // إعادة حساب النتيجة لو المباراة انتهت/اعتُمدت (حذف هدف بعد المباراة)
      settleScore(removed.matchId, l0.events.map((e) =>
        e.id === eventId || e.linkedTo === eventId ? { ...e, deleted: true } : e,
      ));
    },
    [revertCardForEvent, pushAudit, settleScore],
  );

  const editEvent = useCallback(
    (
      eventId: string,
      patch: { minute?: number; value?: number; note?: string; playerId?: string },
      reason: string,
    ) => {
      const l0 = liveRef.current;
      const ev = l0.events.find((e) => e.id === eventId);
      if (!ev) return;
      const next: MatchEvent = {
        ...ev,
        ...(patch.minute != null ? { minute: Math.min(99, Math.max(1, Math.round(patch.minute))) } : {}),
        ...(patch.value != null ? { value: Math.max(1, Math.round(patch.value)) } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.playerId !== undefined ? { playerId: patch.playerId } : {}),
        editedReason: reason,
      };
      const nextEvents = l0.events.map((e) => (e.id === eventId ? next : e));
      setLive((l) => ({ ...l, events: l.events.map((e) => (e.id === eventId ? next : e)) }));
      if (idsRef.current) {
        const dbPatch: Record<string, unknown> = { edited_reason: reason };
        if (patch.minute != null) dbPatch.minute = next.minute;
        if (patch.value != null) dbPatch.value = next.value;
        if (patch.note !== undefined) dbPatch.note = patch.note ?? null;
        if (patch.playerId !== undefined)
          dbPatch.player_id = patch.playerId ? (idsRef.current.playerByCode[patch.playerId] ?? null) : null;
        queueWrite("update_events", { rows: [{ id: eventId, patch: dbPatch }] });
      }
      pushAudit("تعديل حدث", eventId, reason);
      settleScore(ev.matchId, nextEvents);
    },
    [pushAudit, settleScore],
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
      const score = match
        ? deriveScore(resolvedSides(match), liveRef.current.events)
        : { home: 0, away: 0 };
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
    (matchId: string, _pin: string): boolean => {
      // الصلاحية صارت من الحساب لا من رقم سري — والبوابة تتحقق منها ثانيةً
      const roles = userRef.current?.roles ?? [];
      if (!roles.some((r) => r === "admin" || r === "referee")) return false;
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
      const score = match
        ? deriveScore(resolvedSides(match), liveRef.current.events)
        : { home: 0, away: 0 };
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
    // القاعدة مشتركة — لا نمسحها من جهاز؛ الخروج يعيد الجهاز زائرًا
    void signOut();
  }, [signOut]);

  const myTeamCode = user ? live.playerTeams[user.id] : undefined;
  const captainOf = user
    ? Object.entries(live.captains)
        .filter(([, uid]) => uid === user.id)
        .map(([code]) => code)
    : [];
  const groupNames = useMemo(
    () => [...new Set(seed.teams.map((t) => t.group))].sort(),
    [seed],
  );
  const leagueLocked =
    leagues.find((l) => l.id === activeLeagueId)?.status === "archived";

  const store: LeagueStore = {
    seed,
    state,
    hydrated,
    matches,
    matchOf,
    connected,
    pendingWrites: pending,
    droppedWrites: dropped,
    leagues,
    activeLeagueId,
    setActiveLeague,
    refresh,
    myTeamCode,
    captainOf,
    groupNames,
    leagueLocked,
    joinRequests: live.joinRequests,
    joinCodes: live.joinCodes,
    captains: live.captains,
    requestJoin,
    decideJoin,
    profilesAll: live.profiles,
    memberRoles: live.members,
    setCaptain,
    adminSetRoles,
    adminDeleteAccount,
    setLeagueStatus,
    resetLeague,
    deleteLeague,
    canModerate: (user?.roles ?? []).some((r) => r === "admin" || r === "moderator"),
    bans: live.bans,
    deletePost,
    banPoster,
    unbanPoster,
    updatePlayer,
    setMatchDuration,
    setMatchHalves,
    adminCreateAccount,
    adminResetPassword,
    adminCreateLeague,
    register,
    changePassword,
    scheduleConflicts,
    conflictsOf,
    suggestReschedule,
    suspensions,
    isSuspended,
    user,
    canApprove: (user?.roles ?? []).some((r) => r === "admin" || r === "referee"),
    signIn,
    signOut,
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
    startMatch,
    toggleClock,
    advancePeriod,
    setClock,
    recordEvent,
    removeEvent,
    deleteEventWithReason,
    editEvent,
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
