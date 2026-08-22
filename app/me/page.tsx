"use client";

// «أنا» — الدخول الافتراضي للزوار بلا حساب. الطاقم (أدمن/حكم/مسجّل) يسجل
// دخوله باسم مستخدم وكلمة مرور فوق Supabase Auth، والدور يأتي من الحساب
// (league_members.roles) لا من مبدّل محلي.

import Link from "next/link";
import { useState } from "react";
import SectionTitle from "@/components/ui/SectionTitle";
import { useLeague } from "@/lib/league/store";

const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
  admin: { label: "أدمن الدوري", icon: "🛡️" },
  moderator: { label: "مشرف", icon: "🧹" },
  referee: { label: "حكم", icon: "🎽" },
  recorder: { label: "مسجّل", icon: "📋" },
};

export default function MePage() {
  const { user, signIn, signOut, hydrated, connected, pendingWrites, droppedWrites } = useLeague();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hydrated) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    const msg = await signIn(username, password);
    setBusy(false);
    if (msg) {
      setError(msg);
      return;
    }
    setPassword("");
  }

  return (
    <div className="px-4 pb-8">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">أنا</h1>

      {user ? (
        <>
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
          </div>

          <SectionTitle>صلاحياتك</SectionTitle>
          <div className="mb-4 flex flex-wrap gap-2">
            {user.roles.length === 0 ? (
              <span className="text-[13px]" style={{ color: "var(--text-3)" }}>
                لا صلاحيات مسندة — تواصل مع مدير الدوري
              </span>
            ) : (
              user.roles.map((r) => {
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
              })
            )}
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
      ) : (
        <>
          <div className="card mb-4 px-4 py-4">
            <div className="mb-1 text-[15px] font-bold text-white">أهلًا بك 👋</div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>
              تتصفح الآن كزائر — كل المباريات والنتائج والترتيب مفتوحة للجميع بلا
              تسجيل دخول. الدخول للطاقم فقط (المسجّل والحكم وأدمن الدوري).
            </p>
          </div>

          <SectionTitle>دخول الطاقم</SectionTitle>
          <form onSubmit={submit} className="card mb-4 flex flex-col gap-2.5 px-4 py-4">
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
              اسم المستخدم
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                dir="ltr"
                placeholder="mosgel1"
                className="mt-1.5 h-12 w-full rounded-[12px] px-3.5 text-[15px] text-white outline-none"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border-soft)" }}
              />
            </label>
            <label className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
              كلمة المرور
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className="mt-1.5 h-12 w-full rounded-[12px] px-3.5 text-[15px] text-white outline-none"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border-soft)" }}
              />
            </label>
            {error ? (
              <p className="text-[13px] font-semibold" style={{ color: "var(--live)" }}>
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="btn-gold mt-1 h-12 w-full text-[15px] disabled:opacity-40"
            >
              {busy ? "جارٍ الدخول…" : "دخول"}
            </button>
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
        <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
          {pendingWrites > 0 ? "تُرسل تلقائيًا عند عودة الاتصال" : "النتائج تظهر لكل الأجهزة فورًا"}
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
        نتائج الدوري والمباريات والمجتمع محفوظة في السحابة ويراها الجميع.
        <br />
        لنسيان كلمة المرور أو إضافة حساب جديد: تواصل مع مدير الدوري.
      </p>
    </div>
  );
}
