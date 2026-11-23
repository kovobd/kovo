// Title, description, address and share image of the storefront pages.
//
// Used in two places, which must agree:
//  - the pages themselves (via useDocumentMeta), once the app runs;
//  - the Cloudflare Worker (worker/index.ts), which writes them into the HTML
//    it sends. Link previews (Facebook, WhatsApp, Messenger, X) and search
//    engines read that HTML without running any JavaScript.
//
// Pure functions with no app or environment imports, so the Worker can use them.

export interface PageMeta {
  title: string;
  description: string;
  /** Path (and query) of the page's own address, e.g. "/product/ruby-bag". */
  canonicalPath: string;
  /** Image as stored (r2:/r2o: ref, http URL or site path); see shareImageUrl. */
  image?: string;
  /** Open Graph type: "product" on product pages. */
  type: "website" | "product";
}

export const HOME_META: PageMeta = {
  title: "Kovo | Bags & Accessories in Bangladesh",
  description: "Kovo — bags and accessories, delivered across Bangladesh with cash on delivery.",
  canonicalPath: "/",
  type: "website",
};

/** Plain text for a description: no HTML, single spaces, at most 160 characters. */
export function plainDescription(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** First non-empty image of a product. */
export function productPrimaryImage(product: Row | null | undefined): string | undefined {
  const images: unknown[] = Array.isArray(product?.images) ? product!.images : [];
  return images.find((s): s is string => typeof s === "string" && s.trim().length > 0);
}

/** `routeParam` is the :id in /product/:id (a slug, or an id for old links). */
export function productMeta(product: Row | null | undefined, routeParam: string | undefined): PageMeta {
  if (!product) {
    return {
      title: "Product — Kovo",
      description: "Bags and accessories from Kovo. Cash on delivery across Bangladesh.",
      canonicalPath: routeParam ? `/product/${routeParam}` : "/shop",
      type: "product",
    };
  }
  const slug = (typeof product.slug === "string" && product.slug) || routeParam;
  return {
    title: product.name ? `${product.name} — Kovo` : "Product — Kovo",
    description: plainDescription(product.short_description || product.description || `${product.name} — from Kovo.`),
    canonicalPath: slug ? `/product/${encodeURIComponent(slug)}` : "/shop",
    image: productPrimaryImage(product),
    type: "product",
  };
}

/** The category a ?category= value names (by name, slug, or name written as a slug). */
export function findShopCategory(categories: Row[] | null | undefined, value: string | null | undefined): Row | null {
  if (!value || value === "All") return null;
  const norm = (s: string) => String(s).toLowerCase().replace(/\s+/g, "-");
  return (categories ?? []).find((c) => c?.name === value || c?.slug === value || norm(c?.name ?? "") === norm(value)) ?? null;
}

export function shopMeta(category: Row | null): PageMeta {
  if (!category) {
    return {
      title: "Shop — Kovo",
      description: "Shop Kovo bags, wallets and accessories. Cash on delivery across Bangladesh.",
      canonicalPath: "/shop",
      type: "website",
    };
  }
  return {
    title: category.meta_title || `${category.name} — Kovo`,
    description: plainDescription(
      category.meta_description || `Browse ${category.name} from Kovo. Cash on delivery across Bangladesh.`,
    ),
    canonicalPath: `/shop?category=${encodeURIComponent(category.slug || category.name)}`,
    image: category.featured_image_url || category.image_url || undefined,
    type: "website",
  };
}

/**
 * A plain, absolute JPG/PNG/WebP URL for a share preview. Previews need a
 * real file: an r2: variant set maps to its original upload, an r2o: ref to
 * its object, a resizable CDN photo is asked for at 1200 px.
 */
export function shareImageUrl(src: string | null | undefined, r2Base: string, siteOrigin: string): string | undefined {
  if (!src) return undefined;
  const base = (r2Base || "").replace(/\/+$/, "");
  if (src.startsWith("r2:")) return base ? `${base}/${src.slice(3)}-original.jpg` : undefined;
  if (src.startsWith("r2o:")) return base ? `${base}/${src.slice(4)}` : undefined;
  if (/^https?:\/\//.test(src)) {
    if (/^https:\/\/images\.unsplash\.com\//.test(src)) {
      try {
        const u = new URL(src);
        const w = Number(u.searchParams.get("w")) || 0;
        const h = Number(u.searchParams.get("h")) || 0;
        u.searchParams.set("w", "1200");
        if (w && h) u.searchParams.set("h", String(Math.round((h / w) * 1200)));
        return u.toString();
      } catch {
        return src;
      }
    }
    return src;
  }
  if (src.startsWith("data:") || src.startsWith("blob:")) return undefined;
  return `${siteOrigin.replace(/\/+$/, "")}${src.startsWith("/") ? "" : "/"}${src}`;
}
