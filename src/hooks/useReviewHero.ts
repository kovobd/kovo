/**
 * Review Hero settings — headline, subtitle, customer avatars (R2 refs).
 * Singleton row keyed by id=1.
 */
import { publicRestOne } from "@/lib/publicRest";
import { REST_QUERIES } from "@/lib/publicRestQueries";
import { useQuery } from "@tanstack/react-query";

export interface ReviewHeroAvatar {
  r2_key: string;
  sort_order: number;
}

export interface ReviewHeroSettings {
  headline: string;
  subtitle: string;
  avatars: ReviewHeroAvatar[];
}

export const DEFAULT_REVIEW_HERO: ReviewHeroSettings = {
  headline: "Loved by our customers.",
  subtitle: "Trusted by thousands of happy customers — real photos, real videos, real stories.",
  avatars: [],
};

export const useReviewHero = () =>
  useQuery({
    queryKey: ["review-hero-settings"],
    queryFn: async (): Promise<ReviewHeroSettings> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await publicRestOne<any>(REST_QUERIES.reviewHero);
      if (!data) return DEFAULT_REVIEW_HERO;
      const avatars = Array.isArray(data.avatars) ? data.avatars : [];
      return {
        headline: data.headline ?? DEFAULT_REVIEW_HERO.headline,
        subtitle: data.subtitle ?? DEFAULT_REVIEW_HERO.subtitle,
        avatars: avatars
          .filter((a: any) => a && typeof a.r2_key === "string")
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) as ReviewHeroAvatar[],
      };
    },
    staleTime: 60_000,
  });
