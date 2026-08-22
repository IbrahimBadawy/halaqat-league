"use client";

// وضع الشاشة الكبيرة (TV Mode) — لوحة نتائج للبروجيكتور بجوار الملعب
// (المرجع 2i، المواصفة §4.8). ديسكتوب أولًا، تُحدَّث تلقائيًا كل 5 ثوانٍ
// لعرض الدقيقة والنتيجة الحية دون أي تدخل.

import { useEffect, useState } from "react";
import Link from "next/link";
import Shield from "@/components/ui/Shield";
import LiveBadge from "@/components/ui/LiveBadge";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot, STAGE_LABELS } from "@/lib/league/seed";
import type { Match } from "@/lib/league/types";

export default function TvPage() {
  const { seed, matches, hydrated, statusOf, groupNames } = useLeague();

  // إعادة رسم دورية — الدقيقة والنتيجة تتحدثان من المخزن مباشرة
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (!hydrated) return null;

  const liveMatch = matches.find((m) => {
    const st = statusOf(m.id);
    return st === "live" || st === "half_time";
  });
  const nextMatch = matches.find((m) => statusOf(m.id) === "scheduled");

  // الليلة الحالية = أول يوم فيه مباراة غير معتمدة بعد
  const currentNight =
    seed.matchDays.find((d) =>
      matches.some((m) => m.matchDay === d && statusOf(m.id) !== "approved"),
    ) ?? seed.matchDays[seed.matchDays.length - 1];
  const nightNo = seed.matchDays.indexOf(currentNight) + 1;
  const tonight = matches.filter((m) => m.matchDay === currentNight);

  // مباريات موازية: أكثر من مباراة في نفس الفترة على ملاعب مختلفة
  const slotCount = new Map<string, number>();
  for (const m of tonight) slotCount.set(m.slot, (slotCount.get(m.slot) ?? 0) + 1);

  return (
    <div className="pitch-glow flex min-h-dvh flex-col gap-4 px-4 pb-6 pt-4 md:px-8 md:pt-6">
      {/* ————— الرأس ————— */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className="text-[30px] md:text-[40px]"
          style={{ filter: "drop-shadow(0 0 12px rgba(224,178,74,.55))" }}
        >
          👑
        </span>
        <div className="min-w-0">
          <h1
            className="font-display font-bold text-white"
            style={{ fontSize: "clamp(22px, 3.4vw, 40px)", lineHeight: 1.2 }}
          >
            {seed.name}
          </h1>
          <p className="text-[13px] font-medium md:text-[16px]" style={{ color: "var(--gold-light)" }}>
            {seed.slogan}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2.5">
          <span
            className="pill px-3.5 py-1.5 text-[13px] font-bold md:text-[16px]"
            style={{
              background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))",
              color: "var(--ink)",
            }}
          >
            الليلة <span className="num">{nightNo}</span> من{" "}
            <span className="num">{seed.matchDays.length}</span> · {formatNight(currentNight)}
          </span>
          <span className="hidden text-[12px] md:inline" style={{ color: "var(--text-3)" }}>
            اضغط <span className="num font-bold">F11</span> لملء الشاشة
          </span>
          <Link
            href="/"
            className="pill px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              background: "rgba(255,255,255,.05)",
              border: "1px solid var(--border-soft)",
              color: "var(--text-2)",
            }}
          >
            خروج
          </Link>
        </div>
      </header>

      {/* ————— المركز: مباشر الآن أو المباراة القادمة ————— */}
      {liveMatch ? (
        <LiveHero m={liveMatch} />
      ) : nextMatch ? (
        <NextHero m={nextMatch} />
      ) : (
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="text-[44px]">🏆</span>
          <p className="font-display text-[26px] font-bold text-white md:text-[34px]">
            انتهت جميع مباريات الدوري
          </p>
          <p className="text-[15px]" style={{ color: "var(--text-2)" }}>
            شكرًا لكل الفرق والجمهور — {seed.slogan}
          </p>
        </div>
      )}

      {/* ————— مباريات الليلة + الترتيب ————— */}
      <div className="grid flex-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr]">
        {/* مباريات الليلة */}
        <section className="card p-3.5 md:col-span-2 md:p-4 xl:col-span-1">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="section-bar" />
            <h2 className="font-display text-[17px] font-bold text-white md:text-[20px]">
              مباريات الليلة — {formatNight(currentNight)}
            </h2>
          </div>
          {tonight.length === 0 ? (
            <p className="py-4 text-center text-[14px]" style={{ color: "var(--text-3)" }}>
              لا توجد مباريات في هذه الليلة
            </p>
          ) : (
            <div className="flex flex-col">
              {tonight.map((m) => (
                <TonightRow key={m.id} m={m} parallel={(slotCount.get(m.slot) ?? 0) > 1} />
              ))}
            </div>
          )}
        </section>

        {/* جداول الترتيب — مجموعة لكل بطاقة */}
        {groupNames.map((g) => (
          <MiniTable key={g} group={g} />
        ))}
      </div>
    </div>
  );
}

/* المكونات على مستوى الملف — تعريفها داخل الصفحة كان يعيد إنشاء نوعها
   مع كل تحديث دوري (كل 5 ثوانٍ) فيعاد mount الشجرة كاملة */

/* ———————————————— بطاقة المباشر العملاقة ———————————————— */
function LiveHero({ m }: { m: Match }) {
  const { seed, statusOf, scoreOf, minuteOf, eventsOf, resolveSide, teamByCode } = useLeague();
  const st = statusOf(m.id);
    const s = scoreOf(m.id);
    const minute = minuteOf(m.id);
    const goals = eventsOf(m.id).filter((e) => e.type === "goal" && !e.deleted);
    const lastGoal = goals[goals.length - 1];
    const scorer = lastGoal
      ? (seed.players.find((p) => p.id === lastGoal.playerId)?.name ??
        teamByCode(lastGoal.teamCode)?.name ??
        "")
      : "";
    const home = resolveSide(m.home);
    const away = resolveSide(m.away);
    return (
      <section className="live-card px-4 py-5 md:px-8 md:py-7">
        {/* السياق: المرحلة + الليلة + الفترة + الملعب — دائمًا ظاهرة */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13px] font-semibold md:text-[15px]" style={{ color: "var(--text-2)" }}>
          {m.stage !== "group" ? (
            <span style={{ color: "var(--gold-light)" }}>{STAGE_LABELS[m.stage]}</span>
          ) : null}
          <span>{formatNight(m.matchDay)}</span>
          <span className="num">{formatSlot(m.slot)}</span>
          <VenueChip venue={m.venue} size="md" />
          {st === "half_time" ? (
            <span
              className="pill px-3 py-1 text-[13px] font-bold"
              style={{ background: "rgba(244,196,48,.16)", color: "var(--warn)", border: "1px solid rgba(244,196,48,.4)" }}
            >
              استراحة بين الشوطين
            </span>
          ) : (
            <LiveBadge />
          )}
        </div>

        {/* الفريقان والنتيجة العملاقة */}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
          <TeamSide code={home.team?.code ?? m.home} name={home.team?.name ?? home.label} />
          <div className="flex flex-col items-center">
            <div
              className="num gold-shimmer font-display font-bold"
              style={{ fontSize: "clamp(64px, 11vw, 118px)", lineHeight: 1 }}
            >
              {s.home} – {s.away}
            </div>
            <div
              className="num font-display font-bold text-white"
              style={{ fontSize: "clamp(24px, 3.6vw, 44px)", lineHeight: 1.3 }}
            >
              {st === "half_time" ? "⏸" : `${minute}′`}
            </div>
          </div>
          <TeamSide code={away.team?.code ?? m.away} name={away.team?.name ?? away.label} />
        </div>

        {/* شريط آخر هدف */}
        {lastGoal ? (
          <div className="mt-4 flex justify-center">
            <span
              className="float-banner pill px-4 py-1.5 text-[14px] font-bold md:text-[17px]"
              style={{
                background: "linear-gradient(90deg,var(--gold-light),var(--gold-mid))",
                color: "var(--ink)",
              }}
            >
              ⚽ هدف! {scorer} — د <span className="num">{lastGoal.minute}</span>
            </span>
          </div>
        ) : null}
      </section>
    );
}

/* ———————————————— المباراة القادمة (لا مباشر الآن) ———————————————— */
function NextHero({ m }: { m: Match }) {
    const { resolveSide } = useLeague();
    const home = resolveSide(m.home);
    const away = resolveSide(m.away);
    return (
      <section className="card px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13px] font-semibold md:text-[15px]" style={{ color: "var(--text-2)" }}>
          <span
            className="pill px-3 py-1 text-[13px] font-bold md:text-[14px]"
            style={{
              background: "rgba(224,178,74,.14)",
              color: "var(--gold-light)",
              border: "1px solid rgba(224,178,74,.4)",
            }}
          >
            المباراة القادمة
          </span>
          {m.stage !== "group" ? (
            <span style={{ color: "var(--gold-light)" }}>{STAGE_LABELS[m.stage]}</span>
          ) : null}
          <span>{formatNight(m.matchDay)}</span>
          <VenueChip venue={m.venue} size="md" />
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
          <TeamSide code={home.team?.code ?? m.home} name={home.team?.name ?? home.label} />
          <div className="flex flex-col items-center">
            <div
              className="num font-display font-bold"
              style={{ fontSize: "clamp(34px, 5.5vw, 62px)", lineHeight: 1.1, color: "var(--gold)" }}
            >
              {formatSlot(m.slot)}
            </div>
            <div className="font-display text-[18px] font-bold md:text-[24px]" style={{ color: "var(--text-3)" }}>
              ضد
            </div>
          </div>
          <TeamSide code={away.team?.code ?? m.away} name={away.team?.name ?? away.label} />
        </div>
      </section>
    );
}

/* درع + اسم فريق بحجم الشاشة الكبيرة */
function TeamSide({ code, name }: { code: string; name: string }) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-2">
        <Shield code={code} size={64} />
        <span
          className="w-full truncate text-center font-display font-bold text-white"
          style={{ fontSize: "clamp(17px, 2.6vw, 32px)", lineHeight: 1.3 }}
        >
          {name}
        </span>
      </div>
    );
}

/* ———————————————— صف مباراة في قائمة الليلة ———————————————— */
function TonightRow({ m, parallel }: { m: Match; parallel: boolean }) {
    const { statusOf, scoreOf, resolveSide } = useLeague();
    const st = statusOf(m.id);
    const s = scoreOf(m.id);
    const started = st !== "scheduled";
    const home = resolveSide(m.home);
    const away = resolveSide(m.away);
    return (
      <div
        className="flex items-center gap-2 py-2 md:gap-2.5"
        style={{ borderBottom: "1px solid var(--border-softer)" }}
      >
        {/* الفترة + الملعب — دائمًا ظاهران، والموازية مميزة */}
        <div className="flex w-[128px] flex-none flex-col items-start gap-1 md:w-[150px]">
          <span className="num font-display text-[13.5px] font-bold md:text-[15px]" style={{ color: "var(--text-2)" }}>
            {formatSlot(m.slot)}
            {parallel ? (
              <span className="ms-1 text-[10.5px] font-semibold" style={{ color: "#ADC2FF" }}>
                ⇄ موازية
              </span>
            ) : null}
          </span>
          <VenueChip venue={m.venue} />
        </div>

        {/* الفريقان */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold text-white md:text-[15px]">
            <Shield code={home.team?.code ?? m.home} size={18} gold={false} />
            <span className="truncate">{home.team?.name ?? home.label}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold text-white md:text-[15px]">
            <Shield code={away.team?.code ?? m.away} size={18} gold={false} />
            <span className="truncate">{away.team?.name ?? away.label}</span>
          </span>
        </div>

        {/* الحالة */}
        <div className="flex flex-none items-center gap-1.5">
          {st === "live" || st === "half_time" ? (
            <span className="live-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--live)" }} />
          ) : null}
          {st === "approved" ? (
            <span className="text-[15px] font-bold" style={{ color: "var(--green-text)" }}>
              ✓
            </span>
          ) : null}
          <span
            className="num font-display text-[17px] font-bold md:text-[20px]"
            style={{ color: started ? "var(--gold)" : "var(--text-3)" }}
          >
            {started ? `${s.home} – ${s.away}` : "—"}
          </span>
        </div>
      </div>
    );
}

/* ———————————————— جدول ترتيب مصغّر لمجموعة ———————————————— */
function MiniTable({ group }: { group: string }) {
    const { seed, standingsOf, teamByCode } = useLeague();
    const rows = standingsOf(group);
    return (
      <section className="card overflow-hidden">
        <div
          className="flex items-center gap-2 px-3.5 py-2.5"
          style={{ borderBottom: "1px solid var(--border-soft)" }}
        >
          <span className="section-bar" />
          <h2 className="font-display text-[16px] font-bold text-white md:text-[18px]">
            المجموعة {group}
          </h2>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold md:text-[12.5px]"
          style={{ background: "rgba(255,255,255,.04)", color: "var(--text-3)" }}
        >
          <span className="w-4" />
          <span className="flex-1">الفريق</span>
          <span className="num w-[26px] text-center">ل</span>
          <span className="num w-[32px] text-center">±</span>
          <span className="num w-[38px] text-center">نقاط</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.teamCode}
            className="flex items-center gap-1.5 px-3 py-2 md:py-2.5"
            style={{
              borderInlineStart: `3px solid ${r.rank <= seed.qualifyPerGroup ? "var(--green-text)" : "transparent"}`,
              background: r.rank <= seed.qualifyPerGroup ? "rgba(30,127,58,.07)" : "transparent",
              borderBottom: "1px solid var(--border-softer)",
            }}
          >
            <span className="num w-4 font-display text-[13.5px] font-bold" style={{ color: "var(--text-3)" }}>
              {r.rank}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] font-semibold text-white md:text-[15px]">
              <Shield code={r.teamCode} size={20} gold={false} />
              <span className="truncate">{teamByCode(r.teamCode)?.name}</span>
            </span>
            <span className="num w-[26px] text-center font-display text-[13.5px] md:text-[15px]" style={{ color: "var(--text-2)" }}>
              {r.played}
            </span>
            <span className="num w-[32px] text-center font-display text-[13.5px] md:text-[15px]" style={{ color: "var(--text-2)" }}>
              {r.gd > 0 ? `+${r.gd}` : r.gd}
            </span>
            <span className="num w-[38px] text-center font-display text-[16px] font-bold md:text-[18px]" style={{ color: "var(--gold)" }}>
              {r.points}
            </span>
          </div>
        ))}
      </section>
    );
}
