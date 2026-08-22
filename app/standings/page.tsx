"use client";

import { useState } from "react";
import Link from "next/link";
import Shield from "@/components/ui/Shield";
import SectionTitle from "@/components/ui/SectionTitle";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

export default function StandingsPage() {
  const { standingsOf, teamByCode, seed, matches, hydrated, statusOf, scoreOf, resolveSide, groupNames } = useLeague();
  const [pickedGroup, setGroup] = useState<string | null>(null);

  if (!hydrated) return null;

  // المجموعة الفعلية: المختارة إن كانت موجودة في الدوري النشط، وإلا الأولى
  const group = pickedGroup && groupNames.includes(pickedGroup) ? pickedGroup : (groupNames[0] ?? "A");
  const rows = standingsOf(group);
  const knockouts = matches.filter((m) => m.stage !== "group");

  return (
    <div className="px-4">
      <div className="flex items-center gap-2 pb-2 pt-4">
        <h1 className="font-display text-[22px] font-bold text-white">الترتيب</h1>
        <span className="ms-auto flex gap-1.5">
          {groupNames.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="pill px-3.5 py-1.5 text-[13px]"
              style={
                group === g
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
              المجموعة {g}
            </button>
          ))}
        </span>
      </div>

      {/* جدول الترتيب */}
      <div className="overflow-hidden rounded-[14px]" style={{ border: "1px solid var(--border-soft)" }}>
        <div
          className="flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-semibold"
          style={{ background: "rgba(255,255,255,.04)", color: "var(--text-3)" }}
        >
          <span className="w-4" />
          <span className="flex-1">الفريق</span>
          <span className="num w-[22px] text-center">ل</span>
          <span className="num w-[22px] text-center">ف</span>
          <span className="num w-[22px] text-center">ت</span>
          <span className="num w-[22px] text-center">خ</span>
          <span className="num w-[28px] text-center">±</span>
          <span className="num w-[34px] text-center">نقاط</span>
        </div>
        {rows.map((r) => {
          const qualifies = r.rank <= seed.qualifyPerGroup;
          return (
            <div
              key={r.teamCode}
              className="flex items-center gap-1.5 px-2.5 py-2.5"
              style={{
                borderInlineStart: `3px solid ${qualifies ? "var(--green-text)" : "transparent"}`,
                background: qualifies ? "rgba(30,127,58,.07)" : "transparent",
                borderBottom: "1px solid var(--border-softer)",
              }}
            >
              <span className="num w-4 font-display text-[13.5px] font-bold" style={{ color: "var(--text-3)" }}>
                {r.rank}
              </span>
              <Link
                href={`/team/${r.teamCode}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] font-semibold text-white"
              >
                <Shield code={r.teamCode} size={20} gold={false} />
                <span className="truncate">{teamByCode(r.teamCode)?.name}</span>
                {r.adjustments !== 0 ? (
                  <span title="تعديل نقاط" style={{ color: "var(--warn)" }}>
                    ★
                  </span>
                ) : null}
              </Link>
              <span className="num w-[22px] text-center font-display text-[13.5px]" style={{ color: "var(--text-2)" }}>{r.played}</span>
              <span className="num w-[22px] text-center font-display text-[13.5px]" style={{ color: "var(--text-2)" }}>{r.won}</span>
              <span className="num w-[22px] text-center font-display text-[13.5px]" style={{ color: "var(--text-2)" }}>{r.drawn}</span>
              <span className="num w-[22px] text-center font-display text-[13.5px]" style={{ color: "var(--text-2)" }}>{r.lost}</span>
              <span className="num w-[28px] text-center font-display text-[13.5px]" style={{ color: "var(--text-2)" }}>
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </span>
              <span className="num w-[34px] text-center font-display text-[15px] font-bold" style={{ color: "var(--gold)" }}>
                {r.points}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 px-1 py-2.5 text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
        {knockouts.length > 0 ? (
          <span>
            <span className="me-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--green-text)" }} />
            يتأهل للإقصائيات
          </span>
        ) : (
          <span>
            <span className="me-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--green-text)" }} />
            مراكز الصدارة
          </span>
        )}
        <span style={{ color: "var(--warn)" }}>★ تعديل نقاط (كارت/عقوبة)</span>
      </div>

      {/* شجرة الكأس — تظهر فقط للدوريات التي فيها إقصائيات */}
      {knockouts.length > 0 ? (
        <>
          <SectionTitle>شجرة الكأس — {formatNight(knockouts[0].matchDay)}</SectionTitle>
          <div className="flex flex-col gap-2 pb-5">
            <div className="grid grid-cols-2 gap-2">
              {knockouts
                .filter((m) => m.stage === "semi_1" || m.stage === "semi_2")
                .map((m) => (
                  <BracketCard key={m.id} matchId={m.id} title={m.stage === "semi_1" ? "نصف النهائي 1" : "نصف النهائي 2"} />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {knockouts
                .filter((m) => m.stage === "third_place" || m.stage === "final")
                .map((m) => (
                  <BracketCard key={m.id} matchId={m.id} title={m.stage === "final" ? "النهائي 🏆" : "المركز الثالث"} final={m.stage === "final"} />
                ))}
            </div>
          </div>
        </>
      ) : (
        <div className="pb-5" />
      )}
    </div>
  );

  function BracketCard({ matchId, title, final }: { matchId: string; title: string; final?: boolean }) {
    const m = matches.find((x) => x.id === matchId)!;
    const h = resolveSide(m.home);
    const a = resolveSide(m.away);
    const st = statusOf(m.id);
    const s = scoreOf(m.id);
    const showScore = st !== "scheduled";
    return (
      <Link
        href={`/match/${m.id}`}
        className="rounded-[13px] p-2.5"
        style={
          final
            ? {
                background: "linear-gradient(150deg,rgba(224,178,74,.14),rgba(224,178,74,.04))",
                border: "1px solid rgba(224,178,74,.5)",
                boxShadow: "0 0 18px rgba(224,178,74,.12)",
              }
            : {
                background: "linear-gradient(135deg,var(--surface-1),var(--surface-2))",
                border: "1px solid var(--border-soft)",
              }
        }
      >
        <div className="mb-1.5 text-[11.5px] font-semibold" style={{ color: final ? "var(--gold-light)" : "var(--text-3)" }}>
          {title} · {formatNight(m.matchDay)} · <span className="num">{formatSlot(m.slot)}</span>
          {" · "}
          <span style={{ color: m.venue !== "ملعب 1" ? "#ADC2FF" : undefined }}>{m.venue}</span>
          {final ? (
            <>
              {" "}· فترة <span className="num">30</span> د
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between text-[13.5px] font-semibold text-white">
          <span className="truncate">{h.team?.name ?? h.label}</span>
          <span className="num" style={{ color: showScore ? "var(--gold)" : "var(--text-3)" }}>
            {showScore ? s.home : "—"}
          </span>
        </div>
        <div className="my-1.5 h-px" style={{ background: "var(--border-softer)" }} />
        <div className="flex items-center justify-between text-[13.5px] font-semibold text-white">
          <span className="truncate">{a.team?.name ?? a.label}</span>
          <span className="num" style={{ color: showScore ? "var(--gold)" : "var(--text-3)" }}>
            {showScore ? s.away : "—"}
          </span>
        </div>
      </Link>
    );
  }
}
