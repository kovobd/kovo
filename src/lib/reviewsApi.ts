/**
 * Site reviews data access. All media references are Cloudflare R2 (r2:/r2o:)
 * or external video URLs (YouTube/Vimeo). No Supabase Storage paths are used.
 */
import { publicRest } from "@/lib/publicRest";
import { REST_QUERIES } from "@/lib/publicRestQueries";
import { getSupabase } from "@/lib/supabaseLazy";

export type ReviewType = "photo" | "video" | "text";
export type ReviewMediaKind = "image" | "video";
export type ReviewVideoProvider = "upload" | "youtube" | "vimeo";

export interface ReviewMediaRow {
  id: string;
  review_id: string;
  kind: ReviewMediaKind;
  provider: ReviewVideoProvider | null;
  external_video_id: string | null;
  r2_key: string | null;
  url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  duration_seconds: number | null;
  sort_order: number;
}

export interface SiteReviewRow {
  id: string;
  reviewer_name: string;
  location: string | null;
  review_date: string;
  title: string | null;
  body: string | null;
  rating: number;
  review_type: ReviewType;
  is_verified_purchase: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  media?: ReviewMediaRow[];
}

export async function fetchSiteReviews(opts: { includeHidden?: boolean } = {}): Promise<SiteReviewRow[]> {
  // Shoppers (visible reviews only) read the edge-cached copy.
  if (!opts.includeHidden) return sortReviewMedia(await publicRest<SiteReviewRow[]>(REST_QUERIES.siteReviews));
  const supabase = await getSupabase();
  const q = supabase
    .from("site_reviews" as any)
    .select("*, media:site_review_media(*)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (!opts.includeHidden) (q as any).eq("is_visible", true);
  const { data, error } = await q;
  if (error) throw error;
  return sortReviewMedia((data as unknown as SiteReviewRow[]) ?? []);
}

/** Media inside each review in sort_order. */
function sortReviewMedia(rows: SiteReviewRow[] | null): SiteReviewRow[] {
  const list = rows ?? [];
  list.forEach((r) => {
    if (r.media) r.media.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  });
  return list;
}

/** Detect YouTube/Vimeo from a pasted URL. Returns id + thumbnail. */
export function parseExternalVideo(input: string): {
  provider: "youtube" | "vimeo";
  id: string;
  thumbnail: string;
  embed: string;
} | null {
  const url = input.trim();
  if (!url) return null;
  // YouTube
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  if (yt) {
    const id = yt[1];
    return {
      provider: "youtube",
      id,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      embed: `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`,
    };
  }
  // Vimeo
  const v = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (v) {
    const id = v[1];
    return {
      provider: "vimeo",
      id,
      thumbnail: `https://vumbnail.com/${id}.jpg`,
      embed: `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`,
    };
  }
  return null;
}

export function videoEmbedUrl(m: ReviewMediaRow): string | null {
  if (m.provider === "youtube" && m.external_video_id)
    return `https://www.youtube.com/embed/${m.external_video_id}?rel=0&modestbranding=1&autoplay=1`;
  if (m.provider === "vimeo" && m.external_video_id)
    return `https://player.vimeo.com/video/${m.external_video_id}?title=0&byline=0&portrait=0&autoplay=1`;
  return null;
}
