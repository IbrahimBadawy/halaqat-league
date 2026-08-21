import type { ReactNode } from "react";

export default function SectionTitle({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="section-bar" />
      <span className="font-display font-bold text-[17px] text-white">{children}</span>
      {trailing ? <span className="ms-auto">{trailing}</span> : null}
    </div>
  );
}
