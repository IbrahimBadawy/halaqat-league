import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LeagueProvider } from "@/lib/league/store";
import AppShell from "@/components/nav/AppShell";

// مسارات الأصول تحترم basePath (النشر تحت /halaqat-league على GitHub Pages)
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "دوري الحلقات — صيف 2026",
  description: "التحدي يبدأ .. والبطولة لنا — منصة إدارة ومتابعة دوري الحلقات",
  manifest: `${BP}/manifest.webmanifest`,
  icons: { icon: `${BP}/icon.svg` },
};

export const viewport: Viewport = {
  themeColor: "#070E24",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Changa:wght@600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LeagueProvider>
          <AppShell>{children}</AppShell>
        </LeagueProvider>
      </body>
    </html>
  );
}
