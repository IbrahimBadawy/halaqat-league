// درع الفريق — درع أزرق بإطار ذهبي يحمل رمز الموقع (A1..B5) بخط Changa،
// مرسوم بـ clip-path كما في هوية البوستر.

const CLIP = "polygon(0 0,100% 0,100% 70%,50% 100%,0 70%)";

export default function Shield({
  code,
  size = 30,
  gold = true,
}: {
  code: string;
  size?: number; // العرض بالبكسل
  gold?: boolean; // إطار ذهبي حول الدرع
}) {
  const h = Math.round(size * (54 / 48));
  const innerW = gold ? size - 5 : size;
  const innerH = gold ? h - 5 : h;
  const inner = (
    <span
      className="num flex items-center justify-center font-display text-white"
      style={{
        width: innerW,
        height: innerH,
        background: "linear-gradient(180deg,var(--shield-1),var(--shield-2))",
        clipPath: CLIP,
        fontSize: Math.max(9, Math.round(size * 0.36)),
        fontWeight: 700,
      }}
    >
      {code}
    </span>
  );
  if (!gold) return inner;
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        width: size,
        height: h,
        background: "linear-gradient(180deg,var(--gold-light),var(--gold-deep))",
        clipPath: CLIP,
        flex: "none",
      }}
    >
      {inner}
    </span>
  );
}
