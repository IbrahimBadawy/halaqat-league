export default function LiveBadge({ minute }: { minute?: number }) {
  return (
    <span
      className="pill inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-bold text-white"
      style={{ background: "var(--live)", boxShadow: "0 0 16px rgba(229,72,77,.5)" }}
    >
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
      مباشر{minute !== undefined ? <span className="num"> · د {minute}</span> : null}
    </span>
  );
}
