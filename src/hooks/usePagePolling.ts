import { useEffect } from "react";
import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";

/**
 * useQuery variant that polls at `intervalMs` only while the tab is visible.
 * On `visibilitychange` -> hidden: nothing (interval naturally pauses).
 * On `visibilitychange` -> visible: triggers a one-shot refetch.
 * Always disables refetch-on-focus to avoid double-firing.
 */
export function usePagePolling<T>(
  options: UseQueryOptions<T, Error, T, QueryKey> & { intervalMs?: number },
) {
  const intervalMs = options.intervalMs ?? 60_000;

  const q = useQuery<T, Error>({
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      if (typeof document === "undefined") return false;
      return document.visibilityState === "visible" ? intervalMs : false;
    },
    refetchIntervalInBackground: false,
    ...options,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "visible") q.refetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [q]);

  return q;
}
