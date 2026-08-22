// غلاف خادمي للتصدير الثابت — المنصة متعددة الدوريات، فنولّد صفحات لنطاق
// سخي من أكواد المباريات (m1..m64، حد create_league نفسه). الكود غير
// الموجود في الدوري النشط يعرض «المباراة غير موجودة» من مكوّن العميل.

import MatchClient from "./MatchClient";

export function generateStaticParams() {
  return Array.from({ length: 64 }, (_, i) => ({ id: `m${i + 1}` }));
}

export const dynamicParams = false;

export default function MatchPage() {
  return <MatchClient />;
}
