/**
 * Review Hero settings — headline, subtitle, customer avatars (R2 refs).
 * Singleton row keyed by id=1.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await (supabase
        .from("review_hero_settings" as any) as any)
        .select("headline, subtitle, avatars")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
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
