// غلاف خادمي للتصدير الثابت — نفس أكواد المباريات، والكونسول كله عميل.

import { loadSeed } from "@/lib/league/seed";
import ConsoleClient from "./ConsoleClient";

export function generateStaticParams() {
  return loadSeed().matches.map((m) => ({ id: m.id }));
}

export const dynamicParams = false;

export default function ConsolePage() {
  return <ConsoleClient />;
}
