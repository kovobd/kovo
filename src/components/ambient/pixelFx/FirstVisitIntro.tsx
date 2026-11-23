import { useEffect, useState } from "react";

const STORAGE_KEY = "gv_intro_seen_v1";

/**
 * One-time cinematic intro: fog drift + glass crack + logo glow.
 * Runs once per visitor (localStorage flag). Skips on reduced motion.
 */
const FirstVisitIntro = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2000);
    return () => window.clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        pointerEvents: "none",
        background: "#050505",
        animation: "gv-intro-fadeout 1.9s cubic-bezier(0.4,0,0.2,1) forwards",
      }}
    >
      {/* Drifting fog */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 30% 60%, rgba(184,154,232,0.18) 0%, transparent 55%), radial-gradient(ellipse at 70% 40%, rgba(199,189,217,0.14) 0%, transparent 60%)",
          filter: "blur(30px)",
          animation: "gv-intro-fog 2s ease-out forwards",
        }}
      />

      {/* Glass crack burst */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          animation: "gv-intro-glass 1.8s ease-out forwards",
          animationDelay: "0.3s",
        }}
      >
        <g stroke="#F7F4FF" strokeWidth="0.25" fill="none" opacity="0.85">
          <path d="M50 50 L8 6 M50 50 L92 4 M50 50 L98 46 M50 50 L84 96 M50 50 L44 100 M50 50 L2 62 M50 50 L14 96 M50 50 L64 2 M50 50 L28 8 M50 50 L74 12 M50 50 L96 68 M50 50 L20 92" />
          <path d="M20 18 L28 10 M72 14 L84 20 M86 44 L94 54 M74 78 L82 88 M26 82 L18 90 M10 54 L4 62 M40 26 L46 20 M60 26 L66 22" />
        </g>
      </svg>

      {/* Falling glass shards */}
      {Array.from({ length: 14 }).map((_, i) => {
        const left = (i / 14) * 100 + Math.random() * 6;
        const delay = 0.35 + Math.random() * 0.3;
        const dur = 1.1 + Math.random() * 0.4;
        const rot = (Math.random() - 0.5) * 180;
        const size = 4 + Math.random() * 8;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "48%",
              left: `${left}%`,
              width: size,
              height: size * 1.6,
              background: "linear-gradient(180deg, rgba(247,244,255,0.85), rgba(184,154,232,0.4))",
              opacity: 0,
              transform: `rotate(${rot}deg)`,
              animation: `gv-intro-shard ${dur}s ease-in forwards`,
              animationDelay: `${delay}s`,
              boxShadow: "0 0 4px rgba(247,244,255,0.4)",
            }}
          />
        );
      })}

      {/* Logo glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          fontFamily: "'Cinzel', serif",
          fontSize: "clamp(1.75rem, 5vw, 3rem)",
          fontWeight: 600,
          letterSpacing: "0.25em",
          color: "#F7F4FF",
          textShadow: "0 0 24px rgba(247,244,255,0.55), 0 0 48px rgba(184,154,232,0.5)",
          opacity: 0,
          animation: "gv-intro-logo 1.6s ease-out forwards",
          animationDelay: "0.5s",
          whiteSpace: "nowrap",
        }}
      >
        GOTHIC VAULT
      </div>
    </div>
  );
};

export default FirstVisitIntro;
