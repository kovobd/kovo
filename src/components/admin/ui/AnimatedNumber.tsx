import * as React from "react";
import { useMotionValue, useTransform, animate, useInView } from "motion/react";
import { motion } from "motion/react";

interface AnimatedNumberProps {
  value: number;
  /** Decimal places (default 0). */
  decimals?: number;
  /** Animation duration in seconds (default 1.2). */
  duration?: number;
  /** Optional prefix (e.g. "৳"). */
  prefix?: string;
  /** Optional suffix (e.g. "%"). */
  suffix?: string;
  /** Format with locale grouping (default true). */
  format?: boolean;
  /** BCP-47 locale tag, e.g. "en-IN", "bn-BD". */
  locale?: string;
  className?: string;
}

/**
 * Count-up number with motion. Animates the first time it enters the viewport,
 * then re-animates when `value` changes. Honors reduced-motion.
 */
const AnimatedNumber = ({
  value,
  decimals = 0,
  duration = 1.2,
  prefix,
  suffix,
  format = true,
  locale,
  className,
}: AnimatedNumberProps) => {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = React.useMemo(
    () => typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const mv = useMotionValue(reduced ? value : 0);
  const display = useTransform(mv, (latest) => {
    const factor = Math.pow(10, decimals);
    const n = Math.round(latest * factor) / factor;
    const str = format ? n.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) : n.toFixed(decimals);
    return `${prefix ?? ""}${str}${suffix ?? ""}`;
  });

  React.useEffect(() => {
    if (reduced) { mv.set(value); return; }
    if (!inView) return;
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [value, inView, duration, reduced, mv]);

  return <motion.span ref={ref} className={className}>{display}</motion.span>;
};

export default AnimatedNumber;
