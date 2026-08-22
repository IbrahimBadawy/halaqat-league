"use client";

// معالج إنشاء دوري جديد (أدمن) — المواصفة §4.2 بنسخة عملية من صفحة واحدة:
// الأساسيات ← الفرق والمجموعات ← الأيام والفترات والملاعب ← القواعد ←
// توليد الجدول تلقائيًا (طريقة الدائرة) مع فحص التعارضات ← الإنشاء.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLeague } from "@/lib/league/store";
import { generateFixtures, type GeneratedFixture } from "@/lib/scheduling/generate";
import { checkScheduleConflicts, structuralSideTokens } from "@/lib/scheduling/conflicts";
import { formatSlot } from "@/lib/league/seed";
import type { Match, VenueDef } from "@/lib/league/types";

const BORDER = "1px solid #E3E7F2";
const GROUP_LETTERS = ["A", "B", "C", "D"];

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export default function NewLeaguePage() {
  const store = useLeague();
  const { hydrated, state, adminCreateLeague, setActiveLeague } = store;
  const router = useRouter();

  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [slogan, setSlogan] = useState("");
  const [groupCount, setGroupCount] = useState(2);
  const [teamsText, setTeamsText] = useState<string[]>(["", "", "", ""]);
  const [daysText, setDaysText] = useState("");
  const [slotsText, setSlotsText] = useState("23:00\n23:20\n23:40\n00:00\n00:20\n00:40");
  const [venuesText, setVenuesText] = useState("ملعب 1");
  const [halfMinutes, setHalfMinutes] = useState(8);
  const [slotMinutes, setSlotMinutes] = useState(20);
  const [qualify, setQualify] = useState(2);
  const [yellowLimit, setYellowLimit] = useState(2);
  const [redMatches, setRedMatches] = useState(1);
  const [knockout, setKnockout] = useState(true);
  const [powerCards, setPowerCards] = useState(true);
  const [fixtures, setFixtures] = useState<GeneratedFixture[] | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      GROUP_LETTERS.slice(0, groupCount).map((letter, i) => ({
        name: letter,
        teams: parseLines(teamsText[i] ?? ""),
      })),
    [groupCount, teamsText],
  );
  const days = useMemo(() => parseLines(daysText), [daysText]);
  const slots = useMemo(() => parseLines(slotsText), [slotsText]);
  const venuesList = useMemo(() => parseLines(venuesText), [venuesText]);
  const teamCount = groups.reduce((s, g) => s + g.teams.length, 0);
  const knockoutPossible = groupCount === 2;

  if (!hydrated) return null;
  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">إنشاء دوري — يحتاج حساب «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          سجّل دخولك من صفحة «أنا»
        </Link>
      </div>
    );

  function generate() {
    setCreateMsg(null);
    if (!name.trim()) return setGenMsg("اكتب اسم الدوري أولًا");
    if (teamCount < 2) return setGenMsg("أضف الفرق (سطر لكل فريق داخل كل مجموعة)");
    if (groups.some((g) => g.teams.length < 2)) return setGenMsg("كل مجموعة تحتاج فريقين على الأقل");
    if (days.length === 0) return setGenMsg("أضف أيام اللعب (سطر لكل يوم بصيغة 2026-10-02)");
    if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return setGenMsg("صيغة اليوم: YYYY-MM-DD");
    if (slots.length === 0) return setGenMsg("أضف الفترات (سطر لكل فترة بصيغة 23:00)");
    if (slots.some((s) => !/^\d{2}:\d{2}$/.test(s))) return setGenMsg("صيغة الفترة: HH:MM");
    if (venuesList.length === 0) return setGenMsg("أضف ملعبًا واحدًا على الأقل");
    const useKnockout = knockout && knockoutPossible;
    if (useKnockout && days.length < 2) return setGenMsg("الإقصائيات تحتاج يومًا أخيرًا مستقلًا — أضف يومًا آخر");
    if (useKnockout && slots.length < (venuesList.length >= 2 ? 4 : 5))
      return setGenMsg("ليلة الإقصائيات تحتاج فترات أكثر (4 مع ملعبين، 5 مع ملعب واحد)");

    const result = generateFixtures({
      groups: groups.map((g) => ({
        name: g.name,
        teamCodes: g.teams.map((_, i) => `${g.name}${i + 1}`),
      })),
      matchDays: days,
      slots,
      venues: venuesList,
      knockout: useKnockout,
    });
    if (result.unscheduled > 0) {
      setFixtures(null);
      setGenMsg(
        `السعة لا تكفي: ${result.unscheduled} مباراة بلا موعد — زد الأيام أو الفترات أو الملاعب`,
      );
      return;
    }
    if (result.fixtures.length > 64) {
      setFixtures(null);
      setGenMsg(`الجدول ${result.fixtures.length} مباراة — الحد الحالي 64. قلّل الفرق أو المجموعات`);
      return;
    }
    // فحص التعارضات بنفس محرك التطبيق
    const venueDefs: VenueDef[] = venuesList.map((v) => ({ name: v, availability: "all_slots" }));
    const asMatches: Match[] = result.fixtures.map((f, i) => ({
      id: `m${i + 1}`,
      matchDay: f.day,
      slot: f.slot,
      venue: f.venue,
      stage: f.stage,
      round: days.indexOf(f.day) + 1,
      home: f.home,
      away: f.away,
    }));
    const conflicts = checkScheduleConflicts(asMatches, venueDefs, slots, structuralSideTokens(asMatches));
    setFixtures(result.fixtures);
    setGenMsg(
      conflicts.length === 0
        ? `تولّد جدول من ${result.fixtures.length} مباراة بلا أي تعارض ✓`
        : `تولّد الجدول لكن به ${conflicts.length} تعارضًا — راجع الأيام/الفترات`,
    );
  }

  async function create() {
    if (!fixtures) return;
    setBusy(true);
    setCreateMsg(null);
    const res = await adminCreateLeague({
      name: name.trim(),
      season: season.trim(),
      slogan: slogan.trim(),
      groups,
      match_days: days,
      slots,
      venues: venuesList,
      rules: {
        half_minutes: halfMinutes,
        slot_minutes: slotMinutes,
        qualify_per_group: qualify,
        yellow_cards_for_suspension: yellowLimit,
        red_card_suspension_matches: redMatches,
        final_duration_override_minutes: 30,
      },
      knockout: knockout && knockoutPossible,
      power_cards: powerCards,
      fixtures,
    });
    setBusy(false);
    if (res.error) {
      setCreateMsg(res.error);
      return;
    }
    if (res.leagueId) setActiveLeague(res.leagueId);
    router.push("/admin");
  }

  const inputCls = "mt-1 block h-11 w-full rounded-[10px] px-3 text-[13.5px]";
  const inputStyle = { border: BORDER, background: "#fff" } as const;

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[900px] px-5 py-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="font-display text-[24px] font-bold">إنشاء دوري جديد</h1>
            <p className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              حدّد الفرق والأيام والفترات والملاعب والقواعد — والجدول يتولّد تلقائيًا
            </p>
          </div>
          <Link href="/admin" className="ms-auto rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white" style={{ background: "#0B1230" }}>
            → لوحة الأدمن
          </Link>
        </div>

        {/* 1. الأساسيات */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-3 font-display text-[16px] font-bold">1 · الأساسيات</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-[12.5px] font-bold">
              اسم الدوري *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="دوري الحلقات — شتاء 2026" className={inputCls} style={inputStyle} />
            </label>
            <label className="text-[12.5px] font-bold">
              الموسم
              <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="شتاء 2026" className={inputCls} style={inputStyle} />
            </label>
            <label className="text-[12.5px] font-bold">
              الشعار
              <input value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="التحدي يبدأ من جديد" className={inputCls} style={inputStyle} />
            </label>
          </div>
        </section>

        {/* 2. الفرق والمجموعات */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[16px] font-bold">2 · الفرق والمجموعات</h2>
            <span className="ms-auto flex items-center gap-2 text-[12.5px] font-bold">
              عدد المجموعات
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setGroupCount(n)}
                  className="num h-9 w-9 rounded-[9px] text-[13px] font-bold"
                  style={groupCount === n ? { background: "#0B1230", color: "#fff" } : { background: "#F7F9FE", border: BORDER }}
                >
                  {n}
                </button>
              ))}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {GROUP_LETTERS.slice(0, groupCount).map((letter, i) => (
              <label key={letter} className="text-[12.5px] font-bold">
                المجموعة {letter} — اسم فريق في كل سطر ({groups[i]?.teams.length ?? 0})
                <textarea
                  value={teamsText[i] ?? ""}
                  onChange={(e) =>
                    setTeamsText((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))
                  }
                  rows={5}
                  placeholder={"الصقور\nالنسور\nالأبطال"}
                  className="mt-1 block w-full rounded-[10px] p-3 text-[13.5px] leading-relaxed"
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            الأكواد تتولّد تلقائيًا: {GROUP_LETTERS.slice(0, groupCount).map((l) => `${l}1..`).join(" · ")} — الإجمالي حاليًا{" "}
            <span className="num font-bold">{teamCount}</span> فريقًا
          </p>
        </section>

        {/* 3. الأيام والفترات والملاعب */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-3 font-display text-[16px] font-bold">3 · الأيام والفترات والملاعب</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-[12.5px] font-bold">
              أيام اللعب — يوم في كل سطر (YYYY-MM-DD)
              <textarea value={daysText} onChange={(e) => setDaysText(e.target.value)} rows={5}
                placeholder={"2026-10-02\n2026-10-09\n2026-10-16"} className="mt-1 block w-full rounded-[10px] p-3 text-[13.5px]" style={inputStyle} dir="ltr" />
            </label>
            <label className="text-[12.5px] font-bold">
              الفترات — فترة في كل سطر (HH:MM)
              <textarea value={slotsText} onChange={(e) => setSlotsText(e.target.value)} rows={5}
                className="mt-1 block w-full rounded-[10px] p-3 text-[13.5px]" style={inputStyle} dir="ltr" />
            </label>
            <label className="text-[12.5px] font-bold">
              الملاعب — ملعب في كل سطر
              <textarea value={venuesText} onChange={(e) => setVenuesText(e.target.value)} rows={5}
                className="mt-1 block w-full rounded-[10px] p-3 text-[13.5px]" style={inputStyle} />
            </label>
          </div>
        </section>

        {/* 4. القواعد */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <h2 className="mb-3 font-display text-[16px] font-bold">4 · القواعد</h2>
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ["دقائق الشوط", halfMinutes, setHalfMinutes, 1, 45],
                ["دقائق الفترة", slotMinutes, setSlotMinutes, 10, 120],
                ["يتأهل من كل مجموعة", qualify, setQualify, 1, 4],
                ["إنذارات الإيقاف", yellowLimit, setYellowLimit, 1, 5],
                ["مباريات إيقاف الطرد", redMatches, setRedMatches, 1, 3],
              ] as const
            ).map(([label, value, setter, min, max]) => (
              <label key={label} className="text-[12.5px] font-bold">
                {label}
                <input
                  type="number"
                  value={value}
                  min={min}
                  max={max}
                  onChange={(e) => setter(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
                  className="num mt-1 block h-11 w-[110px] rounded-[10px] px-3 text-[13.5px]"
                  style={inputStyle}
                />
              </label>
            ))}
            <button
              onClick={() => setKnockout((v) => !v)}
              disabled={!knockoutPossible}
              className="h-11 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"
              style={knockout && knockoutPossible ? { background: "#0B1230", color: "#fff" } : { background: "#F7F9FE", border: BORDER }}
              title={knockoutPossible ? "" : "الإقصائيات التلقائية متاحة لمجموعتين فقط حاليًا"}
            >
              🏆 إقصائيات في آخر يوم {knockout && knockoutPossible ? "✓" : ""}
            </button>
            <button
              onClick={() => setPowerCards((v) => !v)}
              className="h-11 rounded-[10px] px-4 text-[13px] font-bold"
              style={powerCards ? { background: "#0B1230", color: "#fff" } : { background: "#F7F9FE", border: BORDER }}
            >
              ⚡ كروت القوة {powerCards ? "✓" : ""}
            </button>
          </div>
        </section>

        {/* 5. التوليد والمعاينة */}
        <section className="mb-4 rounded-[16px] bg-white p-4" style={{ border: BORDER }}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[16px] font-bold">5 · الجدول</h2>
            <button onClick={generate} className="ms-auto rounded-[12px] px-5 py-2.5 text-[13.5px] font-bold text-white" style={{ background: "#175CD3" }}>
              ⚙️ توليد الجدول تلقائيًا
            </button>
          </div>
          {genMsg ? (
            <p className="mb-3 rounded-[10px] px-3 py-2 text-[13px] font-bold" style={
              genMsg.includes("✓")
                ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
                : { background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }
            }>
              {genMsg}
            </p>
          ) : null}
          {fixtures ? (
            <div className="max-h-[300px] overflow-y-auto rounded-[10px]" style={{ border: BORDER }}>
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-[11.5px] font-bold" style={{ background: "#F7F9FE", color: "var(--text-2)" }}>
                    <th className="px-3 py-1.5 text-start">اليوم</th>
                    <th className="px-2 py-1.5 text-start">الفترة</th>
                    <th className="px-2 py-1.5 text-start">الملعب</th>
                    <th className="px-2 py-1.5 text-start">المباراة</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((f, i) => (
                    <tr key={i} style={{ borderTop: BORDER }}>
                      <td className="num px-3 py-1.5">{f.day.slice(5)}</td>
                      <td className="num px-2 py-1.5">{formatSlot(f.slot)}</td>
                      <td className="px-2 py-1.5">{f.venue}</td>
                      <td className="px-2 py-1.5 font-bold">
                        {f.home} × {f.away}
                        {f.stage !== "group" ? <span style={{ color: "#175CD3" }}> · {f.stage}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        {/* الإنشاء */}
        <div className="flex flex-wrap items-center gap-3 pb-8">
          <button
            disabled={!fixtures || busy}
            onClick={() => void create()}
            className="rounded-[12px] px-6 py-3 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: "#067647" }}
          >
            {busy ? "جارٍ الإنشاء…" : "🏆 إنشاء الدوري والانتقال إليه"}
          </button>
          {createMsg ? (
            <span className="text-[13px] font-bold" style={{ color: "#B42318" }}>{createMsg}</span>
          ) : null}
          <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
            يُنشأ الدوري بفرقه ولاعبيه الوهميين (7 لكل فريق) وأكواد الانضمام وجدوله كاملًا.
          </span>
        </div>
      </div>
    </div>
  );
}
