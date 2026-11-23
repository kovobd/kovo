import { resolveImageSrc } from "@/lib/cdnImage";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useLayoutData } from "./LayoutDataProvider";
import { useToast } from "@/hooks/use-toast";
import BrandMark from "@/components/brand/BrandMark";
import { subscribeToNewsletter } from "@/lib/newsletter";


const isExternal = (url: string) => /^https?:\/\//i.test(url);

const SocialIcon = ({ link }: { link: { platform: string; url: string; icon_url?: string | null } }) => {
  const label = link.platform || "Social";
  const [imgError, setImgError] = useState(false);
  const inner = link.icon_url && !imgError ? (
    <span className="w-10 h-10 overflow-hidden border border-border bg-background grid place-items-center">
      <img src={resolveImageSrc(link.icon_url, 400)} alt={label} className="w-full h-full object-cover" loading="lazy" onError={() => setImgError(true)} />
    </span>
  ) : (
    <span className="w-10 h-10 border border-border bg-background grid place-items-center text-[10px] font-medium uppercase tracking-[0.18em] text-foreground">
      {label.slice(0, 2)}
    </span>
  );
  return (
    <a
      href={link.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-block transition-transform duration-300 ease-out hover:-translate-y-0.5 active:scale-95"
    >
      {inner}
    </a>
  );
};

const FooterColumn = ({ title, links }: { title: string; links: { label: string; url: string }[] }) => {
  if (!links?.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-medium tracking-[0.18em] uppercase text-foreground mb-4">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((l, i) => (
          <li key={i}>
            {isExternal(l.url) ? (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-muted-foreground hover:text-foreground transition-colors duration-300">
                {l.label}
              </a>
            ) : (
              <Link to={l.url || "/"} className="text-[14px] text-muted-foreground hover:text-foreground transition-colors duration-300">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Footer = () => {
  const { footer } = useLayoutData();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const f = footer || ({} as any);
  const brandName = f.store_name || "Kovo";
  const year = new Date().getFullYear();
  const copyright = (f.copyright_text || `© {year} ${brandName}. All rights reserved.`).replace("{year}", String(year));
  const social = (f.social_links || []).filter((s: any) => s?.enabled !== false && s?.url);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    const result = await subscribeToNewsletter(email);
    setSubmitting(false);
    if (!result.ok) {
      toast({ title: "Could not subscribe", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Subscribed", description: "Thanks for joining our list." });
    setEmail("");
  };

  return (
    <footer className="relative bg-[hsl(var(--surface))] text-foreground border-t border-border">
      <div className="section-padding pt-14 pb-8 sm:pt-16">
         <div className="max-w-7xl mx-auto">
           <div className="grid grid-cols-2 md:grid-cols-12 gap-x-6 gap-y-10 md:gap-6">
            {/* Brand */}
            <div className="col-span-2 md:col-span-4 lg:col-span-4 flex flex-col">
              <Link to="/" aria-label={`${brandName} — Home`} className="footer-brand-link">
                <BrandMark size="lg" />
              </Link>
               {f.description && (
                 <p className="mt-4 text-[14px] leading-[1.65] text-muted-foreground max-w-sm">{f.description}</p>
               )}
               {social.length > 0 && (
                 <div className="mt-4 flex items-center gap-2.5 sm:gap-3">
                  {social.map((s: any, i: number) => <SocialIcon key={i} link={s} />)}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="md:col-span-2 lg:col-span-2">
              <FooterColumn title="Explore" links={f.quick_links || []} />
            </div>

            {/* Customer care */}
            <div className="md:col-span-3 lg:col-span-2">
              <FooterColumn title="Support" links={f.customer_care_links || []} />
            </div>

            {/* Stay in touch + newsletter */}
            <div className="col-span-2 md:col-span-3 lg:col-span-4">
              <h3 className="text-[11px] font-medium tracking-[0.18em] uppercase text-foreground mb-4">Stay in touch</h3>
               <ul className="space-y-1.5 text-[14px] text-muted-foreground">
                 {f.email && (
                   <li><a href={`mailto:${f.email}`} className="hover:text-foreground transition-colors duration-300">{f.email}</a></li>
                 )}
                 {f.phone && (
                   <li><a href={`tel:${f.phone.replace(/\s/g, "")}`} className="hover:text-foreground transition-colors duration-300">{f.phone}</a></li>
                 )}
                 {f.address && <li className="leading-[1.65]">{f.address}</li>}
               </ul>

               {f.newsletter_enabled !== false && (
                 <form onSubmit={handleSubscribe} className="mt-4 w-full max-w-md">
                  <div className="flex items-end justify-between gap-4 border-b border-foreground pb-2">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="flex-1 bg-transparent text-[14px] sm:text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none py-1"
                      aria-label="Email address"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="shrink-0 text-[11px] font-medium tracking-[0.18em] uppercase text-foreground hover:opacity-70 transition-colors disabled:opacity-60 flex items-center gap-2 py-1"
                    >
                      {submitting ? "…" : "Join"}
                      <span aria-hidden className="text-[14px] leading-none">→</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Divider */}
           <div className="mt-12 border-t border-border" />

           <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-center sm:text-left">
            <p className="text-[12px] text-muted-foreground tracking-[-0.005em]">
              {copyright}
            </p>
            <p className="text-[12px] text-muted-foreground">
              Developed by{" "}
              <a
                href="https://renesaameer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:opacity-70 transition-colors duration-300"
              >
                Renesa Ameer
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
