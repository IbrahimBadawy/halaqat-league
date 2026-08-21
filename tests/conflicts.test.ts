import { describe, expect, it } from "vitest";
import {
  checkScheduleConflicts,
  conflictsFor,
  isVenueAvailable,
  structuralSideTokens,
  suggestNearestSlot,
} from "../lib/scheduling/conflicts";
import type { Match, VenueDef } from "../lib/league/types";

// يطابق إتاحة الـ seed الحقيقي: ملعب 2 ليلة 4/9 (فترتان) وليلة 11/9 (نصفا النهائي)
const VENUES: VenueDef[] = [
  { name: "ملعب 1", availability: "all_slots" },
  {
    name: "ملعب 2",
    availability: [
      { date: "2026-09-04", slots: ["23:40", "00:00"] },
      { date: "2026-09-11", slots: ["23:00"] },
    ],
  },
];

const SLOTS = ["23:00", "23:20", "23:40", "00:00", "00:20", "00:40"];
const DAYS = ["2026-08-21", "2026-08-28", "2026-09-04", "2026-09-11"];

function m(id: string, matchDay: string, slot: string, venue: string, home: string, away: string): Match {
  return { id, matchDay, slot, venue, stage: "group", round: 1, home, away };
}

describe("isVenueAvailable", () => {
  it("ملعب 1 متاح دائمًا وملعب 2 فقط ليلة 4/9 في فترتيه", () => {
    expect(isVenueAvailable(VENUES, "ملعب 1", "2026-08-21", "23:00")).toBe(true);
    expect(isVenueAvailable(VENUES, "ملعب 2", "2026-09-04", "23:40")).toBe(true);
    expect(isVenueAvailable(VENUES, "ملعب 2", "2026-09-04", "23:00")).toBe(false);
    expect(isVenueAvailable(VENUES, "ملعب 2", "2026-08-21", "23:40")).toBe(false);
  });
});

describe("checkScheduleConflicts", () => {
  it("جدول الدوري الحقيقي ليلة 4/9 (مباريات متوازية على ملعبين) بلا تعارض", () => {
    const night = [
      m("m13", "2026-09-04", "23:00", "ملعب 1", "A1", "A4"),
      m("m14", "2026-09-04", "23:20", "ملعب 1", "B1", "B4"),
      m("m15", "2026-09-04", "23:40", "ملعب 1", "A3", "A4"),
      m("m16", "2026-09-04", "23:40", "ملعب 2", "A2", "A5"),
      m("m17", "2026-09-04", "00:00", "ملعب 1", "B3", "B4"),
      m("m18", "2026-09-04", "00:00", "ملعب 2", "B2", "B5"),
      m("m19", "2026-09-04", "00:20", "ملعب 1", "A3", "A5"),
      m("m20", "2026-09-04", "00:40", "ملعب 1", "B3", "B5"),
    ];
    expect(checkScheduleConflicts(night, VENUES, SLOTS)).toEqual([]);
  });

  it("يكتشف ملعبًا محجوزًا مرتين في نفس الفترة", () => {
    const conflicts = checkScheduleConflicts(
      [
        m("a", "2026-08-21", "23:00", "ملعب 1", "A1", "A2"),
        m("b", "2026-08-21", "23:00", "ملعب 1", "B1", "B2"),
      ],
      VENUES,
      SLOTS,
    );
    expect(conflicts.some((c) => c.kind === "venue_double_booked")).toBe(true);
  });

  it("مباراتان في نفس الفترة على ملعبين مختلفين = مسموح (مع تحذير الإتاحة فقط لو الملعب غير متاح)", () => {
    const conflicts = checkScheduleConflicts(
      [
        m("a", "2026-09-04", "23:40", "ملعب 1", "A1", "A2"),
        m("b", "2026-09-04", "23:40", "ملعب 2", "B1", "B2"),
      ],
      VENUES,
      SLOTS,
    );
    expect(conflicts).toEqual([]);
  });

  it("يكتشف فريقًا في مباراتين بنفس الفترة وفجوة غير كافية", () => {
    const sameSlot = checkScheduleConflicts(
      [
        m("a", "2026-08-21", "23:00", "ملعب 1", "A1", "A2"),
        m("b", "2026-08-21", "23:00", "ملعب 2", "A1", "A3"),
      ],
      VENUES,
      SLOTS,
    );
    expect(sameSlot.some((c) => c.kind === "team_double_booked")).toBe(true);

    const adjacent = checkScheduleConflicts(
      [
        m("a", "2026-08-21", "23:00", "ملعب 1", "A1", "A2"),
        m("b", "2026-08-21", "23:20", "ملعب 1", "A1", "A3"),
      ],
      VENUES,
      SLOTS,
    );
    expect(adjacent.some((c) => c.kind === "team_gap_too_small")).toBe(true);

    // فجوة فترة واحدة (23:00 ثم 23:40) صحيحة
    const ok = checkScheduleConflicts(
      [
        m("a", "2026-08-21", "23:00", "ملعب 1", "A1", "A2"),
        m("b", "2026-08-21", "23:40", "ملعب 1", "A1", "A3"),
      ],
      VENUES,
      SLOTS,
    );
    expect(ok.filter((c) => c.kind === "team_gap_too_small")).toEqual([]);
  });

  it("رموز الإقصائيات غير المحلولة تُفحص برموزها (نصفا النهائي معًا على ملعبين صالحان)", () => {
    const semis = [
      { ...m("s1", "2026-09-11", "23:00", "ملعب 1", "1A", "2B"), stage: "semi_1" as const },
      { ...m("s2", "2026-09-11", "23:00", "ملعب 2", "1B", "2A"), stage: "semi_2" as const },
    ];
    expect(checkScheduleConflicts(semis, VENUES, SLOTS)).toEqual([]);
  });
});

describe("structuralSideTokens — تبعية النهائي والمركز الثالث على نصفَي النهائي", () => {
  /** ليلة إقصائيات كاملة بفترات قابلة للتعديل لكل حالة */
  const knockoutNight = (thirdSlot: string, finalSlot: string, semi1Slot = "23:00"): Match[] => [
    { ...m("s1", "2026-09-11", semi1Slot, "ملعب 1", "1A", "2B"), stage: "semi_1" as const },
    { ...m("s2", "2026-09-11", "23:00", "ملعب 2", "1B", "2A"), stage: "semi_2" as const },
    { ...m("tp", "2026-09-11", thirdSlot, "ملعب 1", "L_semi_1", "L_semi_2"), stage: "third_place" as const },
    { ...m("f", "2026-09-11", finalSlot, "ملعب 1", "W_semi_1", "W_semi_2"), stage: "final" as const },
  ];
  const check = (ms: Match[]) =>
    checkScheduleConflicts(ms, VENUES, SLOTS, structuralSideTokens(ms));

  it("جدول الإقصائيات الحقيقي (ثالث 00:00، نهائي 00:30) بلا أي تعارض", () => {
    // فائز النصف وخاسره لا يمكن أن يكونا نفس الفريق — النهائي × الثالث لا يتعارضان
    expect(check(knockoutNight("00:00", "00:30"))).toEqual([]);
  });

  it("النهائي في نفس فترة نصف النهائي = متأهل محتمل في مباراتين", () => {
    const conflicts = check(knockoutNight("00:00", "23:00"));
    expect(
      conflictsFor(conflicts, "f").some((c) => c.kind === "team_double_booked"),
    ).toBe(true);
  });

  it("الفجوات بالدقائق: نهائي 00:30 بعد نصف نهائي 00:00 = فجوة 30 دقيقة غير كافية", () => {
    const conflicts = check(knockoutNight("23:40", "00:30", "00:00"));
    expect(
      conflictsFor(conflicts, "f").some((c) => c.kind === "team_gap_too_small"),
    ).toBe(true);
  });

  it("التوسع التخميني لا يدخل حد مباريات الليلة (ثالث + نهائي لا يعدّان مرتين)", () => {
    const conflicts = check(knockoutNight("00:00", "00:30"));
    expect(conflicts.filter((c) => c.kind === "team_over_night_limit")).toEqual([]);
  });
});

describe("suggestNearestSlot", () => {
  it("يقترح أقرب فترة خالية من التعارضات", () => {
    const all = [
      m("a", "2026-08-21", "23:00", "ملعب 1", "A1", "A2"),
      m("b", "2026-08-21", "23:00", "ملعب 1", "B1", "B2"), // متعارضة — نريد نقلها
    ];
    const s = suggestNearestSlot(all[1], all, VENUES, DAYS, SLOTS);
    expect(s).not.toBeNull();
    const moved = { ...all[1], ...s! };
    const after = checkScheduleConflicts([all[0], moved], VENUES, SLOTS);
    expect(conflictsFor(after, "b")).toEqual([]);
  });
});
