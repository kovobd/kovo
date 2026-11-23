import { useEffect, useState } from "react";

/**
 * Distant lightning — a soft, blurred cool-light gradient that swells
 * from the upper edge and fades. No bright arcade flash. Fires roughly
 * every 3–6 minutes, at most twice per 10 minutes, pauses on hidden
 * tabs, and honours prefers-reduced-motion.
 */
const LightningSystem = () => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const recent: number[] = [];

    const scheduleNext = () => {
      const wait = 180_000 + Math.random() * 180_000; // 3–6 minutes
      window.setTimeout(() => {
        if (cancelled) return;
        const now = Date.now();
        while (recent.length && now - recent[0] > 600_000) recent.shift();
        if (recent.length < 2 && !document.hidden) {
          recent.push(now);
          setTick((v) => v + 1);
        }
        scheduleNext();
      }, wait);
    };
    scheduleNext();

    return () => { cancelled = true; };
  }, []);

  if (tick === 0) return null;

  return (
    <div
      key={tick}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(199,189,217,0.22) 0%, rgba(184,154,232,0.06) 40%, transparent 70%)",
        opacity: 0,
        filter: "blur(8px)",
        animation: "gv-lightning 2200ms cubic-bezier(0.4,0,0.2,1) forwards",
        mixBlendMode: "screen",
      }}
    />
  );
};

export default LightningSystem;
