"use client";

// إدارة الدوريات (أدمن): كل دوري ببطاقته — عرضه في التطبيق، قفله (أرشفة:
// يمنع التسجيل والانضمام ويبقى مقروءًا) أو إعادة فتحه، وإنشاء دوري جديد.

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminNav from "@/components/nav/AdminNav";
import { useLeague } from "@/lib/league/store";

const BORDER = "1px solid #E3E7F2";
/** ثوانٍ إجبارية بين التأكيد الأول والتأكيد النهائي للتصفير */
const RESET_GAP_SECONDS = 10;

/**
 * منطقة الخطر — تصفير دوري. مدير المنصة وحده يراها (والبوابة تتحقق كذلك،
 * فإخفاء الزر ليس هو الحماية). تأكيدان بينهما 10 ثوانٍ إجبارية.
 * مكوّن على مستوى الملف: صفحات هذا المشروع تُعاد رندرتها مع Realtime،
 * وأي مكوّن ذي حالة يُعرَّف داخل مكوّن آخر يفقد حالته عند كل رندر.
 */
function ResetLeagueDanger({ league }: { league: { id: string; name: string } }) {
  const { user, resetLeague } = useLeague();
  const [stage, setStage] = useState<"idle" | "wait" | "ready" | "running" | "done">("idle");
  const [left, setLeft] = useState(RESET_GAP_SECONDS);
  const [withPosts, setWithPosts] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // العدّاد بين التأكيدين — لا يبدأ إلا بعد التأكيد الأول
  useEffect(() => {
    if (stage !== "wait") return;
    if (left <= 0) {
      setStage("ready");
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, left]);

  if (!user?.isPlatformAdmin) return null;

  const cancel = () => {
    setStage("idle");
    setLeft(RESET_GAP_SECONDS);
    setError(null);
  };

  const panelOpen = stage === "wait" || stage === "ready" || stage === "running";

  return (
    <div className="mt-3 rounded-[12px] p-3" style={{ background: "#FEF3F2", border: "1px solid #FECDCA" }}>
      <p className="mb-2 text-[12.5px] font-bold" style={{ color: "#B42318" }}>
        ⚠️ منطقة الخطر — مدير المنصة فقط
      </p>

      {stage === "idle" || stage === "done" ? (
        <>
          <button
            onClick={() => {
              setResult(null);
              setError(null);
              setLeft(RESET_GAP_SECONDS);
              setStage("wait");
            }}
            className="h-10 rounded-[10px] px-4 text-[13px] font-bold"
            style={{ background: "#fff", color: "#B42318", border: "1px solid #FDA29B" }}
          >
            🧨 تصفير بيانات هذا الدوري
          </button>
          {result ? (
            <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "#067647" }}>
              ✓ {result}
            </p>
          ) : null}
        </>
      ) : null}

      {panelOpen ? (
        <div>
          <p className="mb-1.5 text-[13px] font-bold" style={{ color: "#B42318" }}>
            تصفير «{league.name}» — لا رجعة فيه
          </p>
          <p className="mb-1 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            <b>يُمسح:</b> كل الأحداث والنتائج والتشكيلات وتقارير المباريات
            واستخدامات كروت القوة وتعديلات النقاط والتوقعات وسجل التدقيق،
            وكل المباريات ترجع «مجدولة».
          </p>
          <p className="mb-2 text-[12.5px]" style={{ color: "var(--text-2)" }}>
            <b>لا يُمس:</b> الفرق واللاعبون وأرقام القمصان والحسابات وأكواد
            الانضمام والجدول (المواعيد والملاعب والمدد).
          </p>

          <label className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--text-1)" }}>
            <input
              type="checkbox"
              checked={withPosts}
              disabled={stage === "running"}
              onChange={(e) => setWithPosts(e.target.checked)}
              className="h-4 w-4"
            />
            امسح منشورات المجتمع كمان
          </label>

          <div className="flex flex-wrap gap-1.5">
            <button
              disabled={stage !== "ready"}
              onClick={async () => {
                setStage("running");
                setError(null);
                const res = await resetLeague(league.id, withPosts);
                if (res.error) {
                  setError(res.error);
                  setStage("ready");
                  return;
                }
                setResult(res.detail || "تم تصفير الدوري");
                setLeft(RESET_GAP_SECONDS);
                setStage("done");
              }}
              className="h-10 rounded-[10px] px-4 text-[13px] font-bold text-white disabled:opacity-45"
              style={{ background: "#B42318" }}
            >
              {stage === "running"
                ? "جارٍ التصفير…"
                : stage === "ready"
                  ? "🧨 تأكيد نهائي — صفّر الآن"
                  : `تأكيد نهائي بعد ${left} ث`}
            </button>
            <button
              disabled={stage === "running"}
              onClick={cancel}
              className="h-10 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-45"
              style={{ background: "#fff", color: "var(--text-1)", border: BORDER }}
            >
              إلغاء
            </button>
          </div>

          <p className="mt-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            {stage === "ready"
              ? "التأكيد الأول تم — الزر الأحمر ينفّذ فورًا."
              : "التأكيد الأول تم — انتظر انتهاء العدّاد قبل التأكيد النهائي."}
          </p>
          {error ? (
            <p className="mt-1.5 text-[12.5px] font-bold" style={{ color: "#B42318" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminLeaguesPage() {
  const store = useLeague();
  const { hydrated, state, leagues, activeLeagueId, setActiveLeague, setLeagueStatus } = store;
  const [msg, setMsg] = useState<string | null>(null);
  const [busyFor, setBusyFor] = useState<string | null>(null);

  if (!hydrated) return null;
  if (state.role !== "admin")
    return (
      <div className="admin-theme flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
        <p className="text-[15px] font-semibold">إدارة الدوريات — تحتاج حساب «أدمن الدوري»</p>
        <Link href="/me" className="rounded-[12px] px-5 py-2.5 text-[14px] font-bold text-white" style={{ background: "#0B1230" }}>
          سجّل دخولك من صفحة «أنا»
        </Link>
      </div>
    );

  return (
    <div className="admin-theme min-h-dvh" style={{ background: "var(--bg-base)", color: "var(--text-1)" }}>
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[24px] font-bold">🏆 الدوريات</h1>
          <Link href="/admin/new-league" className="ms-auto rounded-[12px] px-4 py-2 text-[13.5px] font-bold text-white" style={{ background: "#067647" }}>
            ➕ إنشاء دوري جديد
          </Link>
        </div>
        <AdminNav />

        {msg ? (
          <p className="mb-3 rounded-[10px] px-3.5 py-2.5 text-[13px] font-bold"
            style={msg.includes("✓")
              ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
              : { background: "#FEF3F2", color: "#B42318", border: "1px solid #FECDCA" }}>
            {msg}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {leagues.map((l) => {
            const active = l.id === activeLeagueId;
            const locked = l.status === "archived";
            const draft = l.status === "draft"; // أُنشئ ولم ينطلق بعد
            return (
              <div key={l.id} className="rounded-[16px] bg-white p-4" style={{ border: active ? "2px solid #0B1230" : BORDER }}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[20px]">{locked ? "🔒" : draft ? "📝" : "🏆"}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-[16px] font-bold">{l.name}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
                    style={locked
                      ? { background: "#F2F4F7", color: "var(--text-2)" }
                      : draft
                        ? { background: "#FFFAEB", color: "#93370D" }
                        : { background: "#ECFDF3", color: "#067647" }}>
                    {locked ? "منتهٍ (مؤرشف)" : draft ? "لم يبدأ (مسودة)" : "مفتوح"}
                  </span>
                </div>
                <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-2)" }}>
                  {l.season ?? "بلا موسم"} {active ? "· المعروض حاليًا في التطبيق ✓" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {!active ? (
                    <button onClick={() => setActiveLeague(l.id)}
                      className="h-10 rounded-[10px] px-4 text-[13px] font-bold text-white" style={{ background: "#0B1230" }}>
                      عرضه في التطبيق
                    </button>
                  ) : null}
                  <button
                    disabled={busyFor === l.id}
                    onClick={async () => {
                      setBusyFor(l.id);
                      const next = locked || draft ? "active" : "archived";
                      const m = await setLeagueStatus(l.id, next);
                      setBusyFor(null);
                      setMsg(
                        m ??
                          (next === "archived"
                            ? `قُفل «${l.name}» ✓ — النتائج تبقى معروضة، ولا تسجيل أو انضمام جديدًا`
                            : draft
                              ? `انطلق «${l.name}» ✓ — صار دوريًا مفتوحًا`
                              : `فُتح «${l.name}» ✓`),
                      );
                    }}
                    className="h-10 rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-40"
                    style={locked || draft
                      ? { background: "#ECFDF3", color: "#067647", border: "1px solid #ABEFC6" }
                      : { background: "#FFFAEB", color: "#93370D", border: "1px solid #F4C430" }}
                  >
                    {busyFor === l.id
                      ? "لحظات…"
                      : locked
                        ? "🔓 إعادة فتح الدوري"
                        : draft
                          ? "▶️ بدء الدوري"
                          : "🔒 قفل الدوري (أرشفة)"}
                  </button>
                </div>
                <ResetLeagueDanger league={{ id: l.id, name: l.name }} />
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-2)" }}>
          الدوري المقفول (منتهٍ): يظهر للجمهور بنتائجه كاملة، لكن الكونسول يرفض أي
          تسجيل جديد (إلا للأدمن للتصحيح) ولا يقبل الفريق لاعبين جددًا.
          <br />
          «لم يبدأ (مسودة)»: جدوله وفرقه جاهزة ويظهر في المبدّل موسومًا، و«بدء
          الدوري» يحوّله إلى مفتوح.
        </p>
      </div>
    </div>
  );
}
