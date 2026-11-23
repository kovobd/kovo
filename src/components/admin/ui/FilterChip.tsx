import * as React from "react";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  active?: boolean;
  onClick?: () => void;
  count?: number | string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Optional shortcut key shown as a kbd hint. */
  shortcut?: string;
}

const FilterChip = ({ active, onClick, count, icon, children, className, shortcut }: FilterChipProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={!!active}
    className={cn("a-filter-chip", active && "is-active", className)}
  >
    {icon}
    <span>{children}</span>
    {count !== undefined && count !== "" && <span className="a-filter-chip-count">{count}</span>}
    {shortcut && <span className="a-kbd ml-0.5" aria-hidden>{shortcut}</span>}
  </button>
);

export default FilterChip;
