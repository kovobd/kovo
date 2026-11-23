import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  queryKey: readonly unknown[];
  className?: string;
}

export default function RefreshButton({ queryKey, className = "" }: Props) {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  const refresh = async () => {
    setSpinning(true);
    try {
      await qc.invalidateQueries({ queryKey: queryKey as any });
    } finally {
      setTimeout(() => setSpinning(false), 400);
    }
  };

  return (
    <button
      type="button"
      onClick={refresh}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-medium border border-border/40 bg-background hover:bg-muted/50 transition-colors ${className}`}
    >
      <RefreshCw size={13} className={spinning ? "animate-spin" : ""} />
      Refresh
    </button>
  );
}
