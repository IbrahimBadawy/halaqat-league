"use client";

// «أنا» — الدخول الافتراضي للزوار بلا حساب. أي شخص يسجل حسابًا جديدًا
// (زائر أو لاعب)، واللاعب يطلب الانضمام لفريق بكود الفريق ويقرره الكابتن.
// الطاقم يسجل دخوله بحساباته، والأدوار كلها من القاعدة لا من مبدّل محلي.

import Link from "next/link";
import { useState } from "react";
import SectionTitle from "@/components/ui/SectionTitle";
import Shield from "@/components/ui/Shield";
import { useLeague } from "@/lib/league/store";

const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
  admin: { label: "أدمن الدوري", icon: "🛡️" },
  moderator: { label: "مشرف", icon: "🧹" },
  referee: { label: "حكم", icon: "🎽" },
  recorder: { label: "مسجّل", icon: "📋" },
};

const inputStyle = {
  background: "rgba(255,255,255,.06)",
  border: "1px solid var(--border-soft)",
} as const;

export default function MePage() {
  const store = useLeague();
  const {
    user, signIn, signOut, register, changePassword, hydrated, connected,
    pendingWrites, droppedWrites, myTeamCode, captainOf, joinRequests,
    joinCodes, requestJoin, decideJoin, teamByCode,
  } = store;

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [display, setDisplay] = useState("");
  const [accountType, setAccountType] = useState<"fan" | "player">("fan");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState<string | null>(null);

  if (!hydrated) return null;

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    const msg =
      tab === "login"
        ? await signIn(username, password)
        : await register(username, password, display.trim() || username.trim(), accountType);
    setBusy(false);
    if (msg) setError(msg);
    else setPassword("");
  }

  const myPending = user
    ? joinRequests.find((r) => r.userId === user.id && r.status === "pending")
    : undefined;
  const captainPending = joinRequests.filter(
    (r) => r.status === "pending" && captainOf.includes(r.teamCode),
  );

  return (
    <div className="px-4 pb-8">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">أنا</h1>

      {user ? (
        <>
          {/* بطاقة الحساب */}
          <div className="card mb-4 flex items-center gap-3 px-4 py-4">
            <span
              className="flex h-12 w-12 flex-none items-center justify-center rounded-full font-display text-[18px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg,var(--shield-1),var(--shield-2))",
                border: "2px solid rgba(224,178,74,.6)",
              }}
            >
              {user.displayName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15.5px] font-bold text-white">{user.displayName}</div>
              <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                @{user.username}
                {user.isPlatformAdmin ? " · مدير المنصة" : ""}
              </div>
            </div>
            {myTeamCode ? <Shield code={myTeamCode} size={34} gold={false} /> : null}
          </div>

          {/* الصلاحيات (طاقم فقط) */}
          {user.roles.length > 0 ? (
            <>
              <SectionTitle>صلاحياتك</SectionTitle>
              <div className="mb-4 flex flex-wrap gap-2">
                {user.roles.map((r) => {
                  const meta = ROLE_LABELS[r] ?? { label: r, icon: "•" };
                  return (
                    <span
                      key={r}
                      className="pill px-3 py-1.5 text-[13px] font-bold"
                      style={{
                        background: "rgba(224,178,74,.13)",
                        border: "1px solid rgba(224,178,74,.45)",
                        color: "var(--gold-light)",
                      }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                  );
                })}
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <Link href="/officiate" className="btn-gold flex h-12 items-center justify-center text-[14.5px]">
                  📋 مهامي — مباريات الليلة للتسجيل
                </Link>
                {user.roles.includes("admin") ? (
                  <Link
                    href="/admin"
                    className="flex h-12 items-center justify-center rounded-[13px] text-[14.5px] font-bold"
                    style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border-soft)", color: "var(--text-1)" }}
                  >
                    🛡️ لوحة الأدمن (ديسكتوب)
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}

          {/* فريقي / الانضمام لفريق */}
          <SectionTitle>فريقي</SectionTitle>
          {myTeamCode ? (
            <Link href={`/team/${myTeamCode}`} className="card mb-4 flex items-center gap-2.5 px-3.5 py-3">
              <Shield code={myTeamCode} size={30} gold={false} />
              <span className="flex-1 text-[14.5px] font-bold text-white">
                {teamByCode(myTeamCode)?.name}
              </span>
              <span className="text-[12.5px]" style={{ color: "var(--gold-light)" }}>
                صفحة الفريق ←
              </span>
            </Link>
          ) : myPending ? (
            <div className="card mb-4 flex items-center gap-2.5 px-3.5 py-3">
              <span className="text-[18px]">⏳</span>
              <span className="flex-1 text-[13.5px] font-semibold text-white">
                طلبك للانضمام إلى {teamByCode(myPending.teamCode)?.name ?? myPending.teamCode}{" "}
                بانتظار موافقة الكابتن
              </span>
            </div>
          ) : store.leagueLocked ? (
            <div className="card mb-4 flex items-center gap-2.5 px-3.5 py-3">
              <span className="text-[18px]">🔒</span>
              <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--text-3)" }}>
                هذا الدوري مقفول — الانضمام متاح في الدوريات المفتوحة فقط
              </span>
            </div>
          ) : (
            <div className="card mb-4 px-3.5 py-3.5">
              <p className="mb-2 text-[13px]" style={{ color: "var(--text-2)" }}>
                معك كود فريق من الكابتن؟ اكتبه هنا لإرسال طلب انضمام:
              </p>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  dir="ltr"
                  maxLength={10}
                  className="num h-12 flex-1 rounded-[12px] px-3.5 text-center text-[16px] font-bold tracking-[3px] text-white outline-none"
                  style={inputStyle}
                />
                <button
                  disabled={joinCode.trim().length < 4}
                  onClick={async () => {
                    setJoinMsg(null);
                    const msg = await requestJoin(joinCode.trim());
                    setJoinMsg(msg ?? "أُرسل طلبك — بانتظار موافقة الكابتن ✓");
                    if (!msg) setJoinCode("");
                  }}
                  className="btn-gold h-12 flex-none px-5 text-[14px] disabled:opacity-40"
                >
                  طلب انضمام
                </button>
              </div>
              {joinMsg ? (
                <p
                  className="mt-2 text-[12.5px] font-semibold"
                  style={{ color: joinMsg.includes("✓") ? "var(--green-text)" : "var(--live)" }}
                >
                  {joinMsg}
                </p>
              ) : null}
            </div>
          )}

          {/* لوحة الكابتن */}
          {captainOf.length > 0 ? (
            <>
              <SectionTitle>لوحة الكابتن</SectionTitle>
              {captainOf.map((code) => (
                <div key={code} className="card mb-3 px-3.5 py-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <Shield code={code} size={24} gold={false} />
                    <span className="flex-1 text-[14px] font-bold text-white">
                      {teamByCode(code)?.name}
                    </span>
                    {joinCodes[code] ? (
                      <span
                        className="num pill px-3 py-1 text-[14px] font-bold tracking-[2px]"
                        style={{ background: "rgba(224,178,74,.13)", border: "1px solid rgba(224,178,74,.45)", color: "var(--gold-light)" }}
                        title="كود الانضمام — شاركه مع لاعبيك"
                      >
                        {joinCodes[code]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                    شارك الكود مع لاعبيك ليطلبوا الانضمام — الطلبات تظهر هنا:
                  </p>
                  {captainPending.filter((r) => r.teamCode === code).length === 0 ? (
                    <p className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                      لا طلبات معلقة
                    </p>
                  ) : (
                    captainPending
                      .filter((r) => r.teamCode === code)
                      .map((r) => (
                        <div key={r.id} className="flex items-center gap-2 border-t py-2" style={{ borderColor: "var(--border-softer)" }}>
                          <span className="flex-1 text-[13.5px] font-semibold text-white">
                            {r.displayName}
                            <span className="ms-1.5 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                              @{r.username}
                            </span>
                          </span>
                          <button
                            onClick={() => void decideJoin(r.id, true)}
                            className="pill px-3 py-1.5 text-[12.5px] font-bold"
                            style={{ background: "rgba(30,127,58,.15)", color: "var(--green-text)", border: "1px solid rgba(30,127,58,.4)" }}
                          >
                            قبول ✓
                          </button>
                          <button
                            onClick={() => void decideJoin(r.id, false)}
                            className="pill px-3 py-1.5 text-[12.5px] font-bold"
                            style={{ background: "rgba(229,72,77,.12)", color: "var(--live)", border: "1px solid rgba(229,72,77,.35)" }}
                          >
                            رفض
                          </button>
                        </div>
                      ))
                  )}
                </div>
              ))}
            </>
          ) : null}

          {/* تغيير كلمة المرور */}
          <SectionTitle>كلمة المرور</SectionTitle>
          <div className="card mb-4 px-3.5 py-3.5">
            <div className="flex gap-2">
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="كلمة مرور جديدة (8+ أحرف)"
                autoComplete="new-password"
                dir="ltr"
                className="h-12 flex-1 rounded-[12px] px-3.5 text-[14px] text-white outline-none"
                style={inputStyle}
              />
              <button
                disabled={newPass.length < 8}
                onClick={async () => {
                  const msg = await changePassword(newPass);
                  setPassMsg(msg ?? "تم تغيير كلمة المرور ✓");
                  if (!msg) setNewPass("");
                }}
                className="btn-gold h-12 flex-none px-5 text-[14px] disabled:opacity-40"
              >
                تغيير
              </button>
            </div>
            {passMsg ? (
              <p
                className="mt-2 text-[12.5px] font-semibold"
                style={{ color: passMsg.includes("✓") ? "var(--green-text)" : "var(--live)" }}
              >
                {passMsg}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="card mb-4 px-4 py-4">
            <div className="mb-1 text-[15px] font-bold text-white">أهلًا بك 👋</div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
              تتصفح الآن كزائر — كل المباريات والنتائج مفتوحة بلا حساب. سجّل
              حسابًا لتنضم لفريق كلاعب أو تشارك باسمك.
            </p>
          </div>

          {/* تبويبا الدخول والتسجيل */}
          <div className="mb-3 flex gap-1.5">
            {(
              [
                ["login", "تسجيل الدخول"],
                ["signup", "حساب جديد"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setError(null);
                }}
                className="pill flex-1 py-2 text-[13.5px]"
                style={
                  tab === key
                    ? { background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))", color: "var(--ink)", fontWeight: 700 }
                    : { background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)", color: "var(--text-2)", fontWeight: 600 }
                }
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submitAuth} className="card mb-4 flex flex-col gap-2.5 px-4 py-4">
            {tab === "signup" ? (
              <>
                <label className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
                  الاسم الظاهر (بالعربية عادي)
                  <input
                    value={display}
                    onChange={(e) => setDisplay(e.target.value)}
                    placeholder="مثال: أحمد"
                    className="mt-1.5 h-12 w-full rounded-[12px] px-3.5 text-[15px] text-white outline-none"
                    style={inputStyle}
                  />
                </label>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["fan", "👀 مشجّع / زائر"],
                      ["player", "⚽ لاعب"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccountType(key)}
                      className="pill flex-1 py-2 text-[13px]"
                      style={
                        accountType === key
                          ? { background: "rgba(224,178,74,.15)", border: "1.5px solid rgba(224,178,74,.55)", color: "var(--gold-light)", fontWeight: 700 }
                          : { background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)", color: "var(--text-2)", fontWeight: 600 }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
              اسم المستخدم {tab === "signup" ? "(إنجليزي صغير وأرقام)" : ""}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                dir="ltr"
                placeholder="ahmed10"
                className="mt-1.5 h-12 w-full rounded-[12px] px-3.5 text-[15px] text-white outline-none"
                style={inputStyle}
              />
            </label>
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
              كلمة المرور {tab === "signup" ? "(8 أحرف على الأقل)" : ""}
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                dir="ltr"
                className="mt-1.5 h-12 w-full rounded-[12px] px-3.5 text-[15px] text-white outline-none"
                style={inputStyle}
              />
            </label>
            {error ? (
              <p className="text-[13px] font-semibold" style={{ color: "var(--live)" }}>
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !username.trim() || !password || !connected}
              className="btn-gold mt-1 h-12 w-full text-[15px] disabled:opacity-40"
            >
              {busy ? "لحظات…" : tab === "login" ? "دخول" : "إنشاء الحساب والدخول"}
            </button>
            {!connected ? (
              <p className="text-[12px] font-semibold" style={{ color: "var(--warn)" }}>
                لا اتصال بالخادم — الدخول والتسجيل متوقفان حتى يعود
              </p>
            ) : null}
          </form>
        </>
      )}

      <SectionTitle>المزامنة</SectionTitle>
      <div
        className="card mb-4 flex items-center gap-2.5 px-3.5 py-3"
        style={
          pendingWrites > 0
            ? { borderColor: "rgba(244,196,48,.5)", background: "rgba(244,196,48,.07)" }
            : undefined
        }
      >
        <span className="text-[18px]">{pendingWrites > 0 ? "⏳" : connected ? "☁️" : "📴"}</span>
        <span className="flex-1 text-[13.5px] font-semibold text-white">
          {pendingWrites > 0 ? (
            <>
              <span className="num">{pendingWrites}</span> عملية بانتظار الشبكة
            </>
          ) : connected ? (
            "كل البيانات متزامنة مع السحابة"
          ) : (
            "لا اتصال بالخادم"
          )}
        </span>
      </div>

      {droppedWrites > 0 ? (
        <div
          className="card mb-4 flex items-start gap-2.5 px-3.5 py-3"
          style={{ borderColor: "rgba(229,72,77,.5)", background: "rgba(229,72,77,.08)" }}
        >
          <span className="text-[18px]">⚠️</span>
          <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--live)" }}>
            <span className="num">{droppedWrites}</span> عملية رفضها الخادم ولم تُحفظ — راجع
            المباراة المعنية وأعد تسجيل ما ينقص يدويًا.
          </span>
        </div>
      ) : null}

      {user ? (
        <button
          onClick={() => void signOut()}
          className="flex h-12 w-full items-center justify-center rounded-[13px] text-[14px] font-bold"
          style={{ background: "rgba(229,72,77,.1)", border: "1px solid rgba(229,72,77,.35)", color: "var(--live)" }}
        >
          🚪 تسجيل الخروج
        </button>
      ) : null}

      <p className="pt-3 text-center text-[12px] leading-relaxed" style={{ color: "var(--text-3)" }}>
        نسيت كلمة المرور؟ مدير الدوري يعيد تعيينها لك من لوحة الأدمن.
      </p>
    </div>
  );
}
