"use client";

// لوحة الأدمن — الثيم الفاتح عالي التباين (ديسكتوب أولًا، تعمل على الموبايل).
// المرحلة 0: الاعتمادات، إعادة الفتح، تعديل النقاط بسبب، سجل التدقيق.

import Link from "next/link";
import { useState } from "react";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";

export default function AdminPage() {
  const store = useLeague();
  const { seed, matches, hydrated, state, statusOf, scoreOf, resolveSide, standingsOf, scheduleConflicts } = useLeague();
  const {
    leagues, activeLeagueId, setActiveLeague, profilesAll, memberRoles,
    adminCreateAccount, adminResetPassword, setCaptain, joinRequests,
    decideJoin, joinCodes, captains,
  } = store;
  const [adjTeam, setAdjTeam] = useState(seed.teams[0]?.code ?? "A1");
  const [adjPoints, setAdjPoints] = useState(-1);
  const [adjReason, setAdjReason] = useState("");

  // إدارة الحسابات
  const [accUsername, setAccUsername] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [accDisplay, setAccDisplay] = useState("");
  const [accRoles, setAccRoles] = useState<string[]>(["recorder"]);
  const [accMsg, setAccMsg] = useState<string | null>(null);
  const [accBusy, setAccBusy] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);

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
    seed.matchDays[3];

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
              {formatNight(tonight)} · الليلة {seed.matchDays.indexOf(tonight) + 1} من 4
            </p>
          </div>
          <span className="ms-auto flex flex-wrap gap-2">
            <Link href="/admin/schedule" className="rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white" style={{ background: "#175CD3" }}>
              🗓️ محرر الجدول (اليوم/الفترة/الملعب)
            </Link>
            <Link href="/" className="rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white" style={{ background: "#0B1230" }}>
              ← عرض التطبيق
            </Link>
          </span>
        </div>

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
              {(["A", "B"] as const).map((g) => (
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

        {/* الدوريات — المنصة متعددة الدوريات */}
        <section className="mt-5 rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[17px] font-bold">🏆 الدوريات</h2>
            <Link
              href="/admin/new-league"
              className="ms-auto rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white"
              style={{ background: "#067647" }}
            >
              ➕ إنشاء دوري جديد
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {leagues.map((l) => {
              const active = l.id === activeLeagueId;
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveLeague(l.id)}
                  className="rounded-[12px] px-4 py-2.5 text-start text-[13.5px] font-bold"
                  style={
                    active
                      ? { background: "#0B1230", color: "#fff" }
                      : { background: "#F7F9FE", border: "1px solid #E3E7F2" }
                  }
                >
                  {l.name}
                  <span className="block text-[11.5px] font-semibold" style={{ color: active ? "#F5D271" : "var(--text-2)" }}>
                    {l.season ?? ""} {active ? "· المعروض الآن ✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* الحسابات: إنشاء وإعادة تعيين كلمات المرور */}
        <section className="mt-5 rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
          <h2 className="mb-3 font-display text-[17px] font-bold">👤 الحسابات</h2>
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[12px] p-3" style={{ background: "#F7F9FE", border: "1px solid #E3E7F2" }}>
            <label className="text-[12.5px] font-bold">
              اسم المستخدم
              <input value={accUsername} onChange={(e) => setAccUsername(e.target.value)} dir="ltr" placeholder="hakam3"
                className="mt-1 block h-11 w-[140px] rounded-[10px] px-3 text-[13.5px]" style={{ border: "1px solid #E3E7F2", background: "#fff" }} />
            </label>
            <label className="text-[12.5px] font-bold">
              كلمة مرور مؤقتة
              <input value={accPassword} onChange={(e) => setAccPassword(e.target.value)} dir="ltr" placeholder="8+ أحرف"
                className="mt-1 block h-11 w-[140px] rounded-[10px] px-3 text-[13.5px]" style={{ border: "1px solid #E3E7F2", background: "#fff" }} />
            </label>
            <label className="text-[12.5px] font-bold">
              الاسم الظاهر
              <input value={accDisplay} onChange={(e) => setAccDisplay(e.target.value)} placeholder="حكم 3"
                className="mt-1 block h-11 w-[140px] rounded-[10px] px-3 text-[13.5px]" style={{ border: "1px solid #E3E7F2", background: "#fff" }} />
            </label>
            <div className="flex gap-1.5">
              {(["recorder", "referee", "admin"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() =>
                    setAccRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
                  }
                  className="h-11 rounded-[10px] px-3 text-[12.5px] font-bold"
                  style={
                    accRoles.includes(r)
                      ? { background: "#0B1230", color: "#fff" }
                      : { background: "#fff", border: "1px solid #E3E7F2" }
                  }
                >
                  {r === "recorder" ? "مسجّل" : r === "referee" ? "حكم" : "أدمن"}
                </button>
              ))}
            </div>
            <button
              disabled={accBusy || !accUsername.trim() || accPassword.length < 8}
              onClick={async () => {
                setAccBusy(true);
                setAccMsg(null);
                const msg = await adminCreateAccount(
                  accUsername.trim(), accPassword, accDisplay.trim() || accUsername.trim(), accRoles,
                );
                setAccBusy(false);
                setAccMsg(msg ?? `أُنشئ الحساب ✓ — سلّم ${accUsername.trim()} كلمته المؤقتة وسيُطالَب بتغييرها أول دخول`);
                if (!msg) {
                  setAccUsername("");
                  setAccPassword("");
                  setAccDisplay("");
                }
              }}
              className="h-11 rounded-[10px] px-4 text-[13.5px] font-bold text-white disabled:opacity-40"
              style={{ background: "#067647" }}
            >
              {accBusy ? "لحظات…" : "إنشاء الحساب"}
            </button>
            {accMsg ? (
              <p className="w-full text-[12.5px] font-bold" style={{ color: accMsg.includes("✓") ? "#067647" : "#B42318" }}>
                {accMsg}
              </p>
            ) : null}
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {profilesAll.map((p) => {
              const roles = memberRoles[p.id] ?? [];
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                  <span className="font-bold">{p.displayName}</span>
                  <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>@{p.username}</span>
                  {p.isPlatformAdmin ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#FFFAEB", color: "#93370D" }}>مدير المنصة</span>
                  ) : null}
                  {roles.map((r) => (
                    <span key={r} className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#EFF8FF", color: "#175CD3" }}>
                      {r === "recorder" ? "مسجّل" : r === "referee" ? "حكم" : r === "admin" ? "أدمن" : r}
                    </span>
                  ))}
                  {roles.length === 0 && !p.isPlatformAdmin ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#F2F4F7", color: "var(--text-2)" }}>
                      {p.accountType === "player" ? "لاعب" : "مشجّع"}
                    </span>
                  ) : null}
                  <span className="ms-auto flex items-center gap-1.5">
                    {resetFor === p.id ? (
                      <>
                        <input
                          value={resetPass}
                          onChange={(e) => setResetPass(e.target.value)}
                          dir="ltr"
                          placeholder="كلمة مؤقتة جديدة"
                          className="h-9 w-[150px] rounded-[8px] px-2 text-[12.5px]"
                          style={{ border: "1px solid #E3E7F2" }}
                        />
                        <button
                          disabled={resetPass.length < 8}
                          onClick={async () => {
                            const msg = await adminResetPassword(p.id, resetPass);
                            setResetMsg(msg ?? `أُعيد تعيين كلمة @${p.username} ✓ — سيُطالَب بتغييرها عند الدخول`);
                            if (!msg) {
                              setResetFor(null);
                              setResetPass("");
                            }
                          }}
                          className="h-9 rounded-[8px] px-3 text-[12px] font-bold text-white disabled:opacity-40"
                          style={{ background: "#B42318" }}
                        >
                          تأكيد
                        </button>
                        <button onClick={() => setResetFor(null)} className="h-9 rounded-[8px] px-2 text-[12px] font-bold" style={{ border: "1px solid #E3E7F2" }}>
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setResetFor(p.id);
                          setResetPass("");
                          setResetMsg(null);
                        }}
                        className="h-9 rounded-[8px] px-3 text-[12px] font-bold"
                        style={{ background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}
                      >
                        🔑 إعادة تعيين كلمة المرور
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {resetMsg ? (
            <p className="mt-2 text-[12.5px] font-bold" style={{ color: resetMsg.includes("✓") ? "#067647" : "#B42318" }}>
              {resetMsg}
            </p>
          ) : null}
        </section>

        {/* الكباتن وطلبات الانضمام */}
        <section className="mt-5 rounded-[16px] bg-white p-4" style={{ border: "1px solid #E3E7F2" }}>
          <h2 className="mb-1 font-display text-[17px] font-bold">🧢 كباتن الفرق وأكواد الانضمام</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            الأدمن يعيّن الكابتن، والكابتن يشارك كود فريقه مع لاعبيه ويقبل طلباتهم من صفحة «أنا».
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {seed.teams.map((t) => (
              <div key={t.code} className="flex flex-wrap items-center gap-2 rounded-[12px] p-2.5" style={{ background: "#F7F9FE", border: "1px solid #E3E7F2" }}>
                <span className="num w-8 text-center text-[12px] font-bold" style={{ color: "#175CD3" }}>{t.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{t.name}</span>
                {joinCodes[t.code] ? (
                  <span className="num rounded-[8px] px-2 py-1 text-[12.5px] font-bold tracking-[2px]" style={{ background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}>
                    {joinCodes[t.code]}
                  </span>
                ) : null}
                <select
                  value={captains[t.code] ?? ""}
                  onChange={(e) => void setCaptain(t.code, e.target.value || null)}
                  className="h-10 min-w-[130px] rounded-[10px] px-2 text-[12.5px] font-semibold"
                  style={{ border: "1px solid #E3E7F2", background: "#fff" }}
                >
                  <option value="">— بلا كابتن —</option>
                  {profilesAll.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} (@{p.username})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {joinRequests.filter((r) => r.status === "pending").length > 0 ? (
            <>
              <h3 className="mb-2 mt-4 text-[14px] font-bold">طلبات انضمام معلقة</h3>
              {joinRequests
                .filter((r) => r.status === "pending")
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                    <span className="font-bold">{r.displayName}</span>
                    <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>@{r.username}</span>
                    <span style={{ color: "var(--text-2)" }}>→ {seed.teams.find((t) => t.code === r.teamCode)?.name ?? r.teamCode}</span>
                    <span className="ms-auto flex gap-1.5">
                      <button onClick={() => void decideJoin(r.id, true)} className="h-9 rounded-[8px] px-3 text-[12px] font-bold text-white" style={{ background: "#067647" }}>
                        قبول ✓
                      </button>
                      <button onClick={() => void decideJoin(r.id, false)} className="h-9 rounded-[8px] px-3 text-[12px] font-bold text-white" style={{ background: "#B42318" }}>
                        رفض
                      </button>
                    </span>
                  </div>
                ))}
            </>
          ) : null}
        </section>

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
