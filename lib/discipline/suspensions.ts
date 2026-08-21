// محرك الإيقافات التلقائية — دالة نقية.
// الطرد (بما فيه الإنذار الثاني) = إيقاف المباراة التالية للفريق.
// إنذاران متراكمان عبر المباريات = إيقاف مباراة (الإنذاران المؤديان لطرد
// في نفس المباراة يُستهلكان في الطرد ولا يدخلان التراكم).

import type { Match, MatchEvent, Suspension } from "../league/types";

interface Input {
  /** مباريات الفريق بترتيب الجدول (المحلولة الأطراف فقط)، مع حالة كل مباراة */
  teamMatches: { match: Match; approved: boolean }[];
  teamCode: string;
  events: MatchEvent[];
  yellowsForSuspension: number;
  redSuspensionMatches: number;
}

export function computeTeamSuspensions(input: Input): Suspension[] {
  const { teamMatches, teamCode, events, yellowsForSuspension, redSuspensionMatches } = input;
  const out: Suspension[] = [];
  const yellowAcc = new Map<string, number>();

  for (let i = 0; i < teamMatches.length; i++) {
    const { match, approved } = teamMatches[i];
    if (!approved) continue;

    const matchEvents = events.filter(
      (e) => e.matchId === match.id && e.teamCode === teamCode && !e.deleted && e.playerId,
    );
    const byPlayer = new Map<string, MatchEvent[]>();
    for (const e of matchEvents) {
      const list = byPlayer.get(e.playerId!) ?? [];
      list.push(e);
      byPlayer.set(e.playerId!, list);
    }

    for (const [playerId, evs] of byPlayer) {
      const hasRed = evs.some((e) => e.type === "red");
      const yellows = evs.filter((e) => e.type === "yellow").length;

      if (hasRed) {
        // إيقاف المباريات التالية بعدد عقوبة الطرد
        for (let k = 1; k <= redSuspensionMatches; k++) {
          const next = teamMatches[i + k];
          if (!next) break;
          out.push({
            playerId,
            teamCode,
            forMatchId: next.match.id,
            reason: "طرد",
          });
        }
        // إنذارات مباراة الطرد لا تدخل التراكم
        continue;
      }

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
  return out;
}
