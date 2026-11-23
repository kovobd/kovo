import * as React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface DataColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Sort value extractor; falls back to render output. */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Enable drag-to-resize on the column. Sets initial width. */
  resizable?: boolean;
  /** Initial width in px. */
  width?: number;
  /** Minimum width in px when resizing (default 64). */
  minWidth?: number;
}

export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

interface DataListProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  columns: DataColumn<T>[];
  mobileCard: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  isRowSelected?: (row: T) => boolean;
  /** Controlled sort. If omitted, DataList manages it internally for sortable columns. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /** Constrain table height + sticky header. Defaults to true for desktop. */
  stickyHeader?: boolean;
  /** Max height for the scrollable body. */
  maxHeight?: number | string;
  /** Render shimmer skeleton rows while loading. */
  loading?: boolean;
  /** Number of skeleton rows to render when loading. */
  skeletonRows?: number;
  /** Stable key to persist column widths in localStorage. */
  persistKey?: string;
  className?: string;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function DataList<T>({
  rows, rowKey, columns, mobileCard, empty, onRowClick, isRowSelected,
  sort, onSortChange, stickyHeader = true, maxHeight,
  loading, skeletonRows = 6, persistKey, className,
}: DataListProps<T>) {
  const [internalSort, setInternalSort] = React.useState<SortState | null>(null);
  const activeSort = sort !== undefined ? sort : internalSort;

  // ── Column widths (resize support) ─────────────────────────────
  const initialWidths = React.useMemo(() => {
    const base: Record<string, number> = {};
    columns.forEach(c => { if (c.width) base[c.key] = c.width; });
    if (persistKey && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(`a-cols:${persistKey}`);
        if (stored) Object.assign(base, JSON.parse(stored) as Record<string, number>);
      } catch { /* noop */ }
    }
    return base;
  }, [columns, persistKey]);
  const [widths, setWidths] = React.useState<Record<string, number>>(initialWidths);

  React.useEffect(() => {
    if (!persistKey || typeof window === "undefined") return;
    try { window.localStorage.setItem(`a-cols:${persistKey}`, JSON.stringify(widths)); } catch { /* noop */ }
  }, [widths, persistKey]);

  const resizingRef = React.useRef<{ key: string; startX: number; startW: number; min: number } | null>(null);
  const [resizingKey, setResizingKey] = React.useState<string | null>(null);

  const onResizeStart = (e: React.PointerEvent, col: DataColumn<T>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement | null;
    const startW = widths[col.key] ?? th?.getBoundingClientRect().width ?? 120;
    resizingRef.current = { key: col.key, startX: e.clientX, startW, min: col.minWidth ?? 64 };
    setResizingKey(col.key);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizingRef.current;
    if (!r) return;
    const w = Math.max(r.min, r.startW + (e.clientX - r.startX));
    setWidths(prev => ({ ...prev, [r.key]: w }));
  };
  const onResizeEnd = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    resizingRef.current = null;
    setResizingKey(null);
    document.body.style.cursor = "";
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  // ── Sort ────────────────────────────────────────────────────────
  const handleSort = (key: string) => {
    const next: SortState | null =
      activeSort?.key === key
        ? activeSort.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" };
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  };

  const sortedRows = React.useMemo(() => {
    if (!activeSort) return rows;
    const col = columns.find(c => c.key === activeSort.key);
    if (!col?.sortable) return rows;
    const get = col.sortValue ?? ((r: T) => {
      const v = col.render(r);
      return typeof v === "string" || typeof v === "number" ? v : String(v ?? "");
    });
    const copy = [...rows];
    copy.sort((a, b) => {
      const r = compare(get(a), get(b));
      return activeSort.dir === "asc" ? r : -r;
    });
    return copy;
  }, [rows, columns, activeSort]);

  // ── Loading skeletons (preserve table chrome → no layout shift) ─
  if (loading) {
    return (
      <div className={cn("w-full", className)}>
        <div className="lg:hidden space-y-2">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div key={i} className="a-card p-3.5">
              <div className="flex items-center gap-3">
                <div className="a-skeleton a-skeleton-circle" style={{ width: 36 }} />
                <div className="flex-1 space-y-2">
                  <div className="a-skeleton a-skeleton-text" style={{ width: "60%" }} />
                  <div className="a-skeleton a-skeleton-text" style={{ width: "35%" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block a-table-wrap">
          <div className={stickyHeader ? "a-table-scroll" : undefined}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  {columns.map(c => (
                    <TableHead key={c.key} className="border-0">{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={i} className="border-0">
                    {columns.map(c => (
                      <TableCell key={c.key}>
                        <div className="a-skeleton a-skeleton-text" style={{ width: `${50 + ((i * 7 + c.key.length * 11) % 40)}%` }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  }

  if (sortedRows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {sortedRows.map((r) => (
          <div
            key={rowKey(r)}
            onClick={() => onRowClick?.(r)}
            className={cn(
              "a-card a-card-hover p-3.5",
              isRowSelected?.(r) && "is-selected",
              onRowClick && "cursor-pointer active:scale-[0.995] transition-transform",
            )}
          >
            {mobileCard(r)}
          </div>
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden lg:block a-table-wrap">
        <div
          className={stickyHeader ? "a-table-scroll" : undefined}
          style={stickyHeader && maxHeight ? { maxHeight } : undefined}
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                {columns.map((c) => {
                  const isActive = activeSort?.key === c.key;
                  const sortAria = c.sortable
                    ? isActive
                      ? (activeSort?.dir === "asc" ? "ascending" : "descending")
                      : "none"
                    : undefined;
                  const w = widths[c.key];
                  return (
                    <TableHead
                      key={c.key}
                      role={c.sortable ? "button" : undefined}
                      tabIndex={c.sortable ? 0 : undefined}
                      aria-sort={sortAria}
                      onClick={c.sortable ? () => handleSort(c.key) : undefined}
                      onKeyDown={c.sortable ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSort(c.key);
                        }
                      } : undefined}
                      style={{
                        position: "relative",
                        width: w ? `${w}px` : undefined,
                        minWidth: w ? `${w}px` : undefined,
                      }}
                      className={cn(
                        "border-0",
                        c.sortable && "is-sortable",
                        isActive && "is-active",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.className,
                      )}
                    >
                      {c.sortable ? (
                        <span className={cn("a-th-sort", c.align === "right" && "flex-row-reverse")}>
                          {c.label}
                          <span className="a-th-sort-icon">
                            <ChevronUp size={9} strokeWidth={2.5}
                              style={{ marginBottom: -2, opacity: isActive && activeSort?.dir === "asc" ? 1 : 0.5 }} />
                            <ChevronDown size={9} strokeWidth={2.5}
                              style={{ marginTop: -2, opacity: isActive && activeSort?.dir === "desc" ? 1 : 0.5 }} />
                          </span>
                        </span>
                      ) : c.label}
                      {c.resizable && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${c.label}`}
                          className={cn("a-col-resizer", resizingKey === c.key && "is-resizing")}
                          onPointerDown={(e) => onResizeStart(e, c)}
                          onPointerMove={onResizeMove}
                          onPointerUp={onResizeEnd}
                          onPointerCancel={onResizeEnd}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((r) => (
                <TableRow
                  key={rowKey(r)}
                  onClick={() => onRowClick?.(r)}
                  className={cn(
                    "border-0",
                    isRowSelected?.(r) && "is-selected",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.className,
                      )}
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: c.resizable ? "nowrap" : undefined,
                      }}
                    >
                      {c.render(r)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

export default DataList;
