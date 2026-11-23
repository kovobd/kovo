import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Section, FormRow, StickyActionBar } from "@/components/admin/ui";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

const ShopSettings = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { dirty, rebase } = useDirtyForm(settings);
  const queryClient = useQueryClient();

  const fetchData = async () => {
    let { data } = await supabase.from("shop_settings").select("*").eq("id", "default").maybeSingle();
    if (!data) {
      const { ensureCmsDefaults } = await import("@/lib/cmsBootstrap");
      await ensureCmsDefaults({ force: true });
      ({ data } = await supabase.from("shop_settings").select("*").eq("id", "default").maybeSingle());
    }
    setSettings(data);
    rebase(data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    const { id: _id, updated_at: _u, ...payload } = settings;
    const { error } = await supabase.from("shop_settings").update(payload).eq("id", "default");
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      rebase(settings);
      bumpStorefrontVersion();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["public-layout"] }),
        queryClient.invalidateQueries({ queryKey: ["public-home"] }),
        queryClient.invalidateQueries({ queryKey: ["public-shop"] }),
      ]);
      toast({ title: "Settings saved" });
    }
  };

  if (loading || !settings) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5 pb-20">
      {!hideTitle && <h1 className="text-xl font-semibold text-foreground tracking-tight">Shop settings</h1>}

      <Section title="Browsing" description="Search and sorting on the shop page">
        <div className="space-y-4">
          <FormRow label="Search enabled" inline>
            <Switch checked={settings.search_enabled} onCheckedChange={(v) => setSettings({ ...settings, search_enabled: v })} />
          </FormRow>
          <FormRow label="Sorting enabled" inline>
            <Switch checked={settings.sorting_enabled} onCheckedChange={(v) => setSettings({ ...settings, sorting_enabled: v })} />
          </FormRow>
          <FormRow label="Default sorting">
            <Select value={settings.default_sorting} onValueChange={(v) => setSettings({ ...settings, default_sorting: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">New</SelectItem>
                <SelectItem value="price_low">Price: low to high</SelectItem>
                <SelectItem value="price_high">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
        </div>
      </Section>

      <Section title="Product card" description="What customers see on each product card">
        <div className="space-y-4">
          <FormRow label="Primary card button" hint="Controls the main call-to-action on product cards.">
            <Select value={settings.card_cta_mode ?? "view_details"} onValueChange={(v) => setSettings({ ...settings, card_cta_mode: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="view_details">View details</SelectItem>
                <SelectItem value="add_to_cart">Add to cart</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>

          <div className="pt-2 border-t border-border/30 space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Visible buttons</p>
            {[
              { key: "card_show_view_details", label: "View details" },
              { key: "card_show_add_to_cart", label: "Add to cart" },
              { key: "card_show_buy_now", label: "Buy now" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-[13px] text-foreground">{label}</span>
                <Switch
                  checked={settings[key] !== false}
                  onCheckedChange={(v) => setSettings({ ...settings, [key]: v })}
                />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <StickyActionBar visible={dirty} message="Unsaved shop settings">
        <Button size="sm" variant="ghost" onClick={() => fetchData()} disabled={saving}>Discard</Button>
        <Button size="sm" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </StickyActionBar>
    </div>
  );
};

export default ShopSettings;
