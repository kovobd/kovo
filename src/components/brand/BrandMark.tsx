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
 * Kovo wordmark: "KOVO." in bold. Set in type rather than an image so it
 * stays crisp at any size and needs no asset request.
 */
const BrandMark = ({ className, size = "md", invert = false }: BrandMarkProps) => (
  <span
    role="img"
    aria-label="Kovo"
    className={cn(
      "inline-block select-none font-display font-bold uppercase leading-none tracking-[0.32em]",
      invert ? "text-background" : "text-foreground",
      sizeMap[size],
      className,
    )}
  >
    {/* The last letter carries no tracking, so the full stop sits right after
        it and nothing trails past the word (the mark stays centred). */}
    Kov<span className="tracking-normal">o.</span>
  </span>
);

export default BrandMark;
