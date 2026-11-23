/**
 * Deferred providers loaded via `React.lazy` after the initial paint.
 *
 * `TooltipProvider`, `Toaster` (shadcn), and `Sonner` all pull in Radix
 * primitives and are not needed for the LCP frame — tooltips only fire on
 * hover and toasters only mount portals when triggered. Splitting them
 * off keeps ~15–25 KB of Radix bootstrap code out of the critical path.
 */
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const DeferredProviders = () => (
  <TooltipProvider delayDuration={100}>
    <Toaster />
    <Sonner />
  </TooltipProvider>
);

export default DeferredProviders;
