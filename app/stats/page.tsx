"use client";

import SectionTitle from "@/components/ui/SectionTitle";
import Shield from "@/components/ui/Shield";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";
import type { MatchEvent } from "@/lib/league/types";

export default function StatsPage() {
  const {
    seed,
    hydrated,
    state,
    statusOf,
    matches,
    scoreOf,
    resolveSide,
    playersOf,
    suspensions,
    matchOf,
  } = useLeague();
  if (!hydrated) return null;

  // تُحتسب الإحصائيات من المباريات المعتمدة + الجارية (الأحداث غير المحذوفة)
  const counted = new Set(
    matches.filter((m) => statusOf(m.id) !== "scheduled").map((m) => m.id),
  );
  const events = state.events.filter((e) => counted.has(e.matchId) && !e.deleted);

  const playerName = (id: string) => seed.players.find((p) => p.id === id);

  function leaderboard(
    filter: (e: MatchEvent) => boolean,
    valueOf: (e: MatchEvent) => number = () => 1,
  ) {
    const totals = new Map<string, number>();
    for (const e of events) {
      if (!filter(e) || !e.playerId) continue;
      totals.set(e.playerId, (totals.get(e.playerId) ?? 0) + valueOf(e));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid, total]) => ({ player: playerName(pid), total }));
  }

  const scorers = leaderboard((e) => e.type === "goal", (e) => e.value);
  // الصناعة تُحسب من secondaryPlayerId
  const assistTotals = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "goal" || !e.secondaryPlayerId) continue;
    assistTotals.set(e.secondaryPlayerId, (assistTotals.get(e.secondaryPlayerId) ?? 0) + 1);
  }
  const assistBoard = [...assistTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, total]) => ({ player: playerName(pid), total }));

  const cards = leaderboard((e) => e.type === "yellow" || e.type === "red", (e) =>
    e.type === "red" ? 3 : 1,
  );

  const motm = new Map<string, number>();
  for (const [mid, rep] of Object.entries(state.reports)) {
    if (!counted.has(mid) || !rep.motmPlayerId) continue;
    motm.set(rep.motmPlayerId, (motm.get(rep.motmPlayerId) ?? 0) + 1);
  }
  const motmBoard = [...motm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, total]) => ({ player: playerName(pid), total }));

  // الشباك النظيفة — من المباريات المعتمدة فقط: حارس الفريق (قميص 1) الذي لم تدخل شباكه أهداف
  const cleanTotals = new Map<string, number>();
  for (const m of matches) {
    if (statusOf(m.id) !== "approved") continue;
    const score = scoreOf(m.id);
    const sides: { raw: string; conceded: number }[] = [
      { raw: m.home, conceded: score.away },
      { raw: m.away, conceded: score.home },
    ];
    for (const side of sides) {
      if (side.conceded !== 0) continue;
      const team = resolveSide(side.raw).team;
      if (!team) continue;
      const keeper = playersOf(team.code).find((p) => p.shirt === 1);
      if (!keeper) continue;
      cleanTotals.set(keeper.id, (cleanTotals.get(keeper.id) ?? 0) + 1);
    }
  }
  const cleanBoard = [...cleanTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, total]) => ({ player: playerName(pid), total }));

  // الإيقافات المعروضة: التي لم تُقضَ بعد (مباراة الغياب لم تُعتمد)
  const activeSuspensions = suspensions.filter((s) => statusOf(s.forMatchId) !== "approved");

  const boards: { title: string; icon: string; rows: { player?: { id: string; name: string; teamCode: string }; total: number }[]; unit: string }[] = [
    { title: "الهدافون", icon: "⚽", rows: scorers, unit: "هدف" },
    { title: "صناع الأهداف", icon: "🎯", rows: assistBoard, unit: "صناعة" },
    { title: "نجوم المباريات", icon: "⭐", rows: motmBoard, unit: "مرة" },
    { title: "الشباك النظيفة", icon: "🧤", rows: cleanBoard, unit: "مباراة" },
    { title: "الكروت (نقاط خصم)", icon: "🟨", rows: cards, unit: "نقطة" },
  ];

  return (
    <div className="px-4">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">الإحصائيات</h1>
      {events.length === 0 ? (
        <p className="py-10 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
          الإحصائيات تظهر أولًا بأول مع تسجيل المباريات الليلة ⚽
        </p>
      ) : (
        boards.map((b) => (
          <div key={b.title} className="mb-4">
            <SectionTitle>
              {b.icon} {b.title}
            </SectionTitle>
            {b.rows.length === 0 ? (
              <p className="card px-3 py-3 text-[13px]" style={{ color: "var(--text-3)" }}>
                لا بيانات بعد
              </p>
            ) : (
              <div className="card overflow-hidden">
                {b.rows.map((r, i) => (
                  <div
                    key={r.player?.id ?? i}
                    className="flex items-center gap-2.5 px-3 py-2.5"
                    style={{
                      borderBottom: "1px solid var(--border-softer)",
                      background: i === 0 ? "rgba(224,178,74,.07)" : "transparent",
                    }}
                  >
                    <span className="num w-5 text-center font-display text-[14px] font-bold" style={{ color: i === 0 ? "var(--gold)" : "var(--text-3)" }}>
                      {i + 1}
                    </span>
                    <Shield code={r.player?.teamCode ?? "؟"} size={20} gold={false} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
                      {r.player?.name}
                      <span className="ms-1.5 text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                        {r.player ? `(${r.player.teamCode})` : ""}
                      </span>
                    </span>
                    <span className="num font-display text-[15px] font-bold" style={{ color: "var(--gold)" }}>
                      {r.total}
                    </span>
                    <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
                      {b.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {/* الموقوفون — إيقافات تلقائية محتسبة من الكروت، مع المباراة التي يغيبون عنها */}
      <div className="mb-6">
        <SectionTitle>🚫 الموقوفون</SectionTitle>
        {activeSuspensions.length === 0 ? (
          <p className="card px-3 py-3 text-[13px]" style={{ color: "var(--text-3)" }}>
            لا إيقافات حالية
          </p>
        ) : (
          <div className="card overflow-hidden">
            {activeSuspensions.map((s) => {
              const player = playerName(s.playerId);
              const missed = matchOf(s.forMatchId);
              return (
                <div
                  key={`${s.playerId}-${s.forMatchId}`}
                  className="flex items-start gap-2.5 px-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--border-softer)" }}
                >
                  <Shield code={s.teamCode} size={22} gold={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-white">
                        {player?.name ?? s.playerId}
                      </span>
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                        ({s.teamCode})
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--warn)" }}>
                      {s.reason}
                    </div>
                    {missed ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                        <span>يغيب عن مباراة</span>
                        <span className="pill px-2 py-0.5 font-semibold" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)", color: "var(--text-2)" }}>
                          {formatNight(missed.matchDay)}
                        </span>
                        <span className="pill num px-2 py-0.5 font-semibold" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)", color: "var(--text-2)" }}>
                          {formatSlot(missed.slot)}
                        </span>
                        <VenueChip venue={missed.venue} />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
