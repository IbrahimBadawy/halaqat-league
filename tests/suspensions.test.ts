import { describe, expect, it } from "vitest";
import { computeTeamSuspensions } from "../lib/discipline/suspensions";
import type { Match, MatchEvent } from "../lib/league/types";

function m(id: string, slot: string): Match {
  return {
    id,
    matchDay: "2026-08-21",
    slot,
    venue: "ملعب 1",
    stage: "group",
    round: 1,
    home: "A1",
    away: "A2",
  };
}

let n = 0;
function ev(
  matchId: string,
  playerId: string,
  type: "yellow" | "red",
  extra?: Partial<MatchEvent>,
): MatchEvent {
  n += 1;
  return {
    id: `e${n}`,
    matchId,
    teamCode: "A1",
    playerId,
    type,
    minute: 5,
    period: "first",
    value: 1,
    createdAt: n,
    ...extra,
  };
}

const THREE_MATCHES = (approved: boolean[]) =>
  [m("m1", "23:00"), m("m2", "23:40"), m("m3", "00:20")].map((match, i) => ({
    match,
    approved: approved[i],
  }));

describe("computeTeamSuspensions", () => {
  it("الطرد العادي (مؤقت أو باقي المباراة) لا يوقف أي مباراة تالية", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [
        ev("m1", "A1-4", "red", { penaltyScope: "minutes", penaltyMinutes: 2 }),
        ev("m1", "A1-5", "red", { penaltyScope: "match" }),
        ev("m1", "A1-6", "red"), // حدث قديم بلا عقوبة = باقي المباراة
      ],
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([]);
  });

  it("الطرد من الدوري = إيقاف كل المباريات التالية، نافذ قبل الاعتماد", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([false, false, false]), // لم تُعتمد بعد
      teamCode: "A1",
      events: [ev("m1", "A1-4", "red", { penaltyScope: "league" })],
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([
      { playerId: "A1-4", teamCode: "A1", forMatchId: "m2", reason: "مطرود من الدوري" },
      { playerId: "A1-4", teamCode: "A1", forMatchId: "m3", reason: "مطرود من الدوري" },
    ]);
  });

  it("إنذاران متراكمان عبر مباراتين = إيقاف", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, true, false]),
      teamCode: "A1",
      events: [ev("m1", "A1-4", "yellow"), ev("m2", "A1-4", "yellow")],
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([
      {
        playerId: "A1-4",
        teamCode: "A1",
        forMatchId: "m3",
        reason: "2 إنذارات متراكمة",
      },
    ]);
  });

  it("إنذارا مباراة الطرد (الإنذار الثاني) يُستهلكان ولا يدخلان التراكم ولا يوقفان", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, true, false]),
      teamCode: "A1",
      events: [
        ev("m1", "A1-4", "yellow"),
        ev("m1", "A1-4", "yellow"),
        ev("m1", "A1-4", "red", { subtype: "second_yellow", penaltyScope: "match" }),
        // إنذار في المباراة التالية — يبدأ التراكم من الصفر بعد الطرد
        ev("m2", "A1-4", "yellow"),
      ],
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([]);
  });

  it("المباريات غير المعتمدة لا تدخل حساب الإنذارات، والأحداث المحذوفة تُتجاهل حتى في طرد الدوري", () => {
    const deletedLeagueRed = {
      ...ev("m1", "A1-4", "red", { penaltyScope: "league" }),
      deleted: true,
    };
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [deletedLeagueRed, ev("m2", "A1-5", "yellow"), ev("m2", "A1-5", "yellow")], // m2 غير معتمدة
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([]);
  });

  it("إنذار واحد لا يوقف", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [ev("m1", "A1-4", "yellow")],
      yellowsForSuspension: 2,
    });
    expect(out).toEqual([]);
  });
});
