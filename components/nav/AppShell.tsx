"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { useLeague } from "@/lib/league/store";

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const c = active ? "var(--gold)" : "var(--text-3)";
  const common = {
    width: 22,
    height: 20,
    fill: "none",
    stroke: c,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V20h13V9.5" fill={active ? c : "none"} fillOpacity={active ? 0.25 : 0} />
        </svg>
      );
    case "matches":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M3.5 9.5h17M8 3v3M16 3v3" />
        </svg>
      );
    case "standings":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M5 20V12M12 20V4M19 20v-6" />
        </svg>
      );
    case "community":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M20 11a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h1l3 3 3-3h1a4 4 0 0 0 4-4z" />
        </svg>
      );
    case "me":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    default:
      return null;
  }
}

const TABS = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/matches", label: "المباريات", icon: "matches" },
  { href: "/standings", label: "الترتيب", icon: "standings" },
  { href: "/community", label: "المجتمع", icon: "community" },
  { href: "/me", label: "أنا", icon: "me" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useLeague();

  // شاشات ملء الشاشة بلا شريط سفلي: الكونسول ولوحة الأدمن ووضع TV والبوستر
  const bare =
    pathname.includes("/console") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/tv") ||
    pathname.startsWith("/poster");

  if (bare) return <div className="min-h-dvh">{children}</div>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col pitch-glow">
      <main className="flex-1 pb-20">{children}</main>
      <nav
        className="fixed bottom-0 start-1/2 z-40 flex w-full max-w-[430px] translate-x-1/2 border-t px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-2"
        style={{ background: "rgba(10,18,42,.96)", borderColor: "var(--border-soft)" }}
      >
        {TABS.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-1 flex-col items-center gap-1 py-1"
            >
              <NavIcon name={t.icon} active={active} />
              <span
                className="text-[12.5px]"
                style={{
                  color: active ? "var(--gold-light)" : "var(--text-3)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
        {state.role !== "visitor" ? (
          <Link
            href={state.role === "admin" ? "/admin" : "/officiate"}
            className="flex flex-1 flex-col items-center gap-1 py-1"
          >
            <svg
              width="22"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={pathname.startsWith("/officiate") ? "var(--gold)" : "var(--text-3)"}
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 6h11M9 12h11M9 18h11" />
              <path d="m4 5 1 1 2-2M4 11l1 1 2-2M4 17l1 1 2-2" />
            </svg>
            <span className="text-[12.5px] font-medium" style={{ color: "var(--text-3)" }}>
              {state.role === "admin" ? "الإدارة" : "مهامي"}
            </span>
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
