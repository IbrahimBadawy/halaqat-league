"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Shield from "@/components/ui/Shield";
import LiveBadge from "@/components/ui/LiveBadge";
import { useLeague } from "@/lib/league/store";
import { formatSlot, formatNight, STAGE_LABELS } from "@/lib/league/seed";
import type { MatchEvent } from "@/lib/league/types";

const EVENT_META: Record<string, { icon: string; label: string }> = {
  goal: { icon: "⚽", label: "هدف" },
  yellow: { icon: "🟨", label: "إنذار" },
  red: { icon: "🟥", label: "طرد" },
  sub: { icon: "🔁", label: "تبديل" },
  shot: { icon: "🎯", label: "تسديدة" },
  foul: { icon: "⚠️", label: "خطأ" },
  save: { icon: "🧤", label: "تصدٍّ" },
  corner: { icon: "🚩", label: "ركنية" },
  injury: { icon: "⚕️", label: "إصابة" },
  power_card: { icon: "✨", label: "كارت قوة" },
  comment: { icon: "💬", label: "تعليق" },
};

const TABS = ["الأحداث", "التشكيلات", "الإحصائيات", "المواجهات"] as const;

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const store = useLeague();
  const { seed, hydrated, statusOf, scoreOf, minuteOf, resolveSide, eventsOf, state, matchOf } = store;
  const [tab, setTab] = useState<(typeof TABS)[number]>("الأحداث");
  const [, tick] = useState(0);

  const match = matchOf(params.id);
  const status = match ? statusOf(match.id) : "scheduled";
  const isLive = status === "live" || status === "half_time";

  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [isLive]);

  const events = useMemo(
    () => (match ? [...eventsOf(match.id)].reverse() : []),
    [match, eventsOf],
  );

  if (!hydrated) return null;
  if (!match)
    return (
      <div className="p-6 text-center" style={{ color: "var(--text-3)" }}>
        المباراة غير موجودة
      </div>
    );

  const home = resolveSide(match.home);
  const away = resolveSide(match.away);
  const score = scoreOf(match.id);
  const report = state.reports[match.id];
  const canRecord =
    (state.role === "recorder" || state.role === "admin") &&
    home.team &&
    away.team &&
    status !== "approved";
  // الأدمن يقدر يفتح الكونسول لمباراة معتمدة للتعديل (النتيجة تتحدّث تلقائيًا)
  const canAdminEdit = state.role === "admin" && !!home.team && !!away.team && status === "approved";

  const playerName = (id?: string) =>
    seed.players.find((p) => p.id === id)?.name ?? "";
  const teamName = (code: string) => store.teamByCode(code)?.name ?? code;

  return (
    <div>
      {/* شريط علوي */}
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <button
          onClick={() => router.back()}
          className="flex h-11 w-11 items-center justify-center rounded-[14px]"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
          aria-label="رجوع"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2.5" strokeLinecap="round">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <span className="flex-1 text-center text-[13.5px] font-semibold" style={{ color: "var(--text-3)" }}>
          {seed.name} · {match.stage === "group" ? `الليلة ${match.round}` : STAGE_LABELS[match.stage]}
        </span>
        {canRecord ? (
          <Link
            href={`/match/${match.id}/console`}
            className="btn-gold flex h-11 items-center justify-center px-3 text-[13.5px]"
          >
            {status === "scheduled" ? "بدء التسجيل" : "الكونسول"}
          </Link>
        ) : canAdminEdit ? (
          <Link
            href={`/match/${match.id}/console`}
            className="flex h-11 items-center justify-center rounded-[13px] px-3 text-[13.5px] font-bold"
            style={{ background: "rgba(43,79,194,.2)", color: "#ADC2FF", border: "1px solid rgba(43,79,194,.5)" }}
          >
            ✏️ تعديل
          </Link>
        ) : (
          <span className="w-11" />
        )}
      </div>

      {/* رأس النتيجة */}
      <div
        className="px-4 py-3.5"
        style={{
          background: "linear-gradient(135deg,var(--surface-1),var(--surface-2))",
          borderBottom: "1px solid rgba(224,178,74,.25)",
        }}
      >
        <div className="flex items-center gap-2">
          <TeamSide team={home} />
          <span className="flex flex-none flex-col items-center gap-1">
            {status === "scheduled" ? (
              <span className="num font-display text-[34px] font-bold" style={{ color: "var(--text-3)" }}>
                {formatSlot(match.slot)}
              </span>
            ) : (
              <span
                className={`num font-display text-[48px] font-bold leading-none tracking-wide ${isLive ? "gold-shimmer" : ""}`}
                style={isLive ? undefined : { color: "var(--gold)" }}
              >
                {/* away–home: المضيف يمين في RTL فيتطابق الرقم مع الاسم */}
                {score.away} – {score.home}
              </span>
            )}
            {isLive ? (
              <LiveBadge minute={minuteOf(match.id)} />
            ) : status === "finished" ? (
              <span className="pill px-2.5 py-0.5 text-[12.5px] font-bold" style={{ background: "rgba(244,196,48,.15)", color: "var(--warn)" }}>
                قيد الاعتماد
              </span>
            ) : status === "approved" ? (
              <span className="pill px-2.5 py-0.5 text-[12.5px] font-bold" style={{ background: "rgba(30,127,58,.18)", color: "var(--green-text)" }}>
                نتيجة معتمدة ✓
              </span>
            ) : null}
            <span className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>
              {match.venue} · {formatNight(match.matchDay)} · <span className="num">{formatSlot(match.slot)}</span>
            </span>
            {report?.homePens !== undefined && report?.awayPens !== undefined ? (
              <span className="num text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
                ركلات الترجيح {report.awayPens} – {report.homePens}
              </span>
            ) : null}
          </span>
          <TeamSide team={away} />
        </div>
        {report?.motmPlayerId ? (
          <div className="mt-2.5 flex justify-center">
            <span className="pill px-3 py-1 text-[13px] font-bold" style={{ background: "rgba(224,178,74,.14)", color: "var(--gold-light)", border: "1px solid rgba(224,178,74,.35)" }}>
              ⭐ نجم المباراة: {playerName(report.motmPlayerId)} ({teamName(seed.players.find((p) => p.id === report.motmPlayerId)?.teamCode ?? "")})
            </span>
          </div>
        ) : null}

        {/* زر البدء الصريح للطاقم: ضغطة واحدة = المباراة Live + فتح الكونسول */}
        {canRecord && status === "scheduled" && !store.leagueLocked ? (
          <button
            onClick={() => {
              store.startMatch(match.id);
              router.push(`/match/${match.id}/console`);
            }}
            className="btn-gold mt-3 flex h-12 w-full items-center justify-center gap-2 text-[15px]"
          >
            ▶️ ابدأ المباراة الآن (Live)
            {match.durationOverrideMinutes ? (
              <span className="num text-[13px] font-semibold opacity-80">
                · {match.durationOverrideMinutes} د
              </span>
            ) : null}
            {match.halvesOverride ? (
              <span className="text-[13px] font-semibold opacity-80">
                · {match.halvesOverride === 1 ? "شوط واحد" : "شوطان"}
              </span>
            ) : null}
          </button>
        ) : null}

        {/* زر تعديل واضح للأدمن على المباراة المعتمدة (النتيجة تتحدّث تلقائيًا) */}
        {canAdminEdit ? (
          <Link
            href={`/match/${match.id}/console`}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[13px] text-[15px] font-bold"
            style={{ background: "rgba(43,79,194,.2)", color: "#ADC2FF", border: "1px solid rgba(43,79,194,.5)" }}
          >
            ✏️ تعديل النتيجة والأحداث (أدمن)
          </Link>
        ) : null}
      </div>

      {/* التبويبات */}
      <div className="flex gap-0.5 border-b px-3" style={{ borderColor: "var(--border-soft)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 pb-2.5 pt-3 text-[14px]"
            style={{
              color: tab === t ? "var(--gold-light)" : "var(--text-3)",
              fontWeight: tab === t ? 700 : 500,
              borderBottom: tab === t ? "2px solid var(--gold)" : "2px solid transparent",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 py-3">
        {tab === "الأحداث" ? (
          events.length === 0 ? (
            <Empty text={status === "scheduled" ? "لم تبدأ المباراة بعد — الأحداث ستظهر هنا لحظة بلحظة" : "لا أحداث مسجلة"} />
          ) : (
            <div className="flex flex-col">
              {events.map((e, i) => (
                <EventRow key={e.id} e={e} latest={i === 0 && isLive} />
              ))}
            </div>
          )
        ) : tab === "التشكيلات" ? (
          <Lineups matchId={match.id} homeCode={home.team?.code} awayCode={away.team?.code} />
        ) : tab === "الإحصائيات" ? (
          <MatchStats matchId={match.id} homeCode={home.team?.code} awayCode={away.team?.code} />
        ) : (
          <HeadToHead currentId={match.id} homeCode={home.team?.code} awayCode={away.team?.code} />
        )}

        {/* مشاركة النتيجة على واتساب */}
        {status === "approved" || status === "finished" ? (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `⚽ ${seed.name}\n${home.team?.name ?? home.label} ${score.home} – ${score.away} ${away.team?.name ?? away.label}\n${formatNight(match.matchDay)} · ${formatSlot(match.slot)} · ${match.venue}` +
                (report?.motmPlayerId ? `\n⭐ نجم المباراة: ${playerName(report.motmPlayerId)}` : "") +
                `\n${seed.slogan}`,
            )}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-[13px] text-[14.5px] font-bold"
            style={{ background: "rgba(30,127,58,.18)", color: "var(--green-text)", border: "1px solid rgba(30,127,58,.5)" }}
          >
            💬 مشاركة النتيجة على واتساب
          </a>
        ) : null}
      </div>
    </div>
  );

  function TeamSide({ team }: { team: { team?: { code: string; name: string }; label: string } }) {
    const inner = (
      <span className="flex flex-1 flex-col items-center gap-1.5">
        <Shield code={team.team?.code ?? "؟"} size={48} />
        <span className="text-center text-[15px] font-semibold text-white">
          {team.team?.name ?? team.label}
        </span>
      </span>
    );
    return team.team ? (
      <Link href={`/team/${team.team.code}`} className="flex flex-1">
        {inner}
      </Link>
    ) : (
      inner
    );
  }

  function EventRow({ e, latest }: { e: MatchEvent; latest: boolean }) {
    const meta = EVENT_META[e.type];
    const title =
      e.type === "goal"
        ? e.subtype === "own_goal"
          ? `⚽ هدف عكسي — ${playerName(e.playerId) || "لاعب"} (لصالح ${teamName(e.teamCode)})`
          : `⚽ هدف${e.value > 1 ? " مضاعف (×2)" : ""} — ${playerName(e.playerId) || teamName(e.teamCode)}`
        : e.type === "sub"
          ? `تبديل — خروج ${playerName(e.playerId)} ودخول ${playerName(e.secondaryPlayerId)}`
          : e.type === "comment"
            ? e.note ?? "تعليق"
            : e.type === "red" && e.penaltyScope
              ? `${meta.label} ${
                  e.penaltyScope === "minutes"
                    ? `${e.penaltyMinutes} دقائق`
                    : e.penaltyScope === "league"
                      ? "من الدوري كله"
                      : "باقي المباراة"
                } — ${playerName(e.playerId) || teamName(e.teamCode)}`
              : `${meta.label} — ${playerName(e.playerId) || teamName(e.teamCode)}`;
    const sub =
      e.type === "goal" && e.secondaryPlayerId
        ? `صناعة: ${playerName(e.secondaryPlayerId)} · ${teamName(e.teamCode)}`
        : e.subtype === "second_yellow"
          ? `إنذار ثانٍ · ${teamName(e.teamCode)}`
          : teamName(e.teamCode);
    return (
      <div
        className="flex items-start gap-2.5 rounded-[10px] px-2 py-2.5"
        style={{
          borderBottom: "1px solid rgba(201,209,230,.07)",
          background: latest ? "rgba(224,178,74,.08)" : "transparent",
          opacity: e.deleted ? 0.45 : 1,
        }}
      >
        <span className="num w-8 flex-none pt-1.5 text-center font-display text-[14px] font-bold" style={{ color: "var(--text-2)" }}>
          د {e.minute}
        </span>
        <span
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] text-[15px]"
          style={{ background: e.type === "power_card" ? "rgba(255,138,31,.18)" : "rgba(255,255,255,.05)" }}
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="block text-[14.5px] font-semibold text-white" style={e.deleted ? { textDecoration: "line-through" } : undefined}>
            {title}
          </span>
          <span className="mt-0.5 block text-[13.5px]" style={{ color: "var(--text-3)" }}>
            {e.deleted ? `محذوف: ${e.deletedReason}` : sub}
          </span>
        </span>
      </div>
    );
  }
}

function Empty({ text }: { text: string }) {
  return (
    <p className="py-10 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
      {text}
    </p>
  );
}

/** المواجهات السابقة بين الفريقين (المعتمدة فقط) */
function HeadToHead({
  currentId,
  homeCode,
  awayCode,
}: {
  currentId: string;
  homeCode?: string;
  awayCode?: string;
}) {
  const { matches, statusOf, scoreOf, teamByCode } = useLeague();
  if (!homeCode || !awayCode) return <Empty text="تظهر المواجهات بعد تحدد الفريقين" />;
  const meetings = matches.filter(
    (m) =>
      m.id !== currentId &&
      statusOf(m.id) === "approved" &&
      ((m.home === homeCode && m.away === awayCode) || (m.home === awayCode && m.away === homeCode)),
  );
  if (meetings.length === 0)
    return <Empty text="هذه أول مواجهة بين الفريقين في البطولة" />;
  return (
    <div className="flex flex-col gap-2">
      {meetings.map((m) => {
        const s = scoreOf(m.id);
        return (
          <Link key={m.id} href={`/match/${m.id}`} className="card flex items-center gap-2.5 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
              {teamByCode(m.home)?.name}{" "}
              <span className="num font-display font-bold" style={{ color: "var(--gold)" }}>
                {/* away–home: المضيف يمين في RTL */}
                {s.away} – {s.home}
              </span>{" "}
              {teamByCode(m.away)?.name}
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
              {formatNight(m.matchDay)} · {m.venue}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function Lineups({ matchId, homeCode, awayCode }: { matchId: string; homeCode?: string; awayCode?: string }) {
  const { onFieldPlayers, benchPlayers, teamByCode } = useLeague();
  if (!homeCode || !awayCode) return <Empty text="تتحدد التشكيلات بعد معرفة الفريقين" />;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[homeCode, awayCode].map((code) => (
        <div key={code}>
          <div className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-white">
            <Shield code={code} size={20} gold={false} />
            {teamByCode(code)?.name}
          </div>
          {onFieldPlayers(matchId, code).map((p) => (
            <div key={p.id} className="card mb-1.5 flex items-center gap-2 px-2 py-1.5">
              <span className="num flex h-7 w-7 items-center justify-center rounded-lg font-display text-[13px] font-bold" style={{ background: "rgba(255,255,255,.07)", color: "var(--text-2)" }}>
                {p.shirt}
              </span>
              <span className="truncate text-[13px] font-medium text-white">{p.name}</span>
            </div>
          ))}
          <div className="mb-1 mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
            البدلاء
          </div>
          {benchPlayers(matchId, code).map((p) => (
            <div key={p.id} className="mb-1.5 flex items-center gap-2 rounded-[12px] px-2 py-1.5 opacity-75" style={{ border: "1px dashed rgba(201,209,230,.25)" }}>
              <span className="num flex h-6 w-6 items-center justify-center rounded-lg font-display text-[12px] font-bold" style={{ background: "rgba(255,255,255,.06)", color: "var(--text-2)" }}>
                {p.shirt}
              </span>
              <span className="truncate text-[13px]" style={{ color: "var(--text-2)" }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MatchStats({ matchId, homeCode, awayCode }: { matchId: string; homeCode?: string; awayCode?: string }) {
  const { eventsOf, teamByCode } = useLeague();
  if (!homeCode || !awayCode) return <Empty text="لا إحصائيات بعد" />;
  const events = eventsOf(matchId).filter((e) => !e.deleted);
  const count = (code: string, type: string) =>
    events.filter((e) => e.teamCode === code && e.type === type).length;
  const rows: { label: string; type: string }[] = [
    { label: "الأهداف", type: "goal" },
    { label: "التسديدات", type: "shot" },
    { label: "التصديات", type: "save" },
    { label: "الركنيات", type: "corner" },
    { label: "الأخطاء", type: "foul" },
    { label: "الإنذارات", type: "yellow" },
    { label: "الطرد", type: "red" },
  ];
  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between text-[13px] font-bold text-white">
        <span>{teamByCode(homeCode)?.name}</span>
        <span>{teamByCode(awayCode)?.name}</span>
      </div>
      {rows.map((r) => {
        const h = count(homeCode, r.type);
        const a = count(awayCode, r.type);
        const total = h + a || 1;
        return (
          <div key={r.type} className="py-1.5">
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="num font-display font-bold text-white">{h}</span>
              <span style={{ color: "var(--text-3)" }}>{r.label}</span>
              <span className="num font-display font-bold text-white">{a}</span>
            </div>
            <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
              <span style={{ width: `${(h / total) * 100}%`, background: "var(--gold)" }} />
              <span style={{ width: `${(a / total) * 100}%`, background: "var(--shield-1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
