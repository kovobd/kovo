import { useEffect, useRef } from "react";

/**
 * Canvas-based floating ash. Sparse (max 40 particles desktop,
 * 18 mobile), drifts slowly upward, subtle mouse parallax.
 * Pauses when the tab is hidden. Skips on reduced motion.
 */
const AshParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const MAX = isMobile ? 8 : 20;


    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number; life: number; max: number };
    const parts: P[] = [];

    const spawn = (): P => ({
      x: Math.random() * w,
      y: h + 10,
      vx: (Math.random() - 0.5) * 0.1,
      vy: -0.08 - Math.random() * 0.18,
      r: 1.2 + Math.random() * 2.4,
      o: 0.06 + Math.random() * 0.14,
      life: 0,
      max: 9000 + Math.random() * 10000,
    });


    for (let i = 0; i < MAX; i++) {
      const p = spawn();
      p.y = Math.random() * h;
      p.life = Math.random() * p.max;
      parts.push(p);
    }

    const mouse = { x: 0, y: 0, active: false };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    if (!isMobile) window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    let running = true;

    const onVis = () => {
      running = !document.hidden;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const loop = (t: number) => {
      if (!running) return;
      const dt = Math.min(48, t - last);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life += dt;
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14400) {
            const f = (1 - d2 / 14400) * 0.08;
            p.x += dx * f * 0.02;
            p.y += dy * f * 0.02;
          }
        }
        const fade = p.life > p.max * 0.8 ? Math.max(0, 1 - (p.life - p.max * 0.8) / (p.max * 0.2)) : 1;
        ctx.globalAlpha = p.o * fade;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grad.addColorStop(0, "rgba(199,189,217,1)");
        grad.addColorStop(0.5, "rgba(199,189,217,0.5)");
        grad.addColorStop(1, "rgba(199,189,217,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();

        if (p.life >= p.max || p.y < -10 || p.x < -10 || p.x > w + 10) {
          parts[i] = spawn();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 4,
      }}
    />
  );
};

export default AshParticles;
