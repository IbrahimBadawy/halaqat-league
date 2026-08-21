import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// بوابة الكتابة الوحيدة للمرحلة 0 — RLS مقفول للكتابة من العملاء، وهذه الدالة
// تعمل بمفتاح service_role بعد تحقق PIN، ولا تسمح إلا بأفعال محددة
// بأعمدة محددة (لا كتابة حرة على أي جدول). تُستبدل بصلاحيات Auth الحقيقية
// في مهمة المصادقة. verify_jwt معطل لأن المصادقة هنا مخصصة (PIN).

const PIN = Deno.env.get("LIVE_PIN") ?? "1234";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

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
const ADJUSTMENT_FIELDS = ["league_id", "team_id", "points", "reason", "source"];
const USAGE_FIELDS = [
  "id", "team_card_id", "match_id", "status", "minute", "effect_snapshot",
  "applied_at",
];
const AUDIT_FIELDS = [
  "league_id", "actor_role", "action", "entity", "entity_id", "detail",
];
const POST_FIELDS = ["id", "league_id", "author_name", "text", "created_at"];
const PREDICTION_FIELDS = [
  "league_id", "match_id", "device_key", "home", "away",
];

const MAX_POST_LEN = 500;
const MAX_NAME_LEN = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { pin?: string; action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  // أفعال الجمهور (نشر/إعجاب/توقع) لا تحتاج PIN — الباقي (كل ما يمس نتيجة
  // مباراة أو ترتيبًا) يحتاجه. الحقول والأطوال مقيدة في كل الحالات.
  const PUBLIC_ACTIONS = ["insert_post", "like_post", "upsert_prediction"];
  if (!PUBLIC_ACTIONS.includes(String(body.action)) && body.pin !== PIN) {
    return json({ error: "bad_pin" }, 403);
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
        const { error } = await admin.from("match_events").insert(rows);
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
          const ins = await admin.from("match_lineups").insert(
            players.map((pid: string) => ({
              match_id: p.match_id,
              team_id: p.team_id,
              player_id: pid,
              is_starter: true,
            })),
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
          .insert(pick(p.adjustment ?? {}, ADJUSTMENT_FIELDS));
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
          .insert(pick(p.entry ?? {}, AUDIT_FIELDS));
        if (error) throw error;
        return json({ ok: true });
      }
      case "insert_post": {
        const row = pick(p.post ?? {}, POST_FIELDS) as Record<string, string>;
        const text = String(row.text ?? "").trim();
        const author = String(row.author_name ?? "").trim();
        if (!text || !author) return json({ error: "empty_post" }, 400);
        const { error } = await admin.from("posts").insert({
          ...row,
          text: text.slice(0, MAX_POST_LEN),
          author_name: author.slice(0, MAX_NAME_LEN),
        });
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
