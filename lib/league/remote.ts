// طبقة Supabase البعيدة — جلب بيانات الدوري النشط وتحويلها إلى نفس أشكال
// المخزن (LeagueSeed + حالة حية بمفاتيح الأكواد m1../A1../A1-4)، بحيث لا
// تتغير الصفحات. الكتابة كلها عبر Edge Function واحدة (live-write) بتحقق
// JWT + أدوار — الـ RLS يبقى مقفولًا للكتابة المباشرة.
//
// تعدد الدوريات: كل الاستعلامات الأم مقيدة بـ league_id، والجداول الابنة
// تُرشَّح عبر خرائط الأكواد (صف ابن أبوه خارج الدوري النشط يسقط تلقائيًا).

import { SUPABASE_KEY, SUPABASE_URL, supabase } from "../supabase/client";
import { enqueueWrite, type WriteResult } from "./queue";
import { slotToMinutes, type LeagueSeed } from "./seed";
import type { ClockState } from "./live-types";
import type {
  AuditEntry,
  LeagueRules,
  Match,
  MatchEvent,
  MatchReport,
  MatchStatus,
  Player,
  Post,
  Prediction,
  StageKind,
  StandingAdjustment,
  Team,
  VenueDef,
} from "./types";

/** استخدام كارت قوة كما يراه المخزن: approved = مفعّل الآن، applied = مستهلك */
export interface CardUsageLite {
  id: string;
  matchId: string;
  teamCode: string;
  cardName: string;
  effect: string;
  status: "requested" | "approved" | "rejected" | "applied" | "countered" | "cancelled";
  teamCardId: string;
}

export interface LeagueInfo {
  id: string;
  name: string;
  season: string | null;
  slug: string;
  status: string;
}

export interface JoinRequestInfo {
  id: string;
  teamCode: string;
  userId: string;
  username: string;
  displayName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface ProfileInfo {
  id: string;
  username: string;
  displayName: string;
  accountType: string;
  isPlatformAdmin: boolean;
}

/** حظر ناشر من المجتمع — يراه الأدمن/المشرف فقط عبر RLS */
export interface BanInfo {
  id: string;
  username: string | null;
  reason: string;
  createdAt: number;
}

export interface RemoteLive {
  statuses: Record<string, MatchStatus>;
  clocks: Record<string, ClockState>;
  events: MatchEvent[];
  reports: Record<string, MatchReport>;
  adjustments: StandingAdjustment[];
  /** matchCode -> teamCode -> player codes */
  starters: Record<string, Record<string, string[]>>;
  usages: CardUsageLite[];
  audit: AuditEntry[];
  posts: Post[];
  /** توقعات هذا الجهاز: matchCode -> نتيجة */
  predictions: Record<string, Prediction>;
  /** userId -> teamCode للاعبين المرتبطين بحسابات (في الدوري النشط) */
  playerTeams: Record<string, string>;
  /** teamCode -> userId كابتن الفريق */
  captains: Record<string, string | null>;
  /** طلبات الانضمام المرئية لهذا المستخدم (RLS يحدد) */
  joinRequests: JoinRequestInfo[];
  /** teamCode -> كود الانضمام (يظهر للكابتن والأدمن فقط عبر RLS) */
  joinCodes: Record<string, string>;
  /** كل الملفات الشخصية (لإدارة الحسابات والكباتن) */
  profiles: ProfileInfo[];
  /** userId -> أدوار العضوية في الدوري النشط */
  members: Record<string, string[]>;
  /** المحظورون من النشر (فارغة لغير الأدمن/المشرف — RLS) */
  bans: BanInfo[];
}

/** خرائط uuid ↔ أكواد الواجهة — تلزم للكتابة فقط */
export interface RemoteIds {
  leagueId: string;
  matchByCode: Record<string, string>;
  teamByCode: Record<string, string>;
  playerByCode: Record<string, string>;
  venueByName: Record<string, string>;
  /** `${teamCode}|${cardName}` -> team_cards.id */
  teamCardId: Record<string, string>;
}

export interface RemoteSnapshot {
  seed: LeagueSeed;
  live: RemoteLive;
  ids: RemoteIds;
}

export function emptyLive(): RemoteLive {
  return {
    statuses: {},
    clocks: {},
    events: [],
    reports: {},
    adjustments: [],
    starters: {},
    usages: [],
    audit: [],
    posts: [],
    predictions: {},
    playerTeams: {},
    captains: {},
    joinRequests: [],
    joinCodes: {},
    profiles: [],
    members: {},
    bans: [],
  };
}

const DEVICE_KEY_STORAGE = "halaqat-device-key";

/** معرّف ثابت لهذا الجهاز — يربط التوقعات بصاحبها قبل وجود الحسابات */
export function deviceKey(): string {
  if (typeof window === "undefined") return "server";
  try {
    let k = window.localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!k) {
      k =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(DEVICE_KEY_STORAGE, k);
    }
    return k;
  } catch {
    return "anonymous";
  }
}

/** عقوبة الطرد من meta الحدث (penalty_scope / penalty_minutes / penalty_until_sec) */
function penaltyFromMeta(meta: unknown): Partial<
  Pick<MatchEvent, "penaltyScope" | "penaltyMinutes" | "penaltyUntilSec">
> {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  const scope = m.penalty_scope;
  if (scope !== "minutes" && scope !== "match" && scope !== "league") return {};
  return {
    penaltyScope: scope,
    penaltyMinutes: typeof m.penalty_minutes === "number" ? m.penalty_minutes : undefined,
    penaltyUntilSec: typeof m.penalty_until_sec === "number" ? m.penalty_until_sec : undefined,
  };
}

const APP_STATUSES: MatchStatus[] = [
  "scheduled",
  "live",
  "half_time",
  "finished",
  "approved",
];

const DEFAULT_RULES: LeagueRules = {
  points: { win: 3, draw: 1, loss: 0 },
  halves: 1,
  half_minutes: 17,
  slot_minutes: 20,
  final_duration_override_minutes: 30,
  substitutions: "unlimited",
  tiebreakers: ["points", "head_to_head", "goal_difference", "goals_for", "fair_play", "draw"],
  yellow_cards_for_suspension: 2,
  red_card_suspension_matches: 1,
  red_penalty_minutes_options: [2, 5],
};

/** كل الدوريات على المنصة (للمبدّل) — الأقدم أولًا */
export async function fetchLeagues(): Promise<LeagueInfo[]> {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, season, slug, status")
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function fetchRemote(leagueId?: string): Promise<RemoteSnapshot> {
  // المرحلة 1: الدوري وكياناته الأم (مقيدة كلها بالدوري)
  const leagueQ = leagueId
    ? await supabase.from("leagues").select("*").eq("id", leagueId).maybeSingle()
    : await supabase.from("leagues").select("*").order("created_at").limit(1).maybeSingle();
  if (leagueQ.error) throw leagueQ.error;
  if (!leagueQ.data) throw new Error("لا يوجد دوري");
  const league = leagueQ.data;

  const [venuesQ, teamsQ, stagesQ, matchesQ, templatesQ, adjQ, auditQ, postsQ, profilesQ, membersQ] =
    await Promise.all([
      supabase.from("venues").select("*").eq("league_id", league.id),
      supabase.from("teams").select("*").eq("league_id", league.id).order("short_code"),
      supabase.from("stages").select("*").eq("league_id", league.id),
      supabase.from("matches").select("*").eq("league_id", league.id),
      supabase.from("power_card_templates").select("*").eq("league_id", league.id),
      supabase.from("standing_adjustments").select("*").eq("league_id", league.id).order("created_at"),
      supabase.from("audit_log").select("*").eq("league_id", league.id)
        .order("created_at", { ascending: false }).limit(300),
      supabase.from("posts").select("*").eq("league_id", league.id)
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, username, display_name, account_type, is_platform_admin")
        .order("username"),
      supabase.from("league_members").select("user_id, roles").eq("league_id", league.id)
        .eq("status", "active"),
    ]);
  for (const q of [venuesQ, teamsQ, stagesQ, matchesQ, templatesQ, adjQ, auditQ, postsQ, profilesQ, membersQ]) {
    if (q.error) throw q.error;
  }

  // المحظورون: RLS يعيدها فارغة لغير الأدمن/المشرف — لا نفشل الجلب كله لأجلها
  const bansQ = await supabase
    .from("banned_posters").select("*").order("created_at", { ascending: false });
  const bans: BanInfo[] = (bansQ.data ?? []).map((b) => ({
    id: b.id,
    username: b.banned_username,
    reason: b.reason,
    createdAt: Date.parse(b.created_at),
  }));

  const venueIds = venuesQ.data!.map((v) => v.id);
  const teamIds = teamsQ.data!.map((t) => t.id);
  const stageIds = stagesQ.data!.map((s) => s.id);
  const matchIds = matchesQ.data!.map((m) => m.id);

  // المرحلة 2: الجداول الابنة (in على معرفات الدوري النشط — قوائم صغيرة)
  const emptyOk = { data: [] as never[], error: null };
  const [availQ, playersQ, groupsQ, groupTeamsQ, eventsQ, reportsQ, lineupsQ, teamCardsQ, usagesQ, predictionsQ, joinReqQ, joinCodesQ] =
    await Promise.all([
      venueIds.length
        ? supabase.from("venue_availability").select("*").in("venue_id", venueIds)
        : Promise.resolve(emptyOk),
      teamIds.length
        ? supabase.from("players").select("*").in("team_id", teamIds).order("shirt_number")
        : Promise.resolve(emptyOk),
      stageIds.length
        ? supabase.from("groups").select("*").in("stage_id", stageIds)
        : Promise.resolve(emptyOk),
      teamIds.length
        ? supabase.from("group_teams").select("*").in("team_id", teamIds)
        : Promise.resolve(emptyOk),
      matchIds.length
        ? supabase.from("match_events").select("*").in("match_id", matchIds).order("created_at")
        : Promise.resolve(emptyOk),
      matchIds.length
        ? supabase.from("match_reports").select("*").in("match_id", matchIds)
        : Promise.resolve(emptyOk),
      matchIds.length
        ? supabase.from("match_lineups").select("*").in("match_id", matchIds).eq("is_starter", true)
        : Promise.resolve(emptyOk),
      teamIds.length
        ? supabase.from("team_cards").select("*").in("team_id", teamIds)
        : Promise.resolve(emptyOk),
      matchIds.length
        ? supabase.from("card_usages").select("*").in("match_id", matchIds).order("created_at")
        : Promise.resolve(emptyOk),
      matchIds.length
        ? supabase.from("predictions").select("*").eq("device_key", deviceKey()).in("match_id", matchIds)
        : Promise.resolve(emptyOk),
      teamIds.length
        ? supabase.from("join_requests")
            .select("*, profiles!join_requests_user_id_fkey(username, display_name)")
            .in("team_id", teamIds).order("created_at", { ascending: false })
        : Promise.resolve(emptyOk),
      teamIds.length
        ? supabase.from("team_join_codes").select("*").in("team_id", teamIds)
        : Promise.resolve(emptyOk),
    ]);
  for (const q of [availQ, playersQ, groupsQ, groupTeamsQ, eventsQ, reportsQ, lineupsQ, teamCardsQ, usagesQ, predictionsQ, joinReqQ, joinCodesQ]) {
    if (q.error) throw q.error;
  }

  const settings = (league.settings ?? {}) as {
    rules?: Partial<LeagueRules>;
    match_days?: string[];
    slots?: string[];
    slogans?: string[];
  };
  const rules: LeagueRules = { ...DEFAULT_RULES, ...settings.rules };

  // خرائط الأكواد
  const nameByVenue: Record<string, string> = {};
  const venueByName: Record<string, string> = {};
  for (const v of venuesQ.data!) {
    nameByVenue[v.id] = v.name;
    venueByName[v.name] = v.id;
  }
  const codeByTeam: Record<string, string> = {};
  const teamByCode: Record<string, string> = {};
  for (const t of teamsQ.data!) {
    codeByTeam[t.id] = t.short_code;
    teamByCode[t.short_code] = t.id;
  }
  const codeByPlayer: Record<string, string> = {};
  const playerByCode: Record<string, string> = {};
  for (const p of playersQ.data!) {
    codeByPlayer[p.id] = p.code;
    playerByCode[p.code] = p.id;
  }
  const codeByMatch: Record<string, string> = {};
  const matchByCode: Record<string, string> = {};
  for (const m of matchesQ.data!) {
    codeByMatch[m.id] = m.code;
    matchByCode[m.code] = m.id;
  }

  // ————— بناء LeagueSeed بنفس شكل الـ seed المحلي —————

  const teams: Team[] = teamsQ.data!.map((t) => ({
    code: t.short_code,
    name: t.name,
    group: (t.group_code ?? "A") as Team["group"],
  }));

  const players: Player[] = playersQ.data!.map((p) => ({
    id: p.code,
    teamCode: codeByTeam[p.team_id],
    shirt: p.shirt_number,
    name: p.name,
    position: p.position === "حارس" ? "حارس" : "لاعب",
  }));

  const availByVenue = new Map<string, Map<string, string[]>>();
  for (const a of availQ.data!) {
    const byDate = availByVenue.get(a.venue_id) ?? new Map<string, string[]>();
    byDate.set(a.date, [...(byDate.get(a.date) ?? []), a.slot]);
    availByVenue.set(a.venue_id, byDate);
  }
  const venues: VenueDef[] = venuesQ.data!.map((v) => ({
    name: v.name,
    availability: v.all_slots
      ? ("all_slots" as const)
      : [...(availByVenue.get(v.id) ?? new Map())].map(([date, slots]) => ({ date, slots })),
  }));

  const matchDays =
    settings.match_days ??
    [...new Set(matchesQ.data!.map((m) => m.match_day))].sort();

  const matches: Match[] = matchesQ.data!
    .map((m) => ({
      id: m.code,
      matchDay: m.match_day,
      slot: m.slot,
      venue: nameByVenue[m.venue_id],
      stage: m.stage_kind as StageKind,
      round: matchDays.indexOf(m.match_day) + 1 || m.round_no,
      home: m.home_side,
      away: m.away_side,
      durationOverrideMinutes: m.duration_override_minutes ?? undefined,
      halvesOverride: m.halves_override ?? undefined,
    }))
    .sort(
      (a, b) =>
        a.matchDay.localeCompare(b.matchDay) ||
        slotToMinutes(a.slot) - slotToMinutes(b.slot) ||
        a.venue.localeCompare(b.venue),
    );

  const slots = settings.slots ?? [];
  const allSlots = [...new Set([...slots, ...matches.map((m) => m.slot)])].sort(
    (a, b) => slotToMinutes(a) - slotToMinutes(b),
  );

  const groupsStage = stagesQ.data!.find((s) => s.type === "groups");
  const qualifyPerGroup =
    ((groupsStage?.config ?? {}) as { qualify_per_group?: number }).qualify_per_group ?? 2;

  const seed: LeagueSeed = {
    slug: league.slug,
    name: league.name,
    slogan: league.slogan ?? "",
    slogans: settings.slogans ?? [],
    rules,
    matchDays,
    slots,
    allSlots,
    venues,
    teams,
    players,
    matches,
    powerCards: templatesQ.data!.map((t) => ({
      name: t.name,
      icon: t.icon ?? "✨",
      effect_type: t.effect_type,
      params: (t.params ?? {}) as Record<string, unknown>,
      usage_window: t.usage_window,
      rarity: t.rarity ?? "common",
      description: t.description ?? "",
    })),
    qualifyPerGroup,
  };

  // ————— الحالة الحية بمفاتيح الأكواد —————

  const statuses: Record<string, MatchStatus> = {};
  const clocks: Record<string, ClockState> = {};
  const reports: Record<string, MatchReport> = {};
  for (const m of matchesQ.data!) {
    const code = m.code;
    if (m.status !== "scheduled" && APP_STATUSES.includes(m.status as MatchStatus)) {
      statuses[code] = m.status as MatchStatus;
    }
    if (m.clock) clocks[code] = m.clock as unknown as ClockState;
    if (m.home_pens !== null || m.away_pens !== null) {
      reports[code] = {
        ...reports[code],
        homePens: m.home_pens ?? undefined,
        awayPens: m.away_pens ?? undefined,
      };
    }
  }
  for (const r of reportsQ.data!) {
    const code = codeByMatch[r.match_id];
    if (!code) continue;
    reports[code] = {
      ...reports[code],
      motmPlayerId: r.motm_player_id ? codeByPlayer[r.motm_player_id] : undefined,
      refereeNotes: r.referee_notes ?? undefined,
      approvedAt: r.approved_at ? Date.parse(r.approved_at) : undefined,
    };
  }

  const events: MatchEvent[] = eventsQ.data!
    .filter((e) => codeByMatch[e.match_id])
    .map((e) => ({
      id: e.id,
      matchId: codeByMatch[e.match_id],
      teamCode: codeByTeam[e.team_id],
      playerId: e.player_id ? codeByPlayer[e.player_id] : undefined,
      secondaryPlayerId: e.secondary_player_id ? codeByPlayer[e.secondary_player_id] : undefined,
      type: e.type as MatchEvent["type"],
      subtype: e.subtype ?? undefined,
      minute: e.minute,
      period: e.period as MatchEvent["period"],
      value: e.value,
      note: e.note ?? undefined,
      createdAt: Date.parse(e.created_at),
      editedReason: e.edited_reason ?? undefined,
      deleted: e.deleted_at !== null || undefined,
      deletedReason: e.deleted_reason ?? undefined,
      linkedTo: e.linked_to ?? undefined,
      powerCard: e.power_card ?? undefined,
      ...penaltyFromMeta(e.meta),
    }));

  const starters: Record<string, Record<string, string[]>> = {};
  for (const l of lineupsQ.data!) {
    const mc = codeByMatch[l.match_id];
    const tc = codeByTeam[l.team_id];
    const pc = codeByPlayer[l.player_id];
    if (!mc || !tc || !pc) continue;
    const byTeam = (starters[mc] ??= {});
    (byTeam[tc] ??= []).push(pc);
  }

  const adjustments: StandingAdjustment[] = adjQ.data!.map((a) => ({
    teamCode: codeByTeam[a.team_id],
    points: a.points,
    reason: a.reason,
    source: a.source as StandingAdjustment["source"],
  }));

  const templateById = new Map(templatesQ.data!.map((t) => [t.id, t]));
  const teamCardById = new Map(teamCardsQ.data!.map((tc) => [tc.id, tc]));
  const teamCardId: Record<string, string> = {};
  for (const tc of teamCardsQ.data!) {
    const tpl = templateById.get(tc.template_id);
    const teamCode = codeByTeam[tc.team_id];
    if (tpl && teamCode) teamCardId[`${teamCode}|${tpl.name}`] = tc.id;
  }
  const usages: CardUsageLite[] = usagesQ.data!
    .map((u) => {
      const tc = teamCardById.get(u.team_card_id);
      const tpl = tc ? templateById.get(tc.template_id) : undefined;
      if (!tc || !tpl) return null;
      return {
        id: u.id,
        matchId: codeByMatch[u.match_id] ?? "",
        teamCode: codeByTeam[tc.team_id] ?? "",
        cardName: tpl.name,
        effect: tpl.effect_type,
        status: u.status as CardUsageLite["status"],
        teamCardId: tc.id,
      };
    })
    .filter((u): u is CardUsageLite => u !== null && u.matchId !== "");

  const audit: AuditEntry[] = auditQ.data!.map((a) => ({
    id: a.id,
    at: Date.parse(a.created_at),
    actor: a.actor_role ?? "system",
    action: a.action,
    entity: a.entity,
    detail: a.detail ?? "",
  }));

  const posts: Post[] = postsQ.data!.map((p) => ({
    id: p.id,
    author: p.author_name,
    text: p.text,
    at: Date.parse(p.created_at),
    likes: p.likes,
  }));

  const predictions: Record<string, Prediction> = {};
  for (const pr of predictionsQ.data!) {
    const code = codeByMatch[pr.match_id];
    if (code) predictions[code] = { home: pr.home, away: pr.away };
  }

  const playerTeams: Record<string, string> = {};
  for (const p of playersQ.data!) {
    if (p.user_id && codeByTeam[p.team_id]) playerTeams[p.user_id] = codeByTeam[p.team_id];
  }

  const captains: Record<string, string | null> = {};
  for (const t of teamsQ.data!) captains[t.short_code] = t.captain_id;

  const joinRequests: JoinRequestInfo[] = joinReqQ
    .data!.map((r) => {
      const teamCode = codeByTeam[(r as { team_id: string }).team_id];
      if (!teamCode) return null;
      const row = r as unknown as {
        id: string; user_id: string; status: string; created_at: string;
        profiles: { username: string; display_name: string } | null;
      };
      return {
        id: row.id,
        teamCode,
        userId: row.user_id,
        username: row.profiles?.username ?? "",
        displayName: row.profiles?.display_name ?? row.profiles?.username ?? "مستخدم",
        status: row.status as JoinRequestInfo["status"],
        createdAt: Date.parse(row.created_at),
      };
    })
    .filter((r): r is JoinRequestInfo => r !== null);

  const joinCodes: Record<string, string> = {};
  for (const jc of joinCodesQ.data!) {
    const teamCode = codeByTeam[(jc as { team_id: string }).team_id];
    if (teamCode) joinCodes[teamCode] = (jc as { code: string }).code;
  }

  const profiles: ProfileInfo[] = profilesQ.data!.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.display_name,
    accountType: p.account_type,
    isPlatformAdmin: p.is_platform_admin,
  }));

  const members: Record<string, string[]> = {};
  for (const m of membersQ.data!) {
    members[m.user_id] = [...(members[m.user_id] ?? []), ...(m.roles as string[])];
  }

  return {
    seed,
    live: {
      statuses, clocks, events, reports, adjustments, starters, usages, audit,
      posts, predictions, playerTeams, captains, joinRequests, joinCodes,
      profiles, members, bans,
    },
    ids: {
      leagueId: league.id,
      matchByCode,
      teamByCode,
      playerByCode,
      venueByName,
      teamCardId,
    },
  };
}

// ————— الكتابة عبر بوابة live-write —————

/** إرسال عبر الطابور — لا يضيع شيء لو انقطعت الشبكة أثناء المباراة */
export function queueWrite(action: string, payload: unknown): void {
  enqueueWrite(action, payload);
}

async function gatewayFetch(
  path: string,
  body: unknown,
): Promise<{ status: number; body: { ok?: boolean; error?: string; [k: string]: unknown } | null }> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let parsed: { ok?: boolean; error?: string } | null = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

/**
 * إرسال عملية واحدة للبوابة (لطابور الكتابة). التمييز مهم: "offline" يُعاد
 * للأبد، و"reject" (وصل الخادم ورفض) يُعاد محدودًا ثم يُسقط.
 */
export async function liveWrite(action: string, payload: unknown): Promise<WriteResult> {
  let res: { status: number; body: { ok?: boolean; error?: string } | null };
  try {
    res = await gatewayFetch("live-write", { action, payload });
  } catch (e) {
    console.warn("live-write تعذّر الاتصال:", action, e);
    return "offline";
  }
  if (res.status > 500) return "offline";
  if (res.status >= 200 && res.status < 300 && res.body?.ok) return "ok";
  console.error("live-write رفض:", action, res.status, res.body?.error);
  return "reject";
}

/** نداء تفاعلي للبوابة يعيد رسالة الخطأ للواجهة (خارج الطابور) */
export async function liveCall(
  action: string,
  payload: unknown,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await gatewayFetch("live-write", { action, payload });
    if (res.status >= 200 && res.status < 300 && res.body?.ok) {
      return { ok: true, data: res.body as Record<string, unknown> };
    }
    return { ok: false, error: res.body?.error ?? `خطأ ${res.status}` };
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم" };
  }
}

/** نداء دالة الحسابات (تسجيل/إنشاء/إعادة تعيين) */
export async function accountsCall(
  action: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await gatewayFetch("accounts", { action, ...fields });
    if (res.status >= 200 && res.status < 300 && res.body?.ok) {
      return { ok: true, data: res.body as Record<string, unknown> };
    }
    return { ok: false, error: res.body?.error ?? `خطأ ${res.status}` };
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم" };
  }
}
