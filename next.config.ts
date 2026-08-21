import type { NextConfig } from "next";

// تصدير ثابت للنشر على GitHub Pages — الموقع كله عميل + Supabase.
// NEXT_PUBLIC_BASE_PATH يُضبط في CI إلى "/halaqat-league" (مسار المشروع
// تحت ibrahimbadawy.github.io) ويبقى فارغًا محليًا.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
