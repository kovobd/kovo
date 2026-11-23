import React, { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminProducts, useDeleteProduct, useToggleProductField, adminKeys } from "@/hooks/useAdminData";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Tag, Package, Save, GripVertical, ChevronLeft, ImageOff, ArrowUpDown, Check } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TabRow } from "@/components/admin/products/TabsEditor";
import type { FaqRow } from "@/components/admin/products/FaqsEditor";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ImageUpload = lazy(() => import("@/components/admin/ImageUpload"));
const VariantsEditor = lazy(() => import("@/components/admin/products/VariantsEditor"));
const TabsEditor = lazy(() => import("@/components/admin/products/TabsEditor"));
const FaqsEditor = lazy(() => import("@/components/admin/products/FaqsEditor"));
const DisplaySettings = lazy(() => import("@/components/admin/products/DisplaySettings"));
const EditorFallback = () => <div className="h-20 rounded-lg bg-muted/40 animate-pulse" />;
import {
  type OptionGroup,
  type VariantRow,
} from "@/lib/variants";

interface ProductRow {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  base_price: number;
  compare_price: number | null;
  status: "draft" | "active" | "archived";
  is_new_arrival: boolean;
  stock: number;
  featured: boolean;
  best_seller: boolean;
  images: string[];
  slug: string;
  short_description: string | null;
  description: string | null;
  sku: string | null;
  category_id: string | null;
  brand_id: string | null;
  rating: number;
  review_count: number;
  show_shipping_info: boolean;
  show_stock_status: boolean;
  show_offers: boolean;
  show_brand: boolean;
  option_groups?: any;
  reminder_enabled?: boolean;
  reminder_days?: number | null;
  reminder_notes?: string | null;
  _hasVariants?: boolean;
  _variantCount?: number;
  _variantStock?: number;
  _variantPriceMin?: number | null;
  _variantPriceMax?: number | null;
}

interface ProductOffer {
  id?: string;
  product_id?: string;
  offer_type: string;
  buy_quantity: number | null;
  get_quantity: number | null;
  discount_value: number | null;
  free_product_id: string | null;
  free_variant_id: string | null;
  target_variant_ids: string[];
  display_text: string;
  enabled: boolean;
  sort_order: number;
}

interface OfferVariant {
  id: string;
  product_id: string;
  option_values: Record<string, string> | null;
  sku: string | null;
}


const offerTypes = [
  { value: "buy_x_get_y_same", label: "Buy X Get Y Free (Same Product)" },
  { value: "buy_x_get_y_diff", label: "Buy X Get Different Product Free" },
  { value: "buy_x_get_off", label: `Buy X Get ${CURRENCY_SYMBOL} Off` },
  { value: "flat_percent", label: "Flat Percentage Off" },
  { value: "free_delivery", label: "Free Delivery" },
  { value: "buy_x_get_y_free_delivery", label: "Buy X Get Y Free + Free Delivery" },
];

const emptyProduct: Omit<ProductRow, "id"> = {
  name: "", price: 0, sale_price: null, base_price: 0, compare_price: null,
  status: "draft", is_new_arrival: false,
  stock: 0, featured: false, best_seller: false,
  images: [], slug: "", short_description: "", description: null,
  sku: "", category_id: null, brand_id: null,
  rating: 0, review_count: 0,
  show_shipping_info: true, show_stock_status: true, show_offers: true, show_brand: true,
  option_groups: [],
  reminder_enabled: false, reminder_days: null, reminder_notes: "",
};

const FieldLabel = ({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) => (
  <div className="mb-1.5">
    <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
    {hint && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>}
  </div>
);

// Customer-profile style flat card: bg-background, rounded-[4px], border-border/60, uppercase eyebrow.
const Section = ({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
  noBody = false,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noBody?: boolean;
}) => (
  <section className={cn("bg-background border border-border/60 rounded-[4px] overflow-hidden", className)}>
    {(title || action) && (
      <header className="flex items-start justify-between gap-3 px-3.5 py-2.5 border-b border-border/40">
        <div className="min-w-0">
          {title && (
            <h3 className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/80 leading-none">
              {title}
            </h3>
          )}
          {subtitle && <p className="text-[11.5px] text-muted-foreground/60 mt-1">{subtitle}</p>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </header>
    )}
    {noBody ? children : <div className={cn("p-3.5", bodyClassName)}>{children}</div>}
  </section>
);

// Back-compat alias.
const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <Section className={className} bodyClassName="space-y-4">{children}</Section>
);
const PanelHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="-mt-1 -mb-1">
    <h3 className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/80">{title}</h3>
    {subtitle && <p className="text-[11.5px] text-muted-foreground/60 mt-0.5">{subtitle}</p>}
  </div>
);

// Toggle row group — flat rectangular 4px.
const RowGroup = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-[4px] border border-border/60 bg-background divide-y divide-border/40 overflow-hidden", className)}>
    {children}
  </div>
);
const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer">
    <div className="min-w-0">
      <div className="text-[12.5px] font-medium text-foreground leading-tight">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground/60 mt-0.5 leading-snug">{hint}</div>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </label>
);

const Products = () => {
  const [reorderMode, setReorderMode] = useState(false);
  const { data: productsData, isLoading: loading } = useAdminProducts();
  const products = (productsData ?? []) as unknown as ProductRow[];
  const qc = useQueryClient();
  const deleteProductMutation = useDeleteProduct();
  const toggleFieldMutation = useToggleProductField();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [originalVariantIds, setOriginalVariantIds] = useState<string[]>([]);
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [newReview, setNewReview] = useState({ customer_name: "", rating: 5, review: "" });
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allTags, setAllTags] = useState<{ id: string; name: string; type: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [productDetails, setProductDetails] = useState<import("@/components/admin/products/DisplaySettings").ProductDetailRow[]>([]);
  const [originalDetailIds, setOriginalDetailIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const baselineRef = React.useRef<string>("");
  const justLoadedRef = React.useRef<boolean>(false);
  const { toast } = useToast();

  // ── Track unsaved changes ─────────────────────────────
  React.useEffect(() => {
    if (!editing) {
      setDirty(false);
      baselineRef.current = "";
      justLoadedRef.current = false;
      return;
    }
    if (justLoadedRef.current) {
      baselineRef.current = JSON.stringify({ editing, variantRows, tabs, faqs, selectedTagIds, optionGroups, productDetails });
      setDirty(false);
      justLoadedRef.current = false;
      return;
    }
    if (!baselineRef.current) return;
    const snap = JSON.stringify({ editing, variantRows, tabs, faqs, selectedTagIds, optionGroups, productDetails });
    setDirty(snap !== baselineRef.current);
  }, [editing, variantRows, tabs, faqs, selectedTagIds, optionGroups, productDetails]);


  // ── Drag & drop reordering ─────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const persistOrder = async (orderedIds: string[]) => {
    // Optimistically update cache so UI stays in new order during save.
    qc.setQueryData(adminKeys.products, (old: any) => {
      if (!Array.isArray(old)) return old;
      const map = new Map(old.map((p: any) => [p.id, p]));
      return orderedIds.map((id, i) => ({ ...(map.get(id) as any), sort_order: i }));
    });
    // ONE write instead of N — see public.bulk_update_sort_order().
    await supabase.rpc("bulk_update_sort_order" as any, { _table: "products", _ids: orderedIds });
    qc.invalidateQueries({ queryKey: adminKeys.products });
  };
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = products.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setDragId(null);
    setOverId(null);
    persistOrder(next);
  };

  const [offersDialogProduct, setOffersDialogProduct] = useState<ProductRow | null>(null);
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [offerTargetVariants, setOfferTargetVariants] = useState<OfferVariant[]>([]);
  const [offerFreeVariants, setOfferFreeVariants] = useState<OfferVariant[]>([]);
  const makeBlankOffer = (): ProductOffer => ({
    offer_type: "buy_x_get_y_same", buy_quantity: 3, get_quantity: 1, discount_value: null,
    free_product_id: null, free_variant_id: null, target_variant_ids: [],
    display_text: "Buy 3 Get 1 Free!", enabled: true, sort_order: 0,
  });
  const [newOffer, setNewOffer] = useState<ProductOffer>(makeBlankOffer());


  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("brands").select("id, name").order("sort_order"),
      supabase.from("tags").select("id, name").order("sort_order").order("name"),
    ]).then(([cRes, bRes, tRes]) => {
      setCategories(cRes.data ?? []);
      setBrands(bRes.data ?? []);
      setAllTags((tRes.data ?? []) as any);
    });
  }, []);

  const startEdit = async (product: ProductRow) => {
    setEditing(product);
    setIsNew(false);
    setReviews([]);
    setReviewsLoaded(false);
    // Critical data only — reviews are deferred until the Content tab is opened.
    const [tabsRes, faqsRes, variantsRes, mediaRes, tagsRes, detailsRes] = await Promise.all([
      supabase.from("product_tabs").select("id,product_id,title,content,display_style,sort_order").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_faqs").select("id,product_id,question,answer,sort_order").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_variants").select("id,product_id,option_values,price,sale_price,stock,sku,active,sort_order,image_url,reminder_days,reminder_notes").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_media").select("image_url, sort_order").eq("product_id", product.id).is("variant_id", null).order("sort_order"),
      supabase.from("product_tags").select("tag_id").eq("product_id", product.id),
      supabase.from("product_details").select("id,label,value,sort_order").eq("product_id", product.id).order("sort_order"),
    ]);
    setTabs((tabsRes.data ?? []) as TabRow[]);
    setFaqs((faqsRes.data ?? []) as FaqRow[]);
    const images = (mediaRes.data ?? []).map((m: any) => m.image_url);
    setEditing({ ...product, images });
    setSelectedTagIds(((tagsRes.data ?? []) as any[]).map((t) => t.tag_id));
    const rows = (variantsRes.data ?? []).map((r: any) => ({
      id: r.id,
      product_id: r.product_id,
      option_values: (r.option_values || {}) as Record<string, string>,
      price: Number(r.price ?? 0),
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      stock: Number(r.stock ?? 0),
      sku: r.sku ?? "",
      active: r.active !== false,
      sort_order: Number(r.sort_order ?? 0),
      image_url: r.image_url ?? null,
      reminder_days: r.reminder_days != null ? Number(r.reminder_days) : null,
      reminder_notes: r.reminder_notes ?? null,
    }));

    setVariantRows(rows);
    setOriginalVariantIds(rows.map((r) => r.id!).filter(Boolean));
    // Prefer persisted option_groups; fall back to deriving from variants for legacy products
    const persistedGroups = Array.isArray(product.option_groups) ? (product.option_groups as OptionGroup[]) : [];
    if (persistedGroups.length > 0) {
      setOptionGroups(persistedGroups);
    } else {
      const derivedGroups: Record<string, Set<string>> = {};
      rows.forEach((r) => {
        Object.entries(r.option_values || {}).forEach(([k, v]) => {
          (derivedGroups[k] ||= new Set()).add(String(v));
        });
      });
      setOptionGroups(
        Object.entries(derivedGroups).map(([name, values]) => ({
          name, values: [...values], type: "text" as const, show_on_card: true,
        }))
      );
    }
    const detailRows = ((detailsRes.data ?? []) as any[]).map((d) => ({
      id: d.id as string, label: d.label as string, value: d.value as string, sort_order: Number(d.sort_order ?? 0),
    }));
    setProductDetails(detailRows);
    setOriginalDetailIds(detailRows.map((d) => d.id!).filter(Boolean));
    justLoadedRef.current = true;
  };

  // Lazy-load reviews only when the Content tab is opened — keeps the
  // editor snappy on open because the reviews query (and any large review
  // history) doesn't block initial render.
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const loadReviewsIfNeeded = React.useCallback(async () => {
    if (!editing?.id || isNew || reviewsLoaded || reviewsLoading) return;
    setReviewsLoading(true);
    const { data } = await supabase
      .from("reviews")
      .select("id,product_id,customer_name,rating,comment,review,created_at")
      .eq("product_id", editing.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setReviews(data ?? []);
    setReviewsLoaded(true);
    setReviewsLoading(false);
  }, [editing?.id, isNew, reviewsLoaded, reviewsLoading]);

  const startNew = () => {
    setEditing({ id: "", ...emptyProduct } as ProductRow);
    setIsNew(true);
    setOptionGroups([]);
    setVariantRows([]);
    setOriginalVariantIds([]);
    setTabs([]);
    setFaqs([]);
    setReviews([]);
    setSelectedTagIds([]);
    setProductDetails([]);
    setOriginalDetailIds([]);
    justLoadedRef.current = true;
  };


  const closeEditor = () => {
    setEditing(null); setIsNew(false);
    setTabs([]); setFaqs([]); setOptionGroups([]); setVariantRows([]); setOriginalVariantIds([]);
    setSelectedTagIds([]);
    setProductDetails([]); setOriginalDetailIds([]);
  };

  const handleSave = async () => {
    if (!editing || saving) return;
    if (!editing.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const slug =
      editing.slug?.trim() ||
      editing.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const basePrice = Number(editing.base_price ?? editing.price) || 0;
    const comparePrice = editing.compare_price != null ? Number(editing.compare_price) : (editing.sale_price != null ? Number(editing.sale_price) : null);

    // Strict whitelist matching real DB columns (post-rebuild)
    const payload = {
      name: editing.name.trim(),
      slug,
      base_price: basePrice,
      compare_price: comparePrice,
      status: editing.status ?? "draft",
      is_new_arrival: !!editing.is_new_arrival,
      stock: Number(editing.stock) || 0,
      featured: !!editing.featured,
      best_seller: !!editing.best_seller,
      short_description: editing.short_description,
      description: editing.description,
      sku: editing.sku,
      category_id: editing.category_id,
      brand_id: editing.brand_id,
      rating: Number(editing.rating) || 0,
      review_count: Number(editing.review_count) || 0,
      show_shipping_info: editing.show_shipping_info !== false,
      show_stock_status: editing.show_stock_status !== false,
      show_offers: editing.show_offers !== false,
      show_brand: editing.show_brand !== false,
      option_groups: optionGroups,
      reminder_days: Number(editing.reminder_days) > 0 ? Number(editing.reminder_days) : null,
      reminder_enabled: Number(editing.reminder_days) > 0,
      reminder_notes: editing.reminder_notes ?? null,
    };

    try {
      let productId = editing.id;
      if (isNew) {
        const { data: maxRow } = await supabase
          .from("products").select("sort_order")
          .order("sort_order", { ascending: false }).limit(1).maybeSingle();
        const nextSort = ((maxRow as any)?.sort_order ?? -1) + 1;
        const { data, error } = await supabase.from("products").insert({ ...payload, sort_order: nextSort } as any).select("id").single();
        if (error) throw error;
        productId = data.id;
      } else {
        const { error } = await supabase.from("products").update(payload as any).eq("id", editing.id);
        if (error) throw error;
      }

      // ── Diff product_variants rows ──────────────────────
      const keptIds = variantRows.map((r) => r.id).filter(Boolean) as string[];
      const toDeleteVariants = originalVariantIds.filter((id) => !keptIds.includes(id));
      const toInsertVariants = variantRows
        .map((r, i) => ({ ...r, sort_order: i }))
        .filter((r) => !r.id)
        .map((r) => ({
          product_id: productId,
          option_values: r.option_values,
          price: r.price,
          sale_price: r.sale_price,
          stock: r.stock,
          sku: r.sku,
          active: r.active,
          sort_order: r.sort_order,
          image_url: r.image_url ?? null,
          reminder_days: r.reminder_days != null && Number(r.reminder_days) > 0 ? Number(r.reminder_days) : null,
          reminder_notes: r.reminder_notes ?? null,
        }));

      const toUpdateVariants = variantRows
        .map((r, i) => ({ ...r, sort_order: i }))
        .filter((r) => r.id);

      // Run deletes serially first to avoid FK/unique races against inserts
      // and updates that may reuse keys (e.g. option_values).
      if (toDeleteVariants.length > 0) {
        const delRes = await supabase.from("product_variants").delete().in("id", toDeleteVariants);
        if (delRes.error) throw delRes.error;
      }

      const variantOps: PromiseLike<any>[] = [];
      if (toInsertVariants.length > 0)
        variantOps.push(supabase.from("product_variants").insert(toInsertVariants as any));
      for (const r of toUpdateVariants) {
        variantOps.push(
          supabase
            .from("product_variants")
            .update({
              option_values: r.option_values,
              price: r.price,
              sale_price: r.sale_price,
              stock: r.stock,
              sku: r.sku,
              active: r.active,
              sort_order: r.sort_order,
              image_url: r.image_url ?? null,
              reminder_days: r.reminder_days != null && Number(r.reminder_days) > 0 ? Number(r.reminder_days) : null,
              reminder_notes: r.reminder_notes ?? null,
            } as any)
            .eq("id", r.id!)

        );
      }
      const variantResults = await Promise.all(variantOps);
      for (const res of variantResults) {
        if (res?.error) throw res.error;
      }

      // ── Diff tabs ──
      const tabsToDelete = tabs.filter((t) => t._deleted && t.id);
      const tabsToInsert = tabs.filter((t) => t._isNew && !t._deleted);
      const tabsToUpdate = tabs.filter((t) => !t._isNew && !t._deleted && t.id);
      const tabOps: PromiseLike<any>[] = [];
      if (tabsToDelete.length > 0)
        tabOps.push(supabase.from("product_tabs").delete().in("id", tabsToDelete.map((t) => t.id!)));
      if (tabsToInsert.length > 0)
        tabOps.push(
          supabase.from("product_tabs").insert(
            tabsToInsert.map((t, i) => ({
              product_id: productId,
              title: t.title,
              content: t.content,
              display_style: t.display_style || "text",
              sort_order: i,
            }))
          )
        );
      for (const t of tabsToUpdate) {
        tabOps.push(
          supabase
            .from("product_tabs")
            .update({
              title: t.title,
              content: t.content,
              display_style: t.display_style || "text",
              sort_order: t.sort_order,
            })
            .eq("id", t.id!)
        );
      }

      // ── Diff FAQs ──
      const faqsToDelete = faqs.filter((f) => f._deleted && f.id);
      const faqsToInsert = faqs.filter((f) => f._isNew && !f._deleted);
      const faqsToUpdate = faqs.filter((f) => !f._isNew && !f._deleted && f.id);
      const faqOps: PromiseLike<any>[] = [];
      if (faqsToDelete.length > 0)
        faqOps.push(supabase.from("product_faqs").delete().in("id", faqsToDelete.map((f) => f.id!)));
      if (faqsToInsert.length > 0)
        faqOps.push(
          supabase.from("product_faqs").insert(
            faqsToInsert.map((f, i) => ({
              product_id: productId,
              question: f.question,
              answer: f.answer,
              sort_order: i,
            }))
          )
        );
      for (const f of faqsToUpdate) {
        faqOps.push(
          supabase
            .from("product_faqs")
            .update({ question: f.question, answer: f.answer, sort_order: f.sort_order })
            .eq("id", f.id!)
        );
      }

      // ── Diff product_details ──
      const visibleDetails = productDetails.filter((d) => !d._deleted);
      const keptDetailIds = visibleDetails.map((d) => d.id).filter(Boolean) as string[];
      const detailsToDelete = originalDetailIds.filter((id) => !keptDetailIds.includes(id));
      const detailsToInsert = visibleDetails
        .map((d, i) => ({ ...d, sort_order: i }))
        .filter((d) => !d.id && (d.label.trim() || d.value.trim()))
        .map((d) => ({ product_id: productId, label: d.label.trim(), value: d.value.trim(), sort_order: d.sort_order }));
      const detailsToUpdate = visibleDetails
        .map((d, i) => ({ ...d, sort_order: i }))
        .filter((d) => d.id);
      const detailOps: PromiseLike<any>[] = [];
      if (detailsToDelete.length > 0)
        detailOps.push(supabase.from("product_details").delete().in("id", detailsToDelete));
      if (detailsToInsert.length > 0)
        detailOps.push(supabase.from("product_details").insert(detailsToInsert as any));
      for (const d of detailsToUpdate) {
        detailOps.push(
          supabase.from("product_details")
            .update({ label: d.label.trim(), value: d.value.trim(), sort_order: d.sort_order })
            .eq("id", d.id!)
        );
      }

      const otherResults = await Promise.all([...tabOps, ...faqOps, ...detailOps]);
      for (const res of otherResults) {
        if (res?.error) throw res.error;
      }

      // ── Atomic media + tag replacement (single DB transaction via RPC) ──
      const { error: rpcErr } = await supabase.rpc("replace_product_media_and_tags", {
        _product_id: productId,
        _images: (editing.images ?? []) as any,
        _tag_ids: selectedTagIds,
      });
      if (rpcErr) throw rpcErr;
      toast({ title: isNew ? "Product created" : "Product saved", description: "Changes have been saved." });
      qc.invalidateQueries({ queryKey: adminKeys.products });
      bumpStorefrontVersion();

      // Stay on the editor. If we just created a new product, switch into
      // edit mode for it so subsequent saves update instead of insert.
      if (isNew) {
        setEditing((prev) => (prev ? { ...prev, id: productId } as ProductRow : prev));
        setIsNew(false);
      }
      // Re-baseline dirty tracking and clear any "new"/"deleted" flags on
      // child rows so future diffs work against the persisted state.
      setTabs((rows) => rows.filter((t) => !t._deleted).map((t) => ({ ...t, _isNew: false })));
      setFaqs((rows) => rows.filter((f) => !f._deleted).map((f) => ({ ...f, _isNew: false })));
      setOriginalVariantIds(variantRows.map((r) => r.id!).filter(Boolean));
      // Refresh product_details from DB so newly inserted rows pick up ids
      const { data: freshDetails } = await supabase
        .from("product_details")
        .select("id,label,value,sort_order")
        .eq("product_id", productId)
        .order("sort_order");
      const newDetails = ((freshDetails ?? []) as any[]).map((d) => ({
        id: d.id as string, label: d.label as string, value: d.value as string, sort_order: Number(d.sort_order ?? 0),
      }));
      setProductDetails(newDetails);
      setOriginalDetailIds(newDetails.map((d) => d.id!).filter(Boolean));
      justLoadedRef.current = true;
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
  };
  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    deleteProductMutation.mutate(id, {
      onSuccess: () => toast({ title: "Product deleted" }),
      onError: (err: any) => toast({ title: "Delete failed", description: err?.message ?? "Unknown error", variant: "destructive" }),
    });
  };

  const toggleField = (id: string, field: "featured" | "best_seller", value: boolean) => {
    toggleFieldMutation.mutate({ id, field, value });
  };

  // ── offers dialog ─────────────────────────────────────
  const loadFreeVariants = async (freeProductId: string | null) => {
    if (!freeProductId) { setOfferFreeVariants([]); return; }
    const { data } = await supabase
      .from("product_variants")
      .select("id,product_id,option_values,sku")
      .eq("product_id", freeProductId)
      .eq("active", true)
      .order("sort_order");
    setOfferFreeVariants((data ?? []) as OfferVariant[]);
  };

  const openOffers = async (product: ProductRow) => {
    setOffersDialogProduct(product);
    const [offersRes, variantsRes] = await Promise.all([
      supabase
        .from("product_offers")
        .select("id,product_id,offer_type,buy_quantity,get_quantity,discount_value,free_product_id,free_variant_id,target_variant_ids,display_text,enabled,min_cart_total,sort_order")
        .eq("product_id", product.id)
        .order("sort_order"),
      supabase
        .from("product_variants")
        .select("id,product_id,option_values,sku")
        .eq("product_id", product.id)
        .eq("active", true)
        .order("sort_order"),
    ]);
    const normalized = ((offersRes.data ?? []) as any[]).map((o) => ({
      ...o,
      target_variant_ids: Array.isArray(o.target_variant_ids) ? o.target_variant_ids : [],
      free_variant_id: o.free_variant_id ?? null,
    })) as ProductOffer[];
    setOffers(normalized);
    setOfferTargetVariants((variantsRes.data ?? []) as OfferVariant[]);
    setOfferFreeVariants([]);
    resetNewOffer();
  };
  const resetNewOffer = () => setNewOffer(makeBlankOffer());
  const generateDisplayText = (o: typeof newOffer) => {
    switch (o.offer_type) {
      case "buy_x_get_y_same": return `Buy ${o.buy_quantity} Get ${o.get_quantity} Free!`;
      case "buy_x_get_y_diff": return `Buy ${o.buy_quantity} Get a Free Gift!`;
      case "buy_x_get_off": return `Buy ${o.buy_quantity} Get ${CURRENCY_SYMBOL}${o.discount_value} Off!`;
      case "flat_percent": return `${o.discount_value}% Off!`;
      case "free_delivery": return `Free Delivery on orders above ${CURRENCY_SYMBOL}${o.discount_value}`;
      case "buy_x_get_y_free_delivery": return `Buy ${o.buy_quantity} Get ${o.get_quantity} Free + Free Delivery!`;
      default: return "";
    }
  };
  const handleOfferTypeChange = (type: string) => {
    const u = { ...newOffer, offer_type: type };
    // When toggling between same / different / non-BXGY modes, reset free product picks.
    if (type !== "buy_x_get_y_diff") {
      u.free_product_id = null;
      u.free_variant_id = null;
      setOfferFreeVariants([]);
    }
    u.display_text = generateDisplayText(u);
    setNewOffer(u);
  };
  const updateFreeProduct = async (productId: string | null) => {
    setNewOffer({ ...newOffer, free_product_id: productId, free_variant_id: null });
    await loadFreeVariants(productId);
  };
  const toggleTargetVariant = (variantId: string) => {
    const current = newOffer.target_variant_ids ?? [];
    const next = current.includes(variantId)
      ? current.filter((v) => v !== variantId)
      : [...current, variantId];
    setNewOffer({ ...newOffer, target_variant_ids: next });
  };
  const addOffer = async () => {
    if (!offersDialogProduct) return;
    if (newOffer.offer_type === "buy_x_get_y_diff" && !newOffer.free_product_id) {
      toast({ title: "Pick a free product", variant: "destructive" }); return;
    }
    const { error } = await supabase.from("product_offers").insert({
      product_id: offersDialogProduct.id,
      offer_type: newOffer.offer_type,
      buy_quantity: newOffer.buy_quantity,
      get_quantity: newOffer.get_quantity,
      discount_value: newOffer.discount_value,
      free_product_id: newOffer.free_product_id,
      free_variant_id: newOffer.free_variant_id,
      target_variant_ids: newOffer.target_variant_ids ?? [],
      display_text: newOffer.display_text,
      enabled: true,
      sort_order: offers.length,
    } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Offer added" });
    openOffers(offersDialogProduct);
  };

  const deleteOffer = async (id: string) => {
    const { error } = await supabase.from("product_offers").delete().eq("id", id);
    if (error) { toast({ title: "Failed to remove offer", description: error.message, variant: "destructive" }); return; }
    setOffers(offers.filter((o) => o.id !== id));
    toast({ title: "Offer removed" });
  };
  const toggleOffer = async (id: string, enabled: boolean) => {
    const prev = offers;
    setOffers(offers.map((o) => (o.id === id ? { ...o, enabled } : o)));
    const { error } = await supabase.from("product_offers").update({ enabled }).eq("id", id);
    if (error) {
      setOffers(prev);
      toast({ title: "Failed to update offer", description: error.message, variant: "destructive" });
    }
  };

  // ─────────────────────────────────────────────────────
  // EDITOR VIEW
  // ─────────────────────────────────────────────────────
  if (editing) {
    const computedSlug = (editing.slug?.trim() ||
      editing.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")) || "untitled";
    const statusLabel = editing.status === "active" ? "Active" : editing.status === "archived" ? "Archived" : "Draft";
    const statusDot = editing.status === "active" ? "bg-emerald-500" : editing.status === "archived" ? "bg-muted-foreground/50" : "bg-amber-500";

    return (
      <div className="max-w-6xl pb-28 lg:pb-10 space-y-3">
        {/* Header — Customer Profile style */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-[18px] sm:text-[20px] font-semibold text-foreground truncate leading-tight min-w-0">
              {isNew ? (editing.name || "New product") : editing.name}
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={closeEditor}>
                <ChevronLeft size={13} className="mr-1.5" /> Back
              </Button>
              <Button size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={handleSave} disabled={saving}>
                <Save size={13} className="mr-1.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-mono text-foreground">/{computedSlug}</span>
            {!isNew && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full", statusDot)} /> {statusLabel}
                </span>
              </>
            )}
            {dirty && (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-orange-600 dark:text-orange-400">Unsaved changes</span>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="general" className="w-full mt-4 space-y-5" onValueChange={(v) => { if (v === "content") loadReviewsIfNeeded(); }}>
          <TabsList className="bg-transparent rounded-none h-auto p-0 gap-1 justify-start flex-wrap">
            {[
              { v: "general", label: "General" },
              { v: "media", label: "Media" },
              { v: "variants", label: "Variants" },
              { v: "content", label: "Content" },
              { v: "display", label: "Display" },
            ].map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="h-9 px-3 text-[12px] font-medium rounded-[4px] border border-border bg-background text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground hover:text-foreground transition-colors"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>







          {/* ── General ── Shopify-style two-column layout */}
          <TabsContent value="general" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
              {/* LEFT — content */}
              <div className="space-y-5 min-w-0">
                <Section title="General information" subtitle="Basic product details shown to customers." bodyClassName="space-y-4">
                  <div>
                    <FieldLabel required>Product name</FieldLabel>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      placeholder="e.g. Premium Leather Tote"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Leave empty to auto-generate from name">URL slug</FieldLabel>
                    <Input
                      value={editing.slug}
                      onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                      placeholder="premium-leather-tote"
                      className="h-11 font-mono text-[13px]"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Shown on product cards and search results">Short description</FieldLabel>
                    <Textarea
                      value={editing.short_description ?? ""}
                      onChange={(e) => setEditing({ ...editing, short_description: e.target.value })}
                      placeholder="Brief product summary…"
                      rows={3}
                      className="resize-y"
                    />
                  </div>
                </Section>

                <Section title="Product description" subtitle="Full description shown on the product page." bodyClassName="space-y-4">
                  <Textarea
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Detailed description, features, materials, dimensions…"
                    rows={8}
                    className="resize-y"
                  />
                </Section>

                {allTags.length > 0 && (
                  <Section title="Tags" subtitle="Independent of categories — used for filtering." bodyClassName="space-y-3">
                    <Input
                      placeholder="Search tags…"
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {allTags
                        .filter((t) => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                        .map((t) => {
                          const active = selectedTagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
                                setSelectedTagIds(
                                  active
                                    ? selectedTagIds.filter((id) => id !== t.id)
                                    : [...selectedTagIds, t.id]
                                )
                              }
                              className={cn(
                                "px-3 h-8 rounded-[6px] text-[12px] font-medium transition border",
                                active
                                  ? "bg-[hsl(var(--a-ink))] text-[hsl(var(--a-accent-fg))] border-[hsl(var(--a-ink))]"
                                  : "bg-[hsl(var(--a-surface))] text-[hsl(var(--a-muted))] border-[hsl(var(--a-stroke))] hover:border-[hsl(var(--a-stroke-strong))] hover:text-[hsl(var(--a-ink))]"
                              )}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                    </div>
                    {selectedTagIds.length > 0 && (
                      <p className="text-[11px] text-[hsl(var(--a-soft))]">
                        {selectedTagIds.length} selected
                      </p>
                    )}
                  </Section>
                )}
              </div>

              {/* RIGHT — sidebar */}
              <div className="space-y-5">
                <Section title="Status" bodyClassName="space-y-3">
                  <div>
                    <FieldLabel>Publish status</FieldLabel>
                    <Select value={editing.status ?? "draft"} onValueChange={(v) => setEditing({ ...editing, status: v as any })}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <RowGroup>
                    <Row label="Featured" hint="Show on homepage">
                      <Switch checked={editing.featured} onCheckedChange={(v) => setEditing({ ...editing, featured: v })} />
                    </Row>
                    <Row label="Best seller" hint="Best-seller badge">
                      <Switch checked={editing.best_seller} onCheckedChange={(v) => setEditing({ ...editing, best_seller: v })} />
                    </Row>
                    <Row label="New arrival" hint="New badge">
                      <Switch checked={editing.is_new_arrival} onCheckedChange={(v) => setEditing({ ...editing, is_new_arrival: v })} />
                    </Row>
                  </RowGroup>
                </Section>


                <Section title="Organization" bodyClassName="space-y-3">
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <Select value={editing.category_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, category_id: v === "none" ? null : v })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Brand</FieldLabel>
                    <Select value={editing.brand_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, brand_id: v === "none" ? null : v })}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No brand</SelectItem>
                        {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </Section>
              </div>
            </div>
          </TabsContent>

          {/* ── Media ── */}
          <TabsContent value="media" className="mt-0">
            <Section title="Media" subtitle="Product gallery shown on the storefront." bodyClassName="space-y-4">
              <Suspense fallback={<EditorFallback />}>
                <ImageUpload
                  value={editing.images ?? []}
                  onChange={(urls) => setEditing({ ...editing, images: urls })}
                  multiple
                  label="Product Images"
                  cropAspect="4:5"
                  hint="Required 4:5 ratio · Recommended 2000 × 2500 px · Min 1000 × 1250 px · JPG/PNG"
                />
              </Suspense>
            </Section>
          </TabsContent>

          {/* ── Variants ── */}
          <TabsContent value="variants" className="mt-0">
            <Section title="Variants" subtitle="Options, pricing, stock and per-variant images." bodyClassName="space-y-4">
              <Suspense fallback={<EditorFallback />}>
                <VariantsEditor
                  basePrice={editing.base_price ?? editing.price ?? 0}
                  baseSalePrice={editing.compare_price ?? editing.sale_price}
                  baseStock={editing.stock}
                  baseSku={editing.sku ?? ""}
                  baseReminderDays={editing.reminder_days ?? null}
                  baseReminderNotes={editing.reminder_notes ?? ""}
                  images={editing.images ?? []}
                  onImagesChange={(imgs) => setEditing({ ...editing, images: imgs })}
                  optionGroups={optionGroups}
                  onOptionGroupsChange={setOptionGroups}
                  variantRows={variantRows}
                  onVariantRowsChange={setVariantRows}
                  onBaseChange={(patch: any) => setEditing({
                    ...editing,
                    ...patch,
                    ...(patch.price != null ? { base_price: patch.price } : {}),
                    ...(patch.sale_price !== undefined ? { compare_price: patch.sale_price } : {}),
                  })}
                />
              </Suspense>
            </Section>
          </TabsContent>

          {/* ── Content ── */}
          <TabsContent value="content" className="space-y-5 mt-0">
            <Section title="Description tabs" subtitle="Rich-content tabs displayed on the product page." bodyClassName="space-y-4">
              <Suspense fallback={<EditorFallback />}>
                <TabsEditor tabs={tabs} onChange={setTabs} />
              </Suspense>
            </Section>

            <Section title="FAQs" subtitle={`${faqs.filter((f) => !f._deleted).length} total`} bodyClassName="space-y-4">
              <div className="space-y-2">
                {faqs.filter((f) => !f._deleted).length === 0 && (
                  <p className="text-[12px] text-muted-foreground/40 text-center py-4">No FAQs yet</p>
                )}
                {faqs.map((f, idx) => {
                  if (f._deleted) return null;
                  return (
                    <div key={f.id ?? `new-${idx}`} className="border border-border/40 rounded-[4px] p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <Input
                          value={f.question}
                          onChange={(e) =>
                            setFaqs(faqs.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x)))
                          }
                          placeholder="Question"
                          className="flex-1 h-9 text-[13px] font-medium rounded-[4px]"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const target = faqs[idx];
                            if (target._isNew) setFaqs(faqs.filter((_, i) => i !== idx));
                            else setFaqs(faqs.map((x, i) => (i === idx ? { ...x, _deleted: true } : x)));
                          }}
                          className="text-muted-foreground/30 hover:text-destructive h-7 w-7 p-0 shrink-0"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                      <Textarea
                        value={f.answer}
                        onChange={(e) =>
                          setFaqs(faqs.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x)))
                        }
                        placeholder="Answer"
                        rows={2}
                        className="resize-none text-[13px] rounded-[4px]"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border/40 pt-4 space-y-2">
                <FieldLabel>Add an FAQ</FieldLabel>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    placeholder="Question"
                    value={newFaq.question}
                    onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                    className="h-9 text-[13px] rounded-[4px]"
                  />
                  <Button
                    size="sm"
                    className="h-9 rounded-[4px]"
                    onClick={() => {
                      if (!newFaq.question.trim()) return;
                      setFaqs([
                        ...faqs,
                        {
                          question: newFaq.question.trim(),
                          answer: newFaq.answer,
                          sort_order: faqs.length,
                          _isNew: true,
                        } as FaqRow,
                      ]);
                      setNewFaq({ question: "", answer: "" });
                    }}
                  >
                    <Plus size={13} className="mr-1" /> Add
                  </Button>
                </div>
                <Textarea
                  placeholder="Answer"
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  rows={2}
                  className="resize-none text-[13px] rounded-[4px]"
                />
              </div>
            </Section>

            {!isNew && (
              <Section title="Reviews" subtitle={reviewsLoaded ? `${reviews.length} total` : "Loading…"} bodyClassName="space-y-4">
                <div className="space-y-2">
                  {reviewsLoading && !reviewsLoaded && (
                    <>
                      <Skeleton className="h-14 rounded-[4px]" />
                      <Skeleton className="h-14 rounded-[4px]" />
                    </>
                  )}
                  {reviewsLoaded && reviews.length === 0 && (
                    <p className="text-[12px] text-muted-foreground/40 text-center py-4">No reviews yet</p>
                  )}
                  {reviews.map((r) => (
                    <div key={r.id} className="border border-border/40 rounded-[4px] p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{r.customer_name} <span className="text-muted-foreground/50 ml-1">★ {r.rating}</span></p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{r.review}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await supabase.from("reviews").delete().eq("id", r.id);
                        setReviews(reviews.filter((x) => x.id !== r.id));
                      }} className="text-muted-foreground/30 hover:text-destructive h-7 w-7 p-0"><Trash2 size={12} /></Button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-4 space-y-2">
                  <FieldLabel>Add a review</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Customer name" value={newReview.customer_name} onChange={(e) => setNewReview({ ...newReview, customer_name: e.target.value })} className="h-9 text-[13px] rounded-[4px]" />
                    <Input type="number" min="1" max="5" value={newReview.rating} onChange={(e) => setNewReview({ ...newReview, rating: +e.target.value })} className="h-9 text-[13px] rounded-[4px]" />
                    <Button size="sm" className="h-9 rounded-[4px]" onClick={async () => {
                      if (!newReview.customer_name || !editing.id) return;
                      const { data } = await supabase.from("reviews").insert({ product_id: editing.id, customer_name: newReview.customer_name, rating: newReview.rating, review: newReview.review }).select("*").single();
                      if (data) setReviews([data, ...reviews]);
                      setNewReview({ customer_name: "", rating: 5, review: "" });
                    }}>
                      <Plus size={13} className="mr-1" /> Add
                    </Button>
                  </div>
                  <Textarea placeholder="Review text" value={newReview.review} onChange={(e) => setNewReview({ ...newReview, review: e.target.value })} rows={2} className="resize-none text-[13px] rounded-[4px]" />
                </div>
              </Section>
            )}
          </TabsContent>

          {/* ── Display ── */}
          <TabsContent value="display" className="mt-0">
            <Suspense fallback={<EditorFallback />}>
              <DisplaySettings
                showStockStatus={editing.show_stock_status !== false}
                showOffers={editing.show_offers !== false}
                showBrand={editing.show_brand !== false}
                details={productDetails}
                onChange={(patch) =>
                  setEditing({
                    ...editing,
                    ...(patch.showStockStatus != null ? { show_stock_status: patch.showStockStatus } : {}),
                    ...(patch.showOffers != null ? { show_offers: patch.showOffers } : {}),
                    ...(patch.showBrand != null ? { show_brand: patch.showBrand } : {}),
                  })
                }
                onDetailsChange={setProductDetails}
              />
            </Suspense>
          </TabsContent>

        </Tabs>

        {/* ── Mobile sticky bottom action bar ── */}
        <div className="a-action-bar-mobile sm:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="a-btn a-btn-secondary flex-1 h-11"
            >
              Discard
            </button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="a-btn a-btn-primary flex-1 h-11 gap-1.5"
            >
              <Save size={13} /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] sm:text-[20px] font-semibold text-foreground tracking-tight leading-none">Products</h1>
          <p className="text-[11.5px] sm:text-[12px] text-muted-foreground/70 mt-1">{products.length} products</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReorderMode((v) => !v)}
            className={cn(
              "sm:hidden rounded-[4px] gap-1 text-[12px] h-9 px-3 font-medium border-border/60",
              reorderMode && "bg-foreground text-background border-foreground hover:bg-foreground/90"
            )}
          >
            {reorderMode ? <><Check size={13} /> Done</> : <ArrowUpDown size={13} />}
          </Button>
          <Button
            size="sm"
            onClick={startNew}
            className="rounded-[4px] gap-1 text-[12px] h-9 px-3 bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            <Plus size={14} /> <span className="sm:hidden">Add</span><span className="hidden sm:inline">Add Product</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="bg-background rounded-[4px] border border-border/60 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
              <Skeleton className="w-10 h-10 rounded-[4px] flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/60 border border-dashed border-border/60 rounded-[4px]">
          <Package size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-[13px] font-medium">No products yet</p>
          <p className="text-[12px] text-muted-foreground/50 mt-1">Add your first product to get started.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-background border border-border/60 rounded-[4px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b-2 border-border">
                  <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="text-left px-4 py-2">Product</th>
                    <th className="text-left px-3 py-2 w-[110px]">Price</th>
                    <th className="text-left px-3 py-2 w-[80px]">Stock</th>
                    <th className="text-left px-3 py-2 w-[110px]">Status</th>
                    <th className="text-right px-3 py-2 w-[130px]">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((p) => {
                    const badges: { label: string; cls: string }[] = [];
                    if (p.featured) badges.push({ label: "FEATURED", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" });
                    if (p.is_new_arrival) badges.push({ label: "NEW", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" });
                    if (p.best_seller) badges.push({ label: "BEST", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" });
                    const statusActive = p.status === "active";
                    const statusArchived = p.status === "archived";
                    return (
                    <tr
                      key={p.id}
                      draggable
                      onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={(e) => { e.preventDefault(); if (overId !== p.id) setOverId(p.id); }}
                      onDragLeave={() => { if (overId === p.id) setOverId(null); }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(p.id); }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                      className={cn(
                        "border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors",
                        dragId === p.id && "opacity-40",
                        overId === p.id && dragId && dragId !== p.id && "bg-primary/5 outline outline-1 outline-primary/30"
                      )}
                    >
                      <td className="px-2 py-2 cursor-grab active:cursor-grabbing text-muted-foreground/40">
                        <GripVertical size={14} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          {p.images?.[0] ? (
                            <img src={resolveImageSrc(p.images[0], 400)} alt="" className="w-10 h-10 rounded-[4px] object-cover flex-shrink-0" />

                          ) : (
                            <div className="w-10 h-10 rounded-[4px] bg-muted/40 border border-border/60 flex items-center justify-center flex-shrink-0">
                              <ImageOff size={13} className="text-muted-foreground/50" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[280px] text-[12.5px]">{p.name}</p>
                            {badges.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {badges.map((b) => (
                                  <span key={b.label} className={cn("inline-flex items-center px-1.5 h-[16px] rounded-[4px] text-[9px] font-semibold tracking-[0.04em]", b.cls)}>
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-foreground tabular-nums text-[12.5px]">
                        {p._hasVariants && p._variantPriceMin != null && p._variantPriceMax != null && p._variantPriceMin !== p._variantPriceMax
                          ? `${CURRENCY_SYMBOL}${p._variantPriceMin} – ${CURRENCY_SYMBOL}${p._variantPriceMax}`
                          : `${CURRENCY_SYMBOL}${p._hasVariants && p._variantPriceMin != null ? p._variantPriceMin : p.price}`}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("tabular-nums font-medium text-[12.5px]", p.stock === 0 ? "text-destructive" : p.stock <= 5 ? "text-destructive" : "text-foreground/80")}>
                          {p.stock}
                          {p._hasVariants && <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">· {p._variantCount}v</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2 h-[22px] rounded-[4px] text-[11px] font-medium",
                          statusActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                          statusArchived ? "bg-muted text-muted-foreground" :
                          "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        )}>
                          <span className={cn("w-1.5 h-1.5 rounded-full",
                            statusActive ? "bg-emerald-500" : statusArchived ? "bg-muted-foreground/50" : "bg-amber-500"
                          )} />
                          {statusActive ? "Active" : statusArchived ? "Archived" : "Draft"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => openOffers(p)} title="Offers" className="rounded-[4px] h-8 w-8 p-0 text-muted-foreground/70 hover:text-foreground"><Tag size={14} /></Button>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(p)} title="Edit" className="rounded-[4px] h-8 w-8 p-0 text-muted-foreground/70 hover:text-foreground"><Pencil size={14} /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} title="Delete" className="rounded-[4px] h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10"><Trash2 size={14} /></Button>
                        </div>
                      </td>

                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>



          {/* Mobile cards — touch-friendly drag via dnd-kit */}
          <MobileProductList
            products={products}
            onReorder={persistOrder}
            onEdit={startEdit}
            onDelete={handleDelete}
            onOffers={openOffers}
            reorderMode={reorderMode}
          />



        </>
      )}

      {/* Offers Dialog */}
      <Dialog open={!!offersDialogProduct} onOpenChange={(open) => { if (!open) setOffersDialogProduct(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-[4px] p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b border-border/60 space-y-1">
            <DialogTitle className="text-[14px] font-semibold leading-none">Batch Offers & Deals</DialogTitle>
            <p className="text-[11.5px] text-muted-foreground/70 leading-snug">
              Create special offers like "Buy 3 Get 1 Free" or "Buy 3 Get {CURRENCY_SYMBOL}90 Off".
            </p>
          </DialogHeader>

          <div className="p-4 space-y-4">
            {/* Existing offers */}
            <section className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
              <header className="px-3 py-2 border-b border-border/40 bg-muted/40">
                <h3 className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  Active offers {offers.length > 0 && <span className="opacity-60 ml-1 tabular-nums">({offers.length})</span>}
                </h3>
              </header>
              {offers.length === 0 ? (
                <p className="text-[12px] text-muted-foreground/60 text-center py-6">No offers yet</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {offers.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Switch checked={o.enabled} onCheckedChange={(v) => toggleOffer(o.id!, v)} />
                        <span className="text-[12.5px] text-foreground truncate">{o.display_text}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteOffer(o.id!)}
                        className="rounded-[4px] h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Add new */}
            <section className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
              <header className="px-3 py-2 border-b border-border/40 bg-muted/40">
                <h3 className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">Add new offer</h3>
              </header>
              <div className="p-3 space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1 block">Offer type</label>
                  <Select value={newOffer.offer_type} onValueChange={handleOfferTypeChange}>
                    <SelectTrigger className="h-9 rounded-[4px] text-[12.5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {offerTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(newOffer.offer_type === "buy_x_get_y_same" || newOffer.offer_type === "buy_x_get_y_diff" || newOffer.offer_type === "buy_x_get_y_free_delivery") && (
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span>Buy</span>
                    <Input type="number" inputMode="numeric" className="w-20 h-9 rounded-[4px] text-[12.5px]" value={newOffer.buy_quantity ?? 3} onChange={(e) => { const u = { ...newOffer, buy_quantity: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                    <span>get</span>
                    <Input type="number" inputMode="numeric" className="w-20 h-9 rounded-[4px] text-[12.5px]" value={newOffer.get_quantity ?? 1} onChange={(e) => { const u = { ...newOffer, get_quantity: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                    <span>free</span>
                  </div>
                )}

                {newOffer.offer_type === "buy_x_get_off" && (
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span>Buy</span>
                    <Input type="number" inputMode="numeric" className="w-20 h-9 rounded-[4px] text-[12.5px]" value={newOffer.buy_quantity ?? 3} onChange={(e) => { const u = { ...newOffer, buy_quantity: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                    <span>get {CURRENCY_SYMBOL}</span>
                    <Input type="number" inputMode="numeric" className="w-24 h-9 rounded-[4px] text-[12.5px]" value={newOffer.discount_value ?? ""} onChange={(e) => { const u = { ...newOffer, discount_value: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                    <span>off</span>
                  </div>
                )}

                {newOffer.offer_type === "flat_percent" && (
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span>Discount</span>
                    <Input type="number" inputMode="numeric" className="w-24 h-9 rounded-[4px] text-[12.5px]" value={newOffer.discount_value ?? ""} onChange={(e) => { const u = { ...newOffer, discount_value: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                    <span>%</span>
                  </div>
                )}

                {newOffer.offer_type === "free_delivery" && (
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <span>Min cart total {CURRENCY_SYMBOL}</span>
                    <Input type="number" className="w-28 h-9 rounded-[4px] text-[12.5px]" value={newOffer.discount_value ?? ""} onChange={(e) => { const u = { ...newOffer, discount_value: +e.target.value }; u.display_text = generateDisplayText(u); setNewOffer(u); }} />
                  </div>
                )}

                {/* Variant targeting — only meaningful for offers that need a purchased item */}
                {newOffer.offer_type !== "free_delivery" && offerTargetVariants.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 block">
                      Eligible variants
                      <span className="ml-1 normal-case tracking-normal text-muted-foreground/60">
                        ({(newOffer.target_variant_ids?.length ?? 0) === 0 ? "Any variant qualifies" : `${newOffer.target_variant_ids.length} selected`})
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 border border-border/50 rounded-[4px] bg-muted/20">
                      {offerTargetVariants.map((v) => {
                        const label = v.option_values
                          ? Object.values(v.option_values).filter(Boolean).join(" / ")
                          : v.sku || v.id.slice(0, 6);
                        const selected = (newOffer.target_variant_ids ?? []).includes(v.id);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => toggleTargetVariant(v.id)}
                            className={`px-2 py-1 rounded-[4px] text-[11.5px] border transition ${
                              selected
                                ? "bg-foreground text-background border-foreground"
                                : "bg-background border-border/60 text-foreground hover:border-foreground/50"
                            }`}
                          >
                            {label || "—"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] text-muted-foreground/60">
                      Leave empty to apply to every variant of this product.
                    </p>
                  </div>
                )}

                {/* Free product + variant picker — only for "Buy X Get Different Product Free" */}
                {newOffer.offer_type === "buy_x_get_y_diff" && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1 block">Free product</label>
                      <Select
                        value={newOffer.free_product_id ?? ""}
                        onValueChange={(v) => updateFreeProduct(v || null)}
                      >
                        <SelectTrigger className="h-9 rounded-[4px] text-[12.5px]">
                          <SelectValue placeholder="Choose a free product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {offerFreeVariants.length > 0 && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1 block">Free variant</label>
                        <Select
                          value={newOffer.free_variant_id ?? ""}
                          onValueChange={(v) => setNewOffer({ ...newOffer, free_variant_id: v || null })}
                        >
                          <SelectTrigger className="h-9 rounded-[4px] text-[12.5px]">
                            <SelectValue placeholder="Pick a specific variant" />
                          </SelectTrigger>
                          <SelectContent>
                            {offerFreeVariants.map((v) => {
                              const label = v.option_values
                                ? Object.values(v.option_values).filter(Boolean).join(" / ")
                                : v.sku || v.id.slice(0, 6);
                              return <SelectItem key={v.id} value={v.id}>{label || "—"}</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                        <p className="text-[10.5px] text-muted-foreground/60 mt-1">
                          Stock will be deducted from this exact variant.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 mb-1 block">Display text (editable)</label>
                  <Input
                    value={newOffer.display_text}
                    onChange={(e) => setNewOffer({ ...newOffer, display_text: e.target.value })}
                    className="h-9 rounded-[4px] text-[12.5px]"
                  />
                </div>


                <Button
                  onClick={addOffer}
                  className="w-full h-9 rounded-[4px] text-[12px] bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus size={14} className="mr-1" /> Add offer
                </Button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>


      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this product?</AlertDialogTitle>
            <AlertDialogDescription>
              This is permanent and will also remove its variants, tabs and FAQs. Existing orders are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Mobile sortable list (touch-friendly via @dnd-kit)
// ─────────────────────────────────────────────────────────────
function MobileProductList({
  products, onReorder, onEdit, onDelete, onOffers, reorderMode,
}: {
  products: ProductRow[];
  onReorder: (ids: string[]) => Promise<void> | void;
  onEdit: (p: ProductRow) => void;
  onDelete: (id: string) => void;
  onOffers: (p: ProductRow) => void;
  reorderMode: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = products.map((p) => p.id);
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };
  return (
    <div className="sm:hidden">
      {reorderMode && (
        <div className="mb-2 px-2.5 py-1.5 rounded-[4px] bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <ArrowUpDown size={11} /> Drag the handle to reorder. Tap Done when finished.
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="bg-background border border-border/60 rounded-[4px] overflow-hidden divide-y divide-border/40">
            {products.map((p) => (
              <SortableProductCard
                key={p.id}
                product={p}
                onEdit={onEdit}
                onDelete={onDelete}
                onOffers={onOffers}
                reorderMode={reorderMode}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableProductCard({
  product: p, onEdit, onDelete, onOffers, reorderMode,
}: {
  product: ProductRow;
  onEdit: (p: ProductRow) => void;
  onDelete: (id: string) => void;
  onOffers: (p: ProductRow) => void;
  reorderMode: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled: !reorderMode });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const badges: { label: string; cls: string }[] = [];
  if (p.featured) badges.push({ label: "FEAT", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" });
  if (p.is_new_arrival) badges.push({ label: "NEW", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" });
  if (p.best_seller) badges.push({ label: "BEST", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" });
  const statusActive = p.status === "active";
  const statusArchived = p.status === "archived";
  const priceVal = p.sale_price && Number(p.sale_price) > 0 ? p.sale_price : (p.base_price ?? p.price);
  const priceDisplay = p._hasVariants && p._variantPriceMin != null && p._variantPriceMax != null && p._variantPriceMin !== p._variantPriceMax
    ? `${CURRENCY_SYMBOL}${p._variantPriceMin}–${CURRENCY_SYMBOL}${p._variantPriceMax}`
    : `${CURRENCY_SYMBOL}${p._hasVariants && p._variantPriceMin != null ? p._variantPriceMin : priceVal}`;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-background p-2.5 transition-shadow",
        isDragging && "opacity-60 shadow-lg z-10 rounded-[4px] border border-border",
        reorderMode && !isDragging && "bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2.5">
        {p.images?.[0] ? (
          <img src={resolveImageSrc(p.images[0], 400)} alt="" className="w-[60px] h-[60px] rounded-[4px] object-cover flex-shrink-0" />
        ) : (
          <div className="w-[60px] h-[60px] rounded-[4px] bg-muted/40 border border-border/60 flex items-center justify-center flex-shrink-0">
            <ImageOff size={18} className="text-muted-foreground/50" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-[12.5px] font-medium text-foreground leading-snug line-clamp-2 break-words">{p.name}</p>
          <div className="flex items-center gap-1.5 text-[11.5px]">
            <span className="text-foreground/85 tabular-nums font-semibold">{priceDisplay}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn("tabular-nums", p.stock === 0 || p.stock <= 5 ? "text-destructive font-medium" : "text-muted-foreground")}>Stock {p.stock}{p._hasVariants ? ` · ${p._variantCount}v` : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "inline-flex items-center px-1.5 h-[18px] rounded-[4px] text-[10px] font-medium",
              statusActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
              statusArchived ? "bg-muted text-muted-foreground" :
              "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            )}>
              {statusActive ? "Active" : statusArchived ? "Archived" : "Draft"}
            </span>
            {badges.map((b) => (
              <span key={b.label} className={cn("inline-flex items-center px-1.5 h-[18px] rounded-[4px] text-[9.5px] font-semibold tracking-[0.04em]", b.cls)}>
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {reorderMode ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="cursor-grab active:cursor-grabbing text-muted-foreground/60 h-10 w-8 -mr-1 flex items-center justify-center touch-none flex-shrink-0"
          >
            <GripVertical size={18} />
          </button>
        ) : (
          <div className="flex items-center gap-0.5 pl-1.5 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => onOffers(p)} className="rounded-[4px] h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Offers">
              <Tag size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(p)} className="rounded-[4px] h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Edit">
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(p.id)} className="rounded-[4px] h-8 w-8 p-0 text-destructive/80 hover:text-destructive hover:bg-destructive/10" title="Delete">
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


export default Products;
