import { useEffect, useRef, useState } from "react";

/**
 * Decorative section divider that animates from center outward on first entry.
 * Under 400ms, GPU-friendly (transform + opacity only).
 */
const AnimatedDivider = ({ className = "" }: { className?: string }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "-10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`gv-anim-divider ${visible ? "is-in" : ""} ${className}`} aria-hidden="true">
      <span className="gv-anim-divider__line gv-anim-divider__line--l" />
      <span className="gv-anim-divider__glyph">❦</span>
      <span className="gv-anim-divider__line gv-anim-divider__line--r" />
    </div>
  );
};

export default AnimatedDivider;
