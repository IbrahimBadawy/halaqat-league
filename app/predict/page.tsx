"use client";

// صفحة التوقعات — توقع نتائج المباريات القادمة (تُحفظ محليًا لصاحب الجهاز).
// نتيجة مضبوطة = 3 نقاط، اتجاه صحيح (فائز/تعادل) = نقطة واحدة.

import Shield from "@/components/ui/Shield";
import SectionTitle from "@/components/ui/SectionTitle";
import VenueChip from "@/components/match/VenueChip";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";
import type { Match, Prediction } from "@/lib/league/types";

/** نقاط توقع واحد: 3 للنتيجة المضبوطة، 1 للاتجاه الصحيح، 0 غير ذلك */
function predictionPoints(pred: Prediction, actual: { home: number; away: number }): number {
  if (pred.home === actual.home && pred.away === actual.away) return 3;
  if (Math.sign(pred.home - pred.away) === Math.sign(actual.home - actual.away)) return 1;
  return 0;
}

export default function PredictPage() {
  const { matches, hydrated, statusOf, scoreOf, resolveSide, state, setPrediction, connected } =
    useLeague();

  if (!hydrated) return null;

  // مباريات قادمة قابلة للتوقع: مجدولة وطرفاها معروفان (لا placeholders)
  const upcoming = matches.filter(
    (m) => statusOf(m.id) === "scheduled" && resolveSide(m.home).team && resolveSide(m.away).team,
  );

  // مباريات معتمدة لها توقع — تدخل في الحساب
  const scored = matches.filter((m) => statusOf(m.id) === "approved" && state.predictions[m.id]);

  const totalPoints = scored.reduce(
    (sum, m) => sum + predictionPoints(state.predictions[m.id], scoreOf(m.id)),
    0,
  );

  return (
    <div className="px-4 pb-8">
      {/* العنوان */}
      <div className="pb-1 pt-4">
        <h1 className="font-display text-[22px] font-bold text-white">التوقعات</h1>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          توقع نتيجة المباريات القادمة — نتيجة مضبوطة = <span className="num font-bold" style={{ color: "var(--gold)" }}>3</span> نقاط،
          اتجاه صحيح (فائز/تعادل) = نقطة.
        </p>
      </div>

      {!connected ? (
        <div
          className="mt-3 rounded-[12px] px-3.5 py-2.5 text-[12.5px] font-semibold"
          style={{ background: "rgba(244,196,48,.1)", border: "1px solid rgba(244,196,48,.4)", color: "var(--warn)" }}
        >
          لا اتصال بالخادم — التوقعات لن تُحفظ حتى يعود الاتصال
        </div>
      ) : null}

      {/* رصيد النقاط */}
      <div className="card my-3 flex items-center justify-between px-4 py-3.5">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
            رصيدك من نقاط التوقع
          </div>
          <div className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
            من <span className="num">{scored.length}</span> مباراة معتمدة لها توقع
          </div>
        </div>
        <div className="num font-display text-[34px] font-bold leading-none" style={{ color: "var(--gold)" }}>
          {totalPoints}
        </div>
      </div>

      {/* المباريات القادمة */}
      <SectionTitle>مبارياتك القادمة</SectionTitle>
      {upcoming.length === 0 ? (
        <div className="card px-4 py-6 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
          لا توجد مباريات متاحة للتوقع الآن — تابعنا قبل الليلة القادمة.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {upcoming.map((m) => (
            <PredictCard key={m.id} match={m} />
          ))}
        </div>
      )}

      {/* نتائج التوقعات */}
      <div className="pt-5">
        <SectionTitle>نتائج توقعاتك</SectionTitle>
        {scored.length === 0 ? (
          <div className="card px-4 py-6 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
            لم تُحتسب أي توقعات بعد — تُحسب النقاط بعد اعتماد نتائج المباريات.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {scored.map((m) => (
              <ScoredCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /** بطاقة توقع مباراة قادمة: اليوم + الفترة + الملعب دائمًا، وعدّادان للنتيجة */
  function PredictCard({ match }: { match: Match }) {
    const h = resolveSide(match.home);
    const a = resolveSide(match.away);
    const pred = state.predictions[match.id];
    const home = pred?.home ?? 0;
    const away = pred?.away ?? 0;

    return (
      <div className="card p-3">
        {/* اليوم + الفترة + الملعب — تظهر دائمًا */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
          <span>{formatNight(match.matchDay)}</span>
          <span>·</span>
          <span className="num">{formatSlot(match.slot)}</span>
          <VenueChip venue={match.venue} />
          {pred ? (
            <span className="ms-auto text-[11px] font-bold" style={{ color: "var(--green-text)" }}>
              محفوظ ✓
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <SideRow
            code={h.team!.code}
            name={h.team!.name}
            value={home}
            onChange={(v) => setPrediction(match.id, { home: v, away })}
          />
          <div className="h-px" style={{ background: "var(--border-softer)" }} />
          <SideRow
            code={a.team!.code}
            name={a.team!.name}
            value={away}
            onChange={(v) => setPrediction(match.id, { home, away: v })}
          />
        </div>
      </div>
    );
  }

  /** صف فريق: درع + اسم + عدّاد (− / رقم / +) بأهداف لمس ≥ 44px */
  function SideRow({
    code,
    name,
    value,
    onChange,
  }: {
    code: string;
    name: string;
    value: number;
    onChange: (v: number) => void;
  }) {
    return (
      <div className="flex items-center gap-2">
        <Shield code={code} size={26} gold={false} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">{name}</span>
        <div className="flex items-center gap-1">
          <StepBtn label="−" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} />
          <span
            className="num w-11 text-center font-display text-[22px] font-bold"
            style={{ color: "var(--gold)" }}
          >
            {value}
          </span>
          <StepBtn label="+" disabled={value >= 9} onClick={() => onChange(Math.min(9, value + 1))} />
        </div>
      </div>
    );
  }

  function StepBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label === "+" ? "زيادة" : "إنقاص"}
        className="num flex h-11 w-11 items-center justify-center rounded-[12px] font-display text-[20px] font-bold"
        style={{
          background: "rgba(255,255,255,.06)",
          border: "1px solid var(--border-soft)",
          color: disabled ? "var(--text-3)" : "var(--text-1)",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {label}
      </button>
    );
  }

  /** بطاقة نتيجة توقع لمباراة معتمدة: الفعلي مقابل المتوقع + النقاط */
  function ScoredCard({ match }: { match: Match }) {
    const h = resolveSide(match.home);
    const a = resolveSide(match.away);
    const actual = scoreOf(match.id);
    const pred = state.predictions[match.id];
    const pts = predictionPoints(pred, actual);
    const ptsColor = pts === 3 ? "var(--gold)" : pts === 1 ? "var(--green-text)" : "var(--text-3)";
    const ptsLabel = pts === 3 ? "نتيجة مضبوطة" : pts === 1 ? "اتجاه صحيح" : "لم يصب";

    return (
      <div className="card p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--text-3)" }}>
          <span>{formatNight(match.matchDay)}</span>
          <span>·</span>
          <span className="num">{formatSlot(match.slot)}</span>
          <VenueChip venue={match.venue} />
          <span
            className="pill ms-auto px-2 py-0.5 text-[11px] font-bold"
            style={{
              color: ptsColor,
              background: pts > 0 ? "rgba(224,178,74,.08)" : "rgba(255,255,255,.04)",
              border: `1px solid ${pts > 0 ? "rgba(224,178,74,.3)" : "var(--border-soft)"}`,
            }}
          >
            {ptsLabel} · <span className="num">+{pts}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
          <Shield code={h.team?.code ?? match.home} size={22} gold={false} />
          <span className="min-w-0 flex-1 truncate">{h.team?.name ?? h.label}</span>
          <span className="num font-display text-[17px] font-bold" style={{ color: "var(--gold)" }}>
            {/* away-home: المضيف يمين في RTL */}
            {actual.away} - {actual.home}
          </span>
          <span className="min-w-0 flex-1 truncate text-end">{a.team?.name ?? a.label}</span>
          <Shield code={a.team?.code ?? match.away} size={22} gold={false} />
        </div>

        <div className="mt-1.5 text-center text-[11.5px]" style={{ color: "var(--text-3)" }}>
          توقعك: <span className="num font-display font-bold" style={{ color: "var(--text-2)" }}>{pred.away} - {pred.home}</span>
        </div>
      </div>
    );
  }
}
