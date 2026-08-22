"use client";

import Link from "next/link";
import Shield from "@/components/ui/Shield";
import { useLeague } from "@/lib/league/store";

export default function TeamsPage() {
  const { seed, hydrated, groupNames } = useLeague();
  if (!hydrated) return null;
  return (
    <div className="px-4">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">الفرق</h1>
      {groupNames.map((g) => (
        <div key={g} className="mb-4">
          <div className="mb-2 text-[13.5px] font-semibold" style={{ color: "var(--text-3)" }}>
            المجموعة {g}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {seed.teams
              .filter((t) => t.group === g)
              .map((t) => (
                <Link key={t.code} href={`/team/${t.code}`} className="card flex items-center gap-2.5 px-3 py-3">
                  <Shield code={t.code} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-bold text-white">{t.name}</span>
                    <span className="num block text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                      {t.code}
                    </span>
                  </span>
                </Link>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
