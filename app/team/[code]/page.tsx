// غلاف خادمي للتصدير الثابت — أكواد الفرق تتبع نمط المعالج: مجموعات A..D
// وحتى 10 فرق لكل مجموعة، فنولّد A1..D10 (الكود غير الموجود يعرض
// «الفريق غير موجود» من مكوّن العميل).

import TeamClient from "./TeamClient";

export function generateStaticParams() {
  const letters = ["A", "B", "C", "D"];
  return letters.flatMap((l) =>
    Array.from({ length: 10 }, (_, i) => ({ code: `${l}${i + 1}` })),
  );
}

export const dynamicParams = false;

export default function TeamPage() {
  return <TeamClient />;
}
