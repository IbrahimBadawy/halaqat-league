// محرك قيود الجدولة — دوال نقية بلا اعتماد على المخزن أو الواجهة.
// كل مباراة لها (يوم منطقي، فترة، ملعب)، وقد تُلعب أكثر من مباراة في نفس
// الفترة على ملاعب مختلفة. الفحوص هنا هي مصدر الحقيقة لمحرر الجدول.
//
// هوية الأطراف تُفحص عبر "رموز هوية" (tokens): الفريق المحلول = رمزه، ورمز
// الإقصائيات غير المحلول (W_semi_1...) يتوسع إلى رموز أطراف مباراته المصدر —
// فتُكتشف التعارضات بين النهائي/المركز الثالث ونصفَي النهائي حتى قبل تحدد
// الفرق. الفجوات تُقاس بالدقائق (slotToMinutes) لتصح مع الفترات الخاصة (00:30).

import { slotToMinutes } from "../league/seed";
import type { Match, VenueDef } from "../league/types";

export interface ScheduleConflict {
  matchId: string;
  kind:
    | "venue_double_booked"
    | "venue_unavailable"
    | "team_double_booked"
    | "team_gap_too_small"
    | "team_over_night_limit";
  message: string;
}

/**
 * رمز هوية مرشح واحد لطرف. الرمز التخميني (الناتج عن توسع W_/L_) يحمل
 * مصدره (نصف النهائي) وقطبه (فائز/خاسر) — فيمكن استبعاد تقاطع فائز مباراة
 * مع خاسرها: لا يمكن أن يكونا نفس الفريق أبدًا (النهائي × المركز الثالث).
 */
export interface SideToken {
  id: string;
  /** مرحلة المصدر لو الرمز ناتج عن توسع W_/L_ (مثل semi_1) */
  source?: string;
  pick?: "W" | "L";
}

/**
 * رموز هوية طرف واحد: [الرموز، هل هي تخمينية].
 * التخميني يدخل فحوص الأزواج (حجز مزدوج/فجوة) تحفظيًا،
 * ولا يدخل عدّ حد الليلة حتى لا يعدّ فرعين متنافيين (ثالث + نهائي) مرتين.
 */
export type SideTokens = { tokens: SideToken[]; speculative: boolean };

export type SideTokensFn = (raw: string) => SideTokens;

const defaultSideTokens: SideTokensFn = (raw) => ({
  tokens: [{ id: raw }],
  speculative: false,
});

/** موسّع رموز نقي يعتمد على قائمة المباريات نفسها (بلا حلّ نتائج):
 * W_semi_1 / L_semi_1 → رموز طرفَي مباراة نصف النهائي 1 موسومة بالمصدر والقطب. */
export function structuralSideTokens(matches: Match[]): SideTokensFn {
  const expand = (raw: string, depth: number): SideTokens => {
    const dep = /^([WL])_(semi_[12])$/.exec(raw);
    if (dep && depth < 4) {
      const source = matches.find((m) => m.stage === dep[2]);
      if (source) {
        const h = expand(source.home, depth + 1);
        const a = expand(source.away, depth + 1);
        const pick = dep[1] as "W" | "L";
        // الوسم بالمستوى الأعمق يبقى لو موجود — دورينا لا يتداخل أعمق من مستوى
        const tag = (t: SideToken): SideToken =>
          t.source ? t : { ...t, source: dep[2], pick };
        return { tokens: [...h.tokens, ...a.tokens].map(tag), speculative: true };
      }
    }
    return { tokens: [{ id: raw }], speculative: false };
  };
  return (raw) => expand(raw, 0);
}

/** هل الملعب متاح في هذا اليوم وهذه الفترة وفق إعدادات الدوري؟ */
export function isVenueAvailable(
  venues: VenueDef[],
  venueName: string,
  matchDay: string,
  slot: string,
): boolean {
  const v = venues.find((x) => x.name === venueName);
  if (!v) return false;
  if (v.availability === "all_slots") return true;
  return v.availability.some((a) => a.date === matchDay && a.slots.includes(slot));
}

const NIGHT_TEAM_LIMIT = 2; // أقصى مباريات للفريق في الليلة
const MIN_GAP_MINUTES = 40; // فجوة فترة واحدة على الأقل بين مباراتَي نفس الفريق

/**
 * هل قد يكون بين المجموعتين نفس الفريق الفعلي؟ نفس المعرف يتقاطع، إلا لو
 * كان الرمزان من نفس المصدر بقطبين متضادين (فائز نصفٍ × خاسره) — مستحيل.
 */
function intersects(a: SideToken[], b: SideToken[]): boolean {
  return a.some((x) =>
    b.some(
      (y) =>
        x.id === y.id &&
        !(x.source && y.source && x.source === y.source && x.pick !== y.pick),
    ),
  );
}

/**
 * فحص كل التعارضات على جدول كامل. مرّر sideTokensOf (مثل structuralSideTokens
 * أو موسّعًا محلولًا من المخزن) لاكتشاف تعارضات تبعية الإقصائيات.
 */
export function checkScheduleConflicts(
  matches: Match[],
  venues: VenueDef[],
  slots: string[],
  sideTokensOf: SideTokensFn = defaultSideTokens,
): ScheduleConflict[] {
  void slots;
  const conflicts: ScheduleConflict[] = [];
  const sides = new Map<string, [SideTokens, SideTokens]>();
  for (const m of matches) sides.set(m.id, [sideTokensOf(m.home), sideTokensOf(m.away)]);
  const tokensOf = (m: Match): SideToken[] => {
    const [h, a] = sides.get(m.id)!;
    return [...h.tokens, ...a.tokens];
  };

  for (const m of matches) {
    if (!isVenueAvailable(venues, m.venue, m.matchDay, m.slot)) {
      conflicts.push({
        matchId: m.id,
        kind: "venue_unavailable",
        message: `${m.venue} غير متاح ليلة ${m.matchDay.slice(5)} في فترة ${m.slot}`,
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i];
      const b = matches[j];
      if (a.matchDay !== b.matchDay) continue;

      if (a.slot === b.slot && a.venue === b.venue) {
        for (const id of [a.id, b.id])
          conflicts.push({
            matchId: id,
            kind: "venue_double_booked",
            message: `مباراتان على ${a.venue} في نفس الفترة ${a.slot}`,
          });
      }

      if (intersects(tokensOf(a), tokensOf(b))) {
        const gap = Math.abs(slotToMinutes(a.slot) - slotToMinutes(b.slot));
        if (gap === 0) {
          for (const id of [a.id, b.id])
            conflicts.push({
              matchId: id,
              kind: "team_double_booked",
              message: `فريق (أو متأهل محتمل) في مباراتين بنفس الفترة ${a.slot}`,
            });
        } else if (gap < MIN_GAP_MINUTES) {
          for (const id of [a.id, b.id])
            conflicts.push({
              matchId: id,
              kind: "team_gap_too_small",
              message: "فترتان متقاربتان لنفس الفريق — الفجوة المطلوبة فترة واحدة على الأقل",
            });
        }
      }
    }
  }

  // حد مباريات الفريق في الليلة — بالرموز المؤكدة فقط (غير التخمينية)
  const perNight = new Map<string, number>();
  for (const m of matches) {
    const [h, a] = sides.get(m.id)!;
    for (const side of [h, a]) {
      if (side.speculative) continue;
      for (const t of side.tokens) {
        const key = `${m.matchDay}|${t.id}`;
        perNight.set(key, (perNight.get(key) ?? 0) + 1);
      }
    }
  }
  for (const m of matches) {
    const [h, a] = sides.get(m.id)!;
    for (const side of [h, a]) {
      if (side.speculative) continue;
      for (const t of side.tokens) {
        if ((perNight.get(`${m.matchDay}|${t.id}`) ?? 0) > NIGHT_TEAM_LIMIT) {
          conflicts.push({
            matchId: m.id,
            kind: "team_over_night_limit",
            message: `فريق يلعب أكثر من ${NIGHT_TEAM_LIMIT} مباريات في ليلة واحدة`,
          });
        }
      }
    }
  }

  return conflicts;
}

/** تعارضات مباراة واحدة فقط من نتيجة الفحص الكامل (بلا تكرار) */
export function conflictsFor(
  all: ScheduleConflict[],
  matchId: string,
): ScheduleConflict[] {
  const seen = new Set<string>();
  return all.filter((c) => {
    if (c.matchId !== matchId) return false;
    const key = c.kind + c.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * اقتراح أقرب (يوم، فترة، ملعب) خالٍ من التعارضات لمباراة — بدءًا من ليلتها
 * الحالية فما بعدها. الملعب الآخر في نفس الفترة مرشح صالح (مباريات متوازية).
 * يُرجع null لو لا يوجد.
 */
export function suggestNearestSlot(
  match: Match,
  allMatches: Match[],
  venues: VenueDef[],
  matchDays: string[],
  slots: string[],
  sideTokensOf: SideTokensFn = defaultSideTokens,
): { matchDay: string; slot: string; venue: string } | null {
  const others = allMatches.filter((m) => m.id !== match.id);
  const startNight = Math.max(0, matchDays.indexOf(match.matchDay));
  for (let d = startNight; d < matchDays.length; d++) {
    for (const slot of slots) {
      for (const v of venues) {
        // لا نقترح نفس موعده وملعبه الحاليين — ملعب آخر بنفس الفترة مقبول
        if (
          matchDays[d] === match.matchDay &&
          slot === match.slot &&
          v.name === match.venue
        )
          continue;
        const candidate: Match = {
          ...match,
          matchDay: matchDays[d],
          slot,
          venue: v.name,
        };
        const conflicts = checkScheduleConflicts(
          [...others, candidate],
          venues,
          slots,
          sideTokensOf,
        );
        if (conflictsFor(conflicts, match.id).length === 0) {
          return { matchDay: matchDays[d], slot, venue: v.name };
        }
      }
    }
  }
  return null;
}
