import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  invert?: boolean;
}

/** Text sizes tuned to sit inside the header row (64px mobile, 80px desktop). */
const sizeMap = {
  sm: "text-[18px]",
  md: "text-[22px]",
  lg: "text-[26px]",
  xl: "text-[34px]",
};

/**
 * Kovo wordmark. Set in type rather than an image so it stays crisp at any
 * size and needs no asset request.
 */
const BrandMark = ({ className, size = "md", invert = false }: BrandMarkProps) => (
  <span
    role="img"
    aria-label="Kovo"
    className={cn(
      "inline-block select-none font-display font-medium uppercase leading-none tracking-[0.32em] -mr-[0.32em]",
      invert ? "text-background" : "text-foreground",
      sizeMap[size],
      className,
    )}
  >
    Kovo
  </span>
);

export default BrandMark;
