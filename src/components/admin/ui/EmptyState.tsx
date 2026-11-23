import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional secondary action (e.g. "Learn more"). */
  secondaryAction?: React.ReactNode;
  tone?: Tone;
  /** Compact variant — used inside cards / sections. */
  compact?: boolean;
  className?: string;
}

const EmptyState = ({
  icon, title, description, action, secondaryAction,
  tone = "neutral", compact, className,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center text-center a-empty-enter",
      compact ? "py-8 px-4" : "py-14 px-6",
      className,
    )}
  >
    {icon && (
      <div className="relative mb-5">
        <div
          className={cn("absolute inset-0 rounded-full blur-2xl opacity-50", `a-tone-${tone}`)}
          aria-hidden
          style={{ transform: "scale(1.5)" }}
        />
        <div
          className={cn(
            "relative flex items-center justify-center",
            compact ? "w-12 h-12 rounded-xl" : "w-16 h-16 rounded-2xl",
            `a-tone-${tone}`,
          )}
          style={{ boxShadow: "var(--a-shadow-ring), 0 1px 2px rgba(15,17,21,0.04)" }}
        >
          {icon}
        </div>
      </div>
    )}
    <p
      className={cn("font-semibold tracking-tight", compact ? "text-[14px]" : "text-[15px]")}
      style={{ color: "hsl(var(--a-ink))", letterSpacing: "-0.012em" }}
    >
      {title}
    </p>
    {description && (
      <p
        className={cn(
          "mt-2 max-w-sm leading-relaxed",
          compact ? "text-[12.5px]" : "text-[13px]",
        )}
        style={{ color: "hsl(var(--a-muted))" }}
      >
        {description}
      </p>
    )}
    {(action || secondaryAction) && (
      <div className="mt-6 flex items-center gap-2">
        {action}
        {secondaryAction}
      </div>
    )}
  </div>
);

export default EmptyState;
