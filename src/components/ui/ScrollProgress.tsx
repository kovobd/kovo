import { useEffect, useState } from "react";

/**
 * Thin premium scroll progress indicator.
 * Fixed to the top of the viewport, ~2.5px, primary accent with soft glow.
 */
const ScrollProgress = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const compute = () => {
      const h = document.documentElement;
      const scrollTop = h.scrollTop || document.body.scrollTop;
      const height = h.scrollHeight - h.clientHeight;
      const pct = height > 0 ? (scrollTop / height) * 100 : 0;
      setProgress(pct);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(compute);
        ticking = true;
      }
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2.5px] z-[100] pointer-events-none"
      style={{ background: "transparent" }}
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${progress}%`,
          background:
            "hsl(var(--foreground))",
          boxShadow:
            "none",
          transition: "width 120ms linear",
          willChange: "width",
        }}
      />
    </div>
  );
};

export default ScrollProgress;
