import { useEffect, useState, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown, Image as ImageIcon, Star, Sparkles, FolderOpen, Bookmark,
  BookOpen, Mail, Award, MessageSquare, HelpCircle, Layers, Check, Loader2,
  Film,
} from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import HeroSlidesEditor from "@/components/admin/HeroSlidesEditor";
import WhyChooseUsEditor from "@/components/admin/WhyChooseUsEditor";
import TestimonialsEditor from "@/components/admin/TestimonialsEditor";
import FaqEditor from "@/components/admin/FaqEditor";


type Section = { id: string; title?: string | null; enabled: boolean; content: Record<string, any>; sort_order: number };

const META: Record<string, { label: string; description: string; icon: typeof ImageIcon }> = {
  hero: { label: "Hero", description: "Top slideshow and fallback banner", icon: ImageIcon },
  featured: { label: "Featured products", description: "Curated highlight grid", icon: Star },
  bestsellers: { label: "Bestsellers", description: "Top-selling product strip", icon: Sparkles },
  categories_showcase: { label: "Categories showcase", description: "Top-level category tiles", icon: FolderOpen },
  brands_showcase: { label: "Brands showcase", description: "Brand logo carousel", icon: Bookmark },
  brand_story: { label: "Brand story", description: "Narrative block with image", icon: BookOpen },
  featured_image: { label: "Featured image", description: "Full-width promotional banner", icon: ImageIcon },
  newsletter: { label: "Newsletter", description: "Email capture section", icon: Mail },
  why_choose_us: { label: "Why choose us", description: "Value proposition cards", icon: Award },
  testimonials: { label: "Testimonials", description: "Customer reviews carousel", icon: MessageSquare },
  video_reels: { label: "Video reels", description: "Customer video testimonials carousel", icon: Film },
  faq: { label: "FAQ", description: "Frequently asked questions", icon: HelpCircle },
};

const titleFor = (s: Section) => META[s.id]?.label ?? s.title ?? s.id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const descFor = (s: Section) => META[s.id]?.description ?? "Manage this section";
const iconFor = (s: Section) => META[s.id]?.icon ?? Layers;

const EXPANDED_KEY = "admin:homepage:expanded";

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[11.5px] font-medium block mb-1.5" style={{ color: "hsl(var(--a-muted))" }}>{label}</label>
    {children}
    {hint && <p className="text-[11px] mt-1" style={{ color: "hsl(var(--a-soft))" }}>{hint}</p>}
  </div>
);

const HomepageManager = ({ hideTitle: _hideTitle }: { hideTitle?: boolean }) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(EXPANDED_KEY);
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      let { data } = await supabase.from("homepage_sections").select("*").order("sort_order");
      if (!data || data.length === 0) {
        const { ensureCmsDefaults } = await import("@/lib/cmsBootstrap");
        await ensureCmsDefaults({ force: true });
        ({ data } = await supabase.from("homepage_sections").select("*").order("sort_order"));
      }
      const list = (data ?? []) as unknown as Section[];
      setSections(list);
      setBaseline(Object.fromEntries(list.map(s => [s.id, JSON.stringify(s.content)])));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (expanded) window.localStorage.setItem(EXPANDED_KEY, expanded);
    else window.localStorage.removeItem(EXPANDED_KEY);
  }, [expanded]);

  const dirtyMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of sections) m[s.id] = JSON.stringify(s.content) !== baseline[s.id];
    return m;
  }, [sections, baseline]);

  const updateContent = (section: Section, key: string, value: any) => {
    const newContent = { ...section.content, [key]: value };
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, content: newContent } : s));
  };

  const toggleEnabled = async (section: Section, v: boolean) => {
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, enabled: v } : s));
    const { error } = await supabase.from("homepage_sections").update({ enabled: v } as any).eq("id", section.id);
    if (error) {
      setSections(prev => prev.map(s => s.id === section.id ? { ...s, enabled: !v } : s));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: ["public-home"] });
    }
  };

  const saveContentKey = async (section: Section, key: string, value: any) => {
    const newContent = { ...section.content, [key]: value };
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, content: newContent } : s));
    const { error } = await supabase.from("homepage_sections").update({ content: newContent }).eq("id", section.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      setBaseline(prev => ({ ...prev, [section.id]: JSON.stringify(newContent) }));
      qc.invalidateQueries({ queryKey: ["public-home"] });
      toast({ title: "Image saved" });
    }
  };

  const saveSection = async (section: Section) => {
    setSavingId(section.id);
    const { error } = await supabase.from("homepage_sections").update({ content: section.content }).eq("id", section.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setBaseline(prev => ({ ...prev, [section.id]: JSON.stringify(section.content) }));
    qc.invalidateQueries({ queryKey: ["public-home"] });
    setSavedFlash(section.id);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(null), 1800);
  };

  if (loading) {
    return (
      <div className="space-y-2.5 max-w-3xl">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="a-skeleton h-[68px] rounded-[14px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-2 pb-10">

        {sections.map((section) => {
          const Icon = iconFor(section);
          const isOpen = expanded === section.id;
          const dirty = !!dirtyMap[section.id];
          const saving = savingId === section.id;
          const justSaved = savedFlash === section.id;

          return (
            <div key={section.id} className={`a-expand-card ${isOpen ? "is-open" : ""}`}>
              {/* Header */}
              <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : section.id)}
                  className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 text-left"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "hsl(var(--a-sunken))", color: "hsl(var(--a-ink))" }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] sm:text-[13.5px] font-semibold tracking-tight truncate" style={{ color: "hsl(var(--a-ink))" }}>
                      {titleFor(section)}
                    </p>
                    <p className="text-[11px] sm:text-[11.5px] truncate" style={{ color: "hsl(var(--a-soft))" }}>
                      {descFor(section)}
                    </p>
                  </div>
                </button>

                <span className={`a-status ${section.enabled ? "is-on" : "is-off"} hidden md:inline-flex`}>
                  <span className="dot" />
                  {section.enabled ? "Published" : "Hidden"}
                </span>

                <Switch
                  checked={section.enabled}
                  onCheckedChange={(v) => toggleEnabled(section, v)}
                />

                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : section.id)}
                  className="p-1.5 rounded-md transition-colors hover:bg-[hsl(var(--a-sunken))] shrink-0"
                  style={{ color: "hsl(var(--a-muted))" }}
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  <ChevronDown size={15} className="transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)" }} />
                </button>
              </div>

              {/* Body — lazy-mounted */}
              {isOpen && (
                <div className="a-expand-body px-3 sm:px-4 pb-3 sm:pb-4">
                  <div className="pt-3 sm:pt-4 space-y-3.5 sm:space-y-4" style={{ borderTop: "1px solid hsl(var(--a-divider))" }}>

                    {section.id === "hero" && (
                      <HeroSlidesEditor />
                    )}

                    {(section.id === "featured" || section.id === "bestsellers") && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} /></Field>
                        <Field label="Subtitle"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} /></Field>
                      </>
                    )}

                    {(section.id === "categories_showcase" || section.id === "brands_showcase") && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} /></Field>
                        <Field label="Subtitle"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} /></Field>
                        <p className="text-[11.5px]" style={{ color: "hsl(var(--a-muted))" }}>
                          {section.id === "categories_showcase"
                            ? "Manage category images from the categories page. Only top-level categories with images are shown."
                            : "Manage brand logos from the brands page. Only enabled brands are shown."}
                        </p>
                      </>
                    )}

                    {section.id === "brand_story" && (
                      <>
                        <Field label="Title"><Input value={section.content.title ?? ""} onChange={(e) => updateContent(section, "title", e.target.value)} /></Field>
                        <Field label="Text"><Textarea value={section.content.text ?? ""} onChange={(e) => updateContent(section, "text", e.target.value)} rows={3} /></Field>
                        <ImageUpload
                          value={section.content.image ? [section.content.image] : []}
                          onChange={(urls) => saveContentKey(section, "image", urls[0] || "")}
                          multiple={false}
                          label="Brand story image"
                          hint="Recommended: 600 × 450 px · JPG or PNG"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Button text"><Input value={section.content.button_text ?? ""} onChange={(e) => updateContent(section, "button_text", e.target.value)} /></Field>
                          <Field label="Button link"><Input value={section.content.button_link ?? ""} onChange={(e) => updateContent(section, "button_link", e.target.value)} /></Field>
                        </div>
                      </>
                    )}

                    {section.id === "featured_image" && (
                      <>
                        <Field label="Title (optional)"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} placeholder="New Arrivals" /></Field>
                        <Field label="Subtitle (optional)"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} placeholder="Crafted for modern carry" /></Field>
                        <ImageUpload
                          value={section.content.image ? [section.content.image] : []}
                          onChange={(urls) => saveContentKey(section, "image", urls[0] || "")}
                          multiple={false}
                          label="Banner image"
                          hint="Recommended: 1920 × 720 px · JPG or PNG"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Button text"><Input value={section.content.button_text ?? ""} onChange={(e) => updateContent(section, "button_text", e.target.value)} placeholder="Shop now" /></Field>
                          <Field label="Button link"><Input value={section.content.button_link ?? ""} onChange={(e) => updateContent(section, "button_link", e.target.value)} placeholder="/shop" /></Field>
                        </div>
                        <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "hsl(var(--a-text))" }}>
                          <Switch checked={section.content.overlay ?? true} onCheckedChange={(v) => updateContent(section, "overlay", v)} />
                          Dark overlay (for text legibility)
                        </label>
                      </>
                    )}

                    {section.id === "newsletter" && (
                      <>
                        <Field label="Title"><Input value={section.content.title ?? ""} onChange={(e) => updateContent(section, "title", e.target.value)} placeholder="Join the Atelier" /></Field>
                        <Field label="Headline (fallback)"><Input value={section.content.headline ?? ""} onChange={(e) => updateContent(section, "headline", e.target.value)} /></Field>
                        <Field label="Subtext"><Textarea value={section.content.subtext ?? ""} onChange={(e) => updateContent(section, "subtext", e.target.value)} rows={2} /></Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Email placeholder"><Input value={section.content.placeholder ?? ""} onChange={(e) => updateContent(section, "placeholder", e.target.value)} placeholder="Enter your email" /></Field>
                          <Field label="Button text"><Input value={section.content.button_text ?? ""} onChange={(e) => updateContent(section, "button_text", e.target.value)} placeholder="Subscribe" /></Field>
                        </div>
                        <Field label="Footnote (optional)"><Input value={section.content.footnote ?? ""} onChange={(e) => updateContent(section, "footnote", e.target.value)} placeholder="No spam — unsubscribe any time" /></Field>
                        <ImageUpload
                          value={section.content.background_image ? [section.content.background_image] : []}
                          onChange={(urls) => saveContentKey(section, "background_image", urls[0] || "")}
                          multiple={false}
                          label="Background image (optional)"
                          hint="Recommended: 1920 × 600 px · JPG or PNG"
                        />
                      </>
                    )}

                    {section.id === "why_choose_us" && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} placeholder="Why choose us" /></Field>
                        <Field label="Subtitle (optional)"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} /></Field>
                        <WhyChooseUsEditor />
                      </>
                    )}

                    {section.id === "testimonials" && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} placeholder="What customers say" /></Field>
                        <Field label="Subtitle (optional)"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} /></Field>
                        <TestimonialsEditor />
                      </>
                    )}

                    {section.id === "video_reels" && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} placeholder="Real Customer Experiences" /></Field>
                        <Field label="Subtitle (optional)"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} placeholder="See how our community experiences the collection." /></Field>
                        <p className="text-[11.5px]" style={{ color: "hsl(var(--a-muted))" }}>
                          Manage the actual videos from <strong>Settings → Video Testimonials</strong>.
                        </p>
                      </>
                    )}

                    {section.id === "faq" && (
                      <>
                        <Field label="Section title"><Input value={section.content.section_title ?? ""} onChange={(e) => updateContent(section, "section_title", e.target.value)} placeholder="FAQ" /></Field>
                        <Field label="Subtitle (optional)"><Input value={section.content.subtitle ?? ""} onChange={(e) => updateContent(section, "subtitle", e.target.value)} /></Field>
                        <FaqEditor />
                      </>
                    )}
                  </div>

                  {/* Inline save bar (per card) */}
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: "1px dashed hsl(var(--a-divider))" }}>
                    <span className="text-[11.5px] inline-flex items-center gap-1.5 min-w-0 truncate" style={{ color: dirty ? "hsl(var(--a-warning))" : "hsl(var(--a-soft))" }}>
                      {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                        : justSaved ? <><Check size={11} /> Saved</>
                        : dirty ? <>● Unsaved changes</>
                        : "All changes saved"}
                    </span>
                    <Button size="sm" onClick={() => saveSection(section)} disabled={saving || !dirty} className="shrink-0">
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HomepageManager;
