/**
 * Slow, always-on fog drift. Two layered gradient bands crossing
 * the viewport with different speeds. Extremely low opacity,
 * GPU-only (transform + opacity). Never blocks pointer events.
 */
const ContinuousFog = () => (
  <div
    aria-hidden="true"
    style={{
      position: "fixed",
      inset: 0,
      pointerEvents: "none",
      zIndex: 3,
      overflow: "hidden",
      mixBlendMode: "screen",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: "10%",
        left: "-50%",
        width: "200%",
        height: "60%",
        background:
          "radial-gradient(ellipse at 30% 50%, rgba(199,189,217,0.08) 0%, transparent 55%), radial-gradient(ellipse at 70% 40%, rgba(184,154,232,0.06) 0%, transparent 60%)",
        filter: "blur(40px)",
        animation: "gv-fog-drift-a 90s linear infinite",
        willChange: "transform, opacity",
      }}
    />
    <div
      style={{
        position: "absolute",
        top: "40%",
        left: "-60%",
        width: "220%",
        height: "50%",
        background:
          "radial-gradient(ellipse at 60% 50%, rgba(107,90,147,0.07) 0%, transparent 60%)",
        filter: "blur(50px)",
        animation: "gv-fog-drift-b 130s linear infinite",
        willChange: "transform, opacity",
      }}
    />
  </div>
);

export default ContinuousFog;
