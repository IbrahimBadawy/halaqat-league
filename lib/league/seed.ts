import seedJson from "@/data/first-league.json";
import type {
  GroupCode,
  LeagueRules,
  Match,
  Player,
  PowerCard,
  StageKind,
  Team,
  VenueDef,
} from "./types";

interface SeedFixture {
  match_day: string;
  slot: string;
  venue: string;
  home: string;
  away: string;
  stage?: string;
  duration_override_minutes?: number;
  halves_override?: number;
}

export interface LeagueSeed {
  slug: string;
  name: string;
  slogan: string;
  slogans: string[];
  rules: LeagueRules;
  matchDays: string[];
  slots: string[];
  /** فترات الشبكة + أي فترات خاصة في جدول الـ seed (مثل نهائي 00:30) — مرتبة زمنيًا */
  allSlots: string[];
  venues: VenueDef[];
  teams: Team[];
  players: Player[];
  matches: Match[];
  powerCards: PowerCard[];
  qualifyPerGroup: number;
}

function buildPlayers(teams: Team[], perTeam: number): Player[] {
  const players: Player[] = [];
  for (const t of teams) {
    for (let n = 1; n <= perTeam; n++) {
      players.push({
        id: `${t.code}-${n}`,
        teamCode: t.code,
        shirt: n,
        name: n === 1 ? "الحارس" : `لاعب ${n}`,
        position: n === 1 ? "حارس" : "لاعب",
      });
    }
  }
  return players;
}

function stageOf(f: SeedFixture): StageKind {
  if (!f.stage) return "group";
  return f.stage as StageKind;
}

export function loadSeed(): LeagueSeed {
  const s = seedJson as unknown as {
    league: {
      slug: string;
      name: string;
      slogan: string;
      rules: LeagueRules;
    };
    match_days: string[];
    slots: string[];
    venues: VenueDef[];
    teams: { group: GroupCode; code: string; name: string }[];
    players_per_team_placeholder: number;
    fixtures: SeedFixture[];
    power_cards: PowerCard[];
    slogans: string[];
    format: { stages: { type: string; qualify_per_group?: number }[] };
  };

  const teams: Team[] = s.teams.map((t) => ({
    code: t.code,
    name: t.name,
    group: t.group,
  }));

  const dayIndex = new Map(s.match_days.map((d, i) => [d, i + 1]));

  const matches: Match[] = s.fixtures.map((f, i) => ({
    id: `m${i + 1}`,
    matchDay: f.match_day,
    slot: f.slot,
    venue: f.venue,
    stage: stageOf(f),
    round: dayIndex.get(f.match_day) ?? 0,
    home: f.home,
    away: f.away,
    durationOverrideMinutes: f.duration_override_minutes,
    halvesOverride: f.halves_override,
  }));

  const groupsStage = s.format.stages.find((st) => st.type === "groups");

  const allSlots = [...new Set([...s.slots, ...matches.map((m) => m.slot)])].sort(
    (a, b) => slotToMinutes(a) - slotToMinutes(b),
  );

  return {
    slug: s.league.slug,
    name: s.league.name,
    slogan: s.league.slogan,
    slogans: s.slogans,
    rules: s.league.rules,
    matchDays: s.match_days,
    slots: s.slots,
    allSlots,
    venues: s.venues,
    teams,
    players: buildPlayers(teams, s.players_per_team_placeholder),
    matches,
    powerCards: s.power_cards,
    qualifyPerGroup: groupsStage?.qualify_per_group ?? 2,
  };
}

/**
 * دقائق الفترة منذ بداية الليلة (23:00 = 0). الفترات بعد منتصف الليل تتبع
 * ليلتها فتأخذ قيمًا أكبر — يُستخدم للترتيب ولحساب الفجوات الزمنية حتى مع
 * فترات خارج الشبكة القياسية (مثل نهائي 00:30).
 */
export function slotToMinutes(slot: string): number {
  const [h, mm] = slot.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(mm)) return 9999;
  return h >= 20 ? h * 60 + mm - 23 * 60 : h * 60 + mm + 60;
}

/** تنسيق عرض ليلة المباريات: "الجمعة 21/8" */
export function formatNight(matchDay: string): string {
  const [, m, d] = matchDay.split("-").map(Number);
  return `الجمعة ${d}/${m}`;
}

/** تنسيق الفترة للعرض: "11:00 PM" / "12:20 AM" */
export function formatSlot(slot: string): string {
  const [h, mm] = slot.split(":").map(Number);
  if (h >= 13) return `${h - 12}:${String(mm).padStart(2, "0")} PM`;
  if (h === 12) return `12:${String(mm).padStart(2, "0")} PM`;
  if (h === 0) return `12:${String(mm).padStart(2, "0")} AM`;
  return `${h}:${String(mm).padStart(2, "0")} AM`;
}

export const STAGE_LABELS: Record<StageKind, string> = {
  group: "دور المجموعات",
  semi_1: "نصف النهائي 1",
  semi_2: "نصف النهائي 2",
  third_place: "المركز الثالث",
  final: "النهائي",
};
