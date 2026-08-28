"use client";

// المجتمع — المرحلة 2 المصغّرة (المواصفة §4.11): نشر محلي + إعجابات،
// مع المنشورات النظامية المولَّدة تلقائيًا من النتائج المعتمدة ونجوم المباريات.

import { useState } from "react";
import Link from "next/link";
import Shield from "@/components/ui/Shield";
import { useLeague } from "@/lib/league/store";
import { formatNight, formatSlot } from "@/lib/league/seed";
import type { Match, Post } from "@/lib/league/types";

const AUTHOR_KEY = "halaqat-author";

type FeedItem =
  | { kind: "user"; at: number; post: Post }
  | { kind: "system"; at: number; match: Match };

export default function CommunityPage() {
  const { seed, matches, hydrated, statusOf, state, addPost, connected } = useLeague();

  const [author, setAuthor] = useState<string>(() =>
    typeof window === "undefined" ? "مشجع" : (localStorage.getItem(AUTHOR_KEY) ?? "مشجع"),
  );
  const [text, setText] = useState("");

  if (!hydrated) return null;

  const systemItems: FeedItem[] = matches
    .filter((m) => statusOf(m.id) === "approved")
    .map((m) => ({ kind: "system", at: state.reports[m.id]?.approvedAt ?? 0, match: m }));

  const userItems: FeedItem[] = state.posts.map((p) => ({ kind: "user", at: p.at, post: p }));

  const feed = [...userItems, ...systemItems].sort((a, b) => b.at - a.at);

  // بلا اتصال بالقاعدة لا نقبل نشرًا: كان المنشور يظهر ثم يختفي عند أول مزامنة
  const canPublish = text.trim().length > 0 && connected;

  function publish() {
    const body = text.trim();
    if (!body) return;
    addPost(author.trim() || "مشجع", body);
    setText("");
  }

  return (
    <div className="px-4">
      <h1 className="pb-3 pt-4 font-display text-[22px] font-bold text-white">المجتمع</h1>

      {/* إعلان رسمي مثبت */}
      <div
        className="mb-3 rounded-[16px] p-3.5"
        style={{
          background: "linear-gradient(150deg,rgba(224,178,74,.16),rgba(224,178,74,.04))",
          border: "1px solid rgba(224,178,74,.5)",
        }}
      >
        <div className="mb-1 flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--gold-light)" }}>
          📌 إعلان رسمي · إدارة الدوري
        </div>
        <p className="text-[14px] font-semibold leading-relaxed text-white">
          {seed.slogan} — انطلاق {seed.name} الليلة! <span className="num">6</span> مباريات من{" "}
          <span className="num">11:00 PM</span>. بالتوفيق لكل الفرق 🏆
        </p>
      </div>

      {/* صندوق النشر */}
      <div className="card mb-3 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-bold text-white"
            style={{ background: "linear-gradient(160deg,var(--shield-1),var(--ink))" }}
          >
            {(author.trim() || "مشجع").charAt(0)}
          </span>
          <input
            value={author}
            onChange={(e) => {
              setAuthor(e.target.value);
              localStorage.setItem(AUTHOR_KEY, e.target.value);
            }}
            placeholder="اسمك"
            aria-label="اسمك"
            className="min-w-0 flex-1 rounded-[11px] px-3 py-2 text-[13.5px] font-semibold text-white outline-none"
            style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب منشورًا للمجتمع..."
          rows={2}
          className="w-full resize-none rounded-[11px] px-3 py-2.5 text-[14px] leading-relaxed text-white outline-none"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--border-soft)" }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {!connected ? (
            <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--warn)" }}>
              لا اتصال بالخادم — النشر متوقف مؤقتًا حتى يعود
            </span>
          ) : null}
          <button
            onClick={publish}
            disabled={!canPublish}
            className="btn-gold px-6 py-2 text-[14px]"
            style={canPublish ? undefined : { opacity: 0.4 }}
          >
            نشر
          </button>
        </div>
      </div>

      {/* الخط الزمني: منشورات المشجعين + النتائج المعتمدة */}
      {feed.length === 0 ? (
        <p className="py-8 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
          كن أول من ينشر! منشورات النتائج تظهر هنا تلقائيًا فور اعتماد كل مباراة
        </p>
      ) : (
        feed.map((item) =>
          item.kind === "user" ? (
            <UserPostCard key={`p-${item.post.id}`} post={item.post} />
          ) : (
            <ResultPostCard key={`m-${item.match.id}`} match={item.match} at={item.at} />
          ),
        )
      )}

      <p className="py-4 text-center text-[12px]" style={{ color: "var(--text-3)" }}>
        التعليقات والإشراف الكامل في المرحلة الثانية
      </p>
    </div>
  );
}

// المكونات على مستوى الملف عمدًا: تعريفها داخل الصفحة كان يعيد إنشاء نوعها
// مع كل إعادة جلب من Realtime فتضيع حالة تأكيد الحذف/الحظر

function UserPostCard({ post }: { post: Post }) {
    const { likePost, canModerate, deletePost, banPoster } = useLeague();
    const liked = post.likes > 0;
    const [confirming, setConfirming] = useState<null | "delete" | "ban">(null);
    return (
      <div className="card mb-2.5 p-3.5">
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-bold text-white"
            style={{ background: "linear-gradient(160deg,var(--shield-1),var(--ink))" }}
          >
            {post.author.charAt(0)}
          </span>
          <span className="min-w-0 truncate text-[13.5px] font-bold text-white">{post.author}</span>
          <span className="num ms-auto shrink-0 text-[12px]" style={{ color: "var(--text-3)" }}>
            {new Date(post.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          {post.text}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={() => likePost(post.id)}
            className="pill px-3.5 py-1.5 text-[13px] font-semibold"
            style={
              liked
                ? {
                    background: "rgba(224,178,74,.14)",
                    border: "1px solid rgba(224,178,74,.4)",
                    color: "var(--gold-light)",
                  }
                : {
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid var(--border-soft)",
                    color: "var(--text-2)",
                  }
            }
          >
            👍 <span className="num">{post.likes}</span>
          </button>

          {/* أدوات الإشراف — أدمن/مشرف فقط */}
          {canModerate ? (
            confirming ? (
              <span className="ms-auto flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-bold" style={{ color: "var(--live)" }}>
                  {confirming === "delete" ? "حذف المنشور؟" : "حظر الناشر وحذف منشوره؟"}
                </span>
                <button
                  onClick={() => {
                    if (confirming === "delete") void deletePost(post.id);
                    else void banPoster(post.id, "إساءة في المجتمع");
                    setConfirming(null);
                  }}
                  className="pill px-3 py-1 text-[12px] font-bold text-white"
                  style={{ background: "var(--live)" }}
                >
                  تأكيد
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="pill px-2.5 py-1 text-[12px] font-semibold"
                  style={{ background: "rgba(255,255,255,.08)", color: "var(--text-2)" }}
                >
                  تراجع
                </button>
              </span>
            ) : (
              <span className="ms-auto flex gap-1.5">
                <button
                  onClick={() => setConfirming("delete")}
                  className="pill px-2.5 py-1 text-[12px] font-semibold"
                  style={{ background: "rgba(229,72,77,.1)", color: "var(--live)", border: "1px solid rgba(229,72,77,.3)" }}
                >
                  🗑️ حذف
                </button>
                <button
                  onClick={() => setConfirming("ban")}
                  className="pill px-2.5 py-1 text-[12px] font-semibold"
                  style={{ background: "rgba(229,72,77,.16)", color: "var(--live)", border: "1px solid rgba(229,72,77,.45)" }}
                >
                  🚫 حظر
                </button>
              </span>
            )
          ) : null}
        </div>
      </div>
    );
}

function ResultPostCard({ match: m, at }: { match: Match; at: number }) {
    const { seed, resolveSide, scoreOf, state } = useLeague();
    const h = resolveSide(m.home);
    const a = resolveSide(m.away);
    const s = scoreOf(m.id);
    const motmId = state.reports[m.id]?.motmPlayerId;
    const motm = seed.players.find((p) => p.id === motmId);
    return (
      <Link href={`/match/${m.id}`} className="card mb-2.5 block p-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium" style={{ color: "var(--text-3)" }}>
          <span className="pill px-2 py-0.5 font-bold" style={{ background: "rgba(30,127,58,.16)", color: "var(--green-text)" }}>
            نتيجة معتمدة
          </span>
          {formatNight(m.matchDay)} · <span className="num">{formatSlot(m.slot)}</span> · {m.venue}
          {at ? (
            <span className="num ms-auto">
              {new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-white">
            <Shield code={h.team?.code ?? "؟"} size={24} gold={false} />
            {h.team?.name ?? h.label}
          </span>
          <span className="num font-display text-[26px] font-bold" style={{ color: "var(--gold)" }}>
            {s.home} – {s.away}
          </span>
          <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-white">
            {a.team?.name ?? a.label}
            <Shield code={a.team?.code ?? "؟"} size={24} gold={false} />
          </span>
        </div>
        {motm ? (
          <div className="mt-2 text-center text-[13px] font-semibold" style={{ color: "var(--gold-light)" }}>
            ⭐ نجم المباراة: {motm.name} ({motm.teamCode})
          </div>
        ) : null}
      </Link>
    );
}
