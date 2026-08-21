// أنواع الحالة الحية المشتركة بين المخزن وطبقة Supabase البعيدة —
// في ملف مستقل لتفادي الاستيراد الدائري بين store.tsx وremote.ts.

export interface ClockState {
  period: "first" | "break" | "second" | "extra" | "ended";
  running: boolean;
  /** ثواني متراكمة للفترة الحالية (بدون الجارية الآن) */
  periodSeconds: number;
  /** ثواني متراكمة للمباراة كلها */
  totalSeconds: number;
  /** طابع بدء آخر تشغيل (ms) لو الساعة تعمل */
  runningSince: number | null;
  extraMinutes: number;
}

export interface ActivePowerCard {
  teamCode: string;
  cardName: string;
  effect: "goal_multiplier" | "extra_time" | "shield" | "extra_substitution";
}
