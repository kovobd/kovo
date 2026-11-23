import { useEffect, useRef } from "react";
import { useCartStore } from "@/data/cartStore";

/**
 * Elegant "soul capture" add-to-cart flourish: a curl of soft dark
 * smoke rising from the click point toward the header cart icon,
 * with a gentle glow + shake on the cart itself. No pixel bats, no
 * sparkle burst — the effect stays cinematic and premium.
 */
const CartWatcher = () => {
  const totalItems = useCartStore((s) => s.totalItems());
  const prevRef = useRef(totalItems);
  const pointRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const track = (e: PointerEvent) => { pointRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", track, { passive: true });
    return () => window.removeEventListener("pointerdown", track);
  }, []);

  useEffect(() => {
    if (totalItems > prevRef.current) {
      const { x, y } = pointRef.current;
      if (typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        spawnSoulSmoke(x, y);
        pulseCart();
      }
    }
    prevRef.current = totalItems;
  }, [totalItems]);

  return null;
};

function pulseCart() {
  const el = document.querySelector<HTMLElement>('[data-pixelfx-target="cart"]');
  if (!el) return;
  el.classList.remove("gv-cart-shake", "gv-cart-glow");
  void el.offsetWidth;
  el.classList.add("gv-cart-shake", "gv-cart-glow");
  window.setTimeout(() => {
    el.classList.remove("gv-cart-shake", "gv-cart-glow");
  }, 700);
}

function spawnSoulSmoke(x: number, y: number) {
  const target = document.querySelector<HTMLElement>('[data-pixelfx-target="cart"]');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const tx = rect.left + rect.width / 2 - x;
  const ty = rect.top + rect.height / 2 - y;
  for (let i = 0; i < 6; i++) {
    const puff = document.createElement("span");
    const jitterX = (Math.random() - 0.5) * 30;
    const jitterY = (Math.random() - 0.5) * 20;
    puff.style.cssText = `position:fixed;left:${x - 10}px;top:${y - 10}px;width:20px;height:20px;border-radius:50%;pointer-events:none;z-index:95;background:radial-gradient(circle, rgba(30,20,45,0.85) 0%, rgba(184,154,232,0.35) 55%, transparent 75%);filter:blur(4px);--tx:${tx + jitterX}px;--ty:${ty + jitterY}px;animation:gv-soul-smoke ${600 + i * 45}ms cubic-bezier(0.4,0,0.2,1) forwards;animation-delay:${i * 35}ms;`;
    document.body.appendChild(puff);
    window.setTimeout(() => puff.remove(), 1000 + i * 50);
  }
}

export default CartWatcher;
