// غلاف خادمي للتصدير الثابت — يعدّد أكواد المباريات من الـ seed المدمج
// (m1..m24 ثابتة في المرحلة 0)، والمحتوى كله في مكوّن العميل.

import { loadSeed } from "@/lib/league/seed";
import MatchClient from "./MatchClient";

export function generateStaticParams() {
  return loadSeed().matches.map((m) => ({ id: m.id }));
}

export const dynamicParams = false;

export default function MatchPage() {
  return <MatchClient />;
}
