// Shared singleton React Query client.
//
// Re-exported and used as the app-wide cache by <QueryClientProvider> in
// App.tsx. Exposing it as a module-level singleton lets non-component code
// paths (e.g. `useEffect` data loaders that need cache sharing across admin
// pages) reach the same cache without prop-drilling or window globals.
import { QueryClient } from "@tanstack/react-query";

/** Shared with the server renderer (src/entry-server.tsx), which needs identical behaviour. */
export const queryClientDefaults = {
  queries: {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
} as const;

export const queryClient = new QueryClient({ defaultOptions: queryClientDefaults });
