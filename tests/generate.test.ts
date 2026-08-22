import { describe, expect, it } from "vitest";
import { generateFixtures, roundRobinPairs } from "../lib/scheduling/generate";
import { checkScheduleConflicts, structuralSideTokens } from "../lib/scheduling/conflicts";
import type { Match, VenueDef } from "../lib/league/types";

describe("roundRobinPairs", () => {
  it("4 فرق: 3 جولات × مباراتان، كل فريق مرة في الجولة، كل زوج مرة واحدة", () => {
    const rounds = roundRobinPairs(["T1", "T2", "T3", "T4"]);
    expect(rounds).toHaveLength(3);
    const seen = new Set<string>();
    for (const round of rounds) {
      expect(round).toHaveLength(2);
      const inRound = new Set<string>();
      for (const [h, a] of round) {
        expect(inRound.has(h)).toBe(false);
        expect(inRound.has(a)).toBe(false);
        inRound.add(h);
        inRound.add(a);
        seen.add([h, a].sort().join("|"));
      }
    }
    expect(seen.size).toBe(6);
  });

  it("عدد فردي (5 فرق): 10 مباريات فريدة عبر 5 جولات", () => {
    const rounds = roundRobinPairs(["a", "b", "c", "d", "e"]);
    expect(rounds).toHaveLength(5);
    const all = rounds.flat();
    expect(all).toHaveLength(10);
    expect(new Set(all.map((p) => [...p].sort().join("|"))).size).toBe(10);
  });
});

describe("generateFixtures", () => {
  const DAYS = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"];
  const SLOTS = ["23:00", "23:20", "23:40", "00:00", "00:20", "00:40"];

  it("حالة الدوري الحقيقي: مجموعتان ×5 وملعبان — 20 مباراة مجموعات + 4 إقصائيات بلا تعارض", () => {
    const { fixtures, unscheduled } = generateFixtures({
      groups: [
        { name: "A", teamCodes: ["A1", "A2", "A3", "A4", "A5"] },
        { name: "B", teamCodes: ["B1", "B2", "B3", "B4", "B5"] },
      ],
      matchDays: DAYS,
      slots: SLOTS,
      venues: ["ملعب 1", "ملعب 2"],
      knockout: true,
    });
    expect(unscheduled).toBe(0);
    expect(fixtures.filter((f) => f.stage === "group")).toHaveLength(20);
    expect(fixtures).toHaveLength(24);

    // كل زوج داخل المجموعة مرة واحدة بالظبط
    const pairs = new Set(
      fixtures.filter((f) => f.stage === "group").map((f) => [f.home, f.away].sort().join("|")),
    );
    expect(pairs.size).toBe(20);

    // لا أي تعارض وفق محرك القيود نفسه (الملاعب متاحة دائمًا هنا)
    const venues: VenueDef[] = [
      { name: "ملعب 1", availability: "all_slots" },
      { name: "ملعب 2", availability: "all_slots" },
    ];
    const matches: Match[] = fixtures.map((f, i) => ({
      id: `m${i + 1}`,
      matchDay: f.day,
      slot: f.slot,
      venue: f.venue,
      stage: f.stage,
      round: DAYS.indexOf(f.day) + 1,
      home: f.home,
      away: f.away,
    }));
    const conflicts = checkScheduleConflicts(matches, venues, SLOTS, structuralSideTokens(matches));
    expect(conflicts).toEqual([]);
  });

  it("سعة غير كافية تُبلَّغ ولا تُبتلع: ملعب واحد ويوم واحد لا يسع 20 مباراة", () => {
    const { fixtures, unscheduled } = generateFixtures({
      groups: [
        { name: "A", teamCodes: ["A1", "A2", "A3", "A4", "A5"] },
        { name: "B", teamCodes: ["B1", "B2", "B3", "B4", "B5"] },
      ],
      matchDays: [DAYS[0]],
      slots: SLOTS,
      venues: ["ملعب 1"],
      knockout: false,
    });
    expect(fixtures.length + unscheduled).toBe(20);
    expect(unscheduled).toBeGreaterThan(0);
  });

  it("مجموعة واحدة من 4 فرق بلا إقصائيات: 6 مباريات وكل الفرق ملتزمة بقاعدة الفجوة", () => {
    const { fixtures, unscheduled } = generateFixtures({
      groups: [{ name: "A", teamCodes: ["A1", "A2", "A3", "A4"] }],
      matchDays: [DAYS[0], DAYS[1]],
      slots: SLOTS.slice(0, 4),
      venues: ["ملعب 1"],
      knockout: false,
    });
    expect(unscheduled).toBe(0);
    expect(fixtures).toHaveLength(6);
    const venues: VenueDef[] = [{ name: "ملعب 1", availability: "all_slots" }];
    const matches: Match[] = fixtures.map((f, i) => ({
      id: `m${i + 1}`,
      matchDay: f.day,
      slot: f.slot,
      venue: f.venue,
      stage: f.stage,
      round: 1,
      home: f.home,
      away: f.away,
    }));
    expect(checkScheduleConflicts(matches, venues, SLOTS.slice(0, 4))).toEqual([]);
  });
});
