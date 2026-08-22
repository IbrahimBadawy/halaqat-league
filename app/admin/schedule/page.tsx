"use client";

// محرر الجدول — تحكم الأدمن في (اليوم، الفترة، الملعب) لكل مباراة مع فحص
// التعارضات الحي. القاعدة الجوهرية: أكثر من مباراة تُلعب في نفس الفترة على
// ملاعب مختلفة — لذا الملعب ظاهر ومحرَّر دائمًا. كل تغيير يُسجَّل في التدقيق.

import Link from "next/link";
import { Fragment, useState, type CSSProperties } from "react";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot, STAGE_LABELS } from "@/lib/league/seed";

const BORDER = "1px solid #E3E7F2";
const AMBER_BG = "#FFFAEB";
const AMBER_TX = "#93370D";
const GREEN_TX = "#067647";
const BLUE = "#175CD3";
const INK = "#0B1230";

export default function AdminSchedulePage() {
  const store = useLeague();
  const {
    seed,
    matches,
    hydrated,
    state,
    statusOf,
    resolveSide,
    scheduleConflicts,
    conflictsOf,
    suggestReschedule,
    rescheduleMatch,
  } = store;

  const [reason, setReason] = useState("إعادة جدولة إدارية");
  /** مباريات فشل اقتراح فترة لها — رسالة "لا فترة متاحة" */
  const [noSlotFor, setNoSlotFor] = useState<Record<string, boolean>>({});

  if (!hydrated) return null;

  if (state.role !== "admin")
    return (
      <div
        className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: "var(--bg-base)", color: "var(--text-1)" }}
      >
        <p className="text-[15px] font-semibold">محرر الجدول — يحتاج دور «أدمن الدوري»</p>
        <Link
          href="/me"
          className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white"
          style={{ background: INK }}
        >
          بدّل الدور من صفحة «أنا»
        </Link>
      </div>
    );

  const effectiveReason = reason.trim() || "إعادة جدولة إدارية";
  const conflictedIds = new Set(scheduleConflicts.map((c) => c.matchId));

  function change(matchId: string, patch: { matchDay?: string; slot?: string; venue?: string }) {
    rescheduleMatch(matchId, patch, effectiveReason);
    setNoSlotFor((s) => ({ ...s, [matchId]: false }));
  }

  function suggest(matchId: string) {
    const s = suggestReschedule(matchId);
    if (s) {
      rescheduleMatch(matchId, s, `${effectiveReason} (اقتراح تلقائي)`);
      setNoSlotFor((prev) => ({ ...prev, [matchId]: false }));
    } else {
      setNoSlotFor((prev) => ({ ...prev, [matchId]: true }));
    }
  }

  const selectStyle: CSSProperties = {
    border: BORDER,
    background: "#fff",
    color: "var(--text-1)",
  };

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        {/* الترويسة */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-display text-[24px] font-bold">محرر الجدول — اليوم والفترة والملعب</h1>
            <p className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              عدّل ليلة أو فترة أو ملعب أي مباراة — الفحص يعمل مباشرة مع كل تغيير
            </p>
          </div>
          <span className="ms-auto flex flex-wrap items-center gap-2">
            {/* ملخص التعارضات */}
            <span
              className="rounded-[12px] px-4 py-2 text-[13.5px] font-bold"
              style={
                conflictedIds.size > 0
                  ? { background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA" }
                  : { background: "#ECFDF3", color: GREEN_TX, border: "1px solid #ABEFC6" }
              }
            >
              {conflictedIds.size > 0 ? (
                <>
                  ⚠️ <span className="num">{conflictedIds.size}</span> مباراة بتعارض
                </>
              ) : (
                <>✓ الجدول بلا تعارضات</>
              )}
            </span>
            <Link
              href="/admin"
              className="rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white"
              style={{ background: INK }}
            >
              → لوحة الأدمن
            </Link>
          </span>
        </div>

        {/* سبب التغيير */}
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] bg-white p-4"
          style={{ border: BORDER }}
        >
          <label htmlFor="reschedule-reason" className="text-[13.5px] font-bold">
            سبب التغيير (يُسجَّل في التدقيق مع كل تعديل):
          </label>
          <input
            id="reschedule-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="إعادة جدولة إدارية"
            className="h-11 min-w-[240px] flex-1 rounded-[10px] px-3 text-[13.5px]"
            style={{ border: BORDER }}
          />
        </div>

        {/* دليل الفحوص التلقائية */}
        <div className="mb-5 rounded-[14px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-2 font-display text-[16px] font-bold">الفحوص التلقائية</h2>
          <ul className="flex flex-wrap gap-2 text-[12.5px] font-semibold">
            {[
              "ملعب محجوز مرتين في نفس الفترة",
              "فريق في مباراتين بنفس الفترة",
              "فجوة أقل من فترة بين مباراتَي نفس الفريق",
              "أكثر من مباراتين للفريق في الليلة",
              "ملعب غير متاح وفق الإتاحة",
            ].map((t) => (
              <li key={t} className="rounded-full px-3 py-1" style={{ background: AMBER_BG, color: AMBER_TX }}>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px]" style={{ color: "var(--text-2)" }}>
            ملعب <span className="num">2</span> متاح فقط ليلة <span className="num">4/9</span> في{" "}
            <span className="num">{formatSlot("23:40")}</span> و<span className="num">{formatSlot("00:00")}</span> ·
            التعديل مسموح مع التحذير، وكل تغيير يُسجَّل في التدقيق.
          </p>
        </div>

        {/* ليلة بليلة */}
        {seed.matchDays.map((day, ni) => {
          const nightMatches = matches.filter((m) => m.matchDay === day);
          if (nightMatches.length === 0) return null;
          return (
            <section key={day} className="mb-5 overflow-hidden rounded-[16px] bg-white" style={{ border: BORDER }}>
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: BORDER }}>
                <h2 className="font-display text-[17px] font-bold">{formatNight(day)}</h2>
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "#EFF8FF", color: BLUE }}>
                  الليلة <span className="num">{ni + 1}</span>
                </span>
                <span className="ms-auto text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
                  <span className="num">{nightMatches.length}</span> مباريات
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                  <thead>
                    <tr className="text-start text-[12.5px] font-bold" style={{ color: "var(--text-2)", background: "#F7F9FE" }}>
                      <th className="px-4 py-2 text-start">المباراة</th>
                      <th className="px-2 py-2 text-start">الليلة</th>
                      <th className="px-2 py-2 text-start">الفترة</th>
                      <th className="px-2 py-2 text-start">الملعب</th>
                      <th className="px-2 py-2 text-start">المدة (د)</th>
                      <th className="px-2 py-2 text-start">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nightMatches.map((m) => {
                      const h = resolveSide(m.home);
                      const a = resolveSide(m.away);
                      const homeLabel = h.team ? `${h.team.name} (${m.home})` : h.label;
                      const awayLabel = a.team ? `${a.team.name} (${m.away})` : a.label;
                      const locked = statusOf(m.id) !== "scheduled";
                      const rowConflicts = conflictsOf(m.id);
                      const conflicted = rowConflicts.length > 0;
                      const rowBorder = conflicted ? "3px solid #F04438" : "3px solid transparent";
                      return (
                        <Fragment key={m.id}>
                          <tr style={{ borderTop: BORDER, background: conflicted ? "#FFFBFA" : undefined }}>
                            <td className="px-4 py-2.5" style={{ borderInlineStart: rowBorder }}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="num text-[11.5px] font-bold" style={{ color: "var(--text-2)" }}>
                                  {m.id}
                                </span>
                                <span className="font-bold">
                                  {homeLabel} <span style={{ color: "var(--text-2)" }}>×</span> {awayLabel}
                                </span>
                                {m.stage !== "group" ? (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[11.5px] font-bold"
                                    style={{ background: "#EFF8FF", color: BLUE }}
                                  >
                                    {STAGE_LABELS[m.stage]}
                                  </span>
                                ) : null}
                                {locked ? (
                                  <span
                                    className="rounded-full px-2 py-0.5 text-[11.5px] font-bold"
                                    style={{ background: "#F2F4F7", color: "var(--text-2)" }}
                                  >
                                    🔒 مقفولة (جارية/منتهية/معتمدة)
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-2.5">
                              <select
                                value={m.matchDay}
                                disabled={locked}
                                onChange={(e) => change(m.id, { matchDay: e.target.value })}
                                className="h-10 w-full min-w-[128px] rounded-[10px] px-2 text-[13px] font-semibold disabled:opacity-45"
                                style={selectStyle}
                              >
                                {seed.matchDays.map((d, i) => (
                                  <option key={d} value={d}>
                                    {formatNight(d)} (ليلة {i + 1})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2.5">
                              <select
                                value={m.slot}
                                disabled={locked}
                                onChange={(e) => change(m.id, { slot: e.target.value })}
                                className="num h-10 w-full min-w-[104px] rounded-[10px] px-2 text-[13px] font-semibold disabled:opacity-45"
                                style={selectStyle}
                              >
                                {/* allSlots = شبكة الفترات + فترات خاصة من الـ seed (نهائي 00:30) */}
                                {seed.allSlots.map((s) => (
                                  <option key={s} value={s}>
                                    {formatSlot(s)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2.5">
                              <select
                                value={m.venue}
                                disabled={locked}
                                onChange={(e) => change(m.id, { venue: e.target.value })}
                                className="h-10 w-full min-w-[104px] rounded-[10px] px-2 text-[13px] font-semibold disabled:opacity-45"
                                style={selectStyle}
                              >
                                {seed.venues.map((v) => (
                                  <option key={v.name} value={v.name}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2.5">
                              {/* مدة مخصصة (17، 30...) — فارغ = مدة الدوري الافتراضية */}
                              <input
                                key={`${m.id}-${m.durationOverrideMinutes ?? "def"}`}
                                type="number"
                                min={5}
                                max={120}
                                defaultValue={m.durationOverrideMinutes ?? ""}
                                placeholder={String(seed.rules.half_minutes * seed.rules.halves)}
                                disabled={locked}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  const n = v === "" ? null : Math.max(5, Math.min(120, Number(v) || 0));
                                  if ((n ?? undefined) !== m.durationOverrideMinutes && (n === null || n >= 5)) {
                                    store.setMatchDuration(m.id, n);
                                  }
                                }}
                                className="num h-10 w-full min-w-[72px] rounded-[10px] px-2 text-[13px] font-semibold disabled:opacity-45"
                                style={selectStyle}
                              />
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2">
                                <button
                                  disabled={locked}
                                  onClick={() => suggest(m.id)}
                                  className="whitespace-nowrap rounded-[10px] px-3 py-2 text-[12.5px] font-bold text-white disabled:opacity-40"
                                  style={{ background: BLUE }}
                                >
                                  ✨ اقتراح أقرب فترة
                                </button>
                                {noSlotFor[m.id] ? (
                                  <span className="whitespace-nowrap text-[12px] font-bold" style={{ color: "#B42318" }}>
                                    لا فترة متاحة
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          <tr style={{ background: conflicted ? "#FFFBFA" : undefined }}>
                            <td colSpan={6} className="px-4 pb-2.5" style={{ borderInlineStart: rowBorder }}>
                              {conflicted ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {rowConflicts.map((c, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full px-2.5 py-1 text-[12px] font-bold"
                                      style={{ background: AMBER_BG, color: AMBER_TX }}
                                    >
                                      ⚠️ {c.message}
                                    </span>
                                  ))}
                                </div>
                              ) : !locked ? (
                                <span className="text-[12px] font-bold" style={{ color: GREEN_TX }}>
                                  ✓ بلا تعارض
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
