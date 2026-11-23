import { useEffect, useRef, useState } from "react";

/**
 * PixelBat — ambient 8-bit bat that occasionally flies across the viewport.
 *
 * - Pure CSS pixel-art (box-shadow sprite), no external image.
 * - Wing flap uses steps() to preserve pixel-art feel.
 * - Flight path is computed in JS with rAF for smooth translate3d only.
 * - Respects prefers-reduced-motion (renders a small static bat in the corner).
 * - Hides itself when a header/menu/search/cart-drawer opens (body[style*=overflow: hidden]).
 */

type Point = { x: number; y: number };

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

// Pick a random edge point outside the viewport for spawn/exit.
const edgePoint = (side: "left" | "right" | "top" | "bottom", w: number, h: number): Point => {
  switch (side) {
    case "left": return { x: -60, y: rand(40, h - 60) };
    case "right": return { x: w + 60, y: rand(40, h - 60) };
    case "top": return { x: rand(40, w - 60), y: -60 };
    case "bottom": return { x: rand(40, w - 60), y: h + 60 };
  }
};

const sides: Array<"left" | "right" | "top" | "bottom"> = ["left", "right", "top", "bottom"];

const PixelBat = () => {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Hide when any modal/drawer is open (site pattern: body overflow hidden).
  useEffect(() => {
    const check = () => {
      const overflow = document.body.style.overflow;
      const hidden = overflow === "hidden";
      setVisible((v) => (hidden ? false : v));
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    let scheduleTimer: number | null = null;

    const flight = () => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      // Pick two distinct edges for start and end.
      const startSide = sides[randInt(0, 3)];
      let endSide = sides[randInt(0, 3)];
      while (endSide === startSide) endSide = sides[randInt(0, 3)];
      const start = edgePoint(startSide, w, h);
      const end = edgePoint(endSide, w, h);

      const duration = rand(9000, 15000); // ms — total flight
      const startTime = performance.now();
      // Waypoints add altitude variance + curves.
      const waypoints: Point[] = [
        start,
        { x: rand(0, w), y: rand(60, h - 60) },
        { x: rand(0, w), y: rand(60, h - 60) },
        end,
      ];

      // Hover pauses along the way.
      const hoverAt = Math.random() < 0.7 ? rand(0.35, 0.7) : -1; // fraction of duration
      const hoverDur = rand(1000, 2000);

      setVisible(true);
      el.style.opacity = "1";

      // Cubic bezier position along waypoints.
      const bezier = (t: number, pts: Point[]): Point => {
        const p = pts.map((pt) => ({ ...pt }));
        for (let k = p.length - 1; k > 0; k--) {
          for (let i = 0; i < k; i++) {
            p[i].x = p[i].x * (1 - t) + p[i + 1].x * t;
            p[i].y = p[i].y * (1 - t) + p[i + 1].y * t;
          }
        }
        return p[0];
      };

      let hoverStarted = -1;
      const tick = (now: number) => {
        if (cancelled || !ref.current) return;
        const elapsed = now - startTime;
        let progress = Math.min(1, elapsed / duration);

        // Handle hover pause.
        if (hoverAt > 0 && progress >= hoverAt && hoverStarted < 0) {
          hoverStarted = now;
        }
        if (hoverStarted > 0 && now - hoverStarted < hoverDur) {
          progress = hoverAt;
        } else if (hoverStarted > 0) {
          const shift = (now - hoverStarted - hoverDur);
          progress = Math.min(1, (elapsed - hoverDur) / duration);
          if (shift < 0) progress = hoverAt;
        }

        const pt = bezier(progress, waypoints);
        // Subtle vertical bob during hover.
        const bob = hoverStarted > 0 && now - hoverStarted < hoverDur
          ? Math.sin((now - hoverStarted) / 180) * 3
          : Math.sin(now / 260) * 2;
        // Random-ish rotation between -8..8 based on horizontal velocity direction.
        const dx = end.x - start.x;
        const rot = Math.max(-8, Math.min(8, (dx / Math.max(1, Math.abs(dx))) * 6 + Math.sin(now / 500) * 2));

        ref.current.style.transform = `translate3d(${pt.x}px, ${pt.y + bob}px, 0) rotate(${rot}deg)`;

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          el.style.opacity = "0";
          setVisible(false);
          const wait = rand(5000, 15000);
          scheduleTimer = window.setTimeout(flight, wait);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    // Kick off after a short initial delay.
    scheduleTimer = window.setTimeout(flight, rand(2500, 6000));

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (scheduleTimer) clearTimeout(scheduleTimer);
    };
  }, [reduced]);

  if (reduced) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-3 right-3 z-[5] opacity-70"
        style={{ width: 16, height: 10 }}
      >
        <BatSprite scale={1} />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[5] transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0, willChange: "transform, opacity" }}
    >
      <BatSprite scale={1.4} />
    </div>
  );
};

/**
 * Pixel-art bat rendered with box-shadow "pixels" from a single element.
 * Two frames alternated via steps(2) keyframes for wing flap.
 */
const BatSprite = ({ scale = 1 }: { scale?: number }) => {
  const px = 2 * scale;
  const c = "#FFFFFF";
  const h = "#E5E5E5";
  // Pixel coords for two frames (11 wide x 6 tall grid).
  // Frame A: wings up. Frame B: wings down.
  const frames = [
    // wings up
    [
      [0,1],[1,1],[9,1],[10,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],
      [2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],
      [3,4],[7,4],
    ],
    // wings down
    [
      [1,2],[9,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],
      [3,5],[7,5],
    ],
  ] as const;

  const shadowFor = (frame: readonly (readonly number[])[]) =>
    frame
      .map(([x, y]) => `${x * px}px ${y * px}px 0 ${c}`)
      .concat(frame.filter(([, y]) => y === 3).map(([x, y]) => `${x * px}px ${y * px}px 0 ${h}`))
      .join(",");

  return (
    <div style={{ position: "relative", width: 11 * px, height: 6 * px }}>
      <style>{`
        @keyframes bat-flap-${scale.toString().replace(".", "-")} {
          0% { box-shadow: ${shadowFor(frames[0])}; }
          100% { box-shadow: ${shadowFor(frames[1])}; }
        }
      `}</style>
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: px,
          height: px,
          background: "transparent",
          imageRendering: "pixelated",
          boxShadow: shadowFor(frames[0]),
          animation: `bat-flap-${scale.toString().replace(".", "-")} 0.4s steps(2) infinite`,
        }}
      />
    </div>
  );
};

export default PixelBat;
