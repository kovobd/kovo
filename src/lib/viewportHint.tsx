// Whether the page is being shown on a phone-sized screen, as guessed by the
// Cloudflare Worker from the request headers when it server-renders a page.
//
// The server cannot measure the screen, so it renders a phone or a desktop
// version from that guess, and the browser must start hydration with the same
// answer (window.__kovoSSRMobile), correcting it right after mount if the real
// screen disagrees. null means no guess: measure the screen directly.
import { createContext, useContext } from "react";

export const ViewportHintContext = createContext<boolean | null>(null);

export function useViewportHint(): boolean | null {
  return useContext(ViewportHintContext);
}

/** The Worker's guess embedded in a server-rendered page, or null. */
export function ssrViewportHint(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = (window as unknown as { __kovoSSR?: boolean; __kovoSSRMobile?: boolean });
  return v.__kovoSSR && typeof v.__kovoSSRMobile === "boolean" ? v.__kovoSSRMobile : null;
}
