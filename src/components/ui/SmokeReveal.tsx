import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

/**
 * Section reveal with a drifting-fog + ash overlay. Uses a single
 * IntersectionObserver to add `is-in` when the wrapper enters view;
 * the overlay is a pure GPU animation (opacity + transform) that
 * fades itself out on completion, so there are no layout shifts and
 * no lingering per-frame work.
 *
 * Reduced-motion users see the content immediately with no overlay.
 */
interface Props {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  style?: CSSProperties;
  /** Delay in ms before the reveal starts once visible. */
  delay?: number;
}

const SmokeReveal = ({ children, className = "", as = "div", style, delay = 0 }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        window.setTimeout(() => el.classList.add("is-in"), delay);
        io.disconnect();
        break;
      }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  const Tag = as as any;
  return (
    <Tag ref={ref} className={`gv-smoke-reveal ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
};

export default SmokeReveal;
