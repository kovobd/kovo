import { useEffect } from "react";
import { GhostSvg, GravestoneSvg, MoonSvg, BatSvg } from "./sprites";
import { pixelFx } from "./api";
import "./styles.css";

/**
 * Standalone 404 pixel scene — gravestone, floating ghost, moon with
 * a bat orbiting it, plus a lightning strike every 5–8 seconds.
 */
const NotFoundScene = () => {
  useEffect(() => {
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      pixelFx.thunder();
      window.setTimeout(loop, 5000 + Math.random() * 3000);
    };
    const t = window.setTimeout(loop, 2500);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Moon with orbiting bat */}
      <div className="absolute top-[12%] left-[15%] opacity-70" style={{ filter: "drop-shadow(0 0 8px rgba(199,189,217,0.5))" }}>
        <MoonSvg size={64} />
        <div style={{ position: "absolute", top: "50%", left: "50%", animation: "pxfx-orbit 4s linear infinite" }}>
          <div style={{ animation: "pxfx-raven-flap 0.35s steps(2) infinite" }}>
            <BatSvg size={16} />
          </div>
        </div>
      </div>

      {/* Ghost floating around */}
      <div className="absolute top-[30%] right-[18%]" style={{ animation: "pxfx-float 3s ease-in-out infinite" }}>
        <GhostSvg size={48} />
      </div>

      {/* Gravestone anchored to ground */}
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2">
        <GravestoneSvg size={96} />
      </div>
    </div>
  );
};

export default NotFoundScene;
