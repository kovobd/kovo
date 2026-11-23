import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet" | "accent";

interface StatusPillProps {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  noDot?: boolean;
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  success: "is-success",
  warning: "is-warning",
  danger: "is-danger",
  info: "is-info",
  violet: "is-violet",
  accent: "is-accent",
};

const StatusPill = ({ children, tone = "neutral", className, noDot }: StatusPillProps) => (
  <span className={cn("a-pill", TONE_CLASS[tone], noDot && "before:hidden !pl-2", className)}>{children}</span>
);

export default StatusPill;
