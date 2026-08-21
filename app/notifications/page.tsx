"use client";

// صفحة الإشعارات — تشتق تغذية من سجل التدقيق + أهداف المباريات الحية (بدون حالة جديدة).

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

interface FeedItem {
  key: string;
  at: number;
  icon: string;
  iconBg: string;
  titleColor?: string;
  title: string;
  detail: ReactNode;
  actor?: string;
  matchId?: string;
  /** تغييرات المواعيد تُبرَز — تهم الجميع */
  highlight?: boolean;
}

/** أيقونة ولون لكل نوع إجراء في سجل التدقيق (الألوان مشتقة من رموز التصميم) */
const ACTION_META: Record<string, { icon: string; bg: string; color?: string }> = {
  "بدء مباراة": { icon: "⚽", bg: "rgba(255,255,255,.06)" },
  "نهاية مباراة": { icon: "⏱️", bg: "rgba(255,255,255,.06)" },
  "اعتماد نتيجة": { icon: "✅", bg: "rgba(76,192,122,.14)", color: "var(--green-text)" },
  "إعادة فتح مباراة": { icon: "🔓", bg: "rgba(244,196,48,.14)", color: "var(--warn)" },
  "تغيير موعد مباراة": { icon: "🗓️", bg: "rgba(43,79,194,.32)", color: "#ADC2FF" },
  "تعديل نقاط": { icon: "⚖️", bg: "rgba(244,196,48,.14)", color: "var(--warn)" },
  "حذف حدث": { icon: "🗑️", bg: "rgba(255,255,255,.06)" },
  "تفعيل كارت قوة": { icon: "✨", bg: "rgba(255,138,31,.16)", color: "var(--flame-1)" },
  "تغيير فترة": { icon: "⏱️", bg: "rgba(255,255,255,.06)" },
};

const DEFAULT_META = { icon: "🔔", bg: "rgba(255,255,255,.06)" };

export default function NotificationsPage() {
  const router = useRouter();
  const {
    hydrated,
    state,
    matches,
    matchOf,
    statusOf,
    eventsOf,
    playersOf,
    teamByCode,
    resolveSide,
  } = useLeague();

  if (!hydrated) return null;

  // 1) سجل التدقيق (الأحدث أولًا أصلًا)
  const auditItems: FeedItem[] = state.audit.map((entry) => {
    const meta = ACTION_META[entry.action] ?? DEFAULT_META;
    const isMatchEntity = /^m\d+$/.test(entry.entity);
    return {
      key: `a-${entry.id}`,
      at: entry.at,
      icon: meta.icon,
      iconBg: meta.bg,
      titleColor: meta.color,
      title: entry.action,
      detail: entry.detail,
      actor: entry.actor,
      matchId: isMatchEntity ? entry.entity : undefined,
      highlight: entry.action === "تغيير موعد مباراة",
    };
  });

  // 2) أهداف المباريات الجارية الآن
  const goalItems: FeedItem[] = [];
  for (const m of matches) {
    const st = statusOf(m.id);
    if (st !== "live" && st !== "half_time") continue;
    for (const e of eventsOf(m.id)) {
      if (e.type !== "goal" || e.deleted) continue;
      const scorer =
        playersOf(e.teamCode).find((p) => p.id === e.playerId)?.name ??
        teamByCode(e.teamCode)?.name ??
        "";
      goalItems.push({
        key: `g-${e.id}`,
        at: e.createdAt,
        icon: "⚽",
        iconBg: "rgba(229,72,77,.16)",
        titleColor: "var(--live)",
        title: "هدف الآن",
        detail: (
          <>
            {scorer} د <span className="num">{e.minute}</span>
          </>
        ),
        matchId: m.id,
      });
    }
  }

  const items = [...goalItems, ...auditItems].sort((a, b) => b.at - a.at);

  const fmtTime = (at: number) =>
    new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  /** سياق المباراة: الفريقان + الفترة والملعب والليلة (يظهران دائمًا مع أي مباراة) */
  function matchContext(matchId: string): ReactNode {
    const m = matchOf(matchId);
    if (!m) return null;
    const h = resolveSide(m.home);
    const a = resolveSide(m.away);
    return (
      <span style={{ color: "var(--text-3)" }}>
        {" — "}
        {h.team?.name ?? h.label} × {a.team?.name ?? a.label} ·{" "}
        <span className="num">{formatSlot(m.slot)}</span> ·{" "}
        <span style={{ color: m.venue !== "ملعب 1" ? "#ADC2FF" : undefined }}>{m.venue}</span> ·{" "}
        {formatNight(m.matchDay)}
      </span>
    );
  }

  function rowBody(item: FeedItem) {
    return (
      <>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[18px]"
          style={{ background: item.iconBg, border: "1px solid var(--border-softer)" }}
          aria-hidden
        >
          {item.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className="text-[13.5px] font-bold"
              style={{ color: item.titleColor ?? "var(--text-1)" }}
            >
              {item.title}
            </span>
            <span className="num ms-auto shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>
              {fmtTime(item.at)}
            </span>
          </span>
          <span className="block text-[12.5px] leading-5" style={{ color: "var(--text-2)" }}>
            {item.detail}
            {item.matchId ? matchContext(item.matchId) : null}
          </span>
          {item.actor ? (
            <span className="block text-[11px]" style={{ color: "var(--text-3)" }}>
              بواسطة {item.actor}
            </span>
          ) : null}
        </span>
        {item.matchId ? (
          <svg
            className="mt-3 shrink-0"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-3)"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="m15 5-7 7 7 7" />
          </svg>
        ) : null}
      </>
    );
  }

  return (
    <div className="px-4 pb-8">
      {/* شريط علوي */}
      <div className="flex items-center gap-2.5 pb-3 pt-4">
        <button
          onClick={() => router.back()}
          className="flex h-11 w-11 items-center justify-center rounded-[14px]"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
          aria-label="رجوع"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-2)"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <h1 className="font-display text-[22px] font-bold text-white">الإشعارات</h1>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center gap-2.5 px-6 py-10 text-center">
          <span className="text-[34px]" aria-hidden>
            🔔
          </span>
          <p className="text-[13.5px] font-semibold leading-6" style={{ color: "var(--text-2)" }}>
            لا إشعارات بعد — ستصلك هنا الأهداف والاعتمادات وتغييرات المواعيد
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-[14px]"
          style={{ border: "1px solid var(--border-soft)", background: "var(--surface-1)" }}
        >
          {items.map((item) => {
            const rowStyle = item.highlight
              ? {
                  background: "rgba(43,79,194,.12)",
                  borderInlineStart: "3px solid #ADC2FF",
                  borderBottom: "1px solid var(--border-softer)",
                }
              : {
                  borderInlineStart: "3px solid transparent",
                  borderBottom: "1px solid var(--border-softer)",
                };
            return item.matchId ? (
              <Link
                key={item.key}
                href={`/match/${item.matchId}`}
                className="flex items-start gap-3 px-3 py-3"
                style={rowStyle}
              >
                {rowBody(item)}
              </Link>
            ) : (
              <div key={item.key} className="flex items-start gap-3 px-3 py-3" style={rowStyle}>
                {rowBody(item)}
              </div>
            );
          })}
        </div>
      )}

      <p className="pt-4 text-center text-[11.5px] font-medium" style={{ color: "var(--text-3)" }}>
        إشعارات Push تأتي في مرحلة لاحقة
      </p>
    </div>
  );
}
