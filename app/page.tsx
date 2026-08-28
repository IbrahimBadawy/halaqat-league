"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Shield from "@/components/ui/Shield";
import SectionTitle from "@/components/ui/SectionTitle";
import LiveBadge from "@/components/ui/LiveBadge";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

const STORIES = [
  { icon: "🏆", label: "الكأس", href: "/standings", ring: "linear-gradient(135deg,#F5D271,#B8871F)" },
  { icon: "📅", label: "الجدول", href: "/matches", ring: "linear-gradient(135deg,#2B4FC2,#1E3A9E)" },
  { icon: "🔮", label: "التوقعات", href: "/predict", ring: "linear-gradient(135deg,#2B4FC2,#1E3A9E)" },
  { icon: "⚡", label: "كروت القوة", href: "/cards", ring: "linear-gradient(135deg,#FF8A1F,#E5731F)" },
  { icon: "📊", label: "الإحصائيات", href: "/stats", ring: "linear-gradient(135deg,#1E7F3A,#4CC07A)" },
  { icon: "🖼️", label: "البوستر", href: "/poster", ring: "linear-gradient(135deg,#F5D271,#B8871F)" },
  { icon: "📺", label: "شاشة الملعب", href: "/tv", ring: "linear-gradient(135deg,#E5484D,#B42318)" },
  { icon: "📜", label: "اللائحة", href: "/rules", ring: "linear-gradient(135deg,#F5D271,#B8871F)" },
];

export default function HomePage() {
  const store = useLeague();
  const { seed, matches, statusOf, scoreOf, minuteOf, resolveSide, eventsOf, hydrated } = store;
  const { leagues, activeLeagueId, setActiveLeague } = store;
  const [, tick] = useState(0);
  const [showLeagues, setShowLeagues] = useState(false);

  // كل الجارية الآن — قد تتوازى مباراتان في نفس الفترة على ملعبين
  const liveMatches = matches.filter(
    (m) => statusOf(m.id) === "live" || statusOf(m.id) === "half_time",
  );
  const anyLive = liveMatches.length > 0;

  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => tick((x) => x + 1), 10000);
    return () => clearInterval(t);
  }, [anyLive]);

  // الليلة الحالية: أول يوم فيه مباراة غير معتمدة، وإلا آخر ليلة
  const currentNight =
    seed.matchDays.find((d) =>
      matches.some((m) => m.matchDay === d && statusOf(m.id) !== "approved"),
    ) ?? seed.matchDays[seed.matchDays.length - 1];
  const nightNumber = seed.matchDays.indexOf(currentNight) + 1;

  const tonight = matches.filter((m) => m.matchDay === currentNight);
  const upcoming = tonight.filter((m) => statusOf(m.id) === "scheduled");
  const finishedTonight = tonight.filter(
    (m) => statusOf(m.id) === "approved" || statusOf(m.id) === "finished",
  );

  if (!hydrated) return null;

  return (
    <div className="px-4">
      {/* الترويسة: الشعار + اسم الدوري + الليلة */}
      <header className="flex items-center gap-2.5 pb-2 pt-4">
        <span className="relative">
          {/* التاج الذهبي فوق الدرع — هوية البوستر */}
          <span
            className="absolute -top-2 start-1/2 h-2.5 w-5 translate-x-1/2"
            style={{
              background: "linear-gradient(180deg,#F5D271,#D9A83C)",
              clipPath:
                "polygon(0 100%, 0 30%, 25% 60%, 50% 0, 75% 60%, 100% 30%, 100% 100%)",
            }}
          />
          <Shield code="ح" size={34} />
        </span>
        <span className="min-w-0 flex-1">
          {/* اسم الدوري النشط — يفتح مبدّل الدوريات عند وجود أكثر من دوري */}
          <button
            onClick={() => leagues.length > 1 && setShowLeagues(true)}
            className="flex max-w-full items-center gap-1 text-start"
          >
            <span className="truncate font-display text-[18px] font-bold leading-tight text-white">
              {seed.name.split("—")[0].trim()}
            </span>
            {leagues.length > 1 ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            ) : null}
          </button>
          <span className="block text-[13.5px] font-medium" style={{ color: "var(--text-3)" }}>
            {formatNight(currentNight)} — الليلة <span className="num">{nightNumber}</span> من{" "}
            <span className="num">{seed.matchDays.length}</span>
          </span>
        </span>
        <Link
          href="/notifications"
          aria-label="الإشعارات"
          className="relative flex h-11 w-11 items-center justify-center rounded-[14px]"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
        >
          <span className="text-[17px]">🔔</span>
          {anyLive ? (
            <span
              className="absolute end-2.5 top-2 h-2 w-2 rounded-full"
              style={{ background: "var(--live)", border: "2px solid var(--bg-base)" }}
            />
          ) : null}
        </Link>
        <Link
          href="/me"
          className="flex h-11 w-11 items-center justify-center rounded-full font-display text-[16px] font-bold text-white"
          style={{
            background: "linear-gradient(135deg,var(--shield-1),var(--shield-2))",
            border: "2px solid rgba(224,178,74,.6)",
          }}
        >
          م
        </Link>
      </header>

      {/* شريط اللقطات */}
      <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-3 pt-1">
        {STORIES.map((s) => (
          <Link key={s.label} href={s.href} className="flex flex-none flex-col items-center gap-1.5">
            <span
              className="inline-flex h-[62px] w-[62px] rounded-full p-[2.5px]"
              style={{ background: s.ring }}
            >
              <span
                className="flex flex-1 items-center justify-center rounded-full text-[22px]"
                style={{ background: "var(--surface-1)", border: "2.5px solid var(--bg-base)" }}
              >
                {s.icon}
              </span>
            </span>
            <span className="text-[12px] font-medium" style={{ color: "var(--text-2)" }}>
              {s.label}
            </span>
          </Link>
        ))}
      </div>

      {/* بطاقات المباشر (كل الجارية — قد تتوازى مباراتان) أو بطاقة الليلة */}
      {anyLive ? (
        liveMatches.map((lm) => {
          const lastGoal = [...eventsOf(lm.id)]
            .reverse()
            .find((e) => e.type === "goal" && !e.deleted);
          return (
            <Link key={lm.id} href={`/match/${lm.id}`} className="live-card mb-4 block p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <LiveBadge />
                <span className="text-[13.5px] font-medium" style={{ color: "var(--text-3)" }}>
                  الليلة <span className="num">{lm.round}</span> ·{" "}
                  <span className="num">{formatSlot(lm.slot)}</span>
                </span>
                <VenueChip venue={lm.venue} />
                <span className="num ms-auto font-display text-[16px] font-bold" style={{ color: "var(--gold)" }}>
                  د {minuteOf(lm.id)}
                </span>
              </div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex flex-1 flex-col items-center gap-1.5">
                  <Shield code={resolveSide(lm.home).team?.code ?? "؟"} size={46} />
                  <span className="text-[15px] font-semibold text-white">
                    {resolveSide(lm.home).team?.name ?? resolveSide(lm.home).label}
                  </span>
                </span>
                <span className="num gold-shimmer flex-none font-display text-[48px] font-bold tracking-wide">
                  {/* away–home: المضيف يمين في RTL */}
                  {scoreOf(lm.id).away} – {scoreOf(lm.id).home}
                </span>
                <span className="flex flex-1 flex-col items-center gap-1.5">
                  <Shield code={resolveSide(lm.away).team?.code ?? "؟"} size={46} />
                  <span className="text-[15px] font-semibold text-white">
                    {resolveSide(lm.away).team?.name ?? resolveSide(lm.away).label}
                  </span>
                </span>
              </div>
              {lastGoal ? (
                <div className="mb-3 flex justify-center">
                  <span
                    className="pill float-banner inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13.5px] font-bold"
                    style={{
                      background: "linear-gradient(90deg,#F5D271,#D9A83C)",
                      color: "#211002",
                      boxShadow: "0 6px 18px rgba(224,178,74,.35)",
                    }}
                  >
                    ⚽ هدف! {seed.players.find((p) => p.id === lastGoal.playerId)?.name ?? "لاعب"} —{" "}
                    <span className="num">د {lastGoal.minute}</span>
                    {lastGoal.value > 1 ? " (يُحتسب بهدفين ⚡)" : ""}
                  </span>
                </div>
              ) : null}
              <div className="btn-gold flex h-12 items-center justify-center text-[15px]">
                تابع المباشر
              </div>
            </Link>
          );
        })
      ) : (
        <div className="live-card mb-4 p-4 text-center">
          <div className="mb-1 font-display text-[19px] font-bold text-white">
            {seed.name}
          </div>
          <div className="slogan-ribbon mx-auto mb-3 inline-block px-4 py-1 text-[13.5px] font-bold">
            {seed.slogan}
          </div>
          <div className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
            {tonight.length > 0 && upcoming.length === tonight.length ? (
              <>
                الليلة <span className="num">{nightNumber}</span> تبدأ في{" "}
                <span className="num font-semibold" style={{ color: "var(--gold-light)" }}>
                  {formatSlot(tonight[0].slot)}
                </span>{" "}
                · <span className="num">{tonight.length}</span> مباريات
              </>
            ) : (
              "تابع المباريات والترتيب لحظة بلحظة"
            )}
          </div>
        </div>
      )}

      {/* باقي الليلة */}
      {upcoming.length > 0 ? (
        <>
          <SectionTitle
            trailing={
              <Link href="/matches" className="text-[14px] font-semibold" style={{ color: "var(--gold)" }}>
                الجدول
              </Link>
            }
          >
            {anyLive || finishedTonight.length > 0 ? "باقي الليلة" : "مباريات الليلة"}
          </SectionTitle>
          <div className="mb-4 flex flex-col gap-2">
            {upcoming.map((m) => {
              const h = resolveSide(m.home);
              const a = resolveSide(m.away);
              return (
                <Link key={m.id} href={`/match/${m.id}`} className="card flex items-center gap-2.5 px-3 py-2.5">
                  <span
                    className="num flex-none rounded-lg px-2 py-1 text-[14px] font-semibold"
                    style={{
                      color: "var(--gold-light)",
                      background: "rgba(224,178,74,.1)",
                      border: "1px solid rgba(224,178,74,.25)",
                    }}
                  >
                    {formatSlot(m.slot)}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14.5px] font-semibold text-white">
                    <Shield code={h.team?.code ?? "؟"} size={22} gold={false} />
                    <span className="truncate">{h.team?.name ?? h.label}</span>
                    <span style={{ color: "var(--text-3)", fontWeight: 400 }}>×</span>
                    <span className="truncate">{a.team?.name ?? a.label}</span>
                    <Shield code={a.team?.code ?? "؟"} size={22} gold={false} />
                  </span>
                  <VenueChip venue={m.venue} />
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {/* انتهت الليلة */}
      {finishedTonight.length > 0 ? (
        <>
          <SectionTitle>انتهت الليلة</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {finishedTonight.map((m) => {
              const h = resolveSide(m.home);
              const a = resolveSide(m.away);
              const s = scoreOf(m.id);
              return (
                <Link key={m.id} href={`/match/${m.id}`} className="card flex flex-col items-center gap-1 px-3 py-2.5">
                  <span className="max-w-full truncate text-[13.5px] font-semibold text-white">
                    {h.team?.name ?? h.label} × {a.team?.name ?? a.label}
                  </span>
                  <span className="num font-display text-[22px] font-bold" style={{ color: "var(--gold)" }}>
                    {/* away–home: المضيف يمين في RTL */}
                    {s.away} – {s.home}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--text-3)" }}>
                    <span className="num">{formatSlot(m.slot)}</span>
                    <VenueChip venue={m.venue} />
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                    {statusOf(m.id) === "finished" ? "قيد الاعتماد" : "انتهت · التفاصيل ←"}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      ) : null}

      {/* مختصر الترتيب */}
      <MiniStandings />

      {/* مبدّل الدوريات — زي برامج الكورة */}
      {showLeagues ? (
        <div
          className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setShowLeagues(false)}
        >
          <div
            className="sheet max-h-[70dvh] w-full max-w-[430px] overflow-y-auto px-4 pb-8 pt-3"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full" style={{ background: "rgba(255,255,255,.25)" }} />
            <div className="mb-3 font-display text-[17px] font-bold text-white">اختر الدوري</div>
            {leagues.map((l) => {
              const active = l.id === activeLeagueId;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    setActiveLeague(l.id);
                    setShowLeagues(false);
                  }}
                  className="mb-2 flex w-full items-center gap-2.5 rounded-[13px] px-3.5 py-3 text-start"
                  style={
                    active
                      ? { background: "rgba(224,178,74,.13)", border: "1.5px solid rgba(224,178,74,.55)" }
                      : { background: "rgba(255,255,255,.04)", border: "1px solid var(--border-soft)" }
                  }
                >
                  <span className="text-[20px]">🏆</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-white">{l.name}</span>
                    <span className="block text-[12px]" style={{ color: "var(--text-3)" }}>
                      {l.season ?? ""}
                      {l.status === "archived" ? " · منتهٍ (مؤرشف)" : ""}
                      {l.status === "draft" ? " · لم يبدأ بعد" : ""}
                    </span>
                  </span>
                  {active ? (
                    <span className="text-[13px] font-bold" style={{ color: "var(--gold-light)" }}>
                      الحالي ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniStandings() {
  const { standingsOf, teamByCode, seed, groupNames } = useLeague();
  const groups = groupNames;
  const anyPlayed = groups.some((g) => standingsOf(g).some((r) => r.played > 0));
  if (!anyPlayed) return null;
  return (
    <>
      <SectionTitle
        trailing={
          <Link href="/standings" className="text-[14px] font-semibold" style={{ color: "var(--gold)" }}>
            الترتيب كاملًا
          </Link>
        }
      >
        صدارة المجموعات
      </SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {groups.map((g) => {
          const top = standingsOf(g).slice(0, seed.qualifyPerGroup + 1);
          return (
            <div key={g} className="card p-2.5">
              <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--text-3)" }}>
                المجموعة {g}
              </div>
              {top.map((r) => (
                <div key={r.teamCode} className="flex items-center gap-1.5 py-1">
                  <span className="num w-4 font-display text-[13px] font-bold" style={{ color: "var(--text-3)" }}>
                    {r.rank}
                  </span>
                  <Shield code={r.teamCode} size={18} gold={false} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                    {teamByCode(r.teamCode)?.name}
                  </span>
                  <span className="num font-display text-[14px] font-bold" style={{ color: "var(--gold)" }}>
                    {r.points}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
