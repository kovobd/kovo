/**
 * Imperative Pixel-FX bus.
 * Any component can call `pixelFx.thunder()` etc.; the mounted
 * <EffectLayer /> subscribes and renders the visual once.
 *
 * All effects respect prefers-reduced-motion (the root layer hides
 * itself via CSS, so calls become no-ops visually).
 */

export type FxEvent =
  | { type: "thunder" }
  | { type: "brokenGlass" }
  | { type: "batSwarm"; count?: number }
  | { type: "bloodMoon" }
  | { type: "vaultUnlock" }
  | { type: "magicPortal" }
  | { type: "confetti" }
  | { type: "smokePuff"; x: number; y: number }
  | { type: "sparkleBurst"; x: number; y: number }
  | { type: "flyToCart"; x: number; y: number };

type Listener = (ev: FxEvent) => void;
const listeners = new Set<Listener>();

export const pixelFxBus = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(ev: FxEvent) {
    listeners.forEach((l) => l(ev));
  },
};

export const pixelFx = {
  thunder: () => pixelFxBus.emit({ type: "thunder" }),
  brokenGlass: () => pixelFxBus.emit({ type: "brokenGlass" }),
  batSwarm: (count = 10) => pixelFxBus.emit({ type: "batSwarm", count }),
  bloodMoon: () => pixelFxBus.emit({ type: "bloodMoon" }),
  vaultUnlock: () => pixelFxBus.emit({ type: "vaultUnlock" }),
  magicPortal: () => pixelFxBus.emit({ type: "magicPortal" }),
  confetti: () => pixelFxBus.emit({ type: "confetti" }),
  smokePuff: (x: number, y: number) => pixelFxBus.emit({ type: "smokePuff", x, y }),
  sparkleBurst: (x: number, y: number) => pixelFxBus.emit({ type: "sparkleBurst", x, y }),
  flyToCart: (x: number, y: number) => pixelFxBus.emit({ type: "flyToCart", x, y }),
};

// Expose on window so ad-hoc consumers (analytics, admin buttons, etc.)
// can trigger effects without importing this module.
declare global {
  interface Window { pixelFx?: typeof pixelFx }
}
if (typeof window !== "undefined") window.pixelFx = pixelFx;
