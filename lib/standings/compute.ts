// محرك الترتيب — دالة نقية بلا أي اعتماد على قاعدة بيانات أو واجهة.
// النتيجة تُشتق من أحداث الأهداف (مجموع value لكل فريق)، والترتيب يطبق
// معايير كسر التعادل بالترتيب المُعد في قواعد الدوري.

import type {
  DerivedScore,
  LeagueRules,
  Match,
  MatchEvent,
  StandingAdjustment,
  StandingRow,
  Team,
  Tiebreaker,
} from "../league/types";

/** مجموع قيم أهداف كل فريق في مباراة من أحداثها (يتجاهل المحذوف) */
/**
 * نسخة من المباراة بأطراف محلولة لأكواد فرق حقيقية. أحداث المباراة تحمل كود
 * الفريق دائمًا، بينما أطراف الإقصائيات رموز (1A / W_semi_1) — فبدون الحل
 * تخرج كل نتائج الإقصاء 0-0، ومعها لا يُحسم فائز فلا يتحدد النهائي ولا الثالث.
 * `resolve` يرجع كود الفريق للرمز إن أمكن حسمه، وإلا undefined.
 */
export function resolveMatchSides(
  match: Match,
  resolve: (raw: string) => string | undefined,
): Match {
  if (match.stage === "group") return match;
  const home = resolve(match.home) ?? match.home;
  const away = resolve(match.away) ?? match.away;
  return home === match.home && away === match.away ? match : { ...match, home, away };
}

export function deriveScore(match: Match, events: MatchEvent[]): DerivedScore {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.matchId !== match.id || e.deleted || e.type !== "goal") continue;
    if (e.teamCode === match.home) home += e.value;
    else if (e.teamCode === match.away) away += e.value;
  }
  return { home, away };
}

interface ComputeInput {
  teams: Team[]; // فرق مجموعة واحدة
  matches: Match[]; // مباريات المجموعات المعتمدة فقط تُحتسب
  events: MatchEvent[];
  adjustments: StandingAdjustment[];
  rules: LeagueRules;
}

function emptyRow(teamCode: string): StandingRow {
  return {
    teamCode,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    adjustments: 0,
    fairPlayPenalty: 0,
    form: [],
    rank: 0,
  };
}

/**
 * ترتيب مجموعة واحدة. تُحتسب فقط المباريات المُمرَّرة (يفترض المستدعي أنها
 * المعتمدة) التي يلعب فيها فريقان من نفس المجموعة.
 */
export function computeStandings(input: ComputeInput): StandingRow[] {
  const { teams, matches, events, adjustments, rules } = input;
  const codes = new Set(teams.map((t) => t.code));
  const rows = new Map<string, StandingRow>(
    teams.map((t) => [t.code, emptyRow(t.code)]),
  );

  const played = matches.filter(
    (m) => codes.has(m.home) && codes.has(m.away) && m.stage === "group",
  );

  for (const m of played) {
    const score = deriveScore(m, events);
    const home = rows.get(m.home)!;
    const away = rows.get(m.away)!;
    home.played++;
    away.played++;
    home.gf += score.home;
    home.ga += score.away;
    away.gf += score.away;
    away.ga += score.home;
    if (score.home > score.away) {
      home.won++;
      away.lost++;
      home.points += rules.points.win;
      away.points += rules.points.loss;
      home.form.push("W");
      away.form.push("L");
    } else if (score.home < score.away) {
      away.won++;
      home.lost++;
      away.points += rules.points.win;
      home.points += rules.points.loss;
      away.form.push("W");
      home.form.push("L");
    } else {
      home.drawn++;
      away.drawn++;
      home.points += rules.points.draw;
      away.points += rules.points.draw;
      home.form.push("D");
      away.form.push("D");
    }
  }

  // اللعب النظيف: إنذار = 1 نقطة خصم، طرد = 3 (الأقل أفضل)
  for (const e of events) {
    if (e.deleted) continue;
    const row = rows.get(e.teamCode);
    if (!row) continue;
    const isGroupMatch = played.some((m) => m.id === e.matchId);
    if (!isGroupMatch) continue;
    if (e.type === "yellow") row.fairPlayPenalty += 1;
    if (e.type === "red") row.fairPlayPenalty += 3;
  }

  for (const adj of adjustments) {
    const row = rows.get(adj.teamCode);
    if (!row) continue;
    row.adjustments += adj.points;
    row.points += adj.points;
  }

  for (const row of rows.values()) row.gd = row.gf - row.ga;

  const sorted = sortWithTiebreakers(
    [...rows.values()],
    played,
    events,
    rules.tiebreakers,
  );
  sorted.forEach((r, i) => (r.rank = i + 1));
  return sorted;
}

/** مقارنة ضمن المتعادلين بالمواجهات المباشرة (نقاط المواجهات ثم فارقها) */
function headToHeadCompare(
  tied: StandingRow[],
  matches: Match[],
  events: MatchEvent[],
  rules: LeagueRules,
): Map<string, number> {
  const codes = new Set(tied.map((r) => r.teamCode));
  const mini = new Map<string, { pts: number; gd: number }>(
    tied.map((r) => [r.teamCode, { pts: 0, gd: 0 }]),
  );
  for (const m of matches) {
    if (!codes.has(m.home) || !codes.has(m.away)) continue;
    const s = deriveScore(m, events);
    const h = mini.get(m.home)!;
    const a = mini.get(m.away)!;
    h.gd += s.home - s.away;
    a.gd += s.away - s.home;
    if (s.home > s.away) h.pts += 3;
    else if (s.home < s.away) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  }
  // درجة مركبة للمقارنة
  const scoreOf = new Map<string, number>();
  for (const [code, v] of mini) scoreOf.set(code, v.pts * 1000 + v.gd);
  void rules;
  return scoreOf;
}

function sortWithTiebreakers(
  rows: StandingRow[],
  matches: Match[],
  events: MatchEvent[],
  tiebreakers: Tiebreaker[],
): StandingRow[] {
  const compare = (a: StandingRow, b: StandingRow): number => {
    for (const tb of tiebreakers) {
      let diff = 0;
      switch (tb) {
        case "points":
          diff = b.points - a.points;
          break;
        case "goal_difference":
          diff = b.gd - a.gd;
          break;
        case "goals_for":
          diff = b.gf - a.gf;
          break;
        case "fair_play":
          diff = a.fairPlayPenalty - b.fairPlayPenalty; // الأقل خصمًا أولًا
          break;
        case "head_to_head": {
          // تُحسب على مجموعة المتعادلين نقاطًا فقط
          const tiedGroup = rows.filter((r) => r.points === a.points);
          if (tiedGroup.length < 2) break;
          const h2h = headToHeadCompare(
            tiedGroup,
            matches,
            events,
            {} as LeagueRules,
          );
          diff = (h2h.get(b.teamCode) ?? 0) - (h2h.get(a.teamCode) ?? 0);
          if (diff !== 0) {
            a.tiebreakNote = "المواجهات المباشرة";
            b.tiebreakNote = "المواجهات المباشرة";
          }
          break;
        }
        case "draw":
          diff = a.teamCode.localeCompare(b.teamCode);
          break;
      }
      if (diff !== 0) return diff;
    }
    return 0;
  };
  return [...rows].sort(compare);
}
