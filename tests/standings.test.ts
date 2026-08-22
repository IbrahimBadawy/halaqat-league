import { describe, expect, it } from "vitest";
import { computeStandings, deriveScore, resolveMatchSides } from "../lib/standings/compute";
import type {
  LeagueRules,
  Match,
  MatchEvent,
  Team,
} from "../lib/league/types";

const rules: LeagueRules = {
  points: { win: 3, draw: 1, loss: 0 },
  halves: 2,
  half_minutes: 8,
  slot_minutes: 20,
  final_duration_override_minutes: 30,
  substitutions: "unlimited",
  tiebreakers: [
    "points",
    "head_to_head",
    "goal_difference",
    "goals_for",
    "fair_play",
    "draw",
  ],
  yellow_cards_for_suspension: 2,
  red_card_suspension_matches: 1,
};

const teams: Team[] = [
  { code: "A1", name: "فؤش", group: "A" },
  { code: "A2", name: "زيد", group: "A" },
  { code: "A3", name: "غراب", group: "A" },
];

function match(id: string, home: string, away: string): Match {
  return {
    id,
    matchDay: "2026-08-21",
    slot: "23:00",
    venue: "ملعب 1",
    stage: "group",
    round: 1,
    home,
    away,
  };
}

let n = 0;
function goal(matchId: string, teamCode: string, value = 1): MatchEvent {
  n += 1;
  return {
    id: `e${n}`,
    matchId,
    teamCode,
    type: "goal",
    minute: 5,
    period: "first",
    value,
    createdAt: n,
  };
}

function yellow(matchId: string, teamCode: string): MatchEvent {
  n += 1;
  return {
    id: `e${n}`,
    matchId,
    teamCode,
    type: "yellow",
    minute: 5,
    period: "first",
    value: 1,
    createdAt: n,
  };
}

describe("deriveScore", () => {
  it("يشتق النتيجة من مجموع قيم الأهداف — كارت الهدف بهدفين value=2", () => {
    const m = match("m1", "A1", "A2");
    const events = [goal("m1", "A1"), goal("m1", "A1", 2), goal("m1", "A2")];
    expect(deriveScore(m, events)).toEqual({ home: 3, away: 1 });
  });

  it("يتجاهل الأحداث المحذوفة", () => {
    const m = match("m1", "A1", "A2");
    const events = [goal("m1", "A1"), { ...goal("m1", "A1"), deleted: true }];
    expect(deriveScore(m, events)).toEqual({ home: 1, away: 0 });
  });
});

describe("computeStandings", () => {
  it("يحسب النقاط ويقدّم الفائز بالمواجهة المباشرة عند التعادل", () => {
    // A1 يفوز 2-0 على A2 · A3 يفوز 1-0 على A1
    // A1 وA3 كلاهما 3 نقاط وفارق +1 — المواجهة المباشرة لصالح A3
    const matches = [match("m1", "A1", "A2"), match("m2", "A1", "A3")];
    const events = [goal("m1", "A1"), goal("m1", "A1"), goal("m2", "A3")];
    const rows = computeStandings({ teams, matches, events, adjustments: [], rules });
    expect(rows.map((r) => r.teamCode)).toEqual(["A3", "A1", "A2"]);
    expect(rows[0].points).toBe(3);
  });

  it("المواجهات المباشرة تفصل بين متعادلَين بالنقاط", () => {
    // A1 يفوز على A2 بفارق كبير، A2 يفوز على A1؟ لا — دوري ذهاب:
    // A1 يفوز A3 4-0 · A2 يفوز A3 1-0 · A2 يفوز A1 1-0
    // A1: 3 نقاط gd=+3 · A2: 6 نقاط · A3: 0
    const matches = [
      match("m1", "A1", "A3"),
      match("m2", "A2", "A3"),
      match("m3", "A2", "A1"),
    ];
    const events = [
      goal("m1", "A1"),
      goal("m1", "A1"),
      goal("m1", "A1"),
      goal("m1", "A1"),
      goal("m2", "A2"),
      goal("m3", "A2"),
    ];
    const rows = computeStandings({ teams, matches, events, adjustments: [], rules });
    expect(rows.map((r) => r.teamCode)).toEqual(["A2", "A1", "A3"]);
    expect(rows[0].points).toBe(6);
  });

  it("تعديلات النقاط تُطبَّق وتظهر", () => {
    const matches = [match("m1", "A1", "A2")];
    const events = [goal("m1", "A1")];
    const rows = computeStandings({
      teams,
      matches,
      events,
      adjustments: [{ teamCode: "A1", points: -2, reason: "انضباط", source: "discipline" }],
      rules,
    });
    const a1 = rows.find((r) => r.teamCode === "A1")!;
    expect(a1.points).toBe(1); // 3 - 2
    expect(a1.adjustments).toBe(-2);
  });

  it("اللعب النظيف يفصل عند تساوي كل شيء", () => {
    // تعادل 1-1 بين A1 وA2، وA2 عليه إنذار
    const matches = [match("m1", "A1", "A2")];
    const events = [goal("m1", "A1"), goal("m1", "A2"), yellow("m1", "A2")];
    const twoTeams = teams.filter((t) => t.code !== "A3");
    const rows = computeStandings({ teams: twoTeams, matches, events, adjustments: [], rules });
    expect(rows[0].teamCode).toBe("A1");
    expect(rows[1].fairPlayPenalty).toBe(1);
  });
});

describe("resolveMatchSides — أطراف الإقصائيات قبل اشتقاق النتيجة", () => {
  const semi: Match = {
    ...match("m21", "1A", "2B"),
    stage: "semi_1",
    matchDay: "2026-09-11",
  };
  const events = [goal("m21", "A1"), goal("m21", "A1"), goal("m21", "B2")];
  const resolve = (raw: string) =>
    ({ "1A": "A1", "2B": "B2" } as Record<string, string>)[raw];

  it("بلا حلّ الرموز تخرج النتيجة 0-0 (الأحداث بأكواد الفرق لا بالرموز)", () => {
    expect(deriveScore(semi, events)).toEqual({ home: 0, away: 0 });
  });

  it("بعد الحل تُشتق النتيجة الصحيحة", () => {
    expect(deriveScore(resolveMatchSides(semi, resolve), events)).toEqual({
      home: 2,
      away: 1,
    });
  });

  it("رمز لم يُحسم بعد يبقى كما هو بلا انهيار", () => {
    const pending = resolveMatchSides(semi, () => undefined);
    expect(pending.home).toBe("1A");
    expect(deriveScore(pending, events)).toEqual({ home: 0, away: 0 });
  });

  it("مباريات المجموعات تمر كما هي (نفس المرجع)", () => {
    const g = match("m1", "A1", "A2");
    expect(resolveMatchSides(g, () => "X9")).toBe(g);
  });
});
