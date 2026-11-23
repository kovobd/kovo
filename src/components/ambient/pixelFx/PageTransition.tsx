import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Cinematic 500ms page transition — the outgoing frame dissolves into
 * black smoke, the new frame materialises out of it. Coalesces rapid
 * navigations so overlapping transitions don't stack, and honours
 * prefers-reduced-motion by skipping the effect entirely.
 */
const PageTransition = () => {
  const location = useLocation();
  const [tick, setTick] = useState(0);
  const firstMountRef = useRef(true);
  const lastFireRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }, []);

  useEffect(() => {
    if (firstMountRef.current) { firstMountRef.current = false; return; }
    if (reducedRef.current) return;
    const now = performance.now();
    // Rapid nav guard: don't restart the smoke veil more often than 220ms.
    if (now - lastFireRef.current < 220) return;
    lastFireRef.current = now;
    setTick((t) => t + 1);
  }, [location.pathname]);

  if (tick === 0) return null;

  return (
    <div className="pxfx-root pxfx-root--top" aria-hidden="true">
      <div
        key={tick}
        className="gv-page-smoke"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 55%, rgba(11,9,16,0.92) 0%, rgba(11,9,16,0.75) 35%, rgba(11,9,16,0.1) 75%, transparent 100%)",
          filter: "blur(6px)",
          animation: "gv-page-smoke 500ms cubic-bezier(0.4,0,0.2,1) forwards",
          willChange: "opacity, transform",
        }}
      />
    </div>
  );
};

export default PageTransition;
