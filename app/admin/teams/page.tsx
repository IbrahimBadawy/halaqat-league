"use client";

// إدارة الفرق (أدمن): تعيين الكباتن، أكواد الانضمام، وطلبات الانضمام
// المعلقة — كلها في الدوري النشط.

import Link from "next/link";
import { useState } from "react";
import { useLeague } from "@/lib/league/store";
import AdminNav from "@/components/nav/AdminNav";

const BORDER = "1px solid #E3E7F2";

/** محرر لاعب واحد: رقم القميص + الاسم (للقمصان المرقمة والأسماء الحقيقية) */
function PlayerRow({ code, shirt, name }: { code: string; shirt: number; name: string }) {
  const { updatePlayer } = useLeague();
  const [shirtDraft, setShirtDraft] = useState(String(shirt));
  const [nameDraft, setNameDraft] = useState(name);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = Number(shirtDraft) !== shirt || nameDraft.trim() !== name;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t py-1.5" style={{ borderColor: "#E3E7F2" }}>
      <input
        type="number"
        min={1}
        max={99}
        value={shirtDraft}
        onChange={(e) => setShirtDraft(e.target.value)}
        className="num h-9 w-[64px] rounded-[8px] px-2 text-center text-[13px] font-bold"
        style={{ border: BORDER, background: "#fff" }}
        aria-label="رقم القميص"
      />
      <input
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-[8px] px-2.5 text-[13px]"
        style={{ border: BORDER, background: "#fff" }}
        aria-label="اسم اللاعب"
      />
      <button
        disabled={!dirty || busy || !nameDraft.trim()}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const m = await updatePlayer(code, {
            shirt: Number(shirtDraft),
            name: nameDraft.trim(),
          });
          setBusy(false);
          setMsg(m ?? "✓");
          if (m) setShirtDraft(String(shirt));
        }}
        className="h-9 rounded-[8px] px-3 text-[12px] font-bold text-white disabled:opacity-35"
        style={{ background: "#067647" }}
      >
        {busy ? "…" : "حفظ"}
      </button>
      {msg ? (
        <span className="text-[11.5px] font-bold" style={{ color: msg === "✓" ? "#067647" : "#B42318" }}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}

export default function AdminTeamsPage() {
  const store = useLeague();
  const {
    hydrated, state, seed, profilesAll, captains, joinCodes, setCaptain,
    joinRequests, decideJoin, leagues, activeLeagueId,
  } = store;
  const [rosterFor, setRosterFor] = useState<string | null>(null);

  if (!hydrated) return null;
  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">إدارة الفرق — تحتاج حساب «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          سجّل دخولك من صفحة «أنا»
        </Link>
      </div>
    );

  const pending = joinRequests.filter((r) => r.status === "pending");
  const leagueName = leagues.find((l) => l.id === activeLeagueId)?.name ?? "";

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        <h1 className="mb-4 font-display text-[24px] font-bold">🧢 الفرق والكباتن — {leagueName}</h1>
        <AdminNav />

        {pending.length > 0 ? (
          <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: "1px solid #F4C430", background: "#FFFDF5" }}>
            <h2 className="mb-2 font-display text-[16px] font-bold">
              ⏳ طلبات انضمام معلقة <span className="num">({pending.length})</span>
            </h2>
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-[13px]" style={{ borderColor: "#E3E7F2" }}>
                <span className="font-bold">{r.displayName}</span>
                <span className="num text-[12px]" style={{ color: "var(--text-2)" }}>@{r.username}</span>
                <span style={{ color: "var(--text-2)" }}>
                  → {seed.teams.find((t) => t.code === r.teamCode)?.name ?? r.teamCode}
                </span>
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
          </section>
        ) : null}

        <section className="rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-1 font-display text-[16px] font-bold">الفرق</h2>
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            عيّن الكابتن من القائمة — الكابتن يرى كود فريقه في صفحة «أنا» ويشاركه
            مع لاعبيه ويقبل طلباتهم بنفسه.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {seed.teams.map((t) => (
              <div key={t.code} className="rounded-[12px] p-2.5" style={{ background: "#F7F9FE", border: BORDER }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num w-8 text-center text-[12px] font-bold" style={{ color: "#175CD3" }}>{t.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">{t.name}</span>
                  {joinCodes[t.code] ? (
                    <span className="num rounded-[8px] px-2 py-1 text-[12.5px] font-bold tracking-[2px]"
                      style={{ background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}
                      title="كود الانضمام">
                      {joinCodes[t.code]}
                    </span>
                  ) : null}
                  <select
                    value={captains[t.code] ?? ""}
                    onChange={(e) => void setCaptain(t.code, e.target.value || null)}
                    className="h-10 min-w-[150px] rounded-[10px] px-2 text-[12.5px] font-semibold"
                    style={{ border: BORDER, background: "#fff" }}
                  >
                    <option value="">— بلا كابتن —</option>
                    {profilesAll.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} (@{p.username})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setRosterFor(rosterFor === t.code ? null : t.code)}
                    className="h-10 rounded-[10px] px-3 text-[12.5px] font-bold"
                    style={rosterFor === t.code
                      ? { background: "#0B1230", color: "#fff" }
                      : { background: "#fff", border: BORDER }}
                  >
                    👕 الأرقام والأسماء
                  </button>
                </div>

                {rosterFor === t.code ? (
                  <div className="mt-2">
                    <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                      عدّل رقم القميص والاسم ثم «حفظ» — الرقم لا يتكرر داخل الفريق
                    </p>
                    {seed.players
                      .filter((p) => p.teamCode === t.code)
                      .sort((a, b) => a.shirt - b.shirt)
                      .map((p) => (
                        <PlayerRow key={p.id} code={p.id} shirt={p.shirt} name={p.name} />
                      ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
