"use client";

// «أنا» — مبدّل دور (زائر/مسجّل/أدمن) محفوظ على هذا الجهاز، وحالة المزامنة
// مع القاعدة. المصادقة الحقيقية (اسم مستخدم + كلمة مرور فوق Supabase Auth)
// في المرحلة التالية.

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
  const { state, setRole, resetAll, hydrated, pendingWrites, droppedWrites } = useLeague();
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

      <SectionTitle>المزامنة</SectionTitle>
      <div
        className="card mb-4 flex items-center gap-2.5 px-3.5 py-3"
        style={
          pendingWrites > 0
            ? { borderColor: "rgba(244,196,48,.5)", background: "rgba(244,196,48,.07)" }
            : undefined
        }
      >
        <span className="text-[18px]">{pendingWrites > 0 ? "⏳" : "☁️"}</span>
        <span className="flex-1 text-[13.5px] font-semibold text-white">
          {pendingWrites > 0 ? (
            <>
              <span className="num">{pendingWrites}</span> عملية بانتظار الشبكة
            </>
          ) : (
            "كل البيانات متزامنة مع السحابة"
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

      <SectionTitle>هذا الجهاز</SectionTitle>
      <div className="mb-2 flex flex-col gap-2 pb-6">
        {confirmReset ? (
          <div className="card flex items-center gap-2 p-3">
            <span className="flex-1 text-[13px] font-semibold" style={{ color: "var(--live)" }}>
              إعادة ضبط هذا الجهاز؟ (نتائج الدوري في السحابة لن تُمس)
            </span>
            <button
              onClick={() => {
                resetAll();
                setConfirmReset(false);
              }}
              className="pill px-3 py-1.5 text-[13px] font-bold text-white"
              style={{ background: "var(--live)" }}
            >
              نعم، أعد الضبط
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
            🗑️ إعادة ضبط هذا الجهاز (الدور المختار)
          </button>
        )}
        <p className="pt-1 text-center text-[12px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          نتائج الدوري والمباريات والمجتمع محفوظة في السحابة ويراها الجميع.
          <br />
          المحفوظ على هذا الجهاز: الدور المختار فقط. الحسابات (اسم مستخدم
          وكلمة مرور) في المرحلة التالية — المواصفة §8.
        </p>
      </div>
    </div>
  );
}
