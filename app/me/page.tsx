"use client";

// «أنا» — في المرحلة 0 تعمل كمبدّل دور (زائر/مسجّل/أدمن) وإدارة البيانات المحلية.
// المصادقة الحقيقية (اسم مستخدم + كلمة مرور فوق Supabase Auth) في المرحلة التالية.

import Link from "next/link";
import { useState } from "react";
import SectionTitle from "@/components/ui/SectionTitle";
import { useLeague, type Role } from "@/lib/league/store";

const ROLES: { role: Role; label: string; desc: string; icon: string }[] = [
  { role: "visitor", label: "زائر / لاعب", desc: "متابعة المباريات والترتيب فقط", icon: "👀" },
  { role: "recorder", label: "المسجّل / الحكم", desc: "فتح كونسول التسجيل المباشر وتسجيل الأحداث", icon: "📋" },
  { role: "admin", label: "أدمن الدوري", desc: "الاعتمادات وإعادة الفتح وتعديل النقاط والتدقيق", icon: "🛡️" },
];

export default function MePage() {
  const { state, setRole, loadDemo, resetAll, hydrated } = useLeague();
  const [confirmReset, setConfirmReset] = useState(false);
  if (!hydrated) return null;

  return (
    <div className="px-4">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">أنا</h1>

      <SectionTitle>الدور الحالي</SectionTitle>
      <div className="mb-4 flex flex-col gap-2">
        {ROLES.map((r) => {
          const active = state.role === r.role;
          return (
            <button
              key={r.role}
              onClick={() => setRole(r.role)}
              className="card flex items-center gap-3 p-3 text-start"
              style={active ? { border: "1.5px solid rgba(224,178,74,.6)", boxShadow: "0 0 18px rgba(224,178,74,.15)" } : undefined}
            >
              <span className="text-[22px]">{r.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-white">{r.label}</span>
                <span className="block text-[12.5px]" style={{ color: "var(--text-3)" }}>
                  {r.desc}
                </span>
              </span>
              {active ? (
                <span className="pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(224,178,74,.16)", color: "var(--gold-light)" }}>
                  مفعّل ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {state.role !== "visitor" ? (
        <div className="mb-4 flex flex-col gap-2">
          <Link href="/officiate" className="btn-gold flex h-12 items-center justify-center text-[14.5px]">
            📋 مهامي — مباريات الليلة للتسجيل
          </Link>
          {state.role === "admin" ? (
            <Link
              href="/admin"
              className="flex h-12 items-center justify-center rounded-[13px] text-[14.5px] font-bold"
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border-soft)", color: "var(--text-1)" }}
            >
              🛡️ لوحة الأدمن (ديسكتوب)
            </Link>
          ) : null}
        </div>
      ) : null}

      <SectionTitle>البيانات المحلية</SectionTitle>
      <div className="mb-2 flex flex-col gap-2 pb-6">
        <button
          onClick={loadDemo}
          className="flex h-12 items-center justify-center rounded-[13px] text-[14px] font-bold"
          style={{ background: "rgba(43,79,194,.2)", border: "1px solid rgba(43,79,194,.5)", color: "var(--text-1)" }}
        >
          🎬 تعبئة بيانات تجريبية (ليلة 21/8 + مباراة مباشرة)
        </button>
        {confirmReset ? (
          <div className="card flex items-center gap-2 p-3">
            <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--live)" }}>
              حذف كل الأحداث والنتائج المسجلة نهائيًا؟
            </span>
            <button
              onClick={() => {
                resetAll();
                setConfirmReset(false);
              }}
              className="pill px-3 py-1.5 text-[13px] font-bold text-white"
              style={{ background: "var(--live)" }}
            >
              نعم، امسح
            </button>
            <button onClick={() => setConfirmReset(false)} className="pill px-3 py-1.5 text-[13px] font-semibold" style={{ background: "rgba(255,255,255,.08)", color: "var(--text-2)" }}>
              تراجع
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex h-12 items-center justify-center rounded-[13px] text-[14px] font-bold"
            style={{ background: "rgba(229,72,77,.1)", border: "1px solid rgba(229,72,77,.35)", color: "var(--live)" }}
          >
            🗑️ مسح كل البيانات والبدء من جديد
          </button>
        )}
        <p className="pt-1 text-center text-[12px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          المرحلة 0: البيانات محفوظة محليًا على هذا الجهاز (localStorage).
          <br />
          الحسابات والمزامنة السحابية (Supabase) في المرحلة التالية — المواصفة §8.
        </p>
      </div>
    </div>
  );
}
