import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import AnimatedNumber from "./AnimatedNumber";
import Sparkline from "./Sparkline";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet" | "accent";

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  /** Number → count-up animation. ReactNode → rendered as-is. */
  value: React.ReactNode;
  /** Formatting hints (used when `value` is a number). */
  valuePrefix?: string;
  valueSuffix?: string;
  valueDecimals?: number;
  valueLocale?: string;
  sub?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  tone?: Tone;
  /** Optional sparkline series shown to the right of the value. */
  sparkline?: number[];
  /** Lime spotlight surface (matches reference highlight card). */
  highlight?: boolean;
  /** Stagger index for cascading entrance. */
  index?: number;
  className?: string;
  onClick?: () => void;
}

const TONE_STROKE: Record<Tone, string> = {
  neutral: "hsl(var(--a-ink))",
  success: "hsl(var(--a-success))",
  warning: "hsl(var(--a-warning))",
  danger:  "hsl(var(--a-danger))",
  info:    "hsl(var(--a-info))",
  violet:  "hsl(var(--a-violet))",
  accent:  "hsl(var(--a-highlight-ink))",
};

const StatCard = ({
  icon: Icon, label, value, valuePrefix, valueSuffix, valueDecimals = 0, valueLocale,
  sub, trend, tone = "neutral", sparkline, highlight, index = 0, className, onClick,
}: StatCardProps) => {
  const reduced = useReducedMotion();
  const isNumeric = typeof value === "number";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: reduced ? 0 : Math.min(index * 0.05, 0.4),
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={reduced ? undefined : { y: -3, transition: { type: "spring", stiffness: 320, damping: 22 } }}
      className={cn(
        "a-card p-4 sm:p-5",
        highlight && "a-card-accent",
        onClick ? "cursor-pointer" : "cursor-default",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.06em]",
            highlight ? "a-label-on-accent" : "",
          )}
          style={highlight ? undefined : { color: "hsl(var(--a-muted))" }}
        >
          {label}
        </span>
        {Icon && (
          <motion.div
            whileHover={reduced ? undefined : { rotate: -6, scale: 1.06 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
              highlight ? "" : `a-tone-${tone}`,
            )}
            style={highlight ? { background: "hsl(var(--a-highlight-ink) / 0.10)", color: "hsl(var(--a-highlight-ink))" } : undefined}
          >
            <Icon size={14} strokeWidth={2} />
          </motion.div>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <p
          className={cn(
            "text-[26px] sm:text-[30px] font-semibold tracking-tight tabular-nums leading-none",
            highlight ? "a-value-on-accent" : "",
          )}
          style={highlight ? undefined : { color: "hsl(var(--a-ink))" }}
        >
          {isNumeric ? (
            <AnimatedNumber
              value={value as number}
              prefix={valuePrefix}
              suffix={valueSuffix}
              decimals={valueDecimals}
              locale={valueLocale}
            />
          ) : value}
        </p>
        {sparkline && sparkline.length > 1 && (
          <Sparkline
            data={sparkline}
            width={96}
            height={32}
            color={highlight ? "hsl(var(--a-highlight-ink))" : TONE_STROKE[tone]}
            className="shrink-0 -mb-0.5"
          />
        )}
      </div>

      <div className="flex items-center gap-2 mt-2.5 min-h-[16px]">
        {trend && (
          <motion.span
            initial={reduced ? false : { opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduced ? 0 : 0.35 + index * 0.05, duration: 0.4 }}
            className={cn(
              "text-[11px] font-medium px-1.5 py-0.5 rounded-md tabular-nums",
              trend.positive ? "a-tone-success" : "a-tone-danger",
            )}
          >
            {trend.positive ? "↑" : "↓"} {trend.value}
          </motion.span>
        )}
        {sub && (
          <p
            className="text-[11px] leading-relaxed truncate"
            style={{ color: highlight ? "hsl(var(--a-highlight-ink) / 0.7)" : "hsl(var(--a-soft))" }}
          >
            {sub}
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default StatCard;
