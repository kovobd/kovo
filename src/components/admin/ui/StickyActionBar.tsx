import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  visible: boolean;
  message?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Inline unsaved-changes action row.
 * Renders only when `visible`. Right-aligned on desktop, stacked on mobile.
 * (Previously a fixed/sticky bottom bar — removed for a cleaner UI.)
 */
const StickyActionBar = ({ visible, message, children, className }: StickyActionBarProps) => {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="inline-flex h-2 w-2 rounded-full ring-2 ring-[hsl(var(--a-warning-bg))]"
          style={{ background: "hsl(var(--a-warning))" }}
          aria-hidden
        />
        <span
          className="text-[13px] font-medium truncate"
          style={{ color: "hsl(var(--a-ink))" }}
        >
          {message ?? "You have unsaved changes"}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:justify-end shrink-0 [&>button]:flex-1 sm:[&>button]:flex-none">
        {children}
      </div>
    </div>
  );
};

export default StickyActionBar;
