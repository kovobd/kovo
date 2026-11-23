import { useMemo } from "react";

/**
 * Subtle floating dust motes for the hero section.
 * Pure CSS animations, GPU-accelerated (transform + opacity only).
 * Respects prefers-reduced-motion via the .gv-particles CSS rules.
 */
const HeroParticles = ({ count = 14 }: { count?: number }) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const size = 1 + Math.random() * 2.2;
      const left = Math.random() * 100;
      const top = 20 + Math.random() * 70;
      const dur = 14 + Math.random() * 16;
      const delay = -Math.random() * dur;
      const drift = -20 + Math.random() * 40;
      const opacity = 0.18 + Math.random() * 0.22;
      return { i, size, left, top, dur, delay, drift, opacity };
    });
  }, [count]);

  return (
    <div className="gv-particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.i}
          className="gv-particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            ["--gv-drift" as any]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
};

export default HeroParticles;
