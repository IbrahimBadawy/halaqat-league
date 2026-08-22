"use client";

// المباريات حسب الليلة (اليوم المنطقي) — التجميع بالفترة، والمباريات
// المتوازية في نفس الفترة تظهر معًا تحت ترويسة واحدة بشارة ملعب لكل مباراة.

import { useState } from "react";
import MatchRow from "@/components/match/MatchRow";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

export default function MatchesPage() {
  const { seed, matches, statusOf, hydrated } = useLeague();
  // افتراضيًا: الليلة الجارية (أول ليلة فيها مباراة غير معتمدة).
  // تُحسب كل تصيير حتى لا تتجمد على قيمة ما قبل الـ hydration —
  // الحالة تحفظ اختيار المستخدم اليدوي فقط.
  const defaultNight =
    seed.matchDays.find((d) =>
      matches.some((m) => m.matchDay === d && statusOf(m.id) !== "approved"),
    ) ?? seed.matchDays[0];
  const [nightOverride, setNight] = useState<string | null>(null);
  const night = nightOverride ?? defaultNight;

  if (!hydrated) return null;

  const nightMatches = matches.filter((m) => m.matchDay === night);
  const isKnockout = nightMatches.some((m) => m.stage !== "group");

  // تجميع بالفترة بترتيب فترات الليلة
  const slots = seed.slots.filter((s) => nightMatches.some((m) => m.slot === s));
  const extraSlots = [...new Set(nightMatches.map((m) => m.slot))].filter(
    (s) => !seed.slots.includes(s),
  );
  const allSlots = [...slots, ...extraSlots];

  const venuesTonight = [...new Set(nightMatches.map((m) => m.venue))];

  return (
    <div className="px-4">
      <h1 className="pb-2 pt-4 font-display text-[22px] font-bold text-white">المباريات</h1>

      {/* تبويبات الليالي — ما بعد منتصف الليل يتبع ليلته */}
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {seed.matchDays.map((d, i) => {
          const active = d === night;
          return (
            <button
              key={d}
              onClick={() => setNight(d)}
              className="pill flex-none px-3.5 py-1.5 text-[13px]"
              style={
                active
                  ? {
                      background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))",
                      color: "var(--ink)",
                      fontWeight: 700,
                    }
                  : {
                      background: "rgba(255,255,255,.05)",
                      border: "1px solid rgba(201,209,230,.16)",
                      color: "var(--text-2)",
                      fontWeight: 600,
                    }
              }
            >
              الليلة <span className="num">{i + 1}</span> · {formatNight(d)}
            </button>
          );
        })}
      </div>

      <div className="mb-3 text-[13px] font-medium" style={{ color: "var(--text-3)" }}>
        {isKnockout ? (
          <>ليلة الإقصائيات — نصف النهائي والمركز الثالث والنهائي 🏆</>
        ) : (
          <>
            دور المجموعات · <span className="num">{nightMatches.length}</span> مباريات
          </>
        )}
        {venuesTonight.length > 1 ? (
          <span className="ms-1.5" style={{ color: "#ADC2FF" }}>
            · الليلة على ملعبين معًا
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 pb-5">
        {allSlots.map((slot) => {
          const slotMatches = nightMatches.filter((m) => m.slot === slot);
          const parallel = slotMatches.length > 1;
          return (
            <div key={slot}>
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="num pill px-2.5 py-1 text-[13px] font-bold"
                  style={{
                    color: "var(--gold-light)",
                    background: "rgba(224,178,74,.1)",
                    border: "1px solid rgba(224,178,74,.3)",
                  }}
                >
                  {formatSlot(slot)}
                </span>
                {parallel ? (
                  <span className="text-[12px] font-semibold" style={{ color: "#ADC2FF" }}>
                    مباراتان متوازيتان — ملعبان في نفس الوقت
                  </span>
                ) : null}
                <span className="ms-auto h-px flex-1" style={{ background: "var(--border-softer)", maxWidth: 80 }} />
              </div>
              <div className="flex flex-col gap-1.5">
                {slotMatches.map((m) => (
                  <MatchRow key={m.id} match={m} hideSlot />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isKnockout ? (
        <p className="pb-5 text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
          أطراف الإقصائيات تتحدد تلقائيًا بعد اعتماد نتائج الدور السابق
        </p>
      ) : null}
    </div>
  );
}
