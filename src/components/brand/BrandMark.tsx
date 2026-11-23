import { cn } from "@/lib/utils";
import logoUrl from "@/assets/gothic-vault-logo.png";

interface BrandMarkProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  invert?: boolean;
}

/**
 * Size classes are tuned so the mark always fits inside the header row:
 *  - Desktop header is 80px (h-20)  → lg mark = 72px (≈90%)
 *  - Mobile  header is 64px (h-16)  → md mark = 56px (≈88%)
 * Height-only classes + `w-auto` + `object-contain` keep the aspect ratio
 * intact and prevent any vertical overflow of the header bar.
 */
const sizeMap = {
  sm: "h-12",           // 48px
  md: "h-[68px]",       // 68px — mobile header (+20%)
  lg: "h-[88px]",       // 88px — desktop header (+20%)
  xl: "h-28",           // 112px — hero / footer accents
};

/**
 * Gothic Vault brand mark.
 *
 * The logo is imported as a module so Vite emits a fingerprinted asset
 * in `dist/assets/` at build time. This makes the reference deployment-safe
 * on any static host (Cloudflare Workers/Pages, Netlify, Vercel, S3, …) —
 * no reliance on Lovable's `/__l5e/` asset proxy which only exists inside
 * the Lovable preview/publish infrastructure.
 */
const BrandMark = ({ className, size = "md", invert = false }: BrandMarkProps) => (
  <img
    src={logoUrl}
    alt="Gothic Vault Logo"
    width={1000}
    height={1000}
    loading="eager"
    decoding="async"
    className={cn(
      "w-auto max-h-full select-none object-contain",
      sizeMap[size],
      invert && "brightness-0 invert",
      className,
    )}
    draggable={false}
  />
);

export default BrandMark;
