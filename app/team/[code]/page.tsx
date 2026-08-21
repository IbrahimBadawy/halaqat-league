// غلاف خادمي للتصدير الثابت — يعدّد أكواد الفرق A1..B5 من الـ seed المدمج.

import { loadSeed } from "@/lib/league/seed";
import TeamClient from "./TeamClient";

export function generateStaticParams() {
  return loadSeed().teams.map((t) => ({ code: t.code }));
}

export const dynamicParams = false;

export default function TeamPage() {
  return <TeamClient />;
}
