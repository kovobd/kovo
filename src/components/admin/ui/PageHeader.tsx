import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional uppercase micro-label rendered above the title. */
  eyebrow?: string;
  /** Right-side controls (filters, primary action). */
  actions?: React.ReactNode;
  /** Inline meta on the left (status pill, version chip, etc.). */
  meta?: React.ReactNode;
  /** Removes the bottom hairline + spacing. */
  bare?: boolean;
  className?: string;
}

const PageHeader = ({ title, subtitle, eyebrow, actions, meta, bare, className }: PageHeaderProps) => (
  <header
    className={cn(
      "flex items-start sm:items-center justify-between gap-4",
      bare ? "mb-4" : "a-page-header",
      className,
    )}
  >
    <div className="min-w-0 flex-1">
      {eyebrow && <span className="a-eyebrow">{eyebrow}</span>}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="a-display truncate">{title}</h1>
        {meta && <span className="shrink-0 flex items-center gap-1.5">{meta}</span>}
      </div>
      {subtitle && <p className="a-helper mt-1 max-w-2xl">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </header>
);

export default PageHeader;
