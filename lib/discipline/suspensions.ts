// محرك الإيقافات التلقائية — دالة نقية.
// الطرد لا يمتد لأي مباراة تالية (عقوبته داخل مباراته: دقائق محددة أو باقي
// المباراة) — إلا «الطرد من الدوري» (penaltyScope === "league") فيمنع اللاعب
// من كل المباريات التالية فورًا حتى قبل اعتماد مباراته، والفريق يكمل بغيره.
// إنذاران متراكمان عبر المباريات = إيقاف مباراة (الإنذاران المؤديان لطرد
// في نفس المباراة يُستهلكان في الطرد ولا يدخلان التراكم).

import type { Match, MatchEvent, Suspension } from "../league/types";

interface Input {
  /** مباريات الفريق بترتيب الجدول (المحلولة الأطراف فقط)، مع حالة كل مباراة */
  teamMatches: { match: Match; approved: boolean }[];
  teamCode: string;
  events: MatchEvent[];
  yellowsForSuspension: number;
}

export function computeTeamSuspensions(input: Input): Suspension[] {
  const { teamMatches, teamCode, events, yellowsForSuspension } = input;
  const out: Suspension[] = [];
  const yellowAcc = new Map<string, number>();
  /** playerId ← ترتيب المباراة التي طُرد فيها من الدوري */
  const expelledAt = new Map<string, number>();

  for (let i = 0; i < teamMatches.length; i++) {
    const { match, approved } = teamMatches[i];

    const matchEvents = events.filter(
      (e) => e.matchId === match.id && e.teamCode === teamCode && !e.deleted && e.playerId,
    );

    // الطرد من الدوري نافذ فورًا (حتى قبل اعتماد المباراة)
    for (const e of matchEvents) {
      if (e.type === "red" && e.penaltyScope === "league" && !expelledAt.has(e.playerId!)) {
        expelledAt.set(e.playerId!, i);
      }
    }

    if (!approved) continue;

    const byPlayer = new Map<string, MatchEvent[]>();
    for (const e of matchEvents) {
      const list = byPlayer.get(e.playerId!) ?? [];
      list.push(e);
      byPlayer.set(e.playerId!, list);
    }

    for (const [playerId, evs] of byPlayer) {
      const hasRed = evs.some((e) => e.type === "red");
      // إنذارات مباراة الطرد لا تدخل التراكم — والطرد نفسه لا يوقف مباريات تالية
      if (hasRed) continue;

      const yellows = evs.filter((e) => e.type === "yellow").length;
      if (yellows > 0) {
        let acc = (yellowAcc.get(playerId) ?? 0) + yellows;
        while (acc >= yellowsForSuspension) {
          acc -= yellowsForSuspension;
          const next = teamMatches[i + 1];
          if (next) {
            out.push({
              playerId,
              teamCode,
              forMatchId: next.match.id,
              reason: `${yellowsForSuspension} إنذارات متراكمة`,
            });
          }
        }
        yellowAcc.set(playerId, acc);
      }
    }
  }

  // المطرود من الدوري: موقوف عن كل مباراة تالية لمباراة طرده
  for (const [playerId, fromIdx] of expelledAt) {
    for (let k = fromIdx + 1; k < teamMatches.length; k++) {
      out.push({
        playerId,
        teamCode,
        forMatchId: teamMatches[k].match.id,
        reason: "مطرود من الدوري",
      });
    }
  }

  return out;
}
