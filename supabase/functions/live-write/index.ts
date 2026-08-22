import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// بوابة الكتابة الوحيدة — RLS مقفول للكتابة من العملاء، وهذه الدالة تعمل
// بمفتاح service_role بعد التحقق من هوية المستخدم (JWT) ودوره في الدوري،
// ولا تسمح إلا بأفعال محددة بأعمدة محددة (لا كتابة حرة على أي جدول).
//
// verify_jwt معطّل على مستوى المنصة عمدًا: أفعال الجمهور (نشر/إعجاب/توقع)
// تعمل بلا حساب، والتحقق يتم داخل الدالة لكل فعل حسب ما يتطلبه.
//
// كل الإدراجات upsert بمعرّف من العميل (ignoreDuplicates): طابور الكتابة
// قد يعيد إرسال طلب نجح ولم تصل استجابته، فلا يجوز أن يكرر أو يفشل.

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** هوية حامل التوكن وأدواره (مدير المنصة يُحتسب admin تلقائيًا) */
async function authInfo(
  authHeader: string | null,
): Promise<{ uid: string | null; roles: string[] }> {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { uid: null, roles: [] };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { uid: null, roles: [] };
  const [profileQ, memberQ] = await Promise.all([
    admin.from("profiles").select("is_platform_admin").eq("id", data.user.id).maybeSingle(),
    admin.from("league_members").select("roles").eq("user_id", data.user.id).eq("status", "active"),
  ]);
  const roles = (memberQ.data ?? []).flatMap((r) => r.roles as string[]);
  if (profileQ.data?.is_platform_admin && !roles.includes("admin")) roles.push("admin");
  return { uid: data.user.id, roles };
}

/** كروت القوة الافتراضية للدوريات الجديدة */
const DEFAULT_POWER_CARDS = [
  { name: "الهدف بهدفين", icon: "⚡", description: "الهدف التالي لفريقك يُحتسب بهدفين", rarity: "rare", effect_type: "goal_multiplier", params: { multiplier: 2, scope: "next_goal" }, usage_window: "live" },
  { name: "وقت إضافي", icon: "⏱️", description: "إضافة 3 دقائق لزمن المباراة", rarity: "common", effect_type: "extra_time", params: { minutes: 3 }, usage_window: "live" },
  { name: "الدرع", icon: "🛡️", description: "إلغاء إنذار واحد للاعب من فريقك", rarity: "common", effect_type: "shield", params: { cancels: "yellow_card" }, usage_window: "live" },
  { name: "تبديل إضافي", icon: "🔁", description: "تبديل إضافي فوق الحد المسموح", rarity: "common", effect_type: "extra_substitution", params: { count: 1 }, usage_window: "live" },
];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function pick(
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MATCH_FIELDS = [
  "status", "clock", "home_score", "away_score", "home_pens", "away_pens",
  "match_day", "slot", "venue_id", "home_team_id", "away_team_id",
  "winner_team_id", "locked", "duration_override_minutes", "halves_override",
];
const EVENT_INSERT_FIELDS = [
  "id", "match_id", "team_id", "player_id", "secondary_player_id", "type",
  "subtype", "minute", "period", "value", "note", "linked_to", "power_card",
  "meta", "created_at",
];
const EVENT_UPDATE_FIELDS = [
  "deleted_at", "deleted_reason", "edited_reason", "minute", "note",
  "subtype", "value",
];
const REPORT_FIELDS = [
  "match_id", "motm_player_id", "referee_notes", "recorder_signed_at",
  "approved_at",
];
const ADJUSTMENT_FIELDS = [
  "id", "league_id", "team_id", "points", "reason", "source",
];
const USAGE_FIELDS = [
  "id", "team_card_id", "match_id", "status", "minute", "effect_snapshot",
  "applied_at",
];
const AUDIT_FIELDS = [
  "id", "league_id", "actor_role", "action", "entity", "entity_id", "detail",
];
const POST_FIELDS = ["id", "league_id", "author_name", "text", "author_device"];
const PREDICTION_FIELDS = [
  "league_id", "match_id", "device_key", "home", "away",
];

const MAX_POST_LEN = 500;
const MAX_NAME_LEN = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const action = String(body.action);
  // أفعال الجمهور تعمل بلا حساب، وأفعال المستخدم (طلب/قرار الانضمام) تحتاج
  // دخولًا فقط وتُدقَّق داخل حالتها. تسجيل الأحداث للطاقم، والاعتماد للحكم/
  // الأدمن، وتعديل النقاط والكباتن وإنشاء الدوريات للأدمن فقط.
  const PUBLIC_ACTIONS = ["insert_post", "like_post", "upsert_prediction"];
  const USER_ACTIONS = ["request_join", "decide_join", "update_player"];
  const ADMIN_ACTIONS = [
    "insert_adjustment", "set_captain", "create_league",
    "set_member_roles", "set_league_status",
  ];
  // أفعال الإشراف على المجتمع: أدمن أو مشرف
  const MOD_ACTIONS = ["delete_post", "ban_poster", "unban_poster"];
  const STAFF_ROLES = ["admin", "referee", "recorder"];

  let auth: { uid: string | null; roles: string[] } = { uid: null, roles: [] };
  if (!PUBLIC_ACTIONS.includes(action)) {
    auth = await authInfo(req.headers.get("Authorization"));
    if (USER_ACTIONS.includes(action)) {
      if (!auth.uid) return json({ error: "سجّل دخولك أولًا" }, 401);
    } else {
      const needed = ADMIN_ACTIONS.includes(action)
        ? ["admin"]
        : MOD_ACTIONS.includes(action)
          ? ["admin", "moderator"]
          : STAFF_ROLES;
      if (!auth.roles.some((r) => needed.includes(r))) {
        return json({ error: "forbidden", needed }, 403);
      }
      // الاعتماد النهائي حكر على الحكم أو الأدمن (لا المسجّل)
      if (
        action === "update_match" &&
        (body.payload as { patch?: Record<string, unknown> })?.patch?.status === "approved" &&
        !auth.roles.some((r) => r === "admin" || r === "referee")
      ) {
        return json({ error: "approval_needs_referee" }, 403);
      }
    }
  }

  // deno-lint-ignore no-explicit-any
  const p: any = body.payload ?? {};

  /** الدوري المؤرشف مقفول للتسجيل — الأدمن فقط يتجاوز (لتصحيح خطأ مثلًا) */
  async function leagueLockedForCaller(matchId: string): Promise<boolean> {
    if (auth.roles.includes("admin")) return false;
    const { data } = await admin
      .from("matches")
      .select("leagues!inner(status)")
      .eq("id", matchId)
      .maybeSingle();
    const status = (data as { leagues?: { status?: string } } | null)?.leagues?.status;
    return status === "archived";
  }

  try {
    switch (body.action) {
      case "insert_events": {
        const rows = (Array.isArray(p.events) ? p.events : []).map(
          (e: Record<string, unknown>) => pick(e, EVENT_INSERT_FIELDS),
        );
        if (rows.length === 0) return json({ error: "no_events" }, 400);
        if (await leagueLockedForCaller(String(rows[0].match_id))) {
          return json({ error: "الدوري مقفول (مؤرشف) — لا تسجيل جديدًا" }, 409);
        }
        // upsert بمعرّف العميل: إعادة إرسال طلب نجح ولم تصل استجابته لا تكرر الحدث
        const { error } = await admin
          .from("match_events")
          .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
        return json({ ok: true });
      }
      case "update_events": {
        for (const row of Array.isArray(p.rows) ? p.rows : []) {
          if (!UUID_RE.test(String(row.id))) continue;
          const { error } = await admin
            .from("match_events")
            .update(pick(row.patch ?? {}, EVENT_UPDATE_FIELDS))
            .eq("id", row.id);
          if (error) throw error;
        }
        return json({ ok: true });
      }
      case "delete_event": {
        if (!UUID_RE.test(String(p.id))) return json({ error: "bad_id" }, 400);
        // linked_to عليه on delete cascade — الطرد المرافق يُحذف مع أصله
        const { error } = await admin.from("match_events").delete().eq("id", p.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "update_match": {
        if (!UUID_RE.test(String(p.id))) return json({ error: "bad_id" }, 400);
        if (await leagueLockedForCaller(String(p.id))) {
          return json({ error: "الدوري مقفول (مؤرشف) — لا تعديل" }, 409);
        }
        const { error } = await admin
          .from("matches")
          .update(pick(p.patch ?? {}, MATCH_FIELDS))
          .eq("id", p.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "set_starters": {
        if (!UUID_RE.test(String(p.match_id)) || !UUID_RE.test(String(p.team_id)))
          return json({ error: "bad_id" }, 400);
        const del = await admin
          .from("match_lineups")
          .delete()
          .eq("match_id", p.match_id)
          .eq("team_id", p.team_id);
        if (del.error) throw del.error;
        const players = (Array.isArray(p.players) ? p.players : []).filter(
          (x: unknown) => UUID_RE.test(String(x)),
        );
        if (players.length > 0) {
          const ins = await admin.from("match_lineups").upsert(
            players.map((pid: string) => ({
              match_id: p.match_id,
              team_id: p.team_id,
              player_id: pid,
              is_starter: true,
            })),
            { onConflict: "match_id,player_id" },
          );
          if (ins.error) throw ins.error;
        }
        return json({ ok: true });
      }
      case "upsert_report": {
        const row = pick(p.report ?? {}, REPORT_FIELDS);
        if (!UUID_RE.test(String(row.match_id)))
          return json({ error: "bad_id" }, 400);
        const { error } = await admin
          .from("match_reports")
          .upsert(row, { onConflict: "match_id" });
        if (error) throw error;
        return json({ ok: true });
      }
      case "insert_adjustment": {
        const { error } = await admin
          .from("standing_adjustments")
          .upsert(pick(p.adjustment ?? {}, ADJUSTMENT_FIELDS), {
            onConflict: "id",
            ignoreDuplicates: true,
          });
        if (error) throw error;
        return json({ ok: true });
      }
      case "upsert_card_usage": {
        const row = pick(p.usage ?? {}, USAGE_FIELDS);
        if (!UUID_RE.test(String(row.id))) return json({ error: "bad_id" }, 400);
        const { error } = await admin
          .from("card_usages")
          .upsert(row, { onConflict: "id" });
        if (error) throw error;
        return json({ ok: true });
      }
      case "insert_audit": {
        const { error } = await admin
          .from("audit_log")
          .upsert(pick(p.entry ?? {}, AUDIT_FIELDS), {
            onConflict: "id",
            ignoreDuplicates: true,
          });
        if (error) throw error;
        return json({ ok: true });
      }
      case "insert_post": {
        const row = pick(p.post ?? {}, POST_FIELDS) as Record<string, string>;
        const text = String(row.text ?? "").trim();
        const author = String(row.author_name ?? "").trim();
        if (!text || !author) return json({ error: "empty_post" }, 400);
        // هوية الناشر: مفتاح الجهاز دائمًا + الحساب لو مسجّل دخوله
        const poster = await authInfo(req.headers.get("Authorization"));
        const device =
          String(row.author_device ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || null;
        const orParts: string[] = [];
        if (device) orParts.push(`device_key.eq.${device}`);
        if (poster.uid) orParts.push(`user_id.eq.${poster.uid}`);
        if (orParts.length > 0) {
          const { data: banned } = await admin
            .from("banned_posters").select("id").or(orParts.join(",")).limit(1);
          if ((banned ?? []).length > 0) {
            return json({ error: "أنت محظور من النشر — تواصل مع إدارة الدوري" }, 403);
          }
        }
        const { error } = await admin.from("posts").upsert(
          {
            ...row,
            text: text.slice(0, MAX_POST_LEN),
            author_name: author.slice(0, MAX_NAME_LEN),
            author_device: device,
            author_user: poster.uid,
            // الوقت من الخادم: لا نسمح لعميل بتثبيت منشوره أعلى الفيد بتاريخ مستقبلي
            created_at: new Date().toISOString(),
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete_post": {
        if (!UUID_RE.test(String(p.id))) return json({ error: "bad_id" }, 400);
        const { error } = await admin.from("posts").delete().eq("id", p.id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "ban_poster": {
        // حظر صاحب منشور مسيء (بجهازه وحسابه معًا) + حذف المنشور
        if (!UUID_RE.test(String(p.post_id))) return json({ error: "bad_id" }, 400);
        const { data: post } = await admin
          .from("posts")
          .select("id, author_device, author_user, author_name")
          .eq("id", p.post_id).maybeSingle();
        if (!post) return json({ error: "المنشور غير موجود" }, 404);
        let banned = false;
        if (post.author_device || post.author_user) {
          let uname: string | null = null;
          if (post.author_user) {
            const { data: prof } = await admin
              .from("profiles").select("username").eq("id", post.author_user).maybeSingle();
            uname = prof?.username ?? null;
          }
          const ins = await admin.from("banned_posters").insert({
            device_key: post.author_device,
            user_id: post.author_user,
            reason: String(p.reason ?? "إساءة").slice(0, 120),
            banned_username: uname ?? post.author_name,
          });
          if (ins.error) throw ins.error;
          banned = true;
        }
        await admin.from("posts").delete().eq("id", post.id);
        return json({ ok: true, banned });
      }
      case "unban_poster": {
        if (!UUID_RE.test(String(p.ban_id))) return json({ error: "bad_id" }, 400);
        const { error } = await admin.from("banned_posters").delete().eq("id", p.ban_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "update_player": {
        // تعديل اسم/رقم قميص لاعب — أدمن أو كابتن فريقه
        if (!UUID_RE.test(String(p.player_id))) return json({ error: "bad_id" }, 400);
        const { data: player } = await admin
          .from("players").select("id, team_id").eq("id", p.player_id).maybeSingle();
        if (!player) return json({ error: "اللاعب غير موجود" }, 404);
        const { data: team } = await admin
          .from("teams").select("captain_id").eq("id", player.team_id).single();
        const allowed = auth.roles.includes("admin") || team?.captain_id === auth.uid;
        if (!allowed) return json({ error: "تعديل اللاعبين للأدمن أو كابتن الفريق" }, 403);
        const patch: Record<string, unknown> = {};
        if (p.shirt_number !== undefined) {
          const n = Number(p.shirt_number);
          if (!Number.isInteger(n) || n < 1 || n > 99) {
            return json({ error: "رقم القميص من 1 إلى 99" }, 400);
          }
          patch.shirt_number = n;
        }
        if (p.name !== undefined) {
          const nm = String(p.name).trim().slice(0, 40);
          if (!nm) return json({ error: "الاسم مطلوب" }, 400);
          patch.name = nm;
        }
        if (Object.keys(patch).length === 0) return json({ error: "لا تغيير" }, 400);
        const { error } = await admin.from("players").update(patch).eq("id", player.id);
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            return json({ error: "هذا الرقم مستخدم في الفريق بالفعل" }, 409);
          }
          throw error;
        }
        return json({ ok: true });
      }
      case "like_post": {
        if (!UUID_RE.test(String(p.id))) return json({ error: "bad_id" }, 400);
        const { error } = await admin.rpc("bump_post_likes", { p_post: p.id });
        if (error) throw error;
        return json({ ok: true });
      }
      case "upsert_prediction": {
        const row = pick(p.prediction ?? {}, PREDICTION_FIELDS);
        if (!UUID_RE.test(String(row.match_id)) || !row.device_key)
          return json({ error: "bad_prediction" }, 400);
        const { error } = await admin
          .from("predictions")
          .upsert(row, { onConflict: "match_id,device_key" });
        if (error) throw error;
        return json({ ok: true });
      }
      case "request_join": {
        const code = String(p.code ?? "").trim().toUpperCase();
        if (!/^[A-Z0-9]{4,10}$/.test(code)) return json({ error: "كود غير صالح" }, 400);
        const { data: jc } = await admin
          .from("team_join_codes").select("team_id").eq("code", code).maybeSingle();
        if (!jc) return json({ error: "لا يوجد فريق بهذا الكود" }, 404);
        const { data: team } = await admin
          .from("teams").select("id, league_id, name").eq("id", jc.team_id).single();
        if (!team) return json({ error: "الفريق غير موجود" }, 404);
        const { data: lg } = await admin
          .from("leagues").select("status").eq("id", team.league_id).single();
        if (lg?.status === "archived") {
          return json({ error: "هذا الدوري مقفول — لا انضمام جديدًا" }, 409);
        }
        // عضو بالفعل في فريق بنفس الدوري؟
        const { data: existing } = await admin
          .from("players")
          .select("id, teams!inner(league_id)")
          .eq("user_id", auth.uid!)
          .eq("teams.league_id", team.league_id);
        if ((existing ?? []).length > 0) {
          return json({ error: "أنت بالفعل لاعب في فريق بهذا الدوري" }, 409);
        }
        const ins = await admin
          .from("join_requests").insert({ team_id: team.id, user_id: auth.uid! });
        if (ins.error) {
          if (ins.error.code === "23505") {
            return json({ error: "لديك طلب معلق بالفعل — انتظر قرار الكابتن" }, 409);
          }
          throw ins.error;
        }
        await admin.from("profiles")
          .update({ account_type: "player" })
          .eq("id", auth.uid!).eq("account_type", "fan");
        return json({ ok: true, team_name: team.name });
      }
      case "decide_join": {
        if (!UUID_RE.test(String(p.request_id))) return json({ error: "bad_id" }, 400);
        const { data: reqRow } = await admin
          .from("join_requests")
          .select("id, status, team_id, user_id")
          .eq("id", p.request_id).maybeSingle();
        if (!reqRow) return json({ error: "الطلب غير موجود" }, 404);
        if (reqRow.status !== "pending") return json({ error: "الطلب محسوم بالفعل" }, 409);
        const { data: team } = await admin
          .from("teams")
          .select("id, short_code, captain_id, league_id")
          .eq("id", reqRow.team_id).single();
        if (!team) return json({ error: "الفريق غير موجود" }, 404);
        const allowed = team.captain_id === auth.uid || auth.roles.includes("admin");
        if (!allowed) return json({ error: "قرار الانضمام لكابتن الفريق أو الأدمن" }, 403);
        const approve = p.approve === true;
        if (approve) {
          const { data: profile } = await admin
            .from("profiles").select("display_name, username").eq("id", reqRow.user_id).single();
          const { data: maxRow } = await admin
            .from("players").select("shirt_number").eq("team_id", team.id)
            .order("shirt_number", { ascending: false }).limit(1).maybeSingle();
          const shirt = (maxRow?.shirt_number ?? 0) + 1;
          const ins = await admin.from("players").insert({
            team_id: team.id,
            user_id: reqRow.user_id,
            code: `${team.short_code}-${shirt}`,
            shirt_number: shirt,
            name: profile?.display_name ?? profile?.username ?? "لاعب",
            position: "لاعب",
          });
          if (ins.error) throw ins.error;
        }
        const upd = await admin.from("join_requests").update({
          status: approve ? "approved" : "rejected",
          decided_by: auth.uid,
          decided_at: new Date().toISOString(),
        }).eq("id", reqRow.id);
        if (upd.error) throw upd.error;
        return json({ ok: true });
      }
      case "set_member_roles": {
        // تعديل صلاحيات مستخدم في دوري محدد — أدمن فقط (مُدقق في البوابة أعلاه)
        if (!UUID_RE.test(String(p.user_id)) || !UUID_RE.test(String(p.league_id))) {
          return json({ error: "bad_id" }, 400);
        }
        const roles = (Array.isArray(p.roles) ? p.roles : [])
          .filter((r: unknown) =>
            ["admin", "moderator", "referee", "recorder"].includes(String(r)));
        // حماية: لا يجرد الأدمن نفسه من admin فيقفل على نفسه (إلا مدير المنصة)
        if (p.user_id === auth.uid && !roles.includes("admin")) {
          const { data: prof } = await admin
            .from("profiles").select("is_platform_admin").eq("id", auth.uid!).maybeSingle();
          if (!prof?.is_platform_admin) {
            return json({ error: "لا يمكنك تجريد نفسك من صلاحية الأدمن" }, 400);
          }
        }
        if (roles.length === 0) {
          const { error } = await admin
            .from("league_members").delete()
            .eq("league_id", p.league_id).eq("user_id", p.user_id);
          if (error) throw error;
        } else {
          const { error } = await admin.from("league_members").upsert(
            { league_id: p.league_id, user_id: p.user_id, roles, status: "active" },
            { onConflict: "league_id,user_id" },
          );
          if (error) throw error;
        }
        return json({ ok: true });
      }
      case "set_league_status": {
        // قفل/فتح دوري — المؤرشف يمنع التسجيل والانضمام ويبقى مقروءًا
        if (!UUID_RE.test(String(p.league_id))) return json({ error: "bad_id" }, 400);
        const status = String(p.status);
        if (!["active", "archived"].includes(status)) {
          return json({ error: "bad_status" }, 400);
        }
        const { error } = await admin
          .from("leagues").update({ status }).eq("id", p.league_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "set_captain": {
        if (!UUID_RE.test(String(p.team_id))) return json({ error: "bad_id" }, 400);
        const captain = p.user_id === null ? null : String(p.user_id);
        if (captain !== null && !UUID_RE.test(captain)) return json({ error: "bad_id" }, 400);
        const { error } = await admin
          .from("teams").update({ captain_id: captain }).eq("id", p.team_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case "create_league": {
        // إنشاء دوري كامل من معالج الأدمن — كل الكيانات في طلب واحد
        // deno-lint-ignore no-explicit-any
        const L: any = p.league ?? {};
        const name = String(L.name ?? "").trim().slice(0, 80);
        const season = String(L.season ?? "").trim().slice(0, 40);
        const slogan = String(L.slogan ?? "").trim().slice(0, 120);
        const groups: { name: string; teams: string[] }[] =
          Array.isArray(L.groups) ? L.groups : [];
        const matchDays: string[] = Array.isArray(L.match_days) ? L.match_days : [];
        const slots: string[] = Array.isArray(L.slots) ? L.slots : [];
        const venueNames: string[] = Array.isArray(L.venues) ? L.venues : [];
        // deno-lint-ignore no-explicit-any
        const fixtures: any[] = Array.isArray(L.fixtures) ? L.fixtures : [];
        const teamCount = groups.reduce(
          (s, g) => s + (Array.isArray(g.teams) ? g.teams.length : 0), 0);

        if (!name) return json({ error: "اسم الدوري مطلوب" }, 400);
        if (groups.length < 1 || groups.length > 4)
          return json({ error: "المجموعات من 1 إلى 4" }, 400);
        if (teamCount < 2 || teamCount > 40)
          return json({ error: "الفرق من 2 إلى 40" }, 400);
        if (matchDays.length < 1 || matchDays.length > 12)
          return json({ error: "الأيام من 1 إلى 12" }, 400);
        if (slots.length < 1 || slots.length > 12)
          return json({ error: "الفترات من 1 إلى 12" }, 400);
        if (venueNames.length < 1 || venueNames.length > 6)
          return json({ error: "الملاعب من 1 إلى 6" }, 400);
        if (fixtures.length < 1 || fixtures.length > 64)
          return json({ error: "عدد المباريات من 1 إلى 64" }, 400);

        const rules = {
          points: { win: 3, draw: 1, loss: 0 },
          // شوط واحد أو شوطان — من الويزارد، وقابل للتخصيص لكل مباراة لاحقًا
          halves: Number(L.rules?.halves) === 1 ? 1 : 2,
          half_minutes: Number(L.rules?.half_minutes) || 8,
          slot_minutes: Number(L.rules?.slot_minutes) || 20,
          final_duration_override_minutes: Number(L.rules?.final_duration_override_minutes) || 30,
          substitutions: "unlimited",
          tiebreakers: ["points", "head_to_head", "goal_difference", "goals_for", "fair_play", "draw"],
          yellow_cards_for_suspension: Number(L.rules?.yellow_cards_for_suspension) || 2,
          red_card_suspension_matches: Number(L.rules?.red_card_suspension_matches) || 1,
          red_penalty_minutes_options: [2, 5],
        };
        const qualify = Number(L.rules?.qualify_per_group) || 2;

        const leagueIns = await admin.from("leagues").insert({
          slug: `league-${Date.now().toString(36)}`,
          name, slogan, season,
          status: "active",
          starts_at: matchDays[0],
          ends_at: matchDays[matchDays.length - 1],
          settings: {
            rules,
            features: { power_cards: L.power_cards === true, social: true, competitions: true, fans: false },
            match_days: matchDays,
            slots,
            slogans: [],
          },
        }).select("id").single();
        if (leagueIns.error) throw leagueIns.error;
        const leagueId = leagueIns.data.id;

        const venuesIns = await admin.from("venues").insert(
          venueNames.map((v) => ({ league_id: leagueId, name: String(v).slice(0, 40), all_slots: true })),
        ).select("id, name");
        if (venuesIns.error) throw venuesIns.error;
        const venueIdByName = new Map(venuesIns.data.map((v) => [v.name, v.id]));

        const stagesToInsert = [{
          league_id: leagueId, type: "groups", order_no: 1, legs: 1,
          config: { groups: groups.length, qualify_per_group: qualify },
        }];
        if (L.knockout === true && groups.length === 2) {
          stagesToInsert.push({
            league_id: leagueId, type: "knockout", order_no: 2, legs: 1,
            // deno-lint-ignore no-explicit-any
            config: { third_place: true } as any,
          });
        }
        const stagesIns = await admin.from("stages").insert(stagesToInsert).select("id, type");
        if (stagesIns.error) throw stagesIns.error;
        const groupsStageId = stagesIns.data.find((s) => s.type === "groups")!.id;
        const koStageId = stagesIns.data.find((s) => s.type === "knockout")?.id;

        const groupsIns = await admin.from("groups").insert(
          groups.map((g) => ({ stage_id: groupsStageId, name: String(g.name).slice(0, 4) })),
        ).select("id, name");
        if (groupsIns.error) throw groupsIns.error;
        const groupIdByName = new Map(groupsIns.data.map((g) => [g.name, g.id]));

        for (const g of groups) {
          const letter = String(g.name);
          const teamsIns = await admin.from("teams").insert(
            g.teams.map((t: string, i: number) => ({
              league_id: leagueId,
              short_code: `${letter}${i + 1}`,
              name: String(t).trim().slice(0, 40) || `فريق ${letter}${i + 1}`,
              group_code: letter,
            })),
          ).select("id, short_code");
          if (teamsIns.error) throw teamsIns.error;

          const gt = await admin.from("group_teams").insert(
            teamsIns.data.map((t, i) => ({
              group_id: groupIdByName.get(letter)!, team_id: t.id, seed_no: i + 1,
            })),
          );
          if (gt.error) throw gt.error;

          // لاعبون وهميون (7 لكل فريق) + كود انضمام
          for (const t of teamsIns.data) {
            const players = [];
            for (let n = 1; n <= 7; n++) {
              players.push({
                team_id: t.id,
                code: `${t.short_code}-${n}`,
                shirt_number: n,
                name: n === 1 ? "الحارس" : `لاعب ${n}`,
                position: n === 1 ? "حارس" : "لاعب",
              });
            }
            const pIns = await admin.from("players").insert(players);
            if (pIns.error) throw pIns.error;
            const codeIns = await admin.from("team_join_codes").insert({
              team_id: t.id,
              code: crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(),
            });
            if (codeIns.error) throw codeIns.error;
          }
        }

        const { data: allTeams } = await admin
          .from("teams").select("id, short_code").eq("league_id", leagueId);
        const teamIdByCode = new Map((allTeams ?? []).map((t) => [t.short_code, t.id]));

        const matchRows = fixtures.map((f, i) => {
          const stageKind = String(f.stage ?? "group");
          const isGroup = stageKind === "group";
          return {
            league_id: leagueId,
            stage_id: isGroup ? groupsStageId : (koStageId ?? groupsStageId),
            group_id: isGroup
              ? (groupIdByName.get(String(f.home).charAt(0)) ?? null)
              : null,
            code: `m${i + 1}`,
            stage_kind: stageKind,
            round_no: Math.max(1, matchDays.indexOf(String(f.day)) + 1),
            match_day: String(f.day),
            slot: String(f.slot),
            venue_id: venueIdByName.get(String(f.venue)) ?? venuesIns.data[0].id,
            home_side: String(f.home),
            away_side: String(f.away),
            home_team_id: teamIdByCode.get(String(f.home)) ?? null,
            away_team_id: teamIdByCode.get(String(f.away)) ?? null,
            duration_override_minutes: f.dur ? Number(f.dur) : null,
          };
        });
        const mIns = await admin.from("matches").insert(matchRows);
        if (mIns.error) throw mIns.error;

        if (L.power_cards === true) {
          const cardsIns = await admin.from("power_card_templates").insert(
            DEFAULT_POWER_CARDS.map((c) => ({ league_id: leagueId, ...c })),
          ).select("id");
          if (cardsIns.error) throw cardsIns.error;
          const tc = await admin.from("team_cards").insert(
            (allTeams ?? []).flatMap((t) =>
              cardsIns.data.map((c) => ({
                team_id: t.id, template_id: c.id, quantity: 1, acquired_from: "initial",
              }))
            ),
          );
          if (tc.error) throw tc.error;
        }

        return json({ ok: true, league_id: leagueId });
      }
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
