import type { MetadataRoute } from "next";

// مطلوب مع output: "export" — الـ manifest يُولَّد وقت البناء
export const dynamic = "force-static";

// مسارات الـ PWA تحترم basePath (النشر تحت /halaqat-league على GitHub Pages)
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "دوري الحلقات — صيف 2026",
    short_name: "دوري الحلقات",
    description: "التحدي يبدأ .. والبطولة لنا",
    start_url: `${BP}/`,
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#070E24",
    theme_color: "#070E24",
    icons: [
      {
        src: `${BP}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
