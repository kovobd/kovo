import { useMemo } from "react";
import { ScrollScene } from "@/components/ui/scroll-scene";
import { useSearchParams, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { PoliciesPageSkeleton } from "@/components/ui/page-skeletons";
import DOMPurify from "dompurify";
import { marked } from "marked";

interface Policy { id: string; slug?: string; title: string; content: string | null; enabled: boolean; sort_order: number; updated_at: string; }


const legacyTabMap: Record<string, string> = {
  "privacy-policy": "privacy",
  privacy: "privacy",
  "shipping-policy": "shipping",
  shipping: "shipping",
  "refund-return": "returns",
  "return-exchange": "returns",
  "return": "returns",
  returns: "returns",
  refund: "refund",
  "refund-policy": "refund",
  "terms-conditions": "terms",
  "terms-of-service": "terms",
  terms: "terms",
  faq: "faq",
  faqs: "faq",
};

const Policies = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab: tabParam } = useParams();

  const requestedSlug = (searchParams.get("tab") || tabParam || "").trim().toLowerCase();
  const resolvedSlug = legacyTabMap[requestedSlug] ?? requestedSlug;
  useDocumentMeta({
    title: resolvedSlug
      ? `${resolvedSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — Gothic Vault`
      : "Policies — Gothic Vault",
    description: "Read Gothic Vault policies on shipping, returns, privacy and terms — clear and customer-first.",
    canonicalPath: resolvedSlug ? `/policies/${resolvedSlug}` : "/policies",
  });

  const { data: policies, isError, isLoading } = useQuery<Policy[]>({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("policies").select("id,title,slug,content,sort_order,enabled").eq("enabled", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Policy[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const resolvedTab = resolvedSlug;
  const activePolicy = useMemo(
    () => policies?.find((p) => p.id === resolvedTab || p.slug === resolvedTab) || (!resolvedTab ? policies?.[0] : undefined),
    [policies, resolvedTab]
  );
  const activeTab = activePolicy?.id || "";

  const activeHtml = useMemo(() => {
    const md = activePolicy?.content ?? "";
    if (!md) return "";
    const raw = marked.parse(md, { async: false, breaks: true, gfm: true }) as string;
    return DOMPurify.sanitize(raw);
  }, [activePolicy?.content]);

  if (isLoading && !policies) return <PoliciesPageSkeleton />;

  return (
    <div className="page-enter">
      <ScrollScene variant="cinematic" intensity={0.8}><section className="section-padding py-20 sm:py-28 text-center">
        <div className="fade-up">
          <h1 className="apple-heading-lg text-foreground mb-3">Our Policies</h1>
          <p className="apple-body max-w-2xl mx-auto mb-4">Transparency and trust are at the heart of everything we do.</p>
          <div className="premium-divider max-w-[60px] mx-auto" />
        </div>
      </section></ScrollScene>

      <ScrollScene variant="cinematic" intensity={0.8}><section className="section-padding pb-20 lg:pb-28 max-w-4xl mx-auto text-center">
        {!!policies?.length && (
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {policies.map((p) => (
              <button
                key={p.id}
                onClick={() => setSearchParams({ tab: p.slug ?? p.id })}
                className={`px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                  activeTab === p.id
                    ? "bg-primary text-primary-foreground shadow-[0_2px_8px_-3px_hsl(var(--primary)/0.3)]"
                    : "bg-secondary/70 border border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        {!policies ? (
          <div className="glass-card rounded-2xl p-5 sm:p-8 min-h-[280px] text-left" />
        ) : activePolicy ? (
          <div key={activeTab} className="fade-up glass-card rounded-2xl p-5 sm:p-8 text-left">
            <h2 className="apple-heading-sm text-foreground mb-3">{activePolicy.title}</h2>
            <div className="premium-divider mb-6" />
            {activePolicy.content ? (
              <article
                className="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-headings:tracking-tight prose-h1:text-2xl sm:prose-h1:text-3xl prose-h2:text-xl sm:prose-h2:text-2xl prose-h3:text-lg sm:prose-h3:text-xl prose-h1:font-semibold prose-h2:font-semibold prose-h3:font-semibold prose-h1:mb-4 prose-h2:mb-3 prose-h3:mb-2 prose-p:apple-body-sm prose-a:text-foreground prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-[#2563eb] prose-a:transition-colors prose-strong:text-foreground"
                dangerouslySetInnerHTML={{ __html: activeHtml }}
              />
            ) : (
              <p className="apple-body-sm text-muted-foreground">No content yet. Update from the admin panel.</p>
            )}

          </div>
        ) : isError ? (
          <div className="glass-card rounded-2xl p-5 sm:p-8">
            <p className="apple-body-sm text-muted-foreground">Policies cannot be loaded at the moment.</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-5 sm:p-8">
            <p className="apple-body-sm text-muted-foreground">No policies found.</p>
          </div>
        )}
      </section></ScrollScene>
    </div>
  );
};

export default Policies;
