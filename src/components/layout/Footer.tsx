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
    <span className="w-10 h-10 rounded-full overflow-hidden glass-button grid place-items-center">
      <img src={resolveImageSrc(link.icon_url, 400)} alt={label} className="w-full h-full object-cover" loading="lazy" onError={() => setImgError(true)} />
    </span>
  ) : (
    <span className="w-10 h-10 rounded-full glass-button grid place-items-center text-[10px] font-medium uppercase tracking-[0.18em] text-foreground">
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
      <h3 className="font-display text-[11px] font-semibold tracking-[0.32em] uppercase text-foreground/80 mb-3 [text-shadow:0_0_10px_rgba(200,180,235,0.25)]">{title}</h3>
      <ul className="space-y-2">
        {links.map((l, i) => (
          <li key={i}>
            {isExternal(l.url) ? (
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-foreground/60 hover:text-foreground transition-colors duration-300">
                {l.label}
              </a>
            ) : (
              <Link to={l.url || "/"} className="text-[14px] text-foreground/60 hover:text-foreground transition-colors duration-300">
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
  const brandName = f.store_name || "Gothic Vault";
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
    <footer className="relative bg-[hsl(var(--surface))] text-[#F7F4FF] border-t border-[#2B2337]">
      <style>{`
        footer .text-foreground,
        footer .text-foreground\\/80,
        footer .text-foreground\\/65,
        footer .text-foreground\\/60,
        footer .text-foreground\\/55,
        footer .text-foreground\\/45,
        footer .text-foreground\\/40 { color: #F7F4FF !important; }
        footer .text-foreground\\/80 { color: rgba(247,244,255,0.85) !important; }
        footer .text-foreground\\/65 { color: rgba(247,244,255,0.75) !important; }
        footer .text-foreground\\/60,
        footer .text-foreground\\/55 { color: rgba(247,244,255,0.65) !important; }
        footer .text-foreground\\/45,
        footer .text-foreground\\/40 { color: rgba(247,244,255,0.55) !important; }
        footer a:hover,
        footer button:hover,
        footer .hover\\:text-foreground:hover { color: #CDB5F6 !important; }
        footer input::placeholder { color: rgba(247,244,255,0.55) !important; }
        footer input { color: #F7F4FF !important; }
        footer .border-border,
        footer .border-border\\/60 { border-color: #2B2337 !important; }
        footer .footer-brand-link { display: inline-block; }
        footer .footer-brand-logo { height: 96px !important; width: auto !important; }
        @media (min-width: 640px) { footer .footer-brand-logo { height: 108px !important; } }
        @media (min-width: 768px) { footer .footer-brand-logo { height: 132px !important; } }
      `}</style>
      <div className="section-padding py-8 sm:py-10">
         <div className="max-w-7xl mx-auto">
           <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-4">
            {/* Brand */}
            <div className="md:col-span-4 lg:col-span-4 flex flex-col">
              <Link to="/" aria-label={`${brandName} — Home`} className="footer-brand-link">
                <BrandMark size="xl" className="footer-brand-logo" />
              </Link>
               {f.description && (
                 <p className="mt-4 text-[13px] sm:text-[14px] leading-[1.65] text-foreground/55 max-w-sm">{f.description}</p>
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
            <div className="md:col-span-3 lg:col-span-4">
              <h3 className="font-display text-[11px] font-semibold tracking-[0.32em] uppercase text-foreground/80 mb-3">Stay In Touch</h3>
               <ul className="space-y-1.5 text-[13px] sm:text-[14px] text-foreground/55">
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
                  <div className="flex items-end justify-between gap-4 border-b border-border pb-2">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="flex-1 bg-transparent text-[14px] sm:text-[15px] text-foreground placeholder:text-foreground/45 focus:outline-none py-1"
                      aria-label="Email address"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="shrink-0 text-[11px] sm:text-[12px] font-medium tracking-[0.22em] uppercase text-foreground/80 hover:text-foreground transition-colors disabled:opacity-60 flex items-center gap-2 py-1"
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
           <div className="mt-6 sm:mt-8 border-t border-border" />

           <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-center sm:text-left">
            <p className="text-[11px] sm:text-[12px] text-foreground/45 tracking-[-0.005em]">
              {copyright}
            </p>
            <p className="text-[11px] sm:text-[12px] text-foreground/45">
              Developed by{" "}
              <a
                href="https://renesaameer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/65 hover:text-foreground transition-colors duration-300"
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
