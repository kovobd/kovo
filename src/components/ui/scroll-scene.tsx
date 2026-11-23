"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";

const useReduced = () => {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return r;
};

type Variant = "rise" | "zoom" | "tilt" | "cinematic" | "drift";

interface ScrollSceneProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  /** 0-1 multiplier, default 1 */
  intensity?: number;
  children: React.ReactNode;
}

/**
 * Premium scroll reveal. All variants are now calm fade + gentle rise —
 * no 3D, no perspective, no tilt, no parallax drift. Respects reduced motion.
 */
export const ScrollScene = React.forwardRef<HTMLDivElement, ScrollSceneProps>(
  ({ variant: _v = "cinematic", intensity = 1, className, children, style, ...rest }, ref) => {
    const innerRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);
    const reduced = useReduced();

    // Reveal via IntersectionObserver — elements already in (or above) the
    // viewport on mount render fully visible immediately, so there is no
    // initial blank-frame flicker. Below-the-fold elements fade up on enter.
    const [shown, setShown] = React.useState(false);
    React.useEffect(() => {
      if (reduced) { setShown(true); return; }
      const el = innerRef.current;
      if (!el) return;
      // If the element is already at/above the viewport bottom on mount, skip the fade.
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh * 0.95) { setShown(true); return; }
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
        { rootMargin: "0px 0px -8% 0px", threshold: 0.01 }
      );
      io.observe(el);
      return () => io.disconnect();
    }, [reduced]);

    const k = reduced ? 0 : Math.min(intensity, 1);

    return (
      <div ref={innerRef} className={cn("relative", className)} style={style} {...rest}>
        <div
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translate3d(0,0,0)" : `translate3d(0, ${18 * k}px, 0)`,
            transition: reduced ? undefined : "opacity 600ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1)",
            willChange: "transform, opacity",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
);
ScrollScene.displayName = "ScrollScene";

/**
 * Parallax image — flattened to a static cover image. Kept for API compatibility.
 */
interface ParallaxImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  speed?: number;
  scale?: number;
}
export const ParallaxImage: React.FC<ParallaxImageProps> = ({ className, style, src, speed: _s, scale: _sc, ...rest }) => {
  const resolved = typeof src === "string" ? resolveImageSrc(src, 1600) : src;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={resolved as string}
        style={style}
        className={cn("absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out hover:scale-[1.03]", className)}
        {...(rest as any)}
      />
    </div>
  );
};

/**
 * Section wrapper. Same fade-rise reveal as ScrollScene.
 */
export const CinematicSection = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { intensity?: number }
>(({ children, className, intensity = 1, ...rest }, ref) => {
  return (
    <section ref={ref} className={cn("relative", className)} {...rest}>
      <ScrollScene variant="rise" intensity={intensity}>{children}</ScrollScene>
    </section>
  );
});
CinematicSection.displayName = "CinematicSection";

/**
 * Former 3D tilt — now a calm hover lift. Kept for API compatibility.
 */
export const DeepTilt: React.FC<React.HTMLAttributes<HTMLDivElement> & { intensity?: number }> = ({
  children,
  className,
  intensity: _i,
  ...rest
}) => {
  return (
    <div
      className={cn(
        "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 will-change-transform",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
};
