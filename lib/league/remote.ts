// طبقة Supabase البعيدة — جلب بيانات الدوري وتحويلها إلى نفس أشكال المخزن
// المحلي (LeagueSeed + حالة حية بمفاتيح الأكواد m1../A1../A1-4)، بحيث لا
// تتغير أي صفحة. الكتابة كلها تمر عبر Edge Function واحدة (live-write)
// بتحقق PIN — الـ RLS يبقى مقفولًا للكتابة المباشرة.

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

const APP_STATUSES: MatchStatus[] = [
  "scheduled",
  "live",
  "half_time",
  "finished",
  "approved",
];

const DEFAULT_RULES: LeagueRules = {
  points: { win: 3, draw: 1, loss: 0 },
  halves: 2,
  half_minutes: 8,
  slot_minutes: 20,
  final_duration_override_minutes: 30,
  substitutions: "unlimited",
  tiebreakers: ["points", "head_to_head", "goal_difference", "goals_for", "fair_play", "draw"],
  yellow_cards_for_suspension: 2,
  red_card_suspension_matches: 1,
};

export async function fetchRemote(): Promise<RemoteSnapshot> {
  const [
    leagueQ,
    venuesQ,
    availQ,
    teamsQ,
    playersQ,
    stagesQ,
    matchesQ,
    eventsQ,
    reportsQ,
    lineupsQ,
    adjQ,
    templatesQ,
    teamCardsQ,
    usagesQ,
    auditQ,
    postsQ,
    predictionsQ,
  ] = await Promise.all([
    supabase.from("leagues").select("*").limit(1).single(),
    supabase.from("venues").select("*"),
    supabase.from("venue_availability").select("*"),
    supabase.from("teams").select("*").order("short_code"),
    supabase.from("players").select("*").order("shirt_number"),
    supabase.from("stages").select("*"),
    supabase.from("matches").select("*"),
    supabase.from("match_events").select("*").order("created_at"),
    supabase.from("match_reports").select("*"),
    supabase.from("match_lineups").select("*").eq("is_starter", true),
    supabase.from("standing_adjustments").select("*").order("created_at"),
    supabase.from("power_card_templates").select("*"),
    supabase.from("team_cards").select("*"),
    supabase.from("card_usages").select("*").order("created_at"),
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("predictions").select("*").eq("device_key", deviceKey()),
  ]);

  for (const q of [
    leagueQ, venuesQ, availQ, teamsQ, playersQ, stagesQ, matchesQ, eventsQ,
    reportsQ, lineupsQ, adjQ, templatesQ, teamCardsQ, usagesQ, auditQ,
    postsQ, predictionsQ,
  ]) {
    if (q.error) throw q.error;
  }

  const league = leagueQ.data!;
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
      // الليلة تُشتق من اليوم المنطقي (لا نعتمد round_no المخزن بعد إعادة الجدولة)
      round: matchDays.indexOf(m.match_day) + 1 || m.round_no,
      home: m.home_side,
      away: m.away_side,
      durationOverrideMinutes: m.duration_override_minutes ?? undefined,
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

  return {
    seed,
    live: {
      statuses, clocks, events, reports, adjustments, starters, usages, audit,
      posts, predictions,
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

/**
 * إرسال عملية واحدة للبوابة. التمييز مهم للطابور: "offline" يُعاد للأبد،
 * و"reject" (وصل الخادم ورفض) يُعاد محدودًا ثم يُسقط.
 */
export async function liveWrite(action: string, payload: unknown): Promise<WriteResult> {
  let res: Response;
  // توكن الجلسة يحدد الصلاحية في البوابة — الزائر بلا توكن يكتب الأفعال العامة فقط
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/live-write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch (e) {
    // فشل شبكة/DNS/انقطاع — لم يصل الطلب أصلًا
    console.warn("live-write تعذّر الاتصال:", action, e);
    return "offline";
  }
  // 5xx قد يكون عطلًا عابرًا في البنية التحتية قبل وصول الطلب لمنطقنا
  if (res.status >= 500 && res.status !== 500) return "offline";
  let body: { ok?: boolean; error?: string } | null = null;
  try {
    body = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    body = null;
  }
  if (res.ok && body?.ok) return "ok";
  console.error("live-write رفض:", action, res.status, body?.error);
  return "reject";
}
