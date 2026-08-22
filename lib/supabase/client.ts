import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// مفتاح publishable عام بطبيعته (RLS هو خط الحماية) — القيم الافتراضية هنا
// تجعل البناء الثابت (GitHub Pages) يعمل بلا أسرار، مع إمكانية override بالبيئة.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mgepypcbactyxiqokloi.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_zUAJAL_sXvfOp53PJ3YVdQ_AJ_gznWm";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
