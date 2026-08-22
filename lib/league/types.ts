// أنواع النطاق الأساسية — مشتركة بين المحركات النقية والواجهة.
// النتيجة دائمًا مُشتقة من الأحداث (قيمة الهدف value، افتراضيًا 1) ولا تُخزَّن مباشرة.

// حرف المجموعة — المنصة تدعم حتى 4 مجموعات (A..D) لكل دوري
export type GroupCode = string;

export interface Team {
  code: string; // A1..B5 (رمز الموقع في المجموعة)
  name: string;
  group: GroupCode;
}

export interface Player {
  id: string; // مثل A1-4
  teamCode: string;
  shirt: number;
  name: string;
  position: "حارس" | "لاعب";
}

export type StageKind = "group" | "semi_1" | "semi_2" | "third_place" | "final";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "half_time"
  | "finished" // انتهت وتنتظر الاعتماد
  | "approved"; // معتمدة ومقفولة — تدخل في الترتيب

export interface Match {
  id: string; // m1..m24
  matchDay: string; // اليوم المنطقي (ليلة الجمعة) — منفصل عن التوقيت الفعلي
  slot: string; // "23:00" .. "00:40" — ما بعد منتصف الليل يتبع ليلته
  venue: string;
  stage: StageKind;
  round: number; // رقم الليلة 1..4
  home: string; // رمز فريق أو placeholder للإقصائيات (1A, W_semi_1 ...)
  away: string;
  durationOverrideMinutes?: number;
}

export type EventType =
  | "goal"
  | "yellow"
  | "red"
  | "sub"
  | "shot"
  | "foul"
  | "save"
  | "corner"
  | "injury"
  | "power_card"
  | "comment";

export interface MatchEvent {
  id: string;
  matchId: string;
  teamCode: string;
  playerId?: string;
  secondaryPlayerId?: string; // صانع الهدف أو اللاعب الداخل في التبديل
  type: EventType;
  subtype?: string; // second_yellow / penalty / own_goal / نص التعليق ...
  minute: number;
  period: "first" | "second" | "extra";
  value: number; // قيمة الهدف — كارت "الهدف بهدفين" يجعلها 2
  note?: string;
  createdAt: number;
  editedReason?: string;
  deleted?: boolean;
  deletedReason?: string;
  /** حدث مرافق مولَّد تلقائيًا (كالطرد بعد الإنذار الثاني) — يُحذف مع حدثه الأصلي */
  linkedTo?: string;
  /** اسم كارت القوة الذي طُبق أثره على هذا الحدث (هدف مضاعف) */
  powerCard?: string;
}

export interface StandingAdjustment {
  teamCode: string;
  points: number;
  reason: string;
  source: "card" | "discipline" | "manual";
}

export type Tiebreaker =
  | "points"
  | "head_to_head"
  | "goal_difference"
  | "goals_for"
  | "fair_play"
  | "draw";

export interface LeagueRules {
  points: { win: number; draw: number; loss: number };
  halves: number;
  half_minutes: number;
  slot_minutes: number;
  final_duration_override_minutes: number;
  substitutions: string;
  tiebreakers: Tiebreaker[];
  yellow_cards_for_suspension: number;
  red_card_suspension_matches: number;
}

export interface StandingRow {
  teamCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  adjustments: number;
  fairPlayPenalty: number;
  form: ("W" | "D" | "L")[];
  rank: number;
  tiebreakNote?: string;
}

export interface PowerCard {
  name: string;
  icon: string;
  effect_type: string;
  params: Record<string, unknown>;
  usage_window: string;
  rarity: string;
  description: string;
}

export interface MatchReport {
  motmPlayerId?: string;
  refereeNotes?: string;
  homePens?: number;
  awayPens?: number;
  approvedAt?: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

/** نتيجة مشتقة من الأحداث لمباراة واحدة */
export interface DerivedScore {
  home: number;
  away: number;
}

/** تعديل موعد/ملعب مباراة — يُطبَّق فوق بيانات الـ seed دون تغييرها */
export interface FixtureOverride {
  matchDay?: string;
  slot?: string;
  venue?: string;
}

/** إتاحة ملعب: كل الفترات، أو تواريخ وفترات محددة */
export interface VenueDef {
  name: string;
  availability: "all_slots" | { date: string; slots: string[] }[];
}

export interface Prediction {
  home: number;
  away: number;
}

export interface Post {
  id: string;
  author: string;
  text: string;
  at: number;
  likes: number;
}

/** إيقاف تلقائي محتسب من الكروت — يُعاد اشتقاقه ولا يُخزَّن */
export interface Suspension {
  playerId: string;
  teamCode: string;
  /** المباراة التي يُوقف عنها */
  forMatchId: string;
  reason: string;
}
