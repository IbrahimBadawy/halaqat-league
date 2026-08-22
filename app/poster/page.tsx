"use client";

// بوستر الجدول (§14.7 — تصميم 5a): إعادة بناء البوستر الرسمي بـ HTML،
// مدفوع مباشرة من store.matches بحيث تنعكس تعديلات الأدمن تلقائيًا.
// صفحة كاملة بلا شريط تنقل (AppShell يعاملها كـ bare).

import Link from "next/link";
import Shield from "@/components/ui/Shield";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot, STAGE_LABELS } from "@/lib/league/seed";
import type { Match } from "@/lib/league/types";

const FOOTER_ICONS = ["🏆", "⚽", "⚡"];

/** تجميع مباريات ليلة واحدة حسب الفترة (المباريات مرتبة أصلًا: فترة ← ملعب) */
function groupBySlot(night: Match[]): { slot: string; items: Match[] }[] {
  const out: { slot: string; items: Match[] }[] = [];
  for (const m of night) {
    const last = out[out.length - 1];
    if (last && last.slot === m.slot) last.items.push(m);
    else out.push({ slot: m.slot, items: [m] });
  }
  return out;
}

export default function PosterPage() {
  const { seed, matches, hydrated, resolveSide, groupNames } = useLeague();

  if (!hydrated) return null;

  // الليالي بالترتيب — تشمل أي ليلة إضافية نُقلت إليها مباراة إداريًا
  const days = [...seed.matchDays];
  for (const m of matches) {
    if (!days.includes(m.matchDay)) days.push(m.matchDay);
  }
  days.sort();

  const sideName = (raw: string): string => {
    const s = resolveSide(raw);
    return s.team?.name ?? s.label;
  };

  // نص المشاركة على واتساب: ليلة بليلة، كل مباراة بفترتها وملعبها
  const shareLines: string[] = [`🏆 ${seed.name}`, seed.slogan, ""];
  days.forEach((day, i) => {
    const night = matches.filter((m) => m.matchDay === day);
    if (night.length === 0) return;
    shareLines.push(`📅 ${formatNight(day)} — الليلة ${i + 1}`);
    for (const m of night) {
      const prefix = m.stage === "group" ? "" : `${STAGE_LABELS[m.stage]}: `;
      shareLines.push(
        `${formatSlot(m.slot)} — ${prefix}${sideName(m.home)} × ${sideName(m.away)} — ${m.venue}`,
      );
    }
    shareLines.push("");
  });
  shareLines.push(seed.slogans.join(" · "));
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareLines.join("\n"))}`;

  return (
    <div
      className="poster-root mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-4 pb-10 pt-8"
      style={{ background: "var(--bg-base)" }}
    >
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          body { background: var(--bg-base) !important; }
          .poster-root, .poster-root * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* ————— الترويسة: تاج + الاسم الذهبي + شريط الشعار ————— */}
      <header className="flex flex-col items-center text-center">
        <span
          aria-hidden
          className="mb-1.5 inline-block"
          style={{
            width: 54,
            height: 30,
            background: "linear-gradient(180deg,var(--gold-light),var(--gold-mid))",
            clipPath:
              "polygon(0 100%, 0 25%, 26% 52%, 50% 0, 74% 52%, 100% 25%, 100% 100%)",
          }}
        />
        <h1
          className="font-display text-[34px] font-extrabold leading-tight"
          style={{
            background:
              "linear-gradient(180deg,var(--gold-light) 15%,var(--gold) 55%,var(--gold-deep))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          دوري الحلقات
        </h1>
        <div className="font-display text-[17px] font-bold text-white">
          صيف <span className="num">2026</span>
        </div>
        <div className="slogan-ribbon mt-2.5 px-5 py-1">
          <span
            className="inline-block text-[13px] font-bold"
            style={{ transform: "skewX(6deg)" }}
          >
            {seed.slogan}
          </span>
        </div>
      </header>

      {/* ————— جدول الليالي الأربع — من store.matches مباشرة ————— */}
      <div className="flex flex-col gap-3">
        {days.map((day, i) => {
          const night = matches.filter((m) => m.matchDay === day);
          if (night.length === 0) return null;
          const knockout = night.some((m) => m.stage !== "group");
          return (
            <section key={day} className="card overflow-hidden">
              <header
                className="flex items-center gap-2 px-3 py-2"
                style={{
                  background: "rgba(224,178,74,.09)",
                  borderBottom: "1px solid rgba(224,178,74,.3)",
                }}
              >
                <span className="section-bar" />
                <span
                  className="font-display text-[15px] font-bold"
                  style={{ color: "var(--gold-light)" }}
                >
                  {formatNight(day)}
                </span>
                <span
                  className="text-[11.5px] font-semibold"
                  style={{ color: "var(--text-3)" }}
                >
                  الليلة <span className="num">{i + 1}</span>
                </span>
                {knockout ? (
                  <span
                    className="ms-auto text-[11px] font-bold"
                    style={{ color: "var(--gold)" }}
                  >
                    🏆 ليلة الحسم
                  </span>
                ) : null}
              </header>

              {groupBySlot(night).map(({ slot, items }) => (
                <div
                  key={slot}
                  className="flex items-start gap-2 px-3 py-2"
                  style={{ borderBottom: "1px solid var(--border-softer)" }}
                >
                  <span
                    className="num w-[64px] shrink-0 pt-1 font-display text-[13px] font-bold"
                    style={{ color: "var(--gold-light)" }}
                  >
                    {formatSlot(slot)}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {items.map((m, idx) => (
                      <div key={m.id} className="flex flex-col gap-0.5">
                        {/* فترة واحدة بمباراتين على ملعبين — تمييز الثانية كما في البوستر */}
                        {idx > 0 ? (
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: "#ADC2FF" }}
                          >
                            وفي {m.venue}:
                          </span>
                        ) : null}

                        {m.stage === "group" ? (
                          <div className="flex items-center gap-1.5">
                            <Shield code={m.home} size={22} gold={false} />
                            <span
                              className="num font-display text-[13px] font-bold"
                              style={{ color: "var(--gold)" }}
                            >
                              ×
                            </span>
                            <Shield code={m.away} size={22} gold={false} />
                            <span className="ms-auto shrink-0">
                              <VenueChip venue={m.venue} />
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: "var(--gold-light)" }}
                            >
                              {STAGE_LABELS[m.stage]}
                              {m.stage === "final" ? (
                                <>
                                  {" "}· فترة{" "}
                                  <span className="num">
                                    {seed.rules.final_duration_override_minutes}
                                  </span>{" "}
                                  د
                                </>
                              ) : null}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[12.5px] font-semibold text-white">
                                {sideName(m.home)}
                              </span>
                              <span
                                className="num shrink-0 font-display text-[13px] font-bold"
                                style={{ color: "var(--gold)" }}
                              >
                                ×
                              </span>
                              <span className="truncate text-[12.5px] font-semibold text-white">
                                {sideName(m.away)}
                              </span>
                              <span className="ms-auto shrink-0">
                                <VenueChip venue={m.venue} />
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {/* ————— لوحات المجموعات جنبًا إلى جنب ————— */}
      <div className="grid grid-cols-2 gap-2.5">
        {groupNames.map((g) => (
          <div key={g} className="card overflow-hidden">
            <div
              className="px-2 py-1.5 text-center font-display text-[13.5px] font-bold text-white"
              style={{
                background: "linear-gradient(180deg,var(--shield-1),var(--shield-2))",
              }}
            >
              المجموعة <span className="num">{g}</span>
            </div>
            {seed.teams
              .filter((t) => t.group === g)
              .map((t) => (
                <div
                  key={t.code}
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  style={{ borderBottom: "1px solid var(--border-softer)" }}
                >
                  <Shield code={t.code} size={18} gold={false} />
                  <span
                    className="truncate text-[12.5px] font-semibold"
                    style={{ color: "var(--text-2)" }}
                  >
                    {t.name}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* ————— شعارات البوستر الثلاثة ————— */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-[12px] font-semibold"
        style={{ color: "var(--text-2)" }}
      >
        {seed.slogans.map((s, i) => (
          <span key={s}>
            {FOOTER_ICONS[i % FOOTER_ICONS.length]} {s}
          </span>
        ))}
      </div>

      {/* ————— أزرار الشاشة فقط — مخفية عند الطباعة ————— */}
      <div className="print-hide flex flex-col items-center gap-2.5 pt-1">
        <button
          onClick={() => window.print()}
          className="btn-gold px-6 py-2.5 text-[14px]"
        >
          🖨️ حفظ كصورة / طباعة
        </button>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pill px-4 py-2 text-[13px] font-semibold"
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid var(--border-soft)",
            color: "var(--text-2)",
          }}
        >
          💬 مشاركة الجدول على واتساب
        </a>
        <Link
          href="/"
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--text-3)" }}
        >
          الرجوع إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
