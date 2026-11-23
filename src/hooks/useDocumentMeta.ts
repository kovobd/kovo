import { useEffect } from "react";
import { getR2Base } from "@/lib/cdnImage";
import { shareImageUrl } from "@/lib/pageMeta";

const setMeta = (selector: string, attr: string, value: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    const [, name] = selector.match(/\[(?:name|property)="([^"]+)"\]/) ?? [];
    if (selector.includes("property=")) el.setAttribute("property", name ?? "");
    else el.setAttribute("name", name ?? "");
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
};

const setLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export interface DocumentMetaOptions {
  title: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
  /** As stored: r2:/r2o: ref, http URL or site path (see shareImageUrl). */
  image?: string;
  /** Open Graph type ("product" on product pages). */
  type?: "website" | "product";
}

/**
 * Lightweight per-page meta updater (no react-helmet dep).
 * Call once at the top of a page component with stable strings.
 */
// The Worker writes the same values into the HTML for the home, shop and
// product pages (src/lib/pageMeta.ts), which is what link previews read.
export function useDocumentMeta({ title, description, canonicalPath, noindex, image, type }: DocumentMetaOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    const previousCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
    const previousOgUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? null;
    const previousOgImage = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? null;
    const previousOgType = document.head.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content ?? null;
    document.title = title;
    if (description) {
      setMeta('meta[name="description"]', "content", description);
      setMeta('meta[property="og:description"]', "content", description);
      setMeta('meta[name="twitter:description"]', "content", description);
    }
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    if (canonicalPath) {
      const url = `${window.location.origin}${canonicalPath}`;
      setLink("canonical", url);
      setMeta('meta[property="og:url"]', "content", url);
    }
    const shareImage = shareImageUrl(image, getR2Base(), window.location.origin);
    if (shareImage) {
      setMeta('meta[property="og:image"]', "content", shareImage);
      setMeta('meta[name="twitter:image"]', "content", shareImage);
    }
    if (type) setMeta('meta[property="og:type"]', "content", type);
    if (noindex) {
      setMeta('meta[name="robots"]', "content", "noindex,nofollow");
    }
    return () => {
      document.title = previousTitle;
      if (noindex) {
        const el = document.head.querySelector('meta[name="robots"]');
        if (el) el.remove();
      }
      if (previousCanonical) setLink("canonical", previousCanonical);
      if (previousOgUrl) setMeta('meta[property="og:url"]', "content", previousOgUrl);
      if (previousOgImage) {
        setMeta('meta[property="og:image"]', "content", previousOgImage);
        setMeta('meta[name="twitter:image"]', "content", previousOgImage);
      }
      if (previousOgType) setMeta('meta[property="og:type"]', "content", previousOgType);
    };
  }, [title, description, canonicalPath, noindex, image, type]);
}

/** Inject (or replace) a JSON-LD <script> tag identified by a stable id. */
export function useJsonLd(id: string, data: unknown | null) {
  useEffect(() => {
    const existing = document.getElementById(id);
    if (!data) {
      if (existing) existing.remove();
      return;
    }
    const json = JSON.stringify(data);
    if (existing) {
      existing.textContent = json;
      return;
    }
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.textContent = json;
    document.head.appendChild(script);
    return () => {
      const node = document.getElementById(id);
      if (node) node.remove();
    };
  }, [id, data]);
}
