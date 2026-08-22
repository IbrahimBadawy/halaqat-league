"use client";

// إدارة المستخدمين (أدمن): بحث + ترقيم صفحات + إنشاء حساب + تعديل صلاحيات
// المستخدم في الدوري النشط + إعادة تعيين كلمة المرور + حذف الحساب.

import Link from "next/link";
import { useMemo, useState } from "react";
import AdminNav from "@/components/nav/AdminNav";
import { useLeague } from "@/lib/league/store";

const BORDER = "1px solid #E3E7F2";
const PAGE_SIZE = 8;
const ROLE_META: Record<string, string> = {
  admin: "أدمن",
  moderator: "مشرف",
  referee: "حكم",
  recorder: "مسجّل",
};

export default function AdminUsersPage() {
  const store = useLeague();
  const {
    hydrated, state, user, profilesAll, memberRoles, leagues, activeLeagueId,
    adminCreateAccount, adminResetPassword, adminSetRoles, adminDeleteAccount,
    bans, unbanPoster,
  } = store;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  // إنشاء حساب
  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cDisplay, setCDisplay] = useState("");
  const [cRoles, setCRoles] = useState<string[]>(["recorder"]);
  const [cBusy, setCBusy] = useState(false);

  // صفوف مفتوحة للتحرير
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const [rolesDraft, setRolesDraft] = useState<string[]>([]);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [deleteFor, setDeleteFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profilesAll;
    return profilesAll.filter(
      (p) =>
        p.username.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q),
    );
  }, [profilesAll, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const activeLeagueName = leagues.find((l) => l.id === activeLeagueId)?.name ?? "";

  if (!hydrated) return null;
  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">إدارة المستخدمين — تحتاج حساب «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          سجّل دخولك من صفحة «أنا»
        </Link>
      </div>
    );

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        <h1 className="mb-4 font-display text-[24px] font-bold">👤 المستخدمون</h1>
        <AdminNav />

        {/* إنشاء حساب */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-3 font-display text-[16px] font-bold">إنشاء حساب جديد</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[12.5px] font-bold">
              اسم المستخدم
              <input value={cUsername} onChange={(e) => setCUsername(e.target.value)} dir="ltr" placeholder="hakam3"
                className="mt-1 block h-11 w-[150px] rounded-[10px] px-3 text-[13.5px]" style={{ border: BORDER }} />
            </label>
            <label className="text-[12.5px] font-bold">
              كلمة مرور مؤقتة (8+)
              <input value={cPassword} onChange={(e) => setCPassword(e.target.value)} dir="ltr"
                className="mt-1 block h-11 w-[150px] rounded-[10px] px-3 text-[13.5px]" style={{ border: BORDER }} />
            </label>
            <label className="text-[12.5px] font-bold">
              الاسم الظاهر
              <input value={cDisplay} onChange={(e) => setCDisplay(e.target.value)} placeholder="حكم 3"
                className="mt-1 block h-11 w-[150px] rounded-[10px] px-3 text-[13.5px]" style={{ border: BORDER }} />
            </label>
            <div className="flex gap-1.5">
              {Object.entries(ROLE_META).map(([r, label]) => (
                <button key={r}
                  onClick={() => setCRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
                  className="h-11 rounded-[10px] px-3 text-[12.5px] font-bold"
                  style={cRoles.includes(r) ? { background: "#0B1230", color: "#fff" } : { background: "#F7F9FE", border: BORDER }}>
                  {label}
                </button>
              ))}
            </div>
            <button
              disabled={cBusy || !cUsername.trim() || cPassword.length < 8}
              onClick={async () => {
                setCBusy(true);
                const m = await adminCreateAccount(cUsername.trim(), cPassword, cDisplay.trim() || cUsername.trim(), cRoles);
                setCBusy(false);
                setMsg(m ?? `أُنشئ @${cUsername.trim()} ✓ — سيُطالَب بتغيير كلمته المؤقتة أول دخول`);
                if (!m) { setCUsername(""); setCPassword(""); setCDisplay(""); }
              }}
              className="h-11 rounded-[10px] px-4 text-[13.5px] font-bold text-white disabled:opacity-40"
              style={{ background: "#067647" }}>
              {cBusy ? "لحظات…" : "إنشاء"}
            </button>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            الأدوار المختارة تُمنح في الدوري النشط ({activeLeagueName}). بلا أدوار = حساب لاعب عادي.
          </p>
        </section>

        {msg ? (
          <p className="mb-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold"
            style={msg.includes("✓")
              ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
              : { background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA" }}>
            {msg}
          </p>
        ) : null}

        {/* البحث والقائمة */}
        <section className="rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[16px] font-bold">
              كل الحسابات <span className="num text-[13px]" style={{ color: "var(--text-2)" }}>({filtered.length})</span>
            </h2>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="🔍 ابحث بالاسم أو اسم المستخدم…"
              className="ms-auto h-11 w-full max-w-[300px] rounded-[10px] px-3 text-[13.5px]"
              style={{ border: BORDER, background: "#F7F9FE" }}
            />
          </div>

          {rows.map((p) => {
            const roles = memberRoles[p.id] ?? [];
            const isSelf = p.id === user?.id;
            return (
              <div key={p.id} className="border-b py-2.5" style={{ borderColor: "#E3E7F2" }}>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-bold">{p.displayName}</span>
                  <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>@{p.username}</span>
                  {p.isPlatformAdmin ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#FFFAEB", color: "#93370D" }}>مدير المنصة</span>
                  ) : null}
                  {roles.map((r) => (
                    <span key={r} className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#EFF8FF", color: "#175CD3" }}>
                      {ROLE_META[r] ?? r}
                    </span>
                  ))}
                  {roles.length === 0 && !p.isPlatformAdmin ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#F2F4F7", color: "var(--text-2)" }}>
                      {p.accountType === "player" ? "لاعب" : "مشجّع"}
                    </span>
                  ) : null}
                  <span className="ms-auto flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setRolesFor(rolesFor === p.id ? null : p.id);
                        setRolesDraft(roles);
                        setResetFor(null);
                        setDeleteFor(null);
                      }}
                      className="h-9 rounded-[8px] px-3 text-[12px] font-bold"
                      style={{ background: "#EFF8FF", color: "#175CD3", border: "1px solid #B2DDFF" }}>
                      ⚙️ الصلاحيات
                    </button>
                    <button
                      onClick={() => { setResetFor(resetFor === p.id ? null : p.id); setResetPass(""); setRolesFor(null); setDeleteFor(null); }}
                      className="h-9 rounded-[8px] px-3 text-[12px] font-bold"
                      style={{ background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}>
                      🔑 كلمة المرور
                    </button>
                    {!p.isPlatformAdmin && !isSelf ? (
                      <button
                        onClick={() => { setDeleteFor(deleteFor === p.id ? null : p.id); setRolesFor(null); setResetFor(null); }}
                        className="h-9 rounded-[8px] px-3 text-[12px] font-bold"
                        style={{ background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA" }}>
                        🗑️ حذف
                      </button>
                    ) : null}
                  </span>
                </div>

                {rolesFor === p.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[10px] p-2.5" style={{ background: "#F7F9FE", border: BORDER }}>
                    <span className="text-[12px] font-bold">صلاحياته في «{activeLeagueName}»:</span>
                    {Object.entries(ROLE_META).map(([r, label]) => (
                      <button key={r}
                        onClick={() => setRolesDraft((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
                        className="h-9 rounded-[8px] px-3 text-[12px] font-bold"
                        style={rolesDraft.includes(r) ? { background: "#0B1230", color: "#fff" } : { background: "#fff", border: BORDER }}>
                        {label}
                      </button>
                    ))}
                    <button
                      onClick={async () => {
                        const m = await adminSetRoles(p.id, rolesDraft);
                        setMsg(m ?? `حُدّثت صلاحيات @${p.username} ✓`);
                        if (!m) setRolesFor(null);
                      }}
                      className="h-9 rounded-[8px] px-4 text-[12px] font-bold text-white" style={{ background: "#067647" }}>
                      حفظ
                    </button>
                    <span className="text-[11.5px]" style={{ color: "var(--text-2)" }}>
                      إزالة كل الأدوار تجعله لاعبًا/مشجّعًا عاديًا
                    </span>
                  </div>
                ) : null}

                {resetFor === p.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[10px] p-2.5" style={{ background: "#FFFAEB", border: "1px solid #F4C430" }}>
                    <input value={resetPass} onChange={(e) => setResetPass(e.target.value)} dir="ltr" placeholder="كلمة مؤقتة جديدة (8+)"
                      className="h-10 w-[190px] rounded-[8px] px-3 text-[13px]" style={{ border: BORDER, background: "#fff" }} />
                    <button
                      disabled={resetPass.length < 8}
                      onClick={async () => {
                        const m = await adminResetPassword(p.id, resetPass);
                        setMsg(m ?? `أُعيد تعيين كلمة @${p.username} ✓ — سيُطالَب بتغييرها عند الدخول`);
                        if (!m) setResetFor(null);
                      }}
                      className="h-10 rounded-[8px] px-4 text-[12px] font-bold text-white disabled:opacity-40" style={{ background: "#93370D" }}>
                      إعادة التعيين
                    </button>
                  </div>
                ) : null}

                {deleteFor === p.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] p-2.5" style={{ background: "#FEF3F2", border: "1px solid #FECDCA" }}>
                    <span className="text-[12.5px] font-bold" style={{ color: "#B42318" }}>
                      حذف @{p.username} نهائيًا؟ يفقد الدخول، ويبقى اسمه في سجلات المباريات القديمة.
                    </span>
                    <button
                      onClick={async () => {
                        const m = await adminDeleteAccount(p.id);
                        setMsg(m ?? `حُذف الحساب @${p.username} ✓`);
                        setDeleteFor(null);
                      }}
                      className="h-9 rounded-[8px] px-4 text-[12px] font-bold text-white" style={{ background: "#B42318" }}>
                      نعم، احذف
                    </button>
                    <button onClick={() => setDeleteFor(null)} className="h-9 rounded-[8px] px-3 text-[12px] font-bold" style={{ border: BORDER, background: "#fff" }}>
                      تراجع
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* ترقيم الصفحات */}
          {pageCount > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                className="h-10 rounded-[9px] px-3 text-[13px] font-bold disabled:opacity-35" style={{ border: BORDER }}>
                → السابق
              </button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className="num h-10 w-10 rounded-[9px] text-[13px] font-bold"
                  style={i === safePage ? { background: "#0B1230", color: "#fff" } : { border: BORDER }}>
                  {i + 1}
                </button>
              ))}
              <button disabled={safePage === pageCount - 1} onClick={() => setPage(safePage + 1)}
                className="h-10 rounded-[9px] px-3 text-[13px] font-bold disabled:opacity-35" style={{ border: BORDER }}>
                التالي ←
              </button>
            </div>
          ) : null}
        </section>

        {/* المحظورون من النشر في المجتمع */}
        <section className="mt-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-1 font-display text-[16px] font-bold">
            🚫 المحظورون من النشر <span className="num text-[13px]" style={{ color: "var(--text-2)" }}>({bans.length})</span>
          </h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            الحظر يتم من صفحة المجتمع (زر 🚫 على المنشور المسيء) ويشمل جهاز
            الناشر وحسابه معًا. من هنا تلغي الحظر.
          </p>
          {bans.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-2)" }}>لا محظورين حاليًا</p>
          ) : (
            bans.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                <span className="font-bold">{b.username ?? "ناشر مجهول"}</span>
                <span style={{ color: "var(--text-2)" }}>{b.reason}</span>
                <span className="num text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  {new Date(b.createdAt).toLocaleDateString("en-GB")}
                </span>
                <button
                  onClick={() => void unbanPoster(b.id)}
                  className="ms-auto h-9 rounded-[8px] px-3 text-[12px] font-bold"
                  style={{ background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }}
                >
                  إلغاء الحظر
                </button>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
