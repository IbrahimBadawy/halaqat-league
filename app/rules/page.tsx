"use client";

import SectionTitle from "@/components/ui/SectionTitle";
import { useLeague } from "@/lib/league/store";

const TIEBREAKER_LABELS: Record<string, string> = {
  points: "النقاط",
  head_to_head: "المواجهات المباشرة",
  goal_difference: "فارق الأهداف",
  goals_for: "الأهداف المسجلة",
  fair_play: "اللعب النظيف",
  draw: "القرعة",
};

export default function RulesPage() {
  const { seed, hydrated } = useLeague();
  if (!hydrated) return null;
  const r = seed.rules;

  return (
    <div className="px-4">
      <h1 className="pb-1 pt-4 font-display text-[22px] font-bold text-white">اللائحة</h1>
      <p className="pb-4 text-[13px]" style={{ color: "var(--text-3)" }}>
        {seed.name} · {seed.slogan}
      </p>

      <SectionTitle>نظام البطولة</SectionTitle>
      <div className="card mb-4 p-3.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
        <span className="num">10</span> فرق في مجموعتين من <span className="num">5</span> — دوري ذهاب
        داخل كل مجموعة (<span className="num">20</span> مباراة)، يتأهل الأول والثاني، ثم نصف نهائي
        متقاطع (أول A × ثاني B، أول B × ثاني A) فمباراة المركز الثالث فالنهائي.
        <br />
        <span className="num">4</span> ليالي جمعة · <span className="num">6</span> فترات كل{" "}
        <span className="num">{r.slot_minutes}</span> دقيقة من <span className="num">11:00 PM</span> —
        ما بعد منتصف الليل يتبع ليلته.
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
