import { useQuery } from "@tanstack/react-query";
import { fetchSiteReviews, type SiteReviewRow } from "@/lib/reviewsApi";

export function useSiteReviews(opts: { includeHidden?: boolean } = {}) {
  return useQuery({
    queryKey: ["site-reviews", { hidden: !!opts.includeHidden }],
    queryFn: () => fetchSiteReviews(opts),
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });
}

export type { SiteReviewRow };
