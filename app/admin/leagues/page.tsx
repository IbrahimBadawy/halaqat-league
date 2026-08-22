"use client";

// إدارة الدوريات (أدمن): كل دوري ببطاقته — عرضه في التطبيق، قفله (أرشفة:
// يمنع التسجيل والانضمام ويبقى مقروءًا) أو إعادة فتحه، وإنشاء دوري جديد.

import Link from "next/link";
import { useState } from "react";
import AdminNav from "@/components/nav/AdminNav";
import { useLeague } from "@/lib/league/store";

const BORDER = "1px solid #E3E7F2";

export default function AdminLeaguesPage() {
  const store = useLeague();
  const { hydrated, state, leagues, activeLeagueId, setActiveLeague, setLeagueStatus } = store;
  const [msg, setMsg] = useState<string | null>(null);
  const [busyFor, setBusyFor] = useState<string | null>(null);

  if (!hydrated) return null;
  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">إدارة الدوريات — تحتاج حساب «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          سجّل دخولك من صفحة «أنا»
        </Link>
      </div>
    );

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[24px] font-bold">🏆 الدوريات</h1>
          <Link href="/admin/new-league" className="ms-auto rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white" style={{ background: "#067647" }}>
            ➕ إنشاء دوري جديد
          </Link>
        </div>
        <AdminNav />

        {msg ? (
          <p className="mb-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold"
            style={msg.includes("✓")
              ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
              : { background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA" }}>
            {msg}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {leagues.map((l) => {
            const active = l.id === activeLeagueId;
            const locked = l.status === "archived";
            return (
              <div key={l.id} className="rounded-[16px] bg-white p-4" style={{ border: active ? "2px solid #0B1230" : BORDER }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[20px]">{locked ? "🔒" : "🏆"}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-[16px] font-bold">{l.name}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
                    style={locked
                      ? { background: "#F2F4F7", color: "var(--text-2)" }
                      : { background: "#ECFDF3", color: "#067647" }}>
                    {locked ? "مقفول (مؤرشف)" : "مفتوح"}
                  </span>
                </div>
                <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
                  {l.season ?? "بلا موسم"} {active ? "· المعروض حاليًا في التطبيق ✓" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {!active ? (
                    <button onClick={() => setActiveLeague(l.id)}
                      className="h-10 rounded-[10px] px-4 text-[13px] font-bold text-white" style={{ background: "#0B1230" }}>
                      عرضه في التطبيق
                    </button>
                  ) : null}
                  <button
                    disabled={busyFor === l.id}
                    onClick={async () => {
                      setBusyFor(l.id);
                      const next = locked ? "active" : "archived";
                      const m = await setLeagueStatus(l.id, next);
                      setBusyFor(null);
                      setMsg(
                        m ??
                          (next === "archived"
                            ? `قُفل «${l.name}» ✓ — النتائج تبقى معروضة، ولا تسجيل أو انضمام جديدًا`
                            : `فُتح «${l.name}» ✓`),
                      );
                    }}
                    className="h-10 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"
                    style={locked
                      ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
                      : { background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}
                  >
                    {busyFor === l.id ? "لحظات…" : locked ? "🔓 إعادة فتح الدوري" : "🔒 قفل الدوري (أرشفة)"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          الدوري المقفول: يظهر للجمهور بنتائجه كاملة، لكن الكونسول يرفض أي تسجيل
          جديد (إلا للأدمن للتصحيح) ولا يقبل الفريق لاعبين جددًا.
        </p>
      </div>
    </div>
  );
}
