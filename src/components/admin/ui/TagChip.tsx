import * as React from "react";
import { cn } from "@/lib/utils";

interface TagChipProps {
  children: React.ReactNode;
  hash?: boolean;
  onClick?: () => void;
  className?: string;
}

const TagChip = ({ children, hash, onClick, className }: TagChipProps) => {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn("a-chip", onClick && "cursor-pointer", className)}
      type={onClick ? "button" : undefined}
    >
      {hash && <span className="opacity-50">#</span>}
      {children}
    </Comp>
  );
};

export default TagChip;
