// Helpers for components that read browser-only state (localStorage, the
// cart, session flags) on a server-rendered page.
//
// While the browser hydrates server HTML, a component's first render must
// produce what the server produced, which knows nothing about this visitor's
// storage. Such components start with the server's value and switch to the
// stored one right after mount (a normal re-render, not a mismatch).
import { startTransition, useEffect, useState } from "react";

// The URL whose server-rendered HTML is being hydrated. Components mounted
// after a client-side navigation read real values straight away.
let ssrHref: string | null = null;

/** Called by src/main.tsx just before hydrating server-rendered HTML. */
export function markHydrating(): void {
  if (typeof window !== "undefined") ssrHref = window.location.href;
}

export function isHydratingSsr(): boolean {
  return ssrHref !== null && typeof window !== "undefined" && window.location.href === ssrHref;
}

/**
 * True while rendering on the server or hydrating its HTML. Things that are
 * normally revealed by JavaScript (scroll fades, image fade-ins) start
 * visible then, so server-rendered content shows before any script runs.
 */
export function isServerOrHydrating(): boolean {
  return typeof window === "undefined" || isHydratingSsr();
}

/**
 * A value read from the browser. On a server-rendered page it is
 * `serverValue` for the first render (matching the HTML), then `read()`.
 */
export function useBrowserValue<T>(read: () => T, serverValue: T): T {
  const [value, setValue] = useState<T>(() => (isServerOrHydrating() ? serverValue : read()));
  useEffect(() => {
    const next = read();
    // A transition, so parts of the page still hydrating are not re-rendered
    // from scratch for it (React would otherwise drop their server HTML).
    startTransition(() => setValue((prev) => (Object.is(prev, next) ? prev : next)));
    // Read once after mount; callers keep their own subscriptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** False during the first render of a server-rendered page, true after it (and always true otherwise). */
export function useAfterHydration(): boolean {
  return useBrowserValue(() => true, false);
}
