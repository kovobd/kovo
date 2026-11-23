import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  title?: string;
  description?: string;
  /** Uppercase micro-label above the title. */
  eyebrow?: string;
  /** Right-aligned controls in the header (filters, dropdowns). */
  actions?: React.ReactNode;
  /** Inline meta to the right of the title (pills, chips). */
  meta?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** flush = no body padding (good for tables/lists) */
  flush?: boolean;
  /** transparent = no surface (good for nested groups) */
  transparent?: boolean;
  /** lime spotlight surface */
  highlight?: boolean;
  /** subtle hover lift */
  interactive?: boolean;
  children: React.ReactNode;
}

const Section = ({
  title, description, eyebrow, actions, meta,
  className, bodyClassName, flush, transparent, highlight, interactive, children,
}: SectionProps) => (
  <section
    className={cn(
      transparent ? "" : "a-card",
      highlight && "a-card-accent",
      interactive && "a-card-hover",
      className,
    )}
  >
    {(title || actions || eyebrow) && (
      <header
        className={cn(
          "flex items-start justify-between gap-3",
          transparent ? "mb-3" : "px-3 sm:px-5 pt-3 sm:pt-4 pb-1",
        )}
      >
        <div className="min-w-0 flex-1">
          {eyebrow && <span className="a-eyebrow">{eyebrow}</span>}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {title && <h2 className="a-h2">{title}</h2>}
            {meta && <span className="shrink-0 flex items-center gap-1.5">{meta}</span>}
          </div>
          {description && <p className="a-helper mt-0.5">{description}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
      </header>
    )}
    <div className={cn(transparent || flush ? "" : "p-3 sm:p-5", bodyClassName)}>{children}</div>
  </section>
);

export default Section;
