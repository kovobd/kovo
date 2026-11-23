import { useState } from "react";
import { XIcon } from "@/components/ui/icons";
import { useLayoutData } from "./LayoutDataProvider";

const DISMISS_KEY = "announcement_dismissed";
const BAR_HEIGHT_CLASS = "h-9";
const HAS_BAR_HINT_KEY = "announcement_bar_hint";

const getDismissedState = () => {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
};
const setDismissedState = () => { try { window.sessionStorage.setItem(DISMISS_KEY, "1"); } catch {} };
const getHadBarHint = () => {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(HAS_BAR_HINT_KEY) === "1"; } catch { return false; }
};

const AnnouncementBar = () => {
  const { announcements, announcement, announcementSettings, loaded } = useLayoutData();
  const [dismissed, setDismissed] = useState(getDismissedState);

  // Prefer list; fall back to legacy single announcement field
  const list = (announcements && announcements.length > 0)
    ? announcements.filter(a => a.enabled && a.text)
    : (announcement && announcement.enabled && announcement.text
        ? [{ id: "legacy", ...announcement, sort_order: 0 } as any]
        : []);

  const direction = announcementSettings?.direction ?? "left";
  const speed = announcementSettings?.speed ?? 5;

  const duration = speed === 0 ? 0 : Math.round(200 / speed);
  const isStatic = speed === 0;
  const trackStyle: React.CSSProperties = isStatic
    ? { animation: "none" }
    : { animationDuration: `${duration}s`, animationDirection: direction === "right" ? "reverse" : "normal" };

  if (!loaded) {
    return getHadBarHint() ? <div className={`${BAR_HEIGHT_CLASS} relative z-[60] bg-primary-foreground`} aria-hidden="true" /> : null;
  }

  if (list.length === 0 || dismissed) {
    try { window.sessionStorage.removeItem(HAS_BAR_HINT_KEY); } catch {}
    return null;
  }

  try { window.sessionStorage.setItem(HAS_BAR_HINT_KEY, "1"); } catch {}

  // allow per-item dismissibility (any disabled disables)
  const dismissible = list.every(a => a.dismissible);

  const handleDismiss = () => { setDismissed(true); setDismissedState(); };

  const renderSegment = (a: typeof list[0], i: number) => {
    const textBase = "text-[13px] leading-none font-medium tracking-[0.14em] mx-10 whitespace-nowrap inline-block";
    const inner = (
      <span className={a.link ? `${textBase} underline underline-offset-4 decoration-current` : textBase}>
        {a.text}
      </span>
    );
    return a.link
      ? <a key={`${a.id}-${i}`} href={a.link} className="hover:opacity-90 transition-opacity">{inner}</a>
      : <span key={`${a.id}-${i}`}>{inner}</span>;
  };

  // Repeat the full list enough times to fill the marquee track
  const repeats = Math.max(3, Math.ceil(12 / list.length));
  const segments = Array.from({ length: repeats }).flatMap((_, r) => list.map((a, i) => renderSegment(a, r * list.length + i)));

  const Track = (
    <div className="flex announcement-marquee" style={trackStyle}>
      <div className="flex shrink-0">{segments}</div>
      <div className="flex shrink-0" aria-hidden="true">{segments}</div>
    </div>
  );

  return (
    <div
      className={`relative z-[60] flex ${BAR_HEIGHT_CLASS} items-center overflow-hidden border-b border-border/40 bg-primary-foreground text-primary`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/5" />
      <div className="block w-full">{Track}</div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="absolute right-2 sm:right-3 p-1 rounded-full hover:bg-foreground/10 transition-colors duration-200 z-10 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
};

export default AnnouncementBar;
