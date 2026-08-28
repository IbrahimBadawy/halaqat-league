"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Shield from "@/components/ui/Shield";
import SectionTitle from "@/components/ui/SectionTitle";
import MatchRow from "@/components/match/MatchRow";
import { useLeague } from "@/lib/league/store";

/**
 * كارت لاعب واحد. للأدمن: زر ✏️ يحوّل الاسم لحقل تعديل مباشر (حفظ/إلغاء)
 * عبر updatePlayer. مكوّن على مستوى الملف عمدًا (لا داخل الصفحة) لأن صفحة
 * الفريق تُعاد رندرتها مع الساعة/Realtime فتفقد حالة التعديل لو كان داخلها.
 */
function PlayerCard({
  player,
  goals,
  suspended,
}: {
  player: { id: string; shirt: number; name: string; position: string };
  goals: number;
  suspended: boolean;
}) {
  const { state, updatePlayer } = useLeague();
  const isAdmin = state.role === "admin";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const name = draft.trim();
    if (!name || name === player.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    const m = await updatePlayer(player.id, { name });
    setBusy(false);
    if (m) {
      setErr(m);
      return;
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="card flex flex-col gap-1.5 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span
            className="num flex h-8 w-8 flex-none items-center justify-center rounded-[9px] font-display text-[14px] font-bold"
            style={{ background: "rgba(43,79,194,.25)", color: "var(--text-1)" }}
          >
            {player.shirt}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            aria-label="اسم اللاعب"
            className="h-9 w-0 min-w-0 flex-1 rounded-[8px] px-2 text-[13.5px] font-semibold text-white"
            style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.16)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            onClick={save}
            disabled={busy || !draft.trim() || draft.trim() === player.name}
            className="h-9 flex-none rounded-[8px] px-3 text-[12px] font-bold text-white disabled:opacity-35"
            style={{ background: "var(--gold)", color: "#1a1200" }}
          >
            {busy ? "…" : "حفظ"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setErr(null);
              setDraft(player.name);
            }}
            className="h-9 flex-none rounded-[8px] px-2.5 text-[12px] font-bold"
            style={{ background: "rgba(255,255,255,.06)", color: "var(--text-3)" }}
          >
            إلغاء
          </button>
        </div>
        {err ? (
          <span className="text-[11px] font-bold" style={{ color: "var(--live)" }}>
            {err}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-2 px-2.5 py-2">
      <span
        className="num flex h-8 w-8 flex-none items-center justify-center rounded-[9px] font-display text-[14px] font-bold"
        style={{ background: "rgba(43,79,194,.25)", color: "var(--text-1)" }}
      >
        {player.shirt}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-white">{player.name}</span>
        <span className="block text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {player.position}
        </span>
      </span>
      {suspended ? (
        <span className="flex-none text-[11px] font-bold" style={{ color: "var(--live)" }} title="موقوف عن المباراة القادمة">
          🚫 موقوف
        </span>
      ) : goals > 0 ? (
        <span className="num flex-none text-[12.5px] font-bold" style={{ color: "var(--gold)" }}>
          ⚽ {goals}
        </span>
      ) : null}
      {isAdmin ? (
        <button
          onClick={() => {
            setDraft(player.name);
            setErr(null);
            setEditing(true);
          }}
          aria-label="تعديل اسم اللاعب"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-[13px]"
          style={{ background: "rgba(255,255,255,.05)", color: "var(--text-3)" }}
        >
          ✏️
        </button>
      ) : null}
    </div>
  );
}

export default function TeamPage() {
  const params = useParams<{ code: string }>();
  const { seed, matches: allMatches, hydrated, teamByCode, playersOf, standingsOf, eventsOf, state, suspensions, statusOf, resolveSide } = useLeague();
  if (!hydrated) return null;

  const team = teamByCode(params.code);
  if (!team)
    return (
      <p className="p-8 text-center" style={{ color: "var(--text-3)" }}>
        الفريق غير موجود
      </p>
    );

  const row = standingsOf(team.group).find((r) => r.teamCode === team.code);
  // المقارنة بالأكواد المحلولة حتى تظهر مباريات الإقصائيات بعد تحدد أطرافها
  const matches = allMatches.filter(
    (m) =>
      resolveSide(m.home).team?.code === team.code ||
      resolveSide(m.away).team?.code === team.code,
  );
  const players = playersOf(team.code);
  // موقوف عن أقرب مباراة قادمة (غير معتمدة) للفريق
  const nextMatch = matches.find((m) => statusOf(m.id) !== "approved");
  const suspendedNext = new Set(
    suspensions
      .filter((s) => s.teamCode === team.code && nextMatch && s.forMatchId === nextMatch.id)
      .map((s) => s.playerId),
  );

  const allEvents = matches.flatMap((m) => eventsOf(m.id)).filter((e) => !e.deleted);
  const goalsBy = (pid: string) =>
    allEvents.filter((e) => e.type === "goal" && e.playerId === pid).reduce((s, e) => s + e.value, 0);
  const cardsUsed = state.usedCards.filter((u) => u.teamCode === team.code);

  return (
    <div className="px-4">
      <div className="flex items-center gap-3 pb-3 pt-5">
        <Shield code={team.code} size={52} />
        <div>
          <h1 className="font-display text-[22px] font-bold leading-tight text-white">{team.name}</h1>
          <div className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>
            المجموعة {team.group} · <span className="num">{team.code}</span>
            {row && row.played > 0 ? (
              <>
                {" "}· المركز <span className="num">{row.rank}</span> · <span className="num">{row.points}</span> نقاط
              </>
            ) : null}
          </div>
        </div>
      </div>

      {row && row.played > 0 ? (
        <div className="card mb-4 grid grid-cols-5 gap-1 p-3 text-center">
          {[
            ["لعب", row.played],
            ["فوز", row.won],
            ["تعادل", row.drawn],
            ["خسارة", row.lost],
            ["±", row.gd > 0 ? `+${row.gd}` : row.gd],
          ].map(([l, v]) => (
            <div key={String(l)}>
              <div className="num font-display text-[18px] font-bold" style={{ color: "var(--gold)" }}>
                {v}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
                {l}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <SectionTitle>اللاعبون</SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {players.map((p) => (
          <PlayerCard key={p.id} player={p} goals={goalsBy(p.id)} suspended={suspendedNext.has(p.id)} />
        ))}
      </div>

      <SectionTitle>كروت القوة</SectionTitle>
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {seed.powerCards.map((c) => {
          const used = cardsUsed.some((u) => u.cardName === c.name);
          return (
            <div
              key={c.name}
              className="flex-none rounded-[12px] px-3 py-2 text-[12.5px] font-semibold"
              style={
                used
                  ? { background: "rgba(255,255,255,.04)", color: "var(--text-3)", textDecoration: "line-through" }
                  : { background: "linear-gradient(135deg,rgba(255,138,31,.18),rgba(229,115,31,.06))", border: "1px solid rgba(255,138,31,.45)", color: "#FFB067" }
              }
            >
              {c.icon} {c.name} {used ? "· مستهلك" : "· متاح"}
            </div>
          );
        })}
      </div>

      <SectionTitle>المباريات</SectionTitle>
      <div className="flex flex-col gap-2 pb-5">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} showDay />
        ))}
      </div>
    </div>
  );
}
