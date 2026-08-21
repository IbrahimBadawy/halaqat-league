// شارة الملعب — تظهر مع كل مباراة دائمًا. الملعب الإضافي (غير ملعب 1)
// يُميَّز بالأزرق لأن مباراتين قد تُلعبان في نفس الفترة على ملعبين.

export default function VenueChip({ venue, size = "sm" }: { venue: string; size?: "sm" | "md" }) {
  const alt = venue !== "ملعب 1";
  return (
    <span
      className={`pill font-semibold ${size === "md" ? "px-2.5 py-1 text-[12.5px]" : "px-2 py-0.5 text-[11px]"}`}
      style={
        alt
          ? { background: "rgba(43,79,194,.28)", color: "#ADC2FF", border: "1px solid rgba(43,79,194,.55)" }
          : { background: "rgba(255,255,255,.05)", color: "var(--text-3)", border: "1px solid var(--border-soft)" }
      }
    >
      ⚽ {venue}
    </span>
  );
}
