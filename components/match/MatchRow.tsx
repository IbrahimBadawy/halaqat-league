"use client";

import Link from "next/link";
import Shield from "@/components/ui/Shield";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot, STAGE_LABELS } from "@/lib/league/seed";
import type { Match } from "@/lib/league/types";

/**
 * صف مباراة قياسي. كل مباراة تظهر دائمًا بيومها ووقتها وملعبها —
 * `showDay` للقوائم الممتدة عبر أكثر من ليلة، و`hideSlot` عندما يكون
 * الوقت في ترويسة الفترة أعلاه (قوائم الليلة المجمعة بالفترة).
 */
export default function MatchRow({
  match,
  showDay = false,
  hideSlot = false,
}: {
  match: Match;
  showDay?: boolean;
  hideSlot?: boolean;
}) {
  const { resolveSide, statusOf, scoreOf, minuteOf } = useLeague();
  const home = resolveSide(match.home);
  const away = resolveSide(match.away);
  const status = statusOf(match.id);
  const score = scoreOf(match.id);

  return (
    <Link href={`/match/${match.id}`} className="card flex items-center gap-2.5 px-3 py-2.5">
      {!hideSlot ? (
        <span className="flex flex-none flex-col items-center gap-0.5">
          <span
            className="num pill px-2 py-1 text-[13px] font-semibold"
            style={{
              color: "var(--gold-light)",
              background: "rgba(224,178,74,.1)",
              border: "1px solid rgba(224,178,74,.25)",
              borderRadius: 8,
            }}
          >
            {formatSlot(match.slot)}
          </span>
          {showDay ? (
            <span className="text-[10.5px] font-medium" style={{ color: "var(--text-3)" }}>
              {formatNight(match.matchDay)}
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14.5px] font-semibold text-white">
        <Shield code={home.team?.code ?? "؟"} size={22} gold={false} />
        <span className="truncate">{home.team?.name ?? home.label}</span>
        {status === "scheduled" ? (
          <span className="font-normal" style={{ color: "var(--text-3)" }}>
            ×
          </span>
        ) : (
          <span className="num font-display text-[15px] font-bold" style={{ color: "var(--gold)" }}>
            {score.home} – {score.away}
          </span>
        )}
        <span className="truncate">{away.team?.name ?? away.label}</span>
        <Shield code={away.team?.code ?? "؟"} size={22} gold={false} />
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        {status === "live" || status === "half_time" ? (
          <span
            className="pill live-dot px-2 py-0.5 text-[11.5px] font-bold text-white"
            style={{ background: "var(--live)" }}
          >
            {status === "half_time" ? "استراحة" : `د ${minuteOf(match.id)}`}
          </span>
        ) : status === "finished" ? (
          <span className="pill px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "rgba(244,196,48,.14)", color: "var(--warn)" }}>
            قيد الاعتماد
          </span>
        ) : status === "approved" ? (
          <span className="text-[11.5px] font-medium" style={{ color: "var(--text-3)" }}>
            انتهت
          </span>
        ) : null}
        <VenueChip venue={match.venue} />
        {match.stage !== "group" ? (
          <span className="text-[11px] font-medium" style={{ color: "var(--gold-light)" }}>
            {STAGE_LABELS[match.stage]}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
