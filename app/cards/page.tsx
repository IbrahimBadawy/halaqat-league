"use client";

import Shield from "@/components/ui/Shield";
import SectionTitle from "@/components/ui/SectionTitle";
import { useLeague } from "@/lib/league/store";

const RARITY: Record<string, string> = { rare: "نادر", common: "شائع" };

export default function CardsPage() {
  const { seed, hydrated, state } = useLeague();
  if (!hydrated) return null;

  return (
    <div className="px-4">
      <h1 className="pb-1 pt-4 font-display text-[22px] font-bold text-white">كروت القوة</h1>
      <p className="pb-3 text-[13px]" style={{ color: "var(--text-3)" }}>
        كل فريق يملك كل كارت مرة واحدة في الموسم — القائد يطلبه أثناء المباراة ويطبَّق أثره تلقائيًا.
      </p>

      <div className="mb-5 flex flex-col gap-2.5">
        {seed.powerCards.map((c) => (
          <div
            key={c.name}
            className="rounded-[16px] p-3.5"
            style={{
              background: "linear-gradient(135deg,rgba(255,138,31,.16),rgba(20,36,90,.4))",
              border: "1px solid rgba(255,138,31,.45)",
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[22px]">{c.icon}</span>
              <span className="font-display text-[16px] font-bold text-white">{c.name}</span>
              <span className="pill ms-auto px-2.5 py-0.5 text-[11.5px] font-bold" style={{ background: "rgba(255,138,31,.22)", color: "#FFB067" }}>
                {RARITY[c.rarity] ?? c.rarity}
              </span>
            </div>
            <p className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              {c.description}
            </p>
          </div>
        ))}
      </div>

      <SectionTitle>كروت الفرق (علنية)</SectionTitle>
      <div className="mb-5 flex flex-col gap-1.5 pb-4">
        {seed.teams.map((t) => {
          const used = state.usedCards.filter((u) => u.teamCode === t.code);
          return (
            <div key={t.code} className="card flex items-center gap-2.5 px-3 py-2.5">
              <Shield code={t.code} size={24} gold={false} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-white">{t.name}</span>
              <span className="flex gap-1.5">
                {seed.powerCards.map((c) => {
                  const isUsed = used.some((u) => u.cardName === c.name);
                  return (
                    <span key={c.name} title={`${c.name}${isUsed ? " — مستهلك" : ""}`} className="text-[15px]" style={{ opacity: isUsed ? 0.25 : 1, filter: isUsed ? "grayscale(1)" : "none" }}>
                      {c.icon}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
