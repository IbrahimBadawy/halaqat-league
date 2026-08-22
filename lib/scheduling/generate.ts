// مولد جدولة بسيط (النسخة الأولى من T1): دوري من دور واحد داخل كل مجموعة
// بطريقة الدائرة، وتعبئة رشيدة للمواعيد (يوم ← فترة ← ملعب) تحترم قاعدتي
// النطاق: لا يلعب فريق فترتين متتاليتين، ولا أكثر من مباراتين في الليلة.
// دوال نقية بلا أي اعتماد على المخزن أو القاعدة — تُختبر في tests/.

import type { StageKind } from "../league/types";

export interface GenerateInput {
  groups: { name: string; teamCodes: string[] }[];
  matchDays: string[];
  slots: string[];
  venues: string[];
  /** مجموعتان فقط: نصفا نهائي + مركز ثالث + نهائي في آخر يوم */
  knockout: boolean;
}

export interface GeneratedFixture {
  day: string;
  slot: string;
  venue: string;
  home: string;
  away: string;
  stage: StageKind;
}

export interface GenerateResult {
  fixtures: GeneratedFixture[];
  /** مباريات لم تجد موعدًا (سعة الأيام/الفترات/الملاعب غير كافية) */
  unscheduled: number;
}

const BYE = "__bye__";
const NIGHT_TEAM_LIMIT = 2;

/** جولات دور واحد بطريقة الدائرة — كل فريق يظهر مرة واحدة في كل جولة */
export function roundRobinPairs(codes: string[]): [string, string][][] {
  const list = [...codes];
  if (list.length % 2 === 1) list.push(BYE);
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a !== BYE && b !== BYE) round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    // تثبيت الأول وتدوير الباقي
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export function generateFixtures(input: GenerateInput): GenerateResult {
  // تداخل جولات المجموعات (جولة A ثم جولة B ...) ليتوازن الظهور عبر الليالي
  const groupRounds = input.groups.map((g) => roundRobinPairs(g.teamCodes));
  const queue: { home: string; away: string }[] = [];
  const maxRounds = Math.max(0, ...groupRounds.map((r) => r.length));
  for (let r = 0; r < maxRounds; r++) {
    for (const rounds of groupRounds) {
      for (const [h, a] of rounds[r] ?? []) queue.push({ home: h, away: a });
    }
  }

  const fixtures: GeneratedFixture[] = [];
  const atSlot = new Map<string, Set<string>>(); // "day|slotIndex" -> فرق تلعب فيها
  const perNight = new Map<string, number>(); // "day|team" -> عدد مبارياته الليلة

  const groupDays =
    input.knockout && input.groups.length === 2
      ? input.matchDays.slice(0, -1)
      : input.matchDays;

  outer: for (const day of groupDays) {
    for (let si = 0; si < input.slots.length; si++) {
      for (const venue of input.venues) {
        if (queue.length === 0) break outer;
        const prev = atSlot.get(`${day}|${si - 1}`) ?? new Set<string>();
        const cur = atSlot.get(`${day}|${si}`) ?? new Set<string>();
        // أول مباراة في الطابور تحترم القيود في هذا الموضع
        const idx = queue.findIndex(
          (m) =>
            !prev.has(m.home) &&
            !prev.has(m.away) &&
            !cur.has(m.home) &&
            !cur.has(m.away) &&
            (perNight.get(`${day}|${m.home}`) ?? 0) < NIGHT_TEAM_LIMIT &&
            (perNight.get(`${day}|${m.away}`) ?? 0) < NIGHT_TEAM_LIMIT,
        );
        if (idx === -1) continue;
        const m = queue.splice(idx, 1)[0];
        fixtures.push({
          day,
          slot: input.slots[si],
          venue,
          home: m.home,
          away: m.away,
          stage: "group",
        });
        cur.add(m.home);
        cur.add(m.away);
        atSlot.set(`${day}|${si}`, cur);
        perNight.set(`${day}|${m.home}`, (perNight.get(`${day}|${m.home}`) ?? 0) + 1);
        perNight.set(`${day}|${m.away}`, (perNight.get(`${day}|${m.away}`) ?? 0) + 1);
      }
    }
  }

  // ليلة الإقصائيات (مجموعتان): نصفان متوازيان لو فيه ملعبان، ثم الثالث فالنهائي
  if (input.knockout && input.groups.length === 2) {
    const lastDay = input.matchDays[input.matchDays.length - 1];
    const s = input.slots;
    const twoVenues = input.venues.length >= 2;
    const semi2Slot = twoVenues ? s[0] : (s[1] ?? s[0]);
    // فجوة فترة على الأقل بعد آخر نصف نهائي
    const thirdIdx = Math.min(s.length - 2, twoVenues ? 2 : 3);
    const finalIdx = Math.min(s.length - 1, thirdIdx + 1);
    fixtures.push(
      { day: lastDay, slot: s[0], venue: input.venues[0], home: "1A", away: "2B", stage: "semi_1" },
      { day: lastDay, slot: semi2Slot, venue: twoVenues ? input.venues[1] : input.venues[0], home: "1B", away: "2A", stage: "semi_2" },
      { day: lastDay, slot: s[Math.max(thirdIdx, twoVenues ? 2 : 3)], venue: input.venues[0], home: "L_semi_1", away: "L_semi_2", stage: "third_place" },
      { day: lastDay, slot: s[finalIdx], venue: input.venues[0], home: "W_semi_1", away: "W_semi_2", stage: "final" },
    );
  }

  return { fixtures, unscheduled: queue.length };
}
