// غلاف خادمي للتصدير الثابت — نفس نطاق أكواد المباريات (m1..m64).

import ConsoleClient from "./ConsoleClient";

export function generateStaticParams() {
  return Array.from({ length: 64 }, (_, i) => ({ id: `m${i + 1}` }));
}

export const dynamicParams = false;

export default function ConsolePage() {
  return <ConsoleClient />;
}
