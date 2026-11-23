/**
 * Public Reviews page — Apple-inspired layout with Picsart-style premium masonry
 * gallery for photo/video reviews and elegant testimonial cards for text reviews.
 *
 * Key features:
 *  - Hero with aggregate rating, count, supporting copy, overlapping avatars
 *  - Filter tabs: All / Photo / Video / 5-Star Text
 *  - CSS columns Pinterest masonry — preserves aspect ratios, no cropping
 *  - IntersectionObserver fade-in animations + lazy media loading
 *  - Fullscreen MediaViewer (swipe / keyboard / preloading)
 *  - Skeletons during loading; CLS-safe via aspect-ratio reserves
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSiteReviews } from "@/hooks/useSiteReviews";
import { useReviewHero } from "@/hooks/useReviewHero";

import { resolveImageSrc } from "@/lib/cdnImage";
import { useDocumentMeta, useJsonLd } from "@/hooks/useDocumentMeta";
import { StarIcon, PlayIcon, CheckCircleIcon, ImageIcon, VideoIcon, TypeIcon, SparklesIcon, FilledStarIcon } from "@/components/ui/icons";
import MediaViewer from "@/components/reviews/MediaViewer";
import type { ReviewMediaRow, SiteReviewRow } from "@/lib/reviewsApi";

type Filter = "all" | "photo" | "video" | "text";

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return ""; }
};

const Stars = ({ value, size = 14 }: { value: number; size?: number }) => {
  const rounded = Math.round(value);
  return (
    <div className="inline-flex items-center gap-[3px] leading-none" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <FilledStarIcon
          key={i}
          width={size}
          height={size}
          className={i <= rounded ? "text-yellow-500" : "text-foreground/15"}
        />
      ))}
    </div>
  );
};

/** Individual star with a fractional (0–1) fill overlay. Star sits in a 1em box
 *  so it shares the same vertical center as the adjacent rating score. */
const FractionalStar = ({
  fill,
  className = "w-[1em] h-[1em]",
}: {
  fill: number;
  className?: string;
}) => {
  const pct = Math.min(Math.max(fill, 0), 1);
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: "1em", height: "1em" }} aria-hidden="true">
      <FilledStarIcon className={`absolute inset-0 text-foreground/15 ${className}`} />
      <span className="absolute inset-0 flex items-center justify-start overflow-hidden">
        <span className="relative inline-flex items-center justify-center" style={{ width: `${pct}em`, height: "1em" }}>
          <FilledStarIcon className={`absolute left-0 top-0 text-yellow-500 ${className}`} />
        </span>
      </span>
    </span>
  );
};

/** Compact fractional rating stars — vertically centered via Flexbox. */
const RatingBoxes = ({
  value,
  className = "w-[1em] h-[1em]",
}: {
  value: number;
  className?: string;
}) => {
  return (
    <span className="inline-flex items-center gap-[0.2em] leading-none" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(Math.max(value - (i - 1), 0), 1);
        return <FractionalStar key={i} fill={fill} className={className} />;
      })}
    </span>
  );
};

const VerifiedBadge = () => (
  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase">
    <CheckCircleIcon className="w-3 h-3 text-emerald-600" />
    Verified Purchase
  </span>
);

const useReveal = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    // If already in/above the viewport on mount, show immediately — no flash.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh * 0.95) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }),
      { rootMargin: "120px 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return { ref, shown };
};

/**
 * Shared reviewer meta block — grouped at the bottom of the content section.
 * Same order/position regardless of card type.
 */
const ReviewerMeta = ({ review }: { review: SiteReviewRow }) => (
  <div className="pt-4 flex flex-col gap-1">
    <div className="text-[13px] font-semibold text-foreground leading-tight">{review.reviewer_name}</div>
    {review.location && (
      <div className="text-[11px] text-muted-foreground leading-snug break-words">{review.location}</div>
    )}
    <div className="text-[11px] text-muted-foreground leading-snug break-words">{formatDate(review.review_date)}</div>
    {review.is_verified_purchase && <div className="mt-1"><VerifiedBadge /></div>}
  </div>
);

/** Shared content block: ★★★★★ → Title → Body. Identical across all card types. */
const ReviewContent = ({ review, clamp = 4 }: { review: SiteReviewRow; clamp?: number }) => (
  <>
    <Stars value={review.rating} size={16} />
    {review.title && (
      <h3 className="mt-3 text-[14.5px] font-semibold text-foreground leading-snug line-clamp-2">
        {review.title}
      </h3>
    )}
    {review.body && (
      <p
        className="mt-2 text-[13px] leading-relaxed text-foreground/80 break-words"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: clamp,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {review.body}
      </p>
    )}
  </>
);

/** Media (photo/video) card — fixed aspect ratio, identical content layout below. */
const MediaCard = ({
  review,
  onOpenMedia,
}: { review: SiteReviewRow; onOpenMedia: (review: SiteReviewRow, mediaIdx: number) => void }) => {
  const { ref, shown } = useReveal();
  const media = review.media ?? [];
  const primary = media[0];
  if (!primary) return null;

  const isVideo = primary.kind === "video";
  const thumbSrc = isVideo
    ? (primary.thumbnail_url || (primary.r2_key ? resolveImageSrc(primary.r2_key, 800) : primary.url))
    : (primary.r2_key ? resolveImageSrc(primary.r2_key, 800) : primary.url);

  return (
    <div
      ref={ref}
      className={`group transition-opacity duration-500 ease-out ${shown ? "opacity-100" : "opacity-0"}`}
    >
      <button
        type="button"
        onClick={() => onOpenMedia(review, 0)}
        className="flex w-full flex-col text-left rounded-2xl overflow-hidden bg-card border border-border hover:border-foreground/30 transition-[border-color] duration-300 ease-out"
      >
        {/* Fixed 4:3 media area — same across all media cards */}
        <div className="relative w-full bg-muted/40 aspect-[4/3] overflow-hidden">
          {thumbSrc && (
            <img
              src={thumbSrc}
              alt={review.title || `Review by ${review.reviewer_name}`}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.025]"
            />
          )}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-background/90 backdrop-blur-md text-foreground flex items-center justify-center">
                <PlayIcon className="w-7 h-7 translate-x-0.5" />
              </span>
            </div>
          )}
        </div>

        {/* Content area — matches TextCard padding/spacing */}
        <div className="flex flex-col p-5 sm:p-6">
          <ReviewContent review={review} clamp={3} />
          <ReviewerMeta review={review} />
        </div>
      </button>
    </div>
  );
};

/** Text-only card — same content order/spacing as media cards. */
const TextCard = ({ review }: { review: SiteReviewRow }) => {
  const { ref, shown } = useReveal();
  return (
    <div
      ref={ref}
      className={`flex flex-col rounded-2xl bg-card border border-border p-5 sm:p-6 hover:border-foreground/30 transition-[border-color,opacity] duration-500 ease-out ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <ReviewContent review={review} clamp={6} />
      <ReviewerMeta review={review} />
    </div>
  );
};

const ReviewsSkeleton = () => (
  <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 sm:gap-5 [column-fill:_balance]">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="mb-4 sm:mb-5 break-inside-avoid rounded-2xl bg-muted/40 animate-pulse h-[360px]" />

    ))}
  </div>
);


const FILTERS: { id: Filter; label: string; Icon: any }[] = [
  { id: "all", label: "All", Icon: SparklesIcon },
  { id: "photo", label: "Photos", Icon: ImageIcon },
  { id: "video", label: "Videos", Icon: VideoIcon },
  { id: "text", label: "Text", Icon: TypeIcon },
];

const Reviews = () => {
  useDocumentMeta({
    title: "Customer Reviews — Gothic Vault",
    description: "Real reviews from Gothic Vault customers — photos, videos, and 5-star stories of our mobile accessories.",
    canonicalPath: "/reviews",
  });
  useJsonLd("ld-reviews-breadcrumb", {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gothicvault.shop/" },
      { "@type": "ListItem", position: 2, name: "Reviews", item: "https://gothicvault.shop/reviews" },
    ],
  });

  const { data: reviews = [], isLoading } = useSiteReviews();
  const [filter, setFilter] = useState<Filter>("all");
  const [viewerItems, setViewerItems] = useState<ReviewMediaRow[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return reviews;
    if (filter === "text") return reviews.filter((r) => r.review_type === "text" && r.rating === 5);
    return reviews.filter((r) => r.review_type === filter);
  }, [reviews, filter]);

  const stats = useMemo(() => {
    const eligible = reviews.filter((r) => r.is_visible && r.is_verified_purchase);
    const total = eligible.length;
    const avg = total ? eligible.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total : 0;
    return { total, avg, hasReviews: total > 0 };
  }, [reviews]);

  const openMedia = (review: SiteReviewRow, idx: number) => {
    if (!review.media?.length) return;
    setViewerItems(review.media);
    setViewerIndex(idx);
    setViewerOpen(true);
  };

  const { data: hero } = useReviewHero();
  const heroHeadline = hero?.headline?.trim() || "Loved by our customers.";
  const heroSubtitle = hero?.subtitle?.trim() || "Trusted by thousands of happy customers — real photos, real videos, real stories.";
  const heroAvatars = hero?.avatars ?? [];


  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-10 sm:pb-12 text-center">
          <h1 className="text-[34px] sm:text-[52px] leading-[1.04] font-semibold tracking-[-0.02em] text-foreground">
            {heroHeadline}
          </h1>
          {heroSubtitle && (
            <p className="mt-3 text-[14.5px] sm:text-[16px] text-muted-foreground max-w-xl mx-auto whitespace-pre-line">
              {heroSubtitle}
            </p>
          )}

          {/* Compact rating summary */}
          <div className="mt-4 sm:mt-5 flex justify-center">
            {stats.hasReviews ? (
              <div className="inline-flex items-center gap-2 sm:gap-2.5 rounded-full bg-muted/40 border border-border px-2.5 py-1 sm:px-3 sm:py-1.5">
                {heroAvatars.length > 0 && (
                  <>
                    <div className="flex -space-x-1.5">
                      {heroAvatars.map((a, i) => (
                        <div
                          key={a.r2_key + i}
                          className="w-6 h-6 sm:w-7 sm:h-7 rounded-full ring-2 ring-background overflow-hidden bg-muted"
                        >
                          <img
                            src={resolveImageSrc(a.r2_key, 400)}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="h-6 sm:h-7 w-px bg-border" aria-hidden />
                  </>
                )}
                <div className="flex flex-col items-start gap-0.5">
                  <div className="inline-flex items-center gap-[0.35em] text-[12px] sm:text-[13px] leading-none text-muted-foreground">
                    <RatingBoxes value={stats.avg} />
                    <span className="leading-none translate-y-[-0.5px]">{stats.avg.toFixed(1)}</span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-none">
                    Based on <span className="text-foreground font-semibold tabular-nums">{stats.total}</span> verified {stats.total === 1 ? "review" : "reviews"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] sm:text-[13px] text-muted-foreground">
                No verified reviews yet — be the first to share your story.
              </p>
            )}
          </div>



          {/* Filters */}
          <div className="mt-8 sm:mt-10 inline-flex items-center gap-1 p-1 rounded-full bg-muted/60 border border-border">
            {FILTERS.map(({ id, label, Icon }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 sm:px-4 h-9 rounded-full text-[12.5px] font-medium transition-all duration-200 ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Masonry */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-20">
        {isLoading ? (
          <ReviewsSkeleton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[14px] text-muted-foreground">No reviews to show yet.</p>
            <Link to="/shop" className="mt-4 inline-block text-[13px] text-foreground underline-offset-4 hover:underline">
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 sm:gap-5 [column-fill:_balance]">
            {filtered.map((r) => (
              <div key={r.id} className="mb-4 sm:mb-5 break-inside-avoid">

                {r.media && r.media.length > 0 ? (
                  <MediaCard review={r} onOpenMedia={openMedia} />
                ) : (
                  <TextCard review={r} />
                )}
              </div>
            ))}
          </div>

        )}
      </section>

      <MediaViewer
        items={viewerItems}
        index={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onIndexChange={setViewerIndex}
      />
    </div>
  );
};

export default Reviews;
