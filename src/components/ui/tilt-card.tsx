"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Deprecated — kept for API compatibility. */
  intensity?: number;
  /** Deprecated — kept for API compatibility. */
  disabled?: boolean;
  /** Deprecated — kept for API compatibility. */
  perspective?: number;
  /** Whether to lift the card slightly on hover. */
  lift?: boolean;
  children: React.ReactNode;
}

/**
 * Premium hover wrapper. Replaces the former 3D tilt with a calm,
 * luxury hover: a subtle lift and shadow softening. No 3D, no rotation.
 */
export const TiltCard = React.forwardRef<HTMLDivElement, TiltCardProps>(
  ({ children, className, lift = true, style, intensity: _i, disabled: _d, perspective: _p, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          lift && "hover:-translate-y-1",
          className
        )}
        style={style}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
TiltCard.displayName = "TiltCard";
