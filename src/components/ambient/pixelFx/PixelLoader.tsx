import { CandleSvg } from "./sprites";
import "./styles.css";

/**
 * Gothic pixel loader — flickering candle. Drop-in anywhere a
 * spinner would go; scales with the `size` prop.
 */
const PixelLoader = ({ size = 40, label }: { size?: number; label?: string }) => (
  <div className="inline-flex flex-col items-center gap-2" role="status" aria-live="polite">
    <CandleSvg size={size} />
    {label && <span className="text-xs text-foreground/70">{label}</span>}
    <span className="sr-only">Loading…</span>
  </div>
);

export default PixelLoader;
