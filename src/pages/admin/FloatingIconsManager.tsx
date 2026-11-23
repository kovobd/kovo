import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload, Loader2, GripVertical, ChevronDown } from "lucide-react";
import { FLOATING_PRESETS, getPresetByKey, getReadableColor } from "@/lib/floatingIconPresets";
import IconCropper from "@/components/admin/IconCropper";
import { Skeleton } from "@/components/ui/skeleton";
import { Section, FormRow, StickyActionBar, EmptyState } from "@/components/admin/ui";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { resolveImageSrc } from "@/lib/cdnImage";
import { uploadToR2 } from "@/lib/r2Upload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

interface FloatingIcon {
  id: string;
  label: string;
  url: string;
  icon_url: string | null;
  bg_color: string;
  icon_color: string;
  preset_key: string | null;
  sort_order: number;
  enabled: boolean;
}

interface FloatingSettings {
  enabled: boolean;
  radar_animation: boolean;
  expand_icon_url: string | null;
  animation_style: "radar" | "bounce" | "none";
  animation_intensity: "low" | "med" | "high";
}

const DEFAULT_BG = "#25D366";

const measureImage = (file: File): Promise<{ src: string; square: boolean }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ src, square: img.width === img.height });
      img.onerror = reject;
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const uploadBlob = async (blob: Blob, folder: string, ext = "png") => {
  const mime = ext === "svg" ? "image/svg+xml" : blob.type || "image/png";
  return uploadToR2(blob, { prefix: folder, mime });
};

const IconPreview = ({ icon }: { icon: FloatingIcon }) => {
  const preset = getPresetByKey(icon.preset_key);
  const bg = icon.bg_color || DEFAULT_BG;
  const fg = icon.icon_color || getReadableColor(bg);
  const hasImage = icon.icon_url && !preset;
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden ${hasImage ? "bg-transparent" : "bg-muted"}`}
      style={preset ? { backgroundColor: bg } : undefined}
    >
      {preset ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ color: fg }} dangerouslySetInnerHTML={{ __html: preset.svg }} />
      ) : icon.icon_url ? (
        <img src={resolveImageSrc(icon.icon_url, 400)} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] uppercase font-semibold text-muted-foreground">{icon.label?.[0] || "?"}</span>
      )}
    </div>
  );
};

interface IconControlsProps {
  icon: FloatingIcon;
  onChange: (patch: Partial<FloatingIcon>) => void;
}

const IconControls = ({ icon, onChange }: IconControlsProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "image/svg+xml") {
      setUploading(true);
      try {
        const url = await uploadBlob(file, "floating-icons", "svg");
        onChange({ icon_url: url, preset_key: null });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
      return;
    }

    try {
      const { src } = await measureImage(file);
      setCropSrc(src);
    } catch (err: any) {
      toast({ title: "Could not read image", description: err.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleCropSave = async (blob: Blob) => {
    setCropSrc(null);
    setUploading(true);
    try {
      const url = await uploadBlob(blob, "floating-icons", "png");
      onChange({ icon_url: url, preset_key: null });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const choosePreset = (key: string) => {
    if (key === "__none__") {
      onChange({ preset_key: null });
      return;
    }
    const preset = getPresetByKey(key);
    if (!preset) return;
    onChange({
      preset_key: key,
      icon_url: "",
      label: icon.label || preset.label,
      bg_color: preset.bgColor,
      icon_color: getReadableColor(preset.bgColor),
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Select value={icon.preset_key || ""} onValueChange={choosePreset}>
          <SelectTrigger className="h-9 text-[13px] flex-1 min-w-0">
            <SelectValue placeholder="Choose preset" />
          </SelectTrigger>
          <SelectContent>
            {FLOATING_PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: p.bgColor }}>
                    <svg viewBox="0 0 24 24" className="w-3 h-3" style={{ color: getReadableColor(p.bgColor) }} dangerouslySetInnerHTML={{ __html: p.svg }} />
                  </span>
                  <span className="text-[13px]">{p.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/avif" onChange={handleFile} className="hidden" />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-9 text-[12px] px-3 shrink-0">
          {uploading ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
          Upload image
        </Button>
      </div>

      <IconCropper
        open={!!cropSrc}
        imageSrc={cropSrc}
        onCancel={() => setCropSrc(null)}
        onCrop={handleCropSave}
      />
    </>
  );
};

const ExpandIconUpload = ({ value, onChange }: { value: string | null; onChange: (url: string) => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const url = await uploadBlob(file, "floating-expand", ext);
      onChange(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="w-9 h-9 rounded-full bg-background border border-border/60 flex items-center justify-center overflow-hidden">
          <img src={resolveImageSrc(value, 400)} alt="" className="w-6 h-6 object-contain" />
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground/50">Default</span>
      )}
      <input ref={ref} type="file" accept="image/*" onChange={upload} className="hidden" />
      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => ref.current?.click()} className="h-8 text-[11px]">
        {uploading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Upload size={12} className="mr-1" />}
        {value ? "Change" : "Upload"}
      </Button>
      {value && <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} className="h-8 text-[11px] text-muted-foreground">Clear</Button>}
    </div>
  );
};

const FloatingIconsManager = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [icons, setIcons] = useState<FloatingIcon[]>([]);
  const [settings, setSettings] = useState<FloatingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingIcons, setSavingIcons] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const baselineIcons = useRef<FloatingIcon[]>([]);
  const dragIdx = useRef<number | null>(null);
  const { toast } = useToast();
  const settingsDirty = useDirtyForm(settings);
  const iconsDirty = useDirtyForm(icons);

  useEffect(() => {
    Promise.all([
      supabase.from("floating_icons").select("*").order("sort_order"),
      supabase.from("floating_icons_settings").select("*").eq("id", "default").maybeSingle(),
    ]).then(([iRes, sRes]) => {
      const rows = ((iRes.data as any[]) ?? []).map((r) => ({
        ...r,
        icon_color: r.icon_color || "#ffffff",
        preset_key: r.preset_key ?? null,
      }));
      const s = (sRes.data as any) ?? {};
      const nextSettings: FloatingSettings = {
        enabled: s.enabled ?? true,
        radar_animation: s.radar_animation ?? true,
        expand_icon_url: s.expand_icon_url ?? "",
        animation_style: s.animation_style ?? (s.radar_animation === false ? "none" : "radar"),
        animation_intensity: s.animation_intensity ?? "med",
      };
      setIcons(rows);
      setSettings(nextSettings);
      baselineIcons.current = rows;
      settingsDirty.rebase(nextSettings);
      iconsDirty.rebase(rows);
      setLoading(false);
    });
  }, []);

  const updateIcon = (idx: number, patch: Partial<FloatingIcon>) => {
    setIcons((prev) => prev.map((i, idx2) => (idx2 === idx ? { ...i, ...patch } : i)));
  };

  const addIcon = () => {
    const id = `new-${Date.now()}`;
    setIcons((prev) => [...prev, {
      id,
      label: "",
      url: "",
      icon_url: "",
      bg_color: DEFAULT_BG,
      icon_color: "#ffffff",
      preset_key: null,
      sort_order: prev.length,
      enabled: true,
    }]);
    setOpenId(id);
  };

  const removeIcon = (idx: number) => {
    setIcons((prev) => prev.filter((_, i) => i !== idx));
  };

  const onDragStart = (idx: number) => { dragIdx.current = idx; };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (idx: number) => {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === idx) return;
    setIcons((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(idx, 0, m);
      return next;
    });
  };

  const discardIcons = () => {
    setIcons(baselineIcons.current);
    iconsDirty.rebase(baselineIcons.current);
  };

  const saveIcons = async () => {
    setSavingIcons(true);
    try {
      const baselineIds = new Set(baselineIcons.current.map((b) => b.id));
      const currentIds = new Set(icons.map((i) => i.id));
      // Delete removed icons
      for (const b of baselineIcons.current) {
        if (!currentIds.has(b.id) && !b.id.startsWith("new-")) {
          await supabase.from("floating_icons").delete().eq("id", b.id);
        }
      }
      const updated: FloatingIcon[] = [];
      for (let i = 0; i < icons.length; i++) {
        const ic = icons[i];
        const bg = ic.bg_color || DEFAULT_BG;
        const payload = {
          label: ic.label,
          url: ic.url,
          icon_url: ic.icon_url || "",
          bg_color: bg,
          icon_color: ic.icon_color || getReadableColor(bg),
          preset_key: ic.preset_key,
          sort_order: i,
          enabled: ic.enabled,
        };
        if (ic.id.startsWith("new-")) {
          const { data, error } = await supabase.from("floating_icons").insert(payload as any).select("id").single();
          if (error) throw error;
          updated.push({ ...ic, id: data!.id, sort_order: i });
        } else {
          const { error } = await supabase.from("floating_icons").update(payload as any).eq("id", ic.id);
          if (error) throw error;
          updated.push({ ...ic, sort_order: i });
        }
      }
      setIcons(updated);
      baselineIcons.current = updated;
      iconsDirty.rebase(updated);
      bumpStorefrontVersion();
      toast({ title: "Icons saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingIcons(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      await supabase.from("floating_icons_settings").upsert({
        id: "default",
        enabled: settings.enabled,
        radar_animation: settings.animation_style === "radar",
        expand_icon_url: settings.expand_icon_url || "",
        animation_style: settings.animation_style,
        animation_intensity: settings.animation_intensity,
        updated_at: new Date().toISOString(),
      } as any);
      settingsDirty.rebase(settings);
      bumpStorefrontVersion();
      toast({ title: "Widget settings saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {!hideTitle && (
        <div>
          <h1 className="text-xl font-semibold text-foreground">Floating icons</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Premium floating contact widget. 1 icon = single button, 2+ icons = expandable stack.</p>
        </div>
      )}

      {/* Global Settings */}
      <Section title="Widget settings" description="Site-wide controls for the floating contact widget.">
        <div className="space-y-5">
          <FormRow label="Enable widget" hint="Toggle the widget on or off site-wide." inline>
            <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
          </FormRow>

          <div className="h-px bg-border/40" />

          <FormRow label="Animation style" hint="Choose how the widget draws attention.">
            <div className="grid grid-cols-3 gap-2">
              {(["radar", "bounce", "none"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSettings({ ...settings, animation_style: s })}
                  className={`px-3 py-2 rounded-lg text-[12px] capitalize border transition-colors ${settings.animation_style === s ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormRow>

          {settings.animation_style !== "none" && (
            <FormRow label="Intensity">
              <div className="grid grid-cols-3 gap-2">
                {(["low", "med", "high"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSettings({ ...settings, animation_intensity: s })}
                    className={`px-3 py-1.5 rounded-lg text-[12px] capitalize border transition-colors ${settings.animation_intensity === s ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/30"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </FormRow>
          )}

          <div className="h-px bg-border/40" />

          <FormRow label="Expand button icon" hint="Shown when 2+ icons. Defaults to a chat bubble." inline>
            <ExpandIconUpload
              value={settings.expand_icon_url}
              onChange={(url) => setSettings({ ...settings, expand_icon_url: url })}
            />
          </FormRow>
        </div>
      </Section>

      {/* Icons list */}
      <Section
        title="Icons"
        description="Add the contact icons that appear in the floating widget."
        actions={
          <Button variant="outline" size="sm" onClick={addIcon} className="h-9">
            <Plus size={14} className="mr-1" /> Add icon
          </Button>
        }
      >
        <div className="space-y-2">
          {icons.length === 0 && (
            <EmptyState
              title="No icons yet"
              description='Click "Add icon" to create your first floating contact icon.'
            />
          )}

          {icons.map((ic, idx) => {
            const isOpen = openId === ic.id;
            return (
              <div
                key={ic.id}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(idx)}
                className="border border-border/50 rounded-xl bg-background/40 overflow-hidden transition-colors"
              >
                {/* Top row: drag + preview + label preview + toggle + delete + expand */}
                <div className="flex items-center gap-2 px-2 py-2">
                  <button
                    type="button"
                    className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing h-8 w-7 flex items-center justify-center shrink-0 rounded-md hover:bg-muted/40 transition-colors"
                    aria-label="Drag to reorder"
                  >
                    <GripVertical size={14} />
                  </button>

                  <IconPreview icon={ic} />

                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : ic.id)}
                    className="flex-1 min-w-0 text-left h-9 flex items-center px-1 rounded-md hover:bg-muted/30 transition-colors"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    <span
                      className={`text-[13px] truncate ${ic.label ? "text-foreground font-medium" : "text-muted-foreground/50 italic"}`}
                    >
                      {ic.label || "No text"}
                    </span>
                  </button>

                  <div className="h-8 flex items-center justify-center shrink-0">
                    <Switch checked={ic.enabled} onCheckedChange={(v) => updateIcon(idx, { enabled: v })} className="scale-90" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeIcon(idx)} className="text-muted-foreground hover:text-destructive h-8 w-8 p-0 shrink-0 rounded-md hover:bg-muted/40">
                    <Trash2 size={14} />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : ic.id)}
                    className="h-8 w-8 flex items-center justify-center text-muted-foreground/60 hover:text-foreground shrink-0 rounded-md hover:bg-muted/40 transition-colors"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Body */}
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/30">
                    <FormRow label="Text / Label" className="space-y-1">
                      <Input
                        value={ic.label}
                        onChange={(e) => updateIcon(idx, { label: e.target.value })}
                        placeholder="e.g. WhatsApp"
                        className="h-9 text-[13px]"
                      />
                    </FormRow>

                    <FormRow label="Link" className="space-y-1">
                      <Input
                        value={ic.url}
                        onChange={(e) => updateIcon(idx, { url: e.target.value })}
                        placeholder="https://wa.me/8801XXXXXXXXX"
                        inputMode="url"
                        className="h-9 text-[13px]"
                      />
                    </FormRow>

                    <FormRow label="Icon" className="space-y-1">
                      <IconControls icon={ic} onChange={(patch) => updateIcon(idx, patch)} />
                    </FormRow>
                  </div>
                )}

              </div>
            );
          })}

          {iconsDirty.dirty && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={discardIcons} disabled={savingIcons}>Discard</Button>
              <Button size="sm" onClick={saveIcons} disabled={savingIcons}>
                {savingIcons ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      </Section>

      <StickyActionBar visible={settingsDirty.dirty} message="Unsaved widget settings">
        <Button variant="ghost" onClick={() => window.location.reload()}>Discard</Button>
        <Button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? "Saving…" : "Save changes"}</Button>
      </StickyActionBar>
    </div>
  );
};

export default FloatingIconsManager;
