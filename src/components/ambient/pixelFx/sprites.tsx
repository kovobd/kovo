import type { CSSProperties } from "react";

/**
 * Shared pixel-art sprites. All rendered as <svg> with crispEdges
 * so they stay razor-sharp at any size.
 *
 * Palette (Gothic Vault ambient):
 *   #FFFFFF  primary pixel white
 *   #E5E5E5  soft highlight
 *   #B8935A  antique gold
 *   #7A0F1E  blood red / wax seal
 *   #C7BDD9  moonlight lavender
 *   #0A0A0A  ink
 */

type SvgSize = { size?: number; className?: string; style?: CSSProperties };

/* ---------- 8-bit bat (2 frames stitched via CSS animation) --- */
export const BatSvg = ({ size = 22, className, style }: SvgSize) => (
  <svg
    width={size}
    height={(size * 6) / 11}
    viewBox="0 0 11 6"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#FFFFFF">
      <rect x="0" y="1" width="2" height="1" />
      <rect x="9" y="1" width="2" height="1" />
      <rect x="1" y="2" width="9" height="1" />
      <rect x="2" y="3" width="7" height="1" />
      <rect x="3" y="4" width="1" height="1" />
      <rect x="7" y="4" width="1" height="1" />
    </g>
    <g fill="#E5E5E5" opacity="0.7">
      <rect x="4" y="3" width="3" height="1" />
    </g>
  </svg>
);

/* ---------- Raven (larger flying bird) ------------------------ */
export const RavenSvg = ({ size = 28, className, style }: SvgSize) => (
  <svg
    width={size}
    height={(size * 7) / 14}
    viewBox="0 0 14 7"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#FFFFFF">
      <rect x="0" y="2" width="3" height="1" />
      <rect x="11" y="2" width="3" height="1" />
      <rect x="2" y="3" width="10" height="1" />
      <rect x="3" y="4" width="8" height="1" />
      <rect x="5" y="5" width="4" height="1" />
      <rect x="6" y="1" width="2" height="1" />
      <rect x="6" y="6" width="2" height="1" />
    </g>
  </svg>
);

/* ---------- Crescent moon ------------------------------------ */
export const MoonSvg = ({ size = 44, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 11 11"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#E5E5E5">
      <rect x="4" y="1" width="3" height="1" />
      <rect x="2" y="2" width="6" height="1" />
      <rect x="2" y="3" width="4" height="1" />
      <rect x="1" y="4" width="4" height="1" />
      <rect x="1" y="5" width="4" height="1" />
      <rect x="1" y="6" width="4" height="1" />
      <rect x="2" y="7" width="4" height="1" />
      <rect x="2" y="8" width="6" height="1" />
      <rect x="4" y="9" width="3" height="1" />
    </g>
    <g fill="#FFFFFF" opacity="0.75">
      <rect x="3" y="4" width="1" height="1" />
      <rect x="2" y="6" width="1" height="1" />
    </g>
  </svg>
);

/* ---------- Star (twinkle) ----------------------------------- */
export const StarPx = ({ size = 3, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 3 3"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#FFFFFF">
      <rect x="1" y="0" width="1" height="1" />
      <rect x="0" y="1" width="3" height="1" />
      <rect x="1" y="2" width="1" height="1" />
    </g>
  </svg>
);

/* ---------- Ghost (404) -------------------------------------- */
export const GhostSvg = ({ size = 32, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 9 10"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#F7F4FF" opacity="0.95">
      <rect x="2" y="0" width="5" height="1" />
      <rect x="1" y="1" width="7" height="1" />
      <rect x="1" y="2" width="7" height="1" />
      <rect x="1" y="3" width="7" height="1" />
      <rect x="1" y="4" width="7" height="1" />
      <rect x="1" y="5" width="7" height="1" />
      <rect x="1" y="6" width="7" height="1" />
      <rect x="1" y="7" width="7" height="1" />
      <rect x="0" y="8" width="2" height="1" />
      <rect x="3" y="8" width="2" height="1" />
      <rect x="6" y="8" width="2" height="1" />
    </g>
    <g fill="#0A0A0A">
      <rect x="3" y="3" width="1" height="2" />
      <rect x="5" y="3" width="1" height="2" />
    </g>
  </svg>
);

/* ---------- Gravestone (404) --------------------------------- */
export const GravestoneSvg = ({ size = 60, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 11 12"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#C7BDD9">
      <rect x="3" y="1" width="5" height="1" />
      <rect x="2" y="2" width="7" height="1" />
      <rect x="1" y="3" width="9" height="7" />
    </g>
    <g fill="#0A0A0A">
      <rect x="4" y="5" width="3" height="1" />
      <rect x="5" y="6" width="1" height="2" />
    </g>
    <g fill="#2B2337">
      <rect x="0" y="10" width="11" height="2" />
    </g>
  </svg>
);

/* ---------- Skull / cross (toast error) ---------------------- */
export const SkullSvg = ({ size = 16, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 7 7"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#FFFFFF">
      <rect x="1" y="1" width="5" height="4" />
      <rect x="2" y="5" width="3" height="1" />
    </g>
    <g fill="#7A0F1E">
      <rect x="2" y="2" width="1" height="2" />
      <rect x="4" y="2" width="1" height="2" />
      <rect x="3" y="5" width="1" height="1" />
    </g>
  </svg>
);

/* ---------- Wax seal check (toast success) ------------------- */
export const WaxSealSvg = ({ size = 16, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 7 7"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#2E6A3E">
      <rect x="1" y="1" width="5" height="5" />
      <rect x="0" y="2" width="7" height="3" />
      <rect x="2" y="0" width="3" height="7" />
    </g>
    <g fill="#FFFFFF">
      <rect x="2" y="3" width="1" height="1" />
      <rect x="3" y="4" width="1" height="1" />
      <rect x="4" y="3" width="1" height="1" />
      <rect x="5" y="2" width="1" height="1" />
    </g>
  </svg>
);

/* ---------- Feather (toast info) ----------------------------- */
export const FeatherSvg = ({ size = 16, className, style }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 7 7"
    className={`pxfx-crisp ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  >
    <g fill="#C7BDD9">
      <rect x="4" y="0" width="2" height="1" />
      <rect x="3" y="1" width="3" height="1" />
      <rect x="2" y="2" width="4" height="1" />
      <rect x="1" y="3" width="4" height="1" />
      <rect x="1" y="4" width="3" height="1" />
      <rect x="0" y="5" width="3" height="1" />
      <rect x="0" y="6" width="1" height="1" />
    </g>
  </svg>
);

/* ---------- Candle flame (loader) ---------------------------- */
export const CandleSvg = ({ size = 32 }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 9 12"
    className="pxfx-crisp"
    aria-hidden="true"
  >
    {/* Flame */}
    <g style={{ transformOrigin: "50% 60%", animation: "pxfx-candle 0.6s steps(4) infinite" }}>
      <g fill="#F7F4FF">
        <rect x="4" y="1" width="1" height="1" />
        <rect x="3" y="2" width="3" height="1" />
        <rect x="3" y="3" width="3" height="2" />
        <rect x="4" y="5" width="1" height="1" />
      </g>
      <g fill="#B8935A">
        <rect x="4" y="3" width="1" height="1" />
      </g>
    </g>
    {/* Candle */}
    <g fill="#C7BDD9">
      <rect x="3" y="6" width="3" height="5" />
    </g>
    <g fill="#B8935A">
      <rect x="2" y="11" width="5" height="1" />
    </g>
  </svg>
);

/* ---------- Padlock (vault unlock) --------------------------- */
export const PadlockSvg = ({ size = 48 }: SvgSize) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 11 12"
    className="pxfx-crisp"
    aria-hidden="true"
  >
    <g fill="#B8935A">
      <rect x="2" y="6" width="7" height="5" />
      <rect x="3" y="2" width="1" height="4" />
      <rect x="7" y="2" width="1" height="4" />
      <rect x="4" y="1" width="3" height="1" />
    </g>
    <g fill="#0A0A0A">
      <rect x="5" y="8" width="1" height="1" />
    </g>
  </svg>
);
