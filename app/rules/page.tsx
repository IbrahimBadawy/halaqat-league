"use client";

// اللائحة — كل أرقام «نظام البطولة» محسوبة من جدول الدوري النشط نفسه
// (فرق/مجموعات/مباريات/ليالٍ/فترات/ملاعب)، فلا نص ثابت يكذب مع أي دوري آخر
// أو مع أي تعديل في الجدول (تأجيل ليلة، فترة خارج الشبكة، ملعب إضافي…).

import SectionTitle from "@/components/ui/SectionTitle";
import { formatSlot, slotToMinutes } from "@/lib/league/seed";
import { useLeague } from "@/lib/league/store";

const TIEBREAKER_LABELS: Record<string, string> = {
  points: "النقاط",
  head_to_head: "المواجهات المباشرة",
  goal_difference: "فارق الأهداف",
  goals_for: "الأهداف المسجلة",
  fair_play: "اللعب النظيف",
  draw: "القرعة",
};

const WEEKDAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const RANKS = ["", "أول", "ثاني", "ثالث", "رابع"];
const RANKS_AL = ["", "الأول", "الثاني", "الثالث", "الرابع"];

/** تطابق العدد في العربية: مفرد/مثنى/جمع قلة — «مجموعتين» لا «2 مجموعات» */
function countWord(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** وصف طرف إقصائي كما هو في الجدول (1A / W_semi_1) بلا حلّه لفريق بعينه */
function sideText(raw: string): string {
  const group = /^([1-9])([A-D])$/.exec(raw);
  if (group) return `${RANKS[Number(group[1])] ?? group[1]} ${group[2]}`;
  const dep = /^([WL])_semi_([0-9]+)$/.exec(raw);
  if (dep) return `${dep[1] === "W" ? "فائز" : "خاسر"} نصف ${dep[2]}`;
  return raw;
}

export default function RulesPage() {
  const { seed, hydrated, groupNames } = useLeague();
  if (!hydrated) return null;
  const r = seed.rules;

  // ————— نظام البطولة محسوبًا من الجدول —————
  const groupSizes = groupNames.map(
    (g) => seed.teams.filter((t) => t.group === g).length,
  );
  const sameSize = groupSizes.every((n) => n === groupSizes[0]);
  const groupsText =
    groupNames.length <= 1
      ? `مجموعة واحدة من ${seed.teams.length}`
      : `${countWord(groupNames.length, "مجموعة", "مجموعتين", "مجموعات", "مجموعة")} ${
          sameSize ? `من ${groupSizes[0]}` : `(${groupSizes.join(" و")})`
        }`;

  const groupMatches = seed.matches.filter((m) => m.stage === "group");
  const semis = seed.matches.filter((m) => m.stage.startsWith("semi"));
  const hasThird = seed.matches.some((m) => m.stage === "third_place");
  const hasFinal = seed.matches.some((m) => m.stage === "final");

  const days = seed.matchDays;
  const weekdays = [...new Set(days.map((d) => new Date(d).getDay()))];
  const wd = weekdays.length === 1 ? ` ${WEEKDAYS[weekdays[0]]}` : "";
  const nightsText =
    days.length === 1
      ? `ليلة${wd} واحدة`
      : days.length === 2
        ? `ليلتا${wd || " مباريات"}`
        : `${days.length} ${days.length <= 10 ? "ليالي" : "ليلة"}${wd}`;

  const usedSlots = [...new Set(seed.matches.map((m) => m.slot))].sort(
    (a, b) => slotToMinutes(a) - slotToMinutes(b),
  );
  const venues = [...new Set(seed.matches.map((m) => m.venue))];
  const perNight = Math.max(
    ...days.map((d) => seed.matches.filter((m) => m.matchDay === d).length),
    0,
  );

  return (
    <div className="px-4">
      <h1 className="pb-1 pt-4 font-display text-[22px] font-bold text-white">اللائحة</h1>
      <p className="pb-4 text-[13px]" style={{ color: "var(--text-3)" }}>
        {seed.name} · {seed.slogan}
      </p>

      <SectionTitle>نظام البطولة</SectionTitle>
      <div className="card mb-4 p-3.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        <span className="num">{seed.teams.length}</span> فرق في {groupsText} — دوري ذهاب داخل كل
        مجموعة (<span className="num">{groupMatches.length}</span> مباراة)
        {semis.length > 0 ? (
          <>
            ، يتأهل {RANKS_AL.slice(1, seed.qualifyPerGroup + 1).join(" و")} من كل مجموعة، ثم نصف
            نهائي ({semis.map((m) => `${sideText(m.home)} × ${sideText(m.away)}`).join(" · ")})
            {hasThird ? " فمباراة المركز الثالث" : ""}
            {hasFinal ? " فالنهائي" : ""}
          </>
        ) : (
          <>، والبطل صاحب صدارة الترتيب في النهاية</>
        )}
        .
        <br />
        {nightsText} · <span className="num">{seed.matches.length}</span> مباراة (حتى{" "}
        <span className="num">{perNight}</span> في الليلة) · الفترات كل{" "}
        <span className="num">{r.slot_minutes}</span> دقيقة من{" "}
        <span className="num">{formatSlot(usedSlots[0] ?? seed.slots[0])}</span> إلى{" "}
        <span className="num">
          {formatSlot(usedSlots[usedSlots.length - 1] ?? seed.slots[seed.slots.length - 1])}
        </span>{" "}
        — ما بعد منتصف الليل يتبع ليلته.
        {venues.length > 1 ? (
          <>
            <br />
            {countWord(venues.length, "ملعب", "ملعبان", "ملاعب", "ملعبًا")} ({venues.join(" · ")}) —
            مباراتان قد تُلعبان في نفس الفترة على ملعبين، فكل مباراة تعرض ملعبها دائمًا.
          </>
        ) : null}
      </div>

      <SectionTitle>قواعد اللعب</SectionTitle>
      <div className="card mb-4 overflow-hidden">
        {[
          ["نظام النقاط", `فوز ${r.points.win} · تعادل ${r.points.draw} · خسارة ${r.points.loss}`],
          [
            "مدة المباراة",
            r.halves === 1
              ? `شوط واحد من ${r.half_minutes * r.halves} دقيقة`
              : `شوطان × ${r.half_minutes} دقائق`,
          ],
          ["نظام الأشواط", "قد تُحدد الإدارة لأي مباراة شوطًا واحدًا أو شوطين ومدة مخصصة"],
          ["النهائي", `فترة ${r.final_duration_override_minutes} دقيقة`],
          ["التبديلات", r.substitutions === "unlimited" ? "مفتوحة" : r.substitutions],
          [
            "الطرد",
            `مؤقت بمدة يحددها الحكم (${(r.red_penalty_minutes_options ?? [2, 5]).join(" أو ")} دقائق) أو باقي المباراة — لا يمتد لمباراة تالية`,
          ],
          ["الطرد من الدوري", "أشد عقوبة: يُمنع اللاعب من كل المباريات المتبقية ويكمل فريقه بلاعب آخر"],
          ["الإنذارات", `${r.yellow_cards_for_suspension} إنذارات متراكمة = إيقاف مباراة`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--border-softer)" }}>
            <span className="text-[13.5px] font-semibold text-white">{k}</span>
            <span className="num text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <SectionTitle>معايير كسر التعادل (بالترتيب)</SectionTitle>
      <div className="card mb-4 p-3.5">
        <ol className="flex flex-col gap-1.5">
          {r.tiebreakers.map((t, i) => (
            <li key={t} className="flex items-center gap-2.5 text-[13.5px] font-medium text-white">
              <span className="num flex h-6 w-6 flex-none items-center justify-center rounded-full font-display text-[12px] font-bold" style={{ background: "rgba(224,178,74,.15)", color: "var(--gold-light)" }}>
                {i + 1}
              </span>
              {TIEBREAKER_LABELS[t] ?? t}
            </li>
          ))}
        </ol>
      </div>

      <SectionTitle>كروت القوة</SectionTitle>
      <div className="card mb-6 p-3.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        كل فريق يملك كل كارت مرة واحدة في الموسم. الطلب أثناء المباراة بموافقة الحكم، والأثر يُحتسب
        تلقائيًا (هدف ×<span className="num">2</span> يعني قيمة الهدف <span className="num">2</span> في
        النتيجة) ويُسجَّل كل استخدام في سجل عام.
      </div>
    </div>
  );
}
