"use client";

// لوحة الأدمن — الثيم الفاتح عالي التباين (ديسكتوب أولًا، تعمل على الموبايل).
// المرحلة 0: الاعتمادات، إعادة الفتح، تعديل النقاط بسبب، سجل التدقيق.

import Link from "next/link";
import { useState } from "react";
import AdminNav from "@/components/nav/AdminNav";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

export default function AdminPage() {
  const store = useLeague();
  const { seed, matches, hydrated, state, statusOf, scoreOf, resolveSide, standingsOf, scheduleConflicts } = useLeague();
  const { joinRequests } = store;
  const [adjTeam, setAdjTeam] = useState(seed.teams[0]?.code ?? "A1");
  const [adjPoints, setAdjPoints] = useState(-1);
  const [adjReason, setAdjReason] = useState("");

  if (!hydrated) return null;

  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">لوحة الأدمن — تحتاج دور «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          بدّل الدور من صفحة «أنا»
        </Link>
      </div>
    );

  const pending = matches.filter((m) => statusOf(m.id) === "finished");
  const live = matches.filter((m) => statusOf(m.id) === "live" || statusOf(m.id) === "half_time");
  const approved = matches.filter((m) => statusOf(m.id) === "approved");
  const conflictedIds = new Set(scheduleConflicts.map((c) => c.matchId));
  const tonight =
    seed.matchDays.find((d) => matches.some((m) => m.matchDay === d && statusOf(m.id) !== "approved")) ??
    seed.matchDays[seed.matchDays.length - 1];

  const statusChip = (s: string, bg: string, color: string) => (
    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: bg, color }}>
      {s}
    </span>
  );

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        {/* الترويسة */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-display text-[24px] font-bold">لوحة الأدمن — {seed.name}</h1>
            <p className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              {formatNight(tonight)} · الليلة {seed.matchDays.indexOf(tonight) + 1} من {seed.matchDays.length}
            </p>
          </div>
        </div>

        <AdminNav />

        {joinRequests.filter((r) => r.status === "pending").length > 0 ? (
          <Link
            href="/admin/teams"
            className="mb-4 block rounded-[12px] px-4 py-3 text-[13.5px] font-bold"
            style={{ background: "#EFF8FF", color: "#175CD3", border: "1px solid #B2DDFF" }}
          >
            ⏳ يوجد{" "}
            <span className="num">{joinRequests.filter((r) => r.status === "pending").length}</span>{" "}
            طلب انضمام معلق — افتح «الفرق والكباتن» للبت فيها
          </Link>
        ) : null}

        {conflictedIds.size > 0 ? (
          <Link
            href="/admin/schedule"
            className="mb-4 block rounded-[12px] px-4 py-3 text-[13.5px] font-bold"
            style={{ background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}
          >
            ⚠️ يوجد <span className="num">{conflictedIds.size}</span> مباراة بتعارض جدولة (ملعب محجوز /
            فريق مزدوج / فجوة غير كافية) — افتح محرر الجدول للمعالجة
          </Link>
        ) : null}

        {/* المؤشرات */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["مباريات معتمدة", approved.length, "#067647", "#ECFDF3"],
            ["تنتظر الاعتماد", pending.length, "#93370D", "#FFFAEB"],
            ["جارية الآن", live.length, "#B42318", "#FEF3F2"],
            ["تعارضات الجدول", conflictedIds.size, conflictedIds.size > 0 ? "#B42318" : "#067647", conflictedIds.size > 0 ? "#FEF3F2" : "#ECFDF3"],
          ].map(([label, value, color, bg]) => (
            <div key={String(label)} className="rounded-[14px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
              <div className="num font-display text-[28px] font-bold" style={{ color: String(color) }}>
                {value}
              </div>
              <div className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
                {label}
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: String(bg) }} />
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* الاعتمادات */}
          <section className="rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
            <h2 className="mb-3 font-display text-[17px] font-bold">نتائج تنتظر الاعتماد</h2>
            {pending.length === 0 && live.length === 0 ? (
              <p className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-2)" }}>
                لا شيء معلق — كل النتائج معتمدة ✓
              </p>
            ) : (
              [...live, ...pending].map((m) => {
                const h = resolveSide(m.home);
                const a = resolveSide(m.away);
                const s = scoreOf(m.id);
                const st = statusOf(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-3 border-b py-2.5" style={{ borderColor: "#E3E7F2" }}>
                    <span className="num w-16 text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
                      {formatSlot(m.slot)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">
                      {h.team?.name ?? h.label} <span className="num" style={{ color: "#9A7420" }}>{s.home}–{s.away}</span>{" "}
                      {a.team?.name ?? a.label}
                    </span>
                    {st === "finished"
                      ? statusChip("بانتظار PIN الحكم", "#FFFAEB", "#93370D")
                      : statusChip("جارية", "#FEF3F2", "#B42318")}
                    <Link href={`/match/${m.id}/console`} className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: "#0B1230" }}>
                      فتح
                    </Link>
                  </div>
                );
              })
            )}
            {approved.length > 0 ? (
              <>
                <h3 className="mb-1 mt-4 text-[13.5px] font-bold" style={{ color: "var(--text-2)" }}>
                  معتمدة — يمكن إعادة الفتح (يُسجَّل في التدقيق)
                </h3>
                {approved.slice(0, 6).map((m) => {
                  const h = resolveSide(m.home);
                  const a = resolveSide(m.away);
                  const s = scoreOf(m.id);
                  return (
                    <div key={m.id} className="flex items-center gap-3 border-b py-2" style={{ borderColor: "#E3E7F2" }}>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                        {h.team?.name} <span className="num" style={{ color: "#9A7420" }}>{s.home}–{s.away}</span> {a.team?.name}
                      </span>
                      <button
                        onClick={() => store.reopenMatch(m.id)}
                        className="rounded-[10px] px-3 py-1.5 text-[12px] font-bold"
                        style={{ background: "#FEF3F2", color: "#B42318" }}
                      >
                        إعادة فتح
                      </button>
                    </div>
                  );
                })}
              </>
            ) : null}
          </section>

          {/* الانضباط وتعديل النقاط */}
          <section className="rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
            <h2 className="mb-3 font-display text-[17px] font-bold">تعديل نقاط (انضباط)</h2>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={adjTeam}
                onChange={(e) => setAdjTeam(e.target.value)}
                className="h-11 rounded-[10px] px-3 text-[13.5px] font-semibold"
                style={{ border: "1px solid #E3E7F2", background: "#fff" }}
              >
                {seed.teams.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} · {t.name}
                  </option>
                ))}
              </select>
              <select
                value={adjPoints}
                onChange={(e) => setAdjPoints(Number(e.target.value))}
                className="num h-11 rounded-[10px] px-3 text-[13.5px] font-semibold"
                style={{ border: "1px solid #E3E7F2", background: "#fff" }}
              >
                {[-3, -2, -1, 1, 2, 3].map((p) => (
                  <option key={p} value={p}>
                    {p > 0 ? `+${p}` : p}
                  </option>
                ))}
              </select>
              <input
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="السبب (إلزامي)"
                className="h-11 min-w-[160px] flex-1 rounded-[10px] px-3 text-[13.5px]"
                style={{ border: "1px solid #E3E7F2" }}
              />
              <button
                disabled={!adjReason.trim()}
                onClick={() => {
                  store.addAdjustment({ teamCode: adjTeam, points: adjPoints, reason: adjReason.trim(), source: "discipline" });
                  setAdjReason("");
                }}
                className="h-11 rounded-[10px] px-4 text-[13.5px] font-bold text-white disabled:opacity-40"
                style={{ background: "#0B1230" }}
              >
                تطبيق
              </button>
            </div>
            {state.adjustments.length > 0 ? (
              <div className="mb-4">
                {state.adjustments.map((adj, i) => (
                  <div key={i} className="flex items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                    <span className="font-bold">{seed.teams.find((t) => t.code === adj.teamCode)?.name}</span>
                    <span className="num font-bold" style={{ color: adj.points < 0 ? "#B42318" : "#067647" }}>
                      {adj.points > 0 ? `+${adj.points}` : adj.points}
                    </span>
                    <span style={{ color: "var(--text-2)" }}>{adj.reason}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <h2 className="mb-2 mt-2 font-display text-[17px] font-bold">الترتيب الحالي</h2>
            <div className="grid grid-cols-2 gap-3">
              {store.groupNames.map((g) => (
                <div key={g}>
                  <div className="mb-1 text-[12.5px] font-bold" style={{ color: "var(--text-2)" }}>
                    المجموعة {g}
                  </div>
                  {standingsOf(g).map((r) => (
                    <div key={r.teamCode} className="flex items-center gap-2 py-1 text-[13px]">
                      <span className="num w-4 font-bold" style={{ color: "var(--text-2)" }}>
                        {r.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {seed.teams.find((t) => t.code === r.teamCode)?.name}
                        {r.adjustments !== 0 ? <span style={{ color: "#93370D" }}> ★</span> : null}
                      </span>
                      <span className="num font-display font-bold" style={{ color: "#9A7420" }}>
                        {r.points}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* سجل التدقيق */}
        <section className="mt-5 rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
          <h2 className="mb-3 font-display text-[17px] font-bold">سجل التدقيق</h2>
          {state.audit.length === 0 ? (
            <p className="py-4 text-center text-[13.5px]" style={{ color: "var(--text-2)" }}>
              كل إجراء حساس (بدء/إنهاء/اعتماد/حذف حدث/تعديل نقاط) يُسجَّل هنا بمن ومتى
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto">
              {state.audit.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                  <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>
                    {new Date(a.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "#EFF8FF", color: "#175CD3" }}>
                    {a.actor === "admin" ? "أدمن" : a.actor === "recorder" ? "مسجّل" : a.actor}
                  </span>
                  <span className="font-bold">{a.action}</span>
                  <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>
                    {a.entity}
                  </span>
                  <span style={{ color: "var(--text-2)" }}>{a.detail}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
