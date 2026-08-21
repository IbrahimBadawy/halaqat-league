// بيانات عرض تجريبية لليلة الأولى — تُحمَّل بزر "تعبئة بيانات تجريبية" فقط،
// حتى تظهر شاشات الترتيب والإحصائيات والمباشر بشكل حي قبل تسجيل مباريات حقيقية.

import type { MatchEvent } from "./types";
import type { PersistedState, ClockState } from "./store";

let n = 0;
function id(): string {
  n += 1;
  return `demo-e${n}`;
}

function goal(
  matchId: string,
  teamCode: string,
  playerId: string,
  minute: number,
  value = 1,
  assist?: string,
): MatchEvent {
  return {
    id: id(),
    matchId,
    teamCode,
    playerId,
    secondaryPlayerId: assist,
    type: "goal",
    minute,
    period: minute > 8 ? "second" : "first",
    value,
    createdAt: Date.now() - 1000 * 60 * 60 + n * 1000,
  };
}

function card(
  matchId: string,
  teamCode: string,
  playerId: string,
  type: "yellow" | "red",
  minute: number,
): MatchEvent {
  return {
    id: id(),
    matchId,
    teamCode,
    playerId,
    type,
    minute,
    period: minute > 8 ? "second" : "first",
    value: 1,
    createdAt: Date.now() - 1000 * 60 * 60 + n * 1000,
  };
}

export function buildDemoState(): PersistedState {
  n = 0;
  const events: MatchEvent[] = [
    // m1: فؤش A1 × زيد A2 → 3-1
    goal("m1", "A1", "A1-4", 3, 1, "A1-2"),
    goal("m1", "A2", "A2-5", 6),
    goal("m1", "A1", "A1-4", 10),
    goal("m1", "A1", "A1-3", 14),
    card("m1", "A2", "A2-6", "yellow", 12),
    // m2: صعيدي B1 × جدو B2 → 1-1
    goal("m2", "B1", "B1-2", 5),
    goal("m2", "B2", "B2-4", 13, 1, "B2-3"),
    card("m2", "B1", "B1-5", "yellow", 9),
    card("m2", "B2", "B2-2", "yellow", 15),
    // m3: فؤش A1 × غراب A3 → جارية 2-1 (كما في التصميم)
    goal("m3", "A1", "A1-2", 4),
    goal("m3", "A3", "A3-4", 8),
    goal("m3", "A1", "A1-4", 11, 1, "A1-2"),
    card("m3", "A3", "A3-6", "yellow", 9),
  ];

  const liveClock: ClockState = {
    period: "second",
    running: true,
    periodSeconds: 167,
    totalSeconds: 8 * 60 + 167,
    runningSince: Date.now(),
    extraMinutes: 0,
  };

  return {
    role: "visitor",
    statuses: { m1: "approved", m2: "approved", m3: "live" },
    events,
    clocks: { m3: liveClock },
    reports: {
      m1: { motmPlayerId: "A1-4", approvedAt: Date.now() - 40 * 60 * 1000 },
      m2: { motmPlayerId: "B2-4", approvedAt: Date.now() - 15 * 60 * 1000 },
    },
    adjustments: [],
    lineupOverrides: {},
    activeCards: {},
    usedCards: [],
    fixtureOverrides: {},
    predictions: {},
    posts: [
      {
        id: "demo-p1",
        author: "قائد فؤش",
        text: "بداية قوية الليلة 💪 الفوز الأول والقادم أحلى — فريق واحد .. هدف واحد",
        at: Date.now() - 30 * 60 * 1000,
        likes: 7,
      },
    ],
    starters: {},
    audit: [
      {
        id: "demo-a1",
        at: Date.now() - 40 * 60 * 1000,
        actor: "admin",
        action: "اعتماد نتيجة",
        entity: "m1",
        detail: "بيانات تجريبية",
      },
      {
        id: "demo-a2",
        at: Date.now() - 15 * 60 * 1000,
        actor: "admin",
        action: "اعتماد نتيجة",
        entity: "m2",
        detail: "بيانات تجريبية",
      },
    ],
  };
}
