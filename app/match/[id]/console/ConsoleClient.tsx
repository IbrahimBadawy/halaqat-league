"use client";

// شاشة التسجيل المباشر — أهم شاشة في المنصة (المواصفة §4.7، التصميم 1d–1h).
// 3 مناطق: النتيجة والساعة / لوحتا اللاعبين / شريط الأحداث.
// تسجيل أي حدث بضغطتين: حدث ← لاعب. تراجع 5 ثوانٍ. إنذار ثانٍ = طرد تلقائي.

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Shield from "@/components/ui/Shield";
import { useLeague } from "@/lib/league/store";
import type { EventType, MatchEvent, Player } from "@/lib/league/types";

const PRIMARY_EVENTS: { type: EventType; icon: string; label: string }[] = [
  { type: "goal", icon: "⚽", label: "هدف" },
  { type: "yellow", icon: "🟨", label: "إنذار" },
  { type: "red", icon: "🟥", label: "طرد" },
  { type: "sub", icon: "🔁", label: "تبديل" },
];

const MORE_EVENTS: { type: EventType; icon: string; label: string }[] = [
  { type: "shot", icon: "🎯", label: "تسديدة" },
  { type: "foul", icon: "⚠️", label: "خطأ" },
  { type: "save", icon: "🧤", label: "تصدٍّ" },
  { type: "corner", icon: "🚩", label: "ركنية" },
  { type: "injury", icon: "⚕️", label: "إصابة" },
  { type: "power_card", icon: "✨", label: "كارت" },
  { type: "comment", icon: "💬", label: "تعليق" },
];

const COMMENT_TEMPLATES = ["فرصة خطيرة!", "تصدٍّ رائع", "ضغط هجومي", "استحواذ طويل"];
const DELETE_REASONS = ["تسجيل بالخطأ", "حدث مكرر", "قرار الحكم", "تصحيح لاعب"];

type PendingAction =
  | { kind: "event"; type: EventType }
  | { kind: "sub_out"; outPlayer?: Player }
  | null;

export default function ConsolePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const store = useLeague();
  const {
    seed,
    hydrated,
    state,
    statusOf,
    scoreOf,
    clockOf,
    eventsOf,
    resolveSide,
    onFieldPlayers,
    benchPlayers,
  } = store;

  const match = store.matchOf(params.id);
  const [pending, setPending] = useState<PendingAction>(null);
  const [subOut, setSubOut] = useState<Player | null>(null);
  /** لاعب اختير للطرد — تُفتح له ورقة اختيار مدة العقوبة قبل التسجيل */
  const [redFor, setRedFor] = useState<Player | null>(null);
  const [undoEvent, setUndoEvent] = useState<MatchEvent | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showPrep, setShowPrep] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const status = match ? statusOf(match.id) : "scheduled";
  const clock = match ? clockOf(match.id) : null;

  const events = useMemo(
    () => (match ? [...eventsOf(match.id)].reverse() : []),
    [match, eventsOf],
  );

  if (!hydrated) return null;
  if (!match)
    return <CenterMsg text="المباراة غير موجودة" />;

  const home = resolveSide(match.home);
  const away = resolveSide(match.away);

  if (state.role === "visitor")
    return (
      <CenterMsg
        text="شاشة التسجيل للمسجّل المُسنَد فقط"
        action={
          <Link href="/me" className="btn-gold mt-3 inline-flex h-11 items-center px-5 text-[14px]">
            بدّل الدور من صفحة «أنا»
          </Link>
        }
      />
    );

  if (!home.team || !away.team)
    return <CenterMsg text="أطراف هذه المباراة لم تتحدد بعد — تُحل تلقائيًا بعد اعتماد نتائج الدور السابق" />;

  if (store.leagueLocked)
    return (
      <CenterMsg
        text="هذا الدوري مقفول (مؤرشف) — النتائج للعرض فقط ولا تسجيل جديدًا"
        action={
          <Link href={`/match/${match.id}`} className="btn-gold mt-3 inline-flex h-11 items-center px-5 text-[14px]">
            صفحة المباراة
          </Link>
        }
      />
    );

  if (status === "approved")
    return (
      <CenterMsg
        text="المباراة معتمدة ومقفولة ✓"
        action={
          <Link href={`/match/${match.id}`} className="btn-gold mt-3 inline-flex h-11 items-center px-5 text-[14px]">
            صفحة المباراة
          </Link>
        }
      />
    );

  const homeCode = home.team.code;
  const awayCode = away.team.code;
  const score = scoreOf(match.id);
  const activeCard = state.activeCards[match.id];
  const suspendedHere = store.suspensions.filter((s) => s.forMatchId === match.id);

  // زمن الفترة الحالي
  const running = clock!.running && clock!.runningSince;
  const extraSec = running ? Math.floor((clockNow - clock!.runningSince!) / 1000) : 0;
  const periodSec = clock!.periodSeconds + extraSec;
  const totalSec = clock!.totalSeconds + extraSec;
  const minute = Math.min(99, Math.floor(totalSec / 60) + 1);
  // عدد الأشواط قد يُخصَّص لكل مباراة (شوط واحد أو شوطان)، والمدة الكلية كذلك
  const halves = match.halvesOverride ?? seed.rules.halves;
  const halfLen = (match.durationOverrideMinutes ?? seed.rules.half_minutes * seed.rules.halves) / halves;

  const periodLabel =
    clock!.period === "first"
      ? halves === 1
        ? "الشوط الوحيد"
        : "الشوط الأول"
      : clock!.period === "break"
        ? "استراحة"
        : clock!.period === "second"
          ? "الشوط الثاني"
          : clock!.period === "extra"
            ? "وقت إضافي"
            : "انتهت";

  // العقوبات المؤقتة الجارية الآن (طرد دقائق لم تنقضِ مدته)
  const servingPenalties = state.events.filter(
    (e) =>
      e.matchId === match.id &&
      e.type === "red" &&
      !e.deleted &&
      e.penaltyScope === "minutes" &&
      (e.penaltyUntilSec ?? 0) > totalSec,
  );

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  function pushUndo(e: MatchEvent) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoEvent(e);
    undoTimer.current = setTimeout(() => setUndoEvent(null), 5000);
  }

  function onEventButton(type: EventType) {
    if (status !== "live" && status !== "half_time") return;
    if (type === "comment") {
      setPending({ kind: "event", type });
      return;
    }
    if (type === "power_card") {
      setShowCards(true);
      return;
    }
    if (type === "sub") {
      setPending({ kind: "sub_out" });
      return;
    }
    setPending({ kind: "event", type });
  }

  function onPlayerTap(player: Player, isBench: boolean) {
    if (!pending || !match) return;
    if (pending.kind === "sub_out") {
      if (isBench) return;
      setSubOut(player);
      return;
    }
    if (pending.kind === "event") {
      // الطرد يحتاج خطوة ثالثة: اختيار مدة العقوبة (دقائق/المباراة/الدوري)
      if (pending.type === "red") {
        setRedFor(player);
        setPending(null);
        return;
      }
      const e = store.recordEvent(match.id, {
        matchId: match.id,
        teamCode: player.teamCode,
        playerId: player.id,
        type: pending.type,
      });
      pushUndo(e);
      setPending(null);
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }

  function recordRed(player: Player, scope: "minutes" | "match" | "league", minutes?: number) {
    const e = store.recordEvent(match!.id, {
      matchId: match!.id,
      teamCode: player.teamCode,
      playerId: player.id,
      type: "red",
      penaltyScope: scope,
      ...(scope === "minutes" ? { penaltyMinutes: minutes } : {}),
    });
    pushUndo(e);
    setRedFor(null);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function onBenchTapForSub(player: Player) {
    if (!subOut || !match) return;
    if (store.isSuspended(player.id, match.id)) return; // الموقوف لا يدخل بديلًا
    const e = store.recordEvent(match.id, {
      matchId: match.id,
      teamCode: subOut.teamCode,
      playerId: subOut.id,
      secondaryPlayerId: player.id,
      type: "sub",
    });
    pushUndo(e);
    setSubOut(null);
    setPending(null);
  }

  function teamEvent(teamCode: string) {
    if (!pending || pending.kind !== "event" || !match) return;
    const e = store.recordEvent(match.id, {
      matchId: match.id,
      teamCode,
      type: pending.type,
    });
    pushUndo(e);
    setPending(null);
  }

  const selectingPlayer =
    (pending?.kind === "event" && pending.type !== "comment") ||
    pending?.kind === "sub_out" ||
    subOut !== null;

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col" style={{ background: "var(--bg-base)" }}>
      {/* الشريط العلوي */}
      <div className="flex flex-none items-center gap-2 px-4 pb-1.5 pt-3">
        <button
          onClick={() => router.push(`/match/${match.id}`)}
          className="flex h-10 w-10 items-center justify-center rounded-[12px]"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
          aria-label="خروج"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2.5" strokeLinecap="round">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
        <span className="flex-1 text-center text-[13.5px] font-medium" style={{ color: "var(--text-3)" }}>
          الليلة {match.round} · {match.venue} · تسجيل
        </span>
        {/* حالة المزامنة الحقيقية — الأحداث تُسجَّل حتى بلا شبكة وتُرسل عند عودتها */}
        <span
          className="pill inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-semibold"
          style={
            store.droppedWrites > 0
              ? { color: "var(--live)", background: "rgba(229,72,77,.14)" }
              : store.pendingWrites > 0
                ? { color: "var(--warn)", background: "rgba(244,196,48,.14)" }
                : { color: "var(--green-text)", background: "rgba(30,127,58,.14)" }
          }
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background:
                store.droppedWrites > 0
                  ? "var(--live)"
                  : store.pendingWrites > 0
                    ? "var(--warn)"
                    : "var(--green-text)",
            }}
          />
          {store.droppedWrites > 0 ? (
            <>
              ⚠️ فشل <span className="num">{store.droppedWrites}</span>
            </>
          ) : store.pendingWrites > 0 ? (
            <>
              بانتظار الشبكة <span className="num">{store.pendingWrites}</span>
            </>
          ) : (
            "متصل"
          )}
        </span>
      </div>

      {/* النتيجة */}
      <div className="flex flex-none items-center gap-1.5 px-4">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <Shield code={homeCode} size={30} gold={false} />
          <span className="truncate text-[15px] font-semibold text-white">{home.team.name}</span>
        </span>
        {/* المضيف على اليمين والضيف على الشمال (RTL)، والنتيجة .num تُعرض LTR —
            فنكتب الضيف ثم المضيف حتى يقع رقم كل فريق تحت اسمه ورُوستره */}
        <span className="num flex-none font-display text-[42px] font-bold leading-none" style={{ color: "var(--gold)" }}>
          {score.away} – {score.home}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <span className="truncate text-[15px] font-semibold text-white">{away.team.name}</span>
          <Shield code={awayCode} size={30} gold={false} />
        </span>
      </div>

      {/* عدّاد الطرد المؤقت — اللاعب يعود تلقائيًا عند انقضاء مدته */}
      {servingPenalties.length > 0 ? (
        <div
          className="mx-4 mt-1.5 flex flex-none flex-wrap items-center gap-2 rounded-[12px] px-3 py-2 text-[12.5px] font-bold"
          style={{ background: "rgba(229,72,77,.13)", color: "var(--live)", border: "1px solid rgba(229,72,77,.4)" }}
        >
          🟥
          {servingPenalties.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              {seed.players.find((p) => p.id === e.playerId)?.name}
              <span className="num pill px-2 py-0.5" style={{ background: "rgba(229,72,77,.2)" }}>
                {fmt(Math.max(0, Math.round((e.penaltyUntilSec ?? 0) - totalSec)))}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {/* تنبيه الموقوفين */}
      {suspendedHere.length > 0 && status === "scheduled" ? (
        <div
          className="mx-4 mt-1.5 flex flex-none items-center gap-2 rounded-[12px] px-3 py-2 text-[12.5px] font-bold"
          style={{ background: "rgba(229,72,77,.13)", color: "var(--live)", border: "1px solid rgba(229,72,77,.4)" }}
        >
          🚫 موقوفون عن هذه المباراة:{" "}
          {suspendedHere
            .map((s) => `${seed.players.find((p) => p.id === s.playerId)?.name} (${s.teamCode} — ${s.reason})`)
            .join("، ")}
        </div>
      ) : null}

      {/* بانر كارت القوة النشط */}
      {activeCard ? (
        <div className="power-banner mx-4 mt-2 flex flex-none items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-bold">
          ✨ {activeCard.cardName} مفعّل — {store.teamByCode(activeCard.teamCode)?.name}
          {activeCard.effect === "goal_multiplier" ? " · الهدف القادم ×2" : ""}
          <button onClick={() => store.clearPowerCard(match.id)} className="ms-auto rounded-lg bg-white/20 px-2 py-0.5 text-[12px]">
            إلغاء
          </button>
        </div>
      ) : null}

      {/* الساعة */}
      <div className="card mx-4 my-2 flex flex-none items-center gap-3 px-3.5 py-2.5">
        <button
          onClick={() => (status === "scheduled" ? store.startMatch(match.id) : store.advancePeriod(match.id))}
          className="pill flex-none px-3 py-1.5 text-[13.5px] font-semibold"
          style={{
            color: "var(--gold-light)",
            background: "rgba(224,178,74,.12)",
            border: "1px solid rgba(224,178,74,.4)",
          }}
        >
          {status === "scheduled"
            ? "بدء المباراة"
            : clock!.period === "first"
              ? halves === 1
                ? "وقت إضافي"
                : "إنهاء الشوط"
              : clock!.period === "break"
                ? "بدء الشوط الثاني"
                : "وقت إضافي"}
        </button>
        <span className="flex-1 text-center">
          <span className="num block font-display text-[32px] font-bold leading-none text-white">
            {status === "scheduled" ? "00:00" : fmt(periodSec)}
          </span>
          <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--text-3)" }}>
            {status === "scheduled" ? (
              "لم تبدأ"
            ) : (
              <>
                {periodLabel} · د <span className="num">{minute}</span> · الشوط{" "}
                <span className="num">{fmt(Math.round(halfLen * 60))}</span>
              </>
            )}
          </span>
        </span>
        <button
          onClick={() => status !== "scheduled" && store.toggleClock(match.id)}
          className="flex h-[52px] w-[52px] flex-none items-center justify-center gap-1 rounded-[16px]"
          style={{ background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))" }}
          aria-label={clock!.running ? "إيقاف" : "تشغيل"}
        >
          {clock!.running ? (
            <>
              <span className="h-[18px] w-[5px] rounded-[2px]" style={{ background: "var(--ink)" }} />
              <span className="h-[18px] w-[5px] rounded-[2px]" style={{ background: "var(--ink)" }} />
            </>
          ) : (
            <span
              className="ms-1 h-0 w-0"
              style={{
                borderTop: "10px solid transparent",
                borderBottom: "10px solid transparent",
                borderInlineStart: "16px solid var(--ink)",
              }}
            />
          )}
        </button>
      </div>

      {/* إرشاد الاختيار */}
      {selectingPlayer ? (
        <div
          className="mx-4 mb-1.5 flex flex-none items-center rounded-[10px] px-3 py-1.5 text-[13px] font-bold"
          style={{ background: "rgba(224,178,74,.15)", color: "var(--gold-light)", border: "1px solid rgba(224,178,74,.4)" }}
        >
          {subOut
            ? `اختر البديل الداخل مكان ${subOut.name}`
            : pending?.kind === "sub_out"
              ? "تبديل: اختر اللاعب الخارج"
              : `اختر اللاعب — ${PRIMARY_EVENTS.concat(MORE_EVENTS).find((e) => pending?.kind === "event" && e.type === pending.type)?.label ?? ""}`}
          <button
            onClick={() => {
              setPending(null);
              setSubOut(null);
            }}
            className="ms-auto rounded-lg px-2 py-0.5 text-[12px]"
            style={{ background: "rgba(255,255,255,.1)", color: "var(--text-2)" }}
          >
            إلغاء
          </button>
        </div>
      ) : null}

      {/* لوحتا اللاعبين */}
      <div className="flex min-h-0 flex-1 gap-2 overflow-hidden px-3">
        {[homeCode, awayCode].map((code) => {
          const field = onFieldPlayers(match.id, code);
          const bench = benchPlayers(match.id, code);
          return (
            <div key={code} className="no-scrollbar flex min-w-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-2">
              {field.map((p) => (
                <PlayerChip key={p.id} p={p} onTap={() => (subOut ? undefined : onPlayerTap(p, false))} highlight={selectingPlayer && !subOut} matchId={match.id} />
              ))}
              <div className="px-1 text-[12.5px]" style={{ color: "var(--text-3)" }}>
                البدلاء
              </div>
              {bench.map((p) => (
                <BenchChip
                  key={p.id}
                  p={p}
                  matchId={match.id}
                  isSubTarget={!!(subOut && subOut.teamCode === code)}
                  onSub={() => onBenchTapForSub(p)}
                />
              ))}
              {/* حدث على الفريق كله */}
              {pending?.kind === "event" && pending.type !== "comment" ? (
                <button
                  onClick={() => teamEvent(code)}
                  className="pill mt-1 flex-none py-1.5 text-[12.5px] font-semibold"
                  style={{ border: "1px solid var(--border-soft)", color: "var(--text-3)" }}
                >
                  على الفريق دون لاعب
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* شريط الأحداث */}
      <div className="flex-none px-3 pb-1 pt-2">
        <div className="mb-2 flex gap-2">
          {PRIMARY_EVENTS.map((e) => {
            const active = pending?.kind === "event" && pending.type === e.type;
            const isSubPending = e.type === "sub" && (pending?.kind === "sub_out" || subOut);
            return (
              <button
                key={e.type}
                onClick={() => onEventButton(e.type)}
                className="flex h-[62px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px]"
                style={
                  active || isSubPending
                    ? { background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))" }
                    : e.type === "goal"
                      ? { background: "rgba(224,178,74,.13)", border: "1.5px solid rgba(224,178,74,.5)" }
                      : { background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }
                }
              >
                <span className="text-[20px] leading-none">{e.icon}</span>
                <span className="text-[13.5px] font-bold" style={{ color: active || isSubPending ? "var(--ink)" : e.type === "goal" ? "var(--gold-light)" : "var(--text-1)" }}>
                  {e.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {MORE_EVENTS.map((e) => (
            <button
              key={e.type}
              onClick={() => onEventButton(e.type)}
              className="flex h-[52px] w-[62px] flex-none flex-col items-center justify-center gap-0.5 rounded-[12px]"
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--border-soft)" }}
            >
              <span className="text-[16px] leading-none">{e.icon}</span>
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
                {e.label}
              </span>
            </button>
          ))}
          <button
            onClick={() => setShowTimeline(true)}
            className="flex h-[52px] w-[62px] flex-none flex-col items-center justify-center gap-0.5 rounded-[12px]"
            style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--border-soft)" }}
          >
            <span className="text-[16px] leading-none">📋</span>
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-2)" }}>
              الأحداث
            </span>
          </button>
        </div>
      </div>

      {/* إنهاء المباراة / تحضير التشكيلة */}
      <div className="flex-none px-3 pb-3 pt-1.5">
        {status === "finished" ? (
          <button onClick={() => setShowEnd(true)} className="btn-gold h-12 w-full text-[15px]">
            نجم المباراة والاعتماد
          </button>
        ) : status !== "scheduled" ? (
          <button
            onClick={() => setShowEnd(true)}
            className="h-11 w-full rounded-[13px] text-[14px] font-bold"
            style={{ background: "rgba(229,72,77,.14)", color: "var(--live)", border: "1px solid rgba(229,72,77,.4)" }}
          >
            إنهاء المباراة
          </button>
        ) : (
          <button
            onClick={() => setShowPrep(true)}
            className="h-11 w-full rounded-[13px] text-[14px] font-bold"
            style={{ background: "rgba(43,79,194,.2)", color: "#ADC2FF", border: "1px solid rgba(43,79,194,.5)" }}
          >
            📋 التشكيلة الأساسية (قبل البداية)
          </button>
        )}
      </div>

      {/* Toast تراجع 5 ثوان */}
      {undoEvent ? (
        <div className="pointer-events-none fixed bottom-24 start-1/2 z-50 w-[calc(100%-48px)] max-w-[380px] translate-x-1/2">
          <div className="card pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderColor: "rgba(224,178,74,.45)" }}>
            <span className="text-[14px] font-semibold text-white">
              سُجّل: {PRIMARY_EVENTS.concat(MORE_EVENTS).find((x) => x.type === undoEvent.type)?.label}
              {undoEvent.value > 1 ? " ×2 ⚡" : ""} · د <span className="num">{undoEvent.minute}</span>
            </span>
            <button
              onClick={() => {
                store.removeEvent(undoEvent.id);
                setUndoEvent(null);
              }}
              className="pill ms-auto px-3.5 py-1.5 text-[13.5px] font-bold"
              style={{ background: "rgba(224,178,74,.16)", color: "var(--gold-light)", border: "1px solid rgba(224,178,74,.4)" }}
            >
              تراجع
            </button>
          </div>
        </div>
      ) : null}

      {/* ورقة مدة الطرد: دقائق يعود بعدها اللاعب، أو باقي المباراة، أو طرد من
          الدوري كله (الوحيد الذي يمنع من التشكيلات القادمة) */}
      {redFor ? (
        <Sheet title={`🟥 طرد ${redFor.name} — حدد العقوبة`} onClose={() => setRedFor(null)}>
          <div className="flex flex-col gap-2">
            {(seed.rules.red_penalty_minutes_options ?? [2, 5]).map((min) => (
              <button
                key={min}
                onClick={() => recordRed(redFor, "minutes", min)}
                className="flex h-[52px] items-center justify-between rounded-[13px] px-4 text-[14.5px] font-bold text-white"
                style={{ background: "rgba(229,72,77,.14)", border: "1px solid rgba(229,72,77,.4)" }}
              >
                ⏱️ طرد <span className="num">{min}</span> دقائق
                <span className="text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                  يعود بعد انقضائها
                </span>
              </button>
            ))}
            <button
              onClick={() => recordRed(redFor, "match")}
              className="flex h-[52px] items-center justify-between rounded-[13px] px-4 text-[14.5px] font-bold text-white"
              style={{ background: "rgba(229,72,77,.2)", border: "1px solid rgba(229,72,77,.55)" }}
            >
              🟥 باقي المباراة
              <span className="text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
                لا يؤثر على المباريات القادمة
              </span>
            </button>
            <button
              onClick={() => recordRed(redFor, "league")}
              className="flex h-[52px] items-center justify-between rounded-[13px] px-4 text-[14.5px] font-bold"
              style={{ background: "rgba(229,72,77,.32)", border: "1.5px solid var(--live)", color: "#FFD9DB" }}
            >
              🚫 طرد من الدوري كله
              <span className="text-[12px] font-medium" style={{ color: "#FFB3B7" }}>
                يُمنع من كل التشكيلات القادمة
              </span>
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* ورقة التعليق السريع */}
      {pending?.kind === "event" && pending.type === "comment" ? (
        <Sheet title="تعليق سريع" onClose={() => setPending(null)}>
          <div className="flex flex-wrap gap-2">
            {COMMENT_TEMPLATES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  const e = store.recordEvent(match.id, {
                    matchId: match.id,
                    teamCode: homeCode,
                    type: "comment",
                    note: t,
                  });
                  pushUndo(e);
                  setPending(null);
                }}
                className="pill px-3.5 py-2 text-[13.5px] font-semibold"
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border-soft)", color: "var(--text-1)" }}
              >
                {t}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}

      {/* ورقة كروت القوة */}
      {showCards ? (
        <Sheet title="تفعيل كارت قوة" onClose={() => setShowCards(false)}>
          {[homeCode, awayCode].map((code) => (
            <div key={code} className="mb-3">
              <div className="mb-1.5 text-[13px] font-bold" style={{ color: "var(--text-2)" }}>
                {store.teamByCode(code)?.name}
              </div>
              <div className="flex flex-wrap gap-2">
                {seed.powerCards.map((c) => {
                  const used = state.usedCards.some((u) => u.teamCode === code && u.cardName === c.name);
                  return (
                    <button
                      key={c.name}
                      disabled={used}
                      onClick={() => {
                        store.requestPowerCard(match.id, code, c.name);
                        setShowCards(false);
                      }}
                      className="rounded-[12px] px-3 py-2 text-start text-[13px] font-semibold"
                      style={
                        used
                          ? { background: "rgba(255,255,255,.04)", color: "var(--text-3)", textDecoration: "line-through" }
                          : { background: "linear-gradient(135deg,rgba(255,138,31,.2),rgba(229,115,31,.08))", border: "1px solid rgba(255,138,31,.5)", color: "#FFB067" }
                      }
                    >
                      {c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
            الكارت يُستهلك مرة واحدة في الموسم — يُسجَّل الطلب في سجل التدقيق ويُطبَّق أثره تلقائيًا.
          </p>
        </Sheet>
      ) : null}

      {/* ورقة الخط الزمني — تعديل وحذف بسبب */}
      {showTimeline ? (
        <Sheet title="الخط الزمني" onClose={() => setShowTimeline(false)}>
          {events.length === 0 ? (
            <p className="py-4 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
              لا أحداث بعد
            </p>
          ) : (
            events.slice(0, 30).map((e) => <TimelineRow key={e.id} e={e} />)
          )}
        </Sheet>
      ) : null}

      {/* ورقة النهاية: ملخص ← نجم المباراة ← اعتماد PIN */}
      {showEnd ? (
        <EndSheet
          matchId={match.id}
          homeCode={homeCode}
          awayCode={awayCode}
          onClose={() => setShowEnd(false)}
        />
      ) : null}

      {/* ورقة تحضير التشكيلة */}
      {showPrep ? (
        <PrepSheet matchId={match.id} homeCode={homeCode} awayCode={awayCode} onClose={() => setShowPrep(false)} />
      ) : null}
    </div>
  );

}

// المكونات على مستوى الملف عمدًا: تعريفها داخل الصفحة كان يعيد إنشاء نوعها
// مع كل تحديث للساعة (كل 500ms) فتُعاد الشجرة بالكامل وتضيع حالة «حذف بسبب»

function PlayerChip({
  p,
  onTap,
  highlight,
  matchId,
}: {
  p: Player;
  onTap: () => void;
  highlight: boolean;
  matchId: string;
}) {
  const store = useLeague();
  const { state } = store;
  const isAdmin = state.role === "admin";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const playerEvents = state.events.filter(
    (e) => e.matchId === matchId && e.playerId === p.id && !e.deleted,
  );
  const goals = playerEvents
    .filter((e) => e.type === "goal")
    .reduce((s, e) => s + e.value, 0);
  const yellows = playerEvents.filter((e) => e.type === "yellow").length;
  const suspended = store.isSuspended(p.id, matchId);
  // الطرد المؤقت (دقائق) ينتهي بانقضاء مدته على ساعة المباراة — فيعود اللاعب
  const c = store.clockOf(matchId);
  const nowSec = c.totalSeconds + (c.running && c.runningSince ? (Date.now() - c.runningSince) / 1000 : 0);
  const redBlocks = playerEvents.some(
    (e) =>
      e.type === "red" &&
      (e.penaltyScope === "minutes" ? (e.penaltyUntilSec ?? 0) > nowSec : true),
  );
  const sentOff = redBlocks || suspended;

  const save = async () => {
    const name = draft.trim();
    if (!name || name === p.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    const m = await store.updatePlayer(p.id, { name });
    setBusy(false);
    if (m) {
      setErr(m);
      return;
    }
    setEditing(false);
  };

  const boxStyle = {
    background: "linear-gradient(135deg,var(--surface-1),var(--surface-2))",
    border: highlight ? "1.5px solid rgba(224,178,74,.55)" : "1px solid var(--border-soft)",
  } as const;

  // وضع تعديل الاسم (أدمن) — يحل محل الشريحة كلها مؤقتًا
  if (editing) {
    return (
      <div className="flex h-12 flex-none items-center gap-1.5 rounded-[12px] px-2" style={boxStyle}>
        <span
          className="num flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] font-display text-[15px] font-bold"
          style={{ background: "rgba(43,79,194,.3)", color: "var(--text-1)" }}
        >
          {p.shirt}
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          aria-label="اسم اللاعب"
          className="h-8 w-0 min-w-0 flex-1 rounded-[8px] px-2 text-[13.5px] font-medium text-white"
          style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.16)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={busy || !draft.trim() || draft.trim() === p.name}
          className="h-8 flex-none rounded-[8px] px-2.5 text-[12px] font-bold disabled:opacity-35"
          style={{ background: "var(--gold)", color: "#1a1200" }}
        >
          {busy ? "…" : "حفظ"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setErr(null);
            setDraft(p.name);
          }}
          aria-label="إلغاء"
          className="h-8 flex-none rounded-[8px] px-2 text-[12px] font-bold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--text-3)" }}
        >
          ✕
        </button>
        {err ? (
          <span className="flex-none text-[10.5px] font-bold" style={{ color: "var(--live)" }} title={err}>
            !
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-12 flex-none items-stretch rounded-[12px]" style={{ ...boxStyle, opacity: sentOff ? 0.45 : 1 }}>
      <button
        onClick={onTap}
        disabled={sentOff}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-2 text-start"
      >
        <span
          className="num flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] font-display text-[15px] font-bold"
          style={{ background: "rgba(43,79,194,.3)", color: "var(--text-1)" }}
        >
          {p.shirt}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">
          {p.name}
        </span>
        {sentOff ? (
          <span className="flex-none text-[13px]">{suspended ? "🚫" : "🟥"}</span>
        ) : (
          <>
            {yellows > 0 ? <span className="flex-none text-[12px]">🟨</span> : null}
            {goals > 0 ? (
              <span className="num flex-none text-[12px] font-bold" style={{ color: "var(--gold)" }}>
                ⚽{goals}
              </span>
            ) : null}
          </>
        )}
      </button>
      {isAdmin ? (
        <button
          onClick={() => {
            setDraft(p.name);
            setErr(null);
            setEditing(true);
          }}
          aria-label="تعديل اسم اللاعب"
          className="flex w-9 flex-none items-center justify-center rounded-e-[12px] text-[13px]"
          style={{ borderInlineStart: "1px solid var(--border-soft)", color: "var(--text-3)" }}
        >
          ✏️
        </button>
      ) : null}
    </div>
  );
}

/** لاعب على دكة البدلاء: يُنقر للتبديل عند اختيار الخارج، وللأدمن زر ✏️ لتعديل الاسم. */
function BenchChip({
  p,
  matchId,
  isSubTarget,
  onSub,
}: {
  p: Player;
  matchId: string;
  isSubTarget: boolean;
  onSub: () => void;
}) {
  const store = useLeague();
  const { state } = store;
  const isAdmin = state.role === "admin";
  const suspended = store.isSuspended(p.id, matchId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const name = draft.trim();
    if (!name || name === p.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    const m = await store.updatePlayer(p.id, { name });
    setBusy(false);
    if (m) {
      setErr(m);
      return;
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="flex h-[42px] flex-none items-center gap-1.5 rounded-[12px] px-2"
        style={{ border: "1px dashed rgba(201,209,230,.25)" }}
      >
        <span className="num flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg font-display text-[13px] font-bold" style={{ background: "rgba(255,255,255,.06)", color: "var(--text-2)" }}>
          {p.shirt}
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          aria-label="اسم اللاعب"
          className="h-7 w-0 min-w-0 flex-1 rounded-[8px] px-2 text-[13px] font-medium text-white"
          style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.16)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          onClick={save}
          disabled={busy || !draft.trim() || draft.trim() === p.name}
          className="h-7 flex-none rounded-[8px] px-2.5 text-[11.5px] font-bold disabled:opacity-35"
          style={{ background: "var(--gold)", color: "#1a1200" }}
        >
          {busy ? "…" : "حفظ"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setErr(null);
            setDraft(p.name);
          }}
          aria-label="إلغاء"
          className="h-7 flex-none rounded-[8px] px-2 text-[11.5px] font-bold"
          style={{ background: "rgba(255,255,255,.06)", color: "var(--text-3)" }}
        >
          ✕
        </button>
        {err ? (
          <span className="flex-none text-[10.5px] font-bold" style={{ color: "var(--live)" }} title={err}>
            !
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex h-[42px] flex-none items-stretch rounded-[12px]"
      style={{
        border:
          isSubTarget && !suspended
            ? "1.5px dashed var(--gold)"
            : suspended
              ? "1px dashed rgba(229,72,77,.4)"
              : "1px dashed rgba(201,209,230,.25)",
        opacity: suspended ? 0.45 : isSubTarget ? 1 : 0.75,
      }}
    >
      <button
        disabled={suspended}
        onClick={() => (isSubTarget && !suspended ? onSub() : undefined)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-2"
      >
        <span className="num flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg font-display text-[13px] font-bold" style={{ background: "rgba(255,255,255,.06)", color: "var(--text-2)" }}>
          {p.shirt}
        </span>
        <span className="min-w-0 flex-1 truncate text-start text-[13.5px] font-medium" style={{ color: "var(--text-2)" }}>
          {p.name}
        </span>
        {suspended ? <span className="flex-none text-[12px]">🚫</span> : null}
      </button>
      {isAdmin ? (
        <button
          onClick={() => {
            setDraft(p.name);
            setErr(null);
            setEditing(true);
          }}
          aria-label="تعديل اسم اللاعب"
          className="flex w-9 flex-none items-center justify-center rounded-e-[12px] text-[13px]"
          style={{ borderInlineStart: "1px dashed rgba(201,209,230,.25)", color: "var(--text-3)" }}
        >
          ✏️
        </button>
      ) : null}
    </div>
  );
}

function TimelineRow({ e }: { e: MatchEvent }) {
  const store = useLeague();
  const { seed } = store;
  const [confirming, setConfirming] = useState(false);
  const meta = PRIMARY_EVENTS.concat(MORE_EVENTS).find((x) => x.type === e.type);
  const pName = seed.players.find((p) => p.id === e.playerId)?.name;
  return (
    <div className="flex items-center gap-2 border-b py-2" style={{ borderColor: "var(--border-softer)" }}>
      <span className="num w-9 text-center font-display text-[13px] font-bold" style={{ color: "var(--text-2)" }}>
        د {e.minute}
      </span>
      <span className="text-[15px]">{meta?.icon ?? "•"}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white" style={e.deleted ? { textDecoration: "line-through", opacity: 0.5 } : undefined}>
        {meta?.label}
        {e.type === "red" && e.penaltyScope
          ? e.penaltyScope === "minutes"
            ? ` ${e.penaltyMinutes} د`
            : e.penaltyScope === "league"
              ? " من الدوري"
              : " باقي المباراة"
          : ""}
        {e.value > 1 ? " ×2" : ""} — {pName ?? store.teamByCode(e.teamCode)?.name}
        {e.note ? ` · ${e.note}` : ""}
      </span>
      {!e.deleted ? (
        confirming ? (
          <span className="flex flex-wrap justify-end gap-1">
            {DELETE_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => {
                  store.deleteEventWithReason(e.id, r);
                  setConfirming(false);
                }}
                className="pill px-2 py-1 text-[11.5px] font-semibold"
                style={{ background: "rgba(229,72,77,.14)", color: "var(--live)" }}
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => setConfirming(false)}
              className="pill px-2 py-1 text-[11.5px] font-semibold"
              style={{ background: "rgba(255,255,255,.08)", color: "var(--text-2)" }}
            >
              تراجع
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} className="pill px-2.5 py-1 text-[12px] font-semibold" style={{ background: "rgba(255,255,255,.06)", color: "var(--text-3)" }}>
            حذف بسبب
          </button>
        )
      ) : (
        <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {e.deletedReason}
        </span>
      )}
    </div>
  );
}

/** اختيار التشكيلة الأساسية (5 لاعبين) لكل فريق قبل صافرة البداية */
function PrepSheet({
  matchId,
  homeCode,
  awayCode,
  onClose,
}: {
  matchId: string;
  homeCode: string;
  awayCode: string;
  onClose: () => void;
}) {
  const store = useLeague();
  const { seed, state } = store;
  const STARTERS_COUNT = 5;

  // الافتراضي (أو المحفوظ سابقًا) بعد استبعاد الموقوفين — حتى لا يعلق موقوف داخل الاختيار
  const initial = (code: string) =>
    (
      state.starters[matchId]?.[code] ??
      seed.players
        .filter((p) => p.teamCode === code && p.shirt <= STARTERS_COUNT)
        .map((p) => p.id)
    ).filter((id) => !store.isSuspended(id, matchId));

  const [picked, setPicked] = useState<Record<string, string[]>>({
    [homeCode]: initial(homeCode),
    [awayCode]: initial(awayCode),
  });

  const toggle = (code: string, playerId: string) => {
    setPicked((prev) => {
      const list = prev[code];
      if (list.includes(playerId)) return { ...prev, [code]: list.filter((x) => x !== playerId) };
      if (list.length >= STARTERS_COUNT) return prev;
      return { ...prev, [code]: [...list, playerId] };
    });
  };

  const valid =
    picked[homeCode].length === STARTERS_COUNT && picked[awayCode].length === STARTERS_COUNT;

  return (
    <Sheet title="التشكيلة الأساسية" onClose={onClose}>
      {[homeCode, awayCode].map((code) => (
        <div key={code} className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-[13.5px] font-bold text-white">
            <Shield code={code} size={20} gold={false} />
            {store.teamByCode(code)?.name}
            <span
              className="num ms-auto text-[12.5px]"
              style={{ color: picked[code].length === STARTERS_COUNT ? "var(--green-text)" : "var(--warn)" }}
            >
              {picked[code].length}/{STARTERS_COUNT}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {seed.players
              .filter((p) => p.teamCode === code)
              .map((p) => {
                const suspended = store.isSuspended(p.id, matchId);
                const selected = picked[code].includes(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={suspended}
                    onClick={() => toggle(code, p.id)}
                    className="flex items-center gap-2 rounded-[11px] px-2 py-1.5 text-start"
                    style={
                      suspended
                        ? { background: "rgba(229,72,77,.08)", border: "1px solid rgba(229,72,77,.3)", opacity: 0.6 }
                        : selected
                          ? { background: "rgba(224,178,74,.14)", border: "1.5px solid rgba(224,178,74,.55)" }
                          : { background: "rgba(255,255,255,.04)", border: "1px solid var(--border-soft)" }
                    }
                  >
                    <span className="num flex h-6 w-6 flex-none items-center justify-center rounded-md font-display text-[12px] font-bold" style={{ background: "rgba(43,79,194,.3)", color: "var(--text-1)" }}>
                      {p.shirt}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-white">
                      {p.name}
                    </span>
                    <span className="text-[12px]">{suspended ? "🚫" : selected ? "✓" : ""}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <button
        disabled={!valid}
        onClick={() => {
          store.setStarters(matchId, homeCode, picked[homeCode]);
          store.setStarters(matchId, awayCode, picked[awayCode]);
          onClose();
        }}
        className="btn-gold h-12 w-full text-[15px] disabled:opacity-40"
      >
        حفظ التشكيلتين
      </button>
      <p className="pt-2 text-center text-[12px]" style={{ color: "var(--text-3)" }}>
        اللاعب الموقوف 🚫 لا يمكن اختياره — يُحتسب الإيقاف تلقائيًا من الكروت المعتمدة
      </p>
    </Sheet>
  );
}

function CenterMsg({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col items-center justify-center px-8 text-center">
      <p className="text-[15px] font-medium" style={{ color: "var(--text-2)" }}>
        {text}
      </p>
      {action}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="sheet max-h-[75dvh] w-full max-w-[430px] overflow-y-auto px-4 pb-8 pt-3"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full" style={{ background: "rgba(255,255,255,.25)" }} />
        <div className="mb-3 font-display text-[17px] font-bold text-white">{title}</div>
        {children}
      </div>
    </div>
  );
}

function EndSheet({
  matchId,
  homeCode,
  awayCode,
  onClose,
}: {
  matchId: string;
  homeCode: string;
  awayCode: string;
  onClose: () => void;
}) {
  const store = useLeague();
  const { seed, statusOf, scoreOf, state } = store;
  const status = statusOf(matchId);
  const score = scoreOf(matchId);
  const match = seed.matches.find((m) => m.id === matchId)!;
  const isKnockout = match.stage !== "group";
  const tied = score.home === score.away;
  const report = state.reports[matchId];

  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pens, setPens] = useState<{ h: number; a: number }>({
    h: report?.homePens ?? 0,
    a: report?.awayPens ?? 0,
  });

  const players = seed.players.filter((p) => p.teamCode === homeCode || p.teamCode === awayCode);

  return (
    <Sheet title={status === "finished" ? "الاعتماد النهائي" : "إنهاء المباراة"} onClose={onClose}>
      <div className="card mb-3 flex items-center justify-center gap-3 p-3">
        <span className="text-[14px] font-semibold text-white">{store.teamByCode(homeCode)?.name}</span>
        {/* المضيف يمين والضيف شمال (RTL) — نكتب الضيف ثم المضيف ليتطابق كل رقم مع اسمه */}
        <span className="num font-display text-[30px] font-bold" style={{ color: "var(--gold)" }}>
          {score.away} – {score.home}
        </span>
        <span className="text-[14px] font-semibold text-white">{store.teamByCode(awayCode)?.name}</span>
      </div>

      {status !== "finished" ? (
        <button
          onClick={() => store.endMatch(matchId)}
          className="btn-gold mb-2 h-12 w-full text-[15px]"
        >
          تأكيد إنهاء المباراة
        </button>
      ) : (
        <>
          {isKnockout && tied ? (
            <div className="card mb-3 p-3">
              <div className="mb-2 text-[13.5px] font-bold text-white">ركلات الترجيح</div>
              <div className="flex items-center justify-center gap-4">
                {(["h", "a"] as const).map((side) => (
                  <div key={side} className="flex items-center gap-2">
                    <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
                      {store.teamByCode(side === "h" ? homeCode : awayCode)?.name}
                    </span>
                    <button onClick={() => setPens((p) => ({ ...p, [side]: Math.max(0, p[side] - 1) }))} className="h-9 w-9 rounded-lg text-[18px] font-bold" style={{ background: "rgba(255,255,255,.07)", color: "var(--text-1)" }}>
                      −
                    </button>
                    <span className="num w-6 text-center font-display text-[20px] font-bold text-white">{pens[side]}</span>
                    <button onClick={() => setPens((p) => ({ ...p, [side]: p[side] + 1 }))} className="h-9 w-9 rounded-lg text-[18px] font-bold" style={{ background: "rgba(224,178,74,.15)", color: "var(--gold-light)" }}>
                      +
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => store.setReport(matchId, { homePens: pens.h, awayPens: pens.a })}
                className="pill mt-2 w-full py-2 text-[13px] font-bold"
                style={{ background: "rgba(224,178,74,.14)", color: "var(--gold-light)" }}
              >
                حفظ الترجيح
              </button>
            </div>
          ) : null}

          <div className="mb-2 text-[13.5px] font-bold text-white">⭐ نجم المباراة</div>
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            {players.map((p) => {
              const selected = report?.motmPlayerId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => store.setReport(matchId, { motmPlayerId: p.id })}
                  className="flex-none rounded-[12px] px-3 py-2 text-[12.5px] font-semibold"
                  style={
                    selected
                      ? { background: "linear-gradient(160deg,var(--gold-light),var(--gold-mid))", color: "var(--ink)" }
                      : { background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)", color: "var(--text-1)" }
                  }
                >
                  {p.teamCode} · {p.name}
                </button>
              );
            })}
          </div>

          <div className="mb-2 text-[13.5px] font-bold text-white">
            {store.canApprove ? "اعتماد النتيجة النهائية" : "الاعتماد النهائي"}
          </div>
          {!store.canApprove ? (
            <p
              className="mb-2 rounded-[12px] px-3.5 py-3 text-[13px] font-semibold"
              style={{ background: "rgba(244,196,48,.1)", border: "1px solid rgba(244,196,48,.4)", color: "var(--warn)" }}
            >
              الاعتماد من صلاحية الحكم أو أدمن الدوري — سجّل دخولك بحسابك من
              صفحة «أنا»، أو سلّم الجهاز للحكم لاعتماد النتيجة.
            </p>
          ) : null}
          <div className="mb-2 flex gap-2">
            <button
              disabled={!store.canApprove}
              onClick={() => {
                const ok = store.approveMatch(matchId, pin);
                if (!ok) setPinError(true);
                else onClose();
              }}
              className="btn-gold h-12 w-full text-[15px] disabled:opacity-40"
            >
              اعتماد وقفل النتيجة
            </button>
          </div>
          {pinError ? (
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--live)" }}>
              تعذّر الاعتماد — حسابك لا يملك صلاحية الحكم
            </p>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-3)" }}>
              الاعتماد يقفل النتيجة ويحدّث الترتيب فورًا ويُسجَّل في التدقيق باسم صاحب الحساب.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
