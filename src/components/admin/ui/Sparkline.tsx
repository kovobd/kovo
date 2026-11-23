import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

interface SparklineProps {
  /** Numeric series — at least 2 points. */
  data: number[];
  width?: number;
  height?: number;
  /** Stroke color (CSS color). Defaults to ink. */
  color?: string;
  /** Adds a soft area fill below the line. */
  fill?: boolean;
  /** Stroke width in px. */
  strokeWidth?: number;
  className?: string;
}

/**
 * Minimal SVG sparkline. Animates the stroke on mount, honors reduced-motion.
 * Used to give StatCards a sense of trend without a full chart library.
 */
const Sparkline = ({
  data, width = 120, height = 36,
  color = "hsl(var(--a-ink))", fill = true, strokeWidth = 1.5, className,
}: SparklineProps) => {
  const reduced = useReducedMotion();

  const path = React.useMemo(() => {
    if (!data || data.length < 2) return { line: "", area: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const stepX = width / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [data, width, height]);

  const gid = React.useId().replace(/:/g, "");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <motion.path
            d={path.area}
            fill={`url(#spark-${gid})`}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          />
        </>
      )}
      <motion.path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
};

export default Sparkline;
