"use client";

// «مهامي» — مباريات الليلة للمسجّل/الحكم مع دخول مباشر للكونسول.

import Link from "next/link";
import Shield from "@/components/ui/Shield";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

export default function OfficiatePage() {
  const { seed, matches, hydrated, state, statusOf, resolveSide, scoreOf } = useLeague();
  if (!hydrated) return null;

  if (state.role === "visitor")
    return (
      <div className="flex flex-col items-center px-8 pt-24 text-center">
        <p className="text-[15px]" style={{ color: "var(--text-2)" }}>
          هذه الصفحة للمسجّل والحكم — بدّل دورك أولًا
        </p>
        <Link href="/me" className="btn-gold mt-4 flex h-11 items-center px-5 text-[14px]">
          صفحة «أنا»
        </Link>
      </div>
    );

  const currentNight =
    seed.matchDays.find((d) =>
      matches.some((m) => m.matchDay === d && statusOf(m.id) !== "approved"),
    ) ?? seed.matchDays[seed.matchDays.length - 1];

  const tonight = matches.filter((m) => m.matchDay === currentNight);

  return (
    <div className="px-4">
      <h1 className="pb-1 pt-4 font-display text-[22px] font-bold text-white">مهامي</h1>
      <p className="pb-3 text-[13px]" style={{ color: "var(--text-3)" }}>
        {formatNight(currentNight)} · أنت المسجّل المُسنَد لمباريات الليلة
      </p>
      <div className="flex flex-col gap-2 pb-5">
        {tonight.map((m) => {
          const h = resolveSide(m.home);
          const a = resolveSide(m.away);
          const st = statusOf(m.id);
          const s = scoreOf(m.id);
          const ready = h.team && a.team;
          return (
            <div key={m.id} className="card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="num pill px-2 py-0.5 text-[12.5px] font-semibold" style={{ background: "rgba(224,178,74,.1)", color: "var(--gold-light)", border: "1px solid rgba(224,178,74,.25)" }}>
                  {formatSlot(m.slot)}
                </span>
                <span className="text-[12.5px] font-medium" style={{ color: "var(--text-3)" }}>
                  {m.venue}
                </span>
                <span className="ms-auto text-[12px] font-bold" style={{ color: st === "approved" ? "var(--green-text)" : st === "live" || st === "half_time" ? "var(--live)" : st === "finished" ? "var(--warn)" : "var(--text-3)" }}>
                  {st === "approved" ? "معتمدة ✓" : st === "live" ? "جارية الآن" : st === "half_time" ? "استراحة" : st === "finished" ? "بانتظار الاعتماد" : "لم تبدأ"}
                </span>
              </div>
              <div className="mb-2.5 flex items-center gap-2 text-[14.5px] font-bold text-white">
                <Shield code={h.team?.code ?? "؟"} size={24} gold={false} />
                <span className="truncate">{h.team?.name ?? h.label}</span>
                <span className="num" style={{ color: "var(--gold)" }}>
                  {st === "scheduled" ? "×" : `${s.away} – ${s.home}`}
                </span>
                <span className="truncate">{a.team?.name ?? a.label}</span>
                <Shield code={a.team?.code ?? "؟"} size={24} gold={false} />
              </div>
              {ready && st !== "approved" ? (
                <Link href={`/match/${m.id}/console`} className="btn-gold flex h-11 items-center justify-center text-[14px]">
                  {st === "scheduled" ? "فتح الكونسول وبدء التسجيل" : st === "finished" ? "الاعتماد النهائي" : "متابعة التسجيل"}
                </Link>
              ) : !ready ? (
                <p className="text-center text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  الأطراف تتحدد بعد اعتماد نتائج الدور السابق
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
