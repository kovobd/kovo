// Barrel export for admin UI primitives.
//
// NOTE: `StatCard`, `Sparkline`, and `SalesChart` are intentionally NOT
// re-exported here. They pull in Recharts (~500 KB) via d3-*, and grouping
// them into a barrel risks accidental inclusion in the public entry graph
// through Rollup's shared CJS interop helpers. Import them from their
// individual file paths (`@/components/admin/ui/StatCard`, etc.) in admin
// pages only.
export { default as PageHeader } from "./PageHeader";
export { default as Section } from "./Section";
export { default as EmptyState } from "./EmptyState";
export { default as Toolbar } from "./Toolbar";
export { default as StickyActionBar } from "./StickyActionBar";
export { default as AnimatedNumber } from "./AnimatedNumber";
export { default as StatusPill } from "./StatusPill";
export { default as TagChip } from "./TagChip";
export { default as FormRow } from "./FormRow";
export { default as DataList } from "./DataList";
export { default as FilterChip } from "./FilterChip";

