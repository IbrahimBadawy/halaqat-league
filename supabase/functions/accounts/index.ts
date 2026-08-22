import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// إدارة الحسابات:
// - register: تسجيل ذاتي عام (زائر/لاعب) بحد معدل — كلمة المرور من صاحبها
//   فلا تغيير إجباريًا.
// - create_account: الأدمن ينشئ حساب طاقم بأدوار — تغيير إجباري أول دخول.
// - reset_password: الأدمن يعيد التعيين — تغيير إجباري عند الدخول التالي.
// verify_jwt معطل لأن register عام؛ الفعلان الإداريان يتحققان من JWT داخليًا.

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

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ["admin", "moderator", "referee", "recorder"];

/** معرّف حامل التوكن لو كان أدمن (منصة أو دوري) — null لغير المخوَّل */
async function adminCaller(authHeader: string | null): Promise<string | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const [profileQ, memberQ] = await Promise.all([
    admin.from("profiles").select("is_platform_admin").eq("id", data.user.id).maybeSingle(),
    admin.from("league_members").select("roles").eq("user_id", data.user.id).eq("status", "active"),
  ]);
  const ok =
    profileQ.data?.is_platform_admin === true ||
    (memberQ.data ?? []).some((r) => (r.roles as string[]).includes("admin"));
  return ok ? data.user.id : null;
}

async function createAccount(opts: {
  username: string;
  password: string;
  display: string;
  accountType: string;
  mustChange: boolean;
}): Promise<{ id?: string; error?: string }> {
  const username = String(opts.username ?? "").trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return { error: "اسم المستخدم: 3-20 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو _" };
  }
  if (String(opts.password ?? "").length < 8) {
    return { error: "كلمة المرور 8 أحرف على الأقل" };
  }
  const { data: taken } = await admin
    .from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return { error: "اسم المستخدم محجوز — اختر غيره" };

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@halaqat.local`,
    password: opts.password,
    email_confirm: true,
    user_metadata: { username, display_name: opts.display || username },
  });
  if (error || !data.user) return { error: `تعذّر الإنشاء: ${error?.message}` };

  await admin.from("profiles").update({
    display_name: opts.display || username,
    account_type: opts.accountType,
    must_change_password: opts.mustChange,
  }).eq("id", data.user.id);

  return { id: data.user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  try {
    switch (String(body.action)) {
      case "register": {
        // حد معدل: 20 تسجيلًا ذاتيًا في الساعة على المنصة كلها
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .neq("account_type", "staff")
          .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
        if ((count ?? 0) >= 20) {
          return json({ error: "التسجيل مزدحم الآن — جرّب بعد قليل" }, 429);
        }
        const type = body.account_type === "player" ? "player" : "fan";
        const res = await createAccount({
          username: body.username,
          password: body.password,
          display: String(body.display_name ?? "").slice(0, 60),
          accountType: type,
          mustChange: false, // اختار كلمته بنفسه
        });
        if (res.error) return json({ error: res.error }, 400);
        return json({ ok: true, id: res.id });
      }

      case "create_account": {
        if (!(await adminCaller(req.headers.get("Authorization")))) {
          return json({ error: "forbidden" }, 403);
        }
        const roles = (Array.isArray(body.roles) ? body.roles : [])
          .filter((r: unknown) => STAFF_ROLES.includes(String(r)));
        const res = await createAccount({
          username: body.username,
          password: body.password,
          display: String(body.display_name ?? "").slice(0, 60),
          accountType: roles.length > 0 ? "staff" : "player",
          mustChange: true, // حساب أنشأه الأدمن — يغيّر كلمته أول دخول
        });
        if (res.error) return json({ error: res.error }, 400);
        if (roles.length > 0 && UUID_RE.test(String(body.league_id))) {
          const mem = await admin.from("league_members").insert({
            league_id: body.league_id,
            user_id: res.id!,
            roles,
            status: "active",
          });
          if (mem.error) return json({ error: mem.error.message }, 500);
        }
        return json({ ok: true, id: res.id });
      }

      case "reset_password": {
        if (!(await adminCaller(req.headers.get("Authorization")))) {
          return json({ error: "forbidden" }, 403);
        }
        if (!UUID_RE.test(String(body.user_id))) return json({ error: "bad_id" }, 400);
        if (String(body.new_password ?? "").length < 8) {
          return json({ error: "كلمة المرور 8 أحرف على الأقل" }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          password: body.new_password,
        });
        if (error) return json({ error: error.message }, 500);
        await admin.from("profiles")
          .update({ must_change_password: true })
          .eq("id", body.user_id);
        return json({ ok: true });
      }

      case "delete_account": {
        const caller = await adminCaller(req.headers.get("Authorization"));
        if (!caller) return json({ error: "forbidden" }, 403);
        const uid = String(body.user_id);
        if (!UUID_RE.test(uid)) return json({ error: "bad_id" }, 400);
        if (uid === caller) return json({ error: "لا يمكنك حذف حسابك وأنت داخل به" }, 400);
        const { data: target } = await admin
          .from("profiles").select("is_platform_admin, username").eq("id", uid).maybeSingle();
        if (!target) return json({ error: "الحساب غير موجود" }, 404);
        if (target.is_platform_admin) {
          return json({ error: "حساب مدير المنصة لا يُحذف من هنا" }, 400);
        }
        // فك الارتباطات غير المتسلسلة قبل حذف حساب المصادقة (الملف يتسلسل معه)
        await admin.from("players").update({ user_id: null }).eq("user_id", uid);
        await admin.from("teams").update({ captain_id: null }).eq("captain_id", uid);
        await admin.from("join_requests").update({ decided_by: null }).eq("decided_by", uid);
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
