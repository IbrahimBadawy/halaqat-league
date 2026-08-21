import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "دوري الحلقات — صيف 2026",
    short_name: "دوري الحلقات",
    description: "التحدي يبدأ .. والبطولة لنا",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#070E24",
    theme_color: "#070E24",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
