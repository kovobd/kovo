import { useEffect, useState } from "react";
import { pixelFxBus, type FxEvent } from "./api";
import { BatSvg, PadlockSvg } from "./sprites";

/** One-shot effect record with a unique id + expiry timeout. */
type Instance = { id: number; ev: FxEvent; ttl: number };

let counter = 0;

/** Locates the cart icon target in the header for fly-to-cart animations. */
const findCartTarget = (): DOMRect | null => {
  const el = document.querySelector<HTMLElement>('[data-pixelfx-target="cart"]');
  return el?.getBoundingClientRect() ?? null;
};

/**
 * Global effect renderer — subscribes to the pixelFx bus and mounts
 * the visual for each incoming event. Each effect self-cleans after
 * its animation duration.
 */
const EffectLayer = () => {
  const [items, setItems] = useState<Instance[]>([]);

  useEffect(() => {
    const unsub = pixelFxBus.subscribe((ev) => {
      const id = ++counter;
      const ttl = ev.type === "batSwarm" ? 4000
        : ev.type === "vaultUnlock" ? 1600
        : ev.type === "magicPortal" ? 900
        : ev.type === "confetti" ? 3200
        : ev.type === "brokenGlass" ? 900
        : ev.type === "thunder" ? 900
        : ev.type === "bloodMoon" ? 3500
        : ev.type === "flyToCart" ? 900
        : 700;
      setItems((prev) => [...prev, { id, ev, ttl }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, ttl);
    });
    return () => { unsub(); };
  }, []);

  return (
    <div className="pxfx-root pxfx-root--top" aria-hidden="true">
      {items.map((i) => (
        <Render key={i.id} ev={i.ev} />
      ))}
    </div>
  );
};

const Render = ({ ev }: { ev: FxEvent }) => {
  switch (ev.type) {
    case "thunder": return <Thunder />;
    case "brokenGlass": return <BrokenGlass />;
    case "batSwarm": return <BatSwarm count={ev.count ?? 10} />;
    case "bloodMoon": return <BloodMoon />;
    case "vaultUnlock": return <VaultUnlock />;
    case "magicPortal": return <MagicPortal />;
    case "confetti": return <Confetti />;
    case "smokePuff": return <SmokePuff x={ev.x} y={ev.y} />;
    case "sparkleBurst": return <SparkleBurst x={ev.x} y={ev.y} />;
    case "flyToCart": return <FlyToCart x={ev.x} y={ev.y} />;
  }
};

/* ============================================================ */

const Thunder = () => (
  <>
    <div style={{ position: "absolute", inset: 0, background: "#FFFFFF", opacity: 0, animation: "pxfx-thunder-flash 700ms ease-out forwards" }} />
    <svg
      style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 120, height: "60vh" }}
      viewBox="0 0 20 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M12 0 L4 45 L11 45 L2 100"
        fill="none"
        stroke="#F7F4FF"
        strokeWidth="2"
        strokeLinejoin="miter"
        strokeDasharray="200"
        style={{ animation: "pxfx-bolt-draw 350ms ease-out forwards", filter: "drop-shadow(0 0 6px #FFFFFF)" }}
      />
    </svg>
  </>
);

const BrokenGlass = () => (
  <svg
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", animation: "pxfx-glass 900ms ease-out forwards" }}
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g stroke="#F7F4FF" strokeWidth="0.35" fill="none" opacity="0.9">
      <path d="M50 50 L10 10 M50 50 L90 5 M50 50 L95 40 M50 50 L85 90 M50 50 L45 95 M50 50 L5 60 M50 50 L15 90 M50 50 L60 8" />
      <path d="M22 20 L30 12 M70 15 L82 22 M85 45 L92 55 M75 80 L82 88 M25 82 L18 90 M12 55 L5 62" />
    </g>
  </svg>
);

const BatSwarm = ({ count }: { count: number }) => {
  const bats = Array.from({ length: count }).map((_, i) => ({
    id: i,
    top: `${5 + Math.random() * 70}%`,
    delay: `${(i * 80)}ms`,
    dur: `${2600 + Math.random() * 1400}ms`,
    ltr: Math.random() < 0.5,
    scale: 1 + Math.random() * 0.8,
  }));
  return (
    <>
      {bats.map((b) => (
        <div
          key={b.id}
          style={{
            position: "absolute", top: b.top, left: 0, right: 0,
            animation: `pxfx-drift ${b.dur} linear forwards`,
            animationDirection: b.ltr ? "normal" : "reverse",
            animationDelay: b.delay,
          }}
        >
          <div style={{ display: "inline-block", transform: `scale(${b.scale}) ${b.ltr ? "" : "scaleX(-1)"}`, animation: "pxfx-raven-flap 0.28s steps(2) infinite", filter: "drop-shadow(0 0 4px rgba(255,255,255,0.6))" }}>
            <BatSvg size={22} />
          </div>
        </div>
      ))}
    </>
  );
};

const BloodMoon = () => (
  <div style={{ position: "absolute", inset: 0, background: "rgba(122,15,30,0.15)", animation: "pxfx-glass 3500ms ease-in-out forwards" }}>
    <div style={{ position: "absolute", top: "8%", animation: "pxfx-drift 3500ms linear forwards", filter: "drop-shadow(0 0 12px rgba(122,15,30,0.7)) hue-rotate(320deg)" }}>
      <div style={{ transform: "scale(1.4)" }}>
        <svg width="48" height="48" viewBox="0 0 11 11" className="pxfx-crisp">
          <g fill="#7A0F1E">
            <rect x="1" y="2" width="9" height="7" />
            <rect x="2" y="1" width="7" height="9" />
          </g>
        </svg>
      </div>
    </div>
  </div>
);

const VaultUnlock = () => (
  <>
    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "pxfx-vault-lock 1600ms cubic-bezier(0.22,1,0.36,1) forwards", willChange: "transform, opacity", filter: "drop-shadow(0 0 8px rgba(184,154,232,0.5))" }}>
      <PadlockSvg size={64} />
    </div>
    <div style={{ position: "absolute", inset: 0, display: "flex", willChange: "transform, opacity" }}>
      <div style={{ flex: 1, background: "linear-gradient(90deg, #0B0910 0%, rgba(11,9,16,0.9) 60%, rgba(11,9,16,0) 100%)", animation: "pxfx-vault-open 1500ms cubic-bezier(0.22,1,0.36,1) forwards" }} />
      <div style={{ flex: 1, background: "linear-gradient(-90deg, #0B0910 0%, rgba(11,9,16,0.9) 60%, rgba(11,9,16,0) 100%)", animation: "pxfx-vault-open-r 1500ms cubic-bezier(0.22,1,0.36,1) forwards" }} />
    </div>
  </>
);


const MagicPortal = () => (
  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 240, height: 240, borderRadius: "50%", border: "3px solid #B8935A", boxShadow: "0 0 30px #B8935A, inset 0 0 30px #7A0F1E", animation: "pxfx-portal 900ms cubic-bezier(0.22,1,0.36,1) forwards" }} />
);

const Confetti = () => {
  const pieces = Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: ["#FFFFFF", "#B8935A", "#0A0A0A"][i % 3],
    delay: `${Math.random() * 400}ms`,
    dur: `${1800 + Math.random() * 1400}ms`,
    cx: `${(Math.random() - 0.5) * 200}px`,
    size: 3 + Math.floor(Math.random() * 3),
  }));
  return (
    <>
      {pieces.map((p) => (
        <div key={p.id} style={{
          position: "absolute", top: 0, left: p.left, width: p.size, height: p.size,
          background: p.color, animation: `pxfx-confetti ${p.dur} linear forwards`,
          animationDelay: p.delay, ["--cx" as any]: p.cx,
        }} />
      ))}
    </>
  );
};

const SmokePuff = ({ x, y }: { x: number; y: number }) => (
  <div style={{
    position: "absolute", left: x - 20, top: y - 20, width: 40, height: 40, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(199,189,217,0.7) 0%, rgba(199,189,217,0) 70%)",
    animation: "pxfx-puff 600ms ease-out forwards",
  }} />
);

const SparkleBurst = ({ x, y }: { x: number; y: number }) => {
  const bits = Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    angle: (i / 8) * Math.PI * 2,
    dist: 18 + Math.random() * 10,
    delay: `${i * 20}ms`,
  }));
  return (
    <>
      {bits.map((b) => (
        <div key={b.id} style={{
          position: "absolute",
          left: x + Math.cos(b.angle) * b.dist - 2,
          top: y + Math.sin(b.angle) * b.dist - 2,
          width: 3, height: 3, background: "#FFFFFF",
          boxShadow: "0 0 4px #B8935A",
          animation: "pxfx-sparkle 550ms ease-out forwards",
          animationDelay: b.delay,
        }} />
      ))}
    </>
  );
};

const FlyToCart = ({ x, y }: { x: number; y: number }) => {
  const target = findCartTarget();
  if (!target) return null;
  const tx = target.left + target.width / 2 - x;
  const ty = target.top + target.height / 2 - y;
  return (
    <div style={{
      position: "absolute", left: x - 11, top: y - 6, willChange: "transform, opacity",
      animation: "pxfx-fly 900ms cubic-bezier(0.5,0,0.6,1) forwards",
      ["--fx" as any]: "0px", ["--fy" as any]: "0px",
      ["--tx" as any]: `${tx}px`, ["--ty" as any]: `${ty}px`,
    }}>
      <div style={{ animation: "pxfx-raven-flap 0.2s steps(2) infinite", filter: "drop-shadow(0 0 4px rgba(255,255,255,0.7))" }}>
        <BatSvg size={22} />
      </div>
    </div>
  );
};

export default EffectLayer;
