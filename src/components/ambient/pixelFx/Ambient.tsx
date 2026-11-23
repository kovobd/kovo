import { useEffect, useState } from "react";

/**
 * Cinematic ambient layer — soft moonlight vignette, gentle candle-like
 * flicker on the moon glow, and a rare silhouette raven pass. No pixel
 * art, no twinkling stars, no bright embers. Everything is blurred,
 * low-opacity, and behind the content.
 */
const Ambient = () => {
  const [ravenTick, setRavenTick] = useState(0);
  const [ravenCfg, setRavenCfg] = useState<{ top: string; ltr: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const wait = 90_000 + Math.random() * 120_000; // 1.5–3.5 min
      window.setTimeout(() => {
        if (cancelled || document.hidden) { schedule(); return; }
        setRavenCfg({
          top: `${8 + Math.random() * 30}%`,
          ltr: Math.random() < 0.5,
        });
        setRavenTick((k) => k + 1);
        schedule();
      }, wait);
    };
    // First appearance ~40s in — quiet enough to feel accidental.
    window.setTimeout(() => {
      if (!cancelled) {
        setRavenCfg({ top: "14%", ltr: true });
        setRavenTick((k) => k + 1);
      }
    }, 40_000);
    schedule();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pxfx-root" aria-hidden="true">
      {/* Soft page vignette — cinematic edge falloff */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 45%, rgba(5,5,5,0.35) 85%, rgba(5,5,5,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Soft moonlight — blurred halo, gentle candle flicker */}
      <div
        style={{
          position: "absolute",
          top: "6%",
          right: "8%",
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(247,244,255,0.22) 0%, rgba(199,189,217,0.10) 40%, transparent 70%)",
          filter: "blur(24px)",
          animation: "gv-moon-flicker 7s ease-in-out infinite",
          willChange: "opacity, transform",
        }}
      />

      {/* Occasional silhouette raven — smooth SVG, drifting flight arc */}
      {ravenCfg && (
        <div
          key={ravenTick}
          style={{
            position: "absolute",
            top: ravenCfg.top,
            left: 0,
            right: 0,
            height: 40,
            animation: "gv-raven-glide 18s cubic-bezier(0.4, 0, 0.6, 1)",
            animationDirection: ravenCfg.ltr ? "normal" : "reverse",
            willChange: "transform",
          }}
        >
          <div
            style={{
              display: "inline-block",
              transform: ravenCfg.ltr ? "scaleX(1)" : "scaleX(-1)",
              animation: "gv-raven-flap 0.9s ease-in-out infinite",
              opacity: 0.6,
              filter: "blur(0.5px) drop-shadow(0 4px 8px rgba(5,5,5,0.6))",
            }}
          >
            <svg width="36" height="16" viewBox="0 0 36 16" fill="none" aria-hidden="true">
              <path
                d="M2 8 Q6 3 10 6 Q14 2 18 5 Q22 2 26 6 Q30 3 34 8 Q30 6 26 7 Q22 5 18 7 Q14 5 10 7 Q6 6 2 8 Z"
                fill="#0A0810"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default Ambient;
