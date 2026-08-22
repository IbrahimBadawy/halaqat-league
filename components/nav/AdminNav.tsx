"use client";

// شريط تنقل قسم الإدارة — مشترك بين صفحات الأدمن كلها.

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "نظرة عامة", icon: "📊" },
  { href: "/admin/users", label: "المستخدمون", icon: "👤" },
  { href: "/admin/teams", label: "الفرق والكباتن", icon: "🧢" },
  { href: "/admin/leagues", label: "الدوريات", icon: "🏆" },
  { href: "/admin/schedule", label: "محرر الجدول", icon: "🗓️" },
  { href: "/admin/new-league", label: "دوري جديد", icon: "➕" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex flex-wrap gap-1.5 rounded-[14px] bg-white p-1.5" style={{ border: "1px solid #E3E7F2" }}>
      {TABS.map((t) => {
        const active =
          t.href === "/admin"
            ? pathname === "/admin" || pathname === "/admin/"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-[10px] px-3.5 py-2 text-[13px] font-bold"
            style={
              active
                ? { background: "#0B1230", color: "#fff" }
                : { color: "var(--text-1)" }
            }
          >
            {t.icon} {t.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="ms-auto rounded-[10px] px-3.5 py-2 text-[13px] font-bold"
        style={{ color: "#175CD3" }}
      >
        ← عرض التطبيق
      </Link>
    </nav>
  );
}
