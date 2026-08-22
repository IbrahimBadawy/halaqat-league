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

/** أدوار الدوري لحامل هذا التوكن (فارغة = زائر أو توكن غير صالح) */
async function rolesOf(authHeader: string | null): Promise<string[]> {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return [];
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return [];
  const { data: rows } = await admin
    .from("league_members")
    .select("roles")
    .eq("user_id", data.user.id)
    .eq("status", "active");
  return (rows ?? []).flatMap((r) => r.roles as string[]);
}

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
  "winner_team_id", "locked",
];
const EVENT_INSERT_FIELDS = [
  "id", "match_id", "team_id", "player_id", "secondary_player_id", "type",
  "subtype", "minute", "period", "value", "note", "linked_to", "power_card",
  "created_at",
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
const POST_FIELDS = ["id", "league_id", "author_name", "text"];
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
  // أفعال الجمهور تعمل بلا حساب. تسجيل الأحداث والتشكيلات للطاقم المُسنَد،
  // والاعتماد وإعادة الفتح وتعديل النقاط وتغيير المواعيد للأدمن/الحكم فقط.
  const PUBLIC_ACTIONS = ["insert_post", "like_post", "upsert_prediction"];
  const ADMIN_ACTIONS = ["insert_adjustment"];
  const STAFF_ROLES = ["admin", "referee", "recorder"];

  if (!PUBLIC_ACTIONS.includes(action)) {
    const roles = await rolesOf(req.headers.get("Authorization"));
    const needed = ADMIN_ACTIONS.includes(action)
      ? ["admin"]
      : action === "approve_match"
        ? ["admin", "referee"]
        : STAFF_ROLES;
    if (!roles.some((r) => needed.includes(r))) {
      return json({ error: "forbidden", needed }, 403);
    }
    // الاعتماد النهائي حكر على الحكم أو الأدمن (لا المسجّل)
    if (
      action === "update_match" &&
      (body.payload as { patch?: Record<string, unknown> })?.patch?.status === "approved" &&
      !roles.some((r) => r === "admin" || r === "referee")
    ) {
      return json({ error: "approval_needs_referee" }, 403);
    }
  }

  // deno-lint-ignore no-explicit-any
  const p: any = body.payload ?? {};
  try {
    switch (body.action) {
      case "insert_events": {
        const rows = (Array.isArray(p.events) ? p.events : []).map(
          (e: Record<string, unknown>) => pick(e, EVENT_INSERT_FIELDS),
        );
        if (rows.length === 0) return json({ error: "no_events" }, 400);
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
        const { error } = await admin.from("posts").upsert(
          {
            ...row,
            text: text.slice(0, MAX_POST_LEN),
            author_name: author.slice(0, MAX_NAME_LEN),
            // الوقت من الخادم: لا نسمح لعميل بتثبيت منشوره أعلى الفيد بتاريخ مستقبلي
            created_at: new Date().toISOString(),
          },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (error) throw error;
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
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
