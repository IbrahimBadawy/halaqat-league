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
function ev(matchId: string, playerId: string, type: "yellow" | "red", subtype?: string): MatchEvent {
  n += 1;
  return {
    id: `e${n}`,
    matchId,
    teamCode: "A1",
    playerId,
    type,
    subtype,
    minute: 5,
    period: "first",
    value: 1,
    createdAt: n,
  };
}

const THREE_MATCHES = (approved: boolean[]) =>
  [m("m1", "23:00"), m("m2", "23:40"), m("m3", "00:20")].map((match, i) => ({
    match,
    approved: approved[i],
  }));

describe("computeTeamSuspensions", () => {
  it("الطرد = إيقاف المباراة التالية", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [ev("m1", "A1-4", "red")],
      yellowsForSuspension: 2,
      redSuspensionMatches: 1,
    });
    expect(out).toEqual([
      { playerId: "A1-4", teamCode: "A1", forMatchId: "m2", reason: "طرد" },
    ]);
  });

  it("إنذاران متراكمان عبر مباراتين = إيقاف", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, true, false]),
      teamCode: "A1",
      events: [ev("m1", "A1-4", "yellow"), ev("m2", "A1-4", "yellow")],
      yellowsForSuspension: 2,
      redSuspensionMatches: 1,
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

  it("إنذاران في نفس المباراة مع طرد (إنذار ثانٍ) = إيقاف طرد واحد فقط بلا تراكم", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, true, false]),
      teamCode: "A1",
      events: [
        ev("m1", "A1-4", "yellow"),
        ev("m1", "A1-4", "yellow"),
        ev("m1", "A1-4", "red", "second_yellow"),
      ],
      yellowsForSuspension: 2,
      redSuspensionMatches: 1,
    });
    expect(out).toEqual([
      { playerId: "A1-4", teamCode: "A1", forMatchId: "m2", reason: "طرد" },
    ]);
  });

  it("المباريات غير المعتمدة لا تدخل الحساب، والأحداث المحذوفة تُتجاهل", () => {
    const deleted = { ...ev("m1", "A1-4", "red"), deleted: true };
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [deleted, ev("m2", "A1-5", "red")], // m2 غير معتمدة
      yellowsForSuspension: 2,
      redSuspensionMatches: 1,
    });
    expect(out).toEqual([]);
  });

  it("إنذار واحد لا يوقف", () => {
    const out = computeTeamSuspensions({
      teamMatches: THREE_MATCHES([true, false, false]),
      teamCode: "A1",
      events: [ev("m1", "A1-4", "yellow")],
      yellowsForSuspension: 2,
      redSuspensionMatches: 1,
    });
    expect(out).toEqual([]);
  });
});
