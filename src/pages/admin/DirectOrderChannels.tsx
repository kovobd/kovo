import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Section, FormRow, StickyActionBar, EmptyState } from "@/components/admin/ui";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { Plus, Trash2, MessageCircle, RotateCcw, Save, Loader2 } from "lucide-react";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

interface Channel {
  id: string;
  enabled: boolean;
  label: string;
  identifier: string;
  message_template: string;
  sort_order: number;
}

type Kind = "whatsapp" | "messenger";

const channelKind = (c: Channel): Kind => {
  const l = (c.label || "").toLowerCase();
  return l.includes("messenger") || l.includes("facebook") ? "messenger" : "whatsapp";
};

const META: Record<Kind, {
  title: string; idLabel: string; idHint: string; idPlaceholder: string;
  prefix: string; color: string; defaultLabel: string; defaultTemplate: string;
}> = {
  whatsapp: {
    title: "WhatsApp",
    idLabel: "Phone number",
    idHint: "Include country code, digits only. Example: 8801XXXXXXXXX",
    idPlaceholder: "8801XXXXXXXXX",
    prefix: "wa.me/",
    color: "#25D366",
    defaultLabel: "Chat on WhatsApp",
    defaultTemplate: "Hi! I'd like to order {product_name} ({product_url})",
  },
  messenger: {
    title: "Messenger",
    idLabel: "Page username",
    idHint: "The part after m.me/. Example: yourpage",
    idPlaceholder: "yourpage",
    prefix: "m.me/",
    color: "#0084FF",
    defaultLabel: "Chat on Messenger",
    defaultTemplate: "",
  },
};

const DirectOrderChannels = ({ hideTitle }: { hideTitle?: boolean }) => {
  const [rows, setRows] = useState<Channel[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { dirty, rebase } = useDirtyForm({ rows, deleted });

  const load = () => {
    setLoading(true);
    supabase.from("direct_order_channels").select("*").order("sort_order").then(({ data }) => {
      const next = (data as Channel[]) ?? [];
      setRows(next);
      setDeleted([]);
      rebase({ rows: next, deleted: [] });
      setLoading(false);
    });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const update = (id: string, patch: Partial<Channel>) => {
    setRows((r) => r.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addChannel = (kind: Kind) => {
    if (rows.some((r) => channelKind(r) === kind)) {
      toast({ title: `${META[kind].title} channel already exists`, variant: "destructive" });
      return;
    }
    const m = META[kind];
    const newRow: Channel = {
      id: `new-${crypto.randomUUID()}`,
      enabled: true,
      label: m.defaultLabel,
      identifier: "",
      message_template: m.defaultTemplate,
      sort_order: rows.length,
    };
    setRows((r) => [...r, newRow]);
  };

  const removeChannel = (id: string) => {
    setRows((r) => r.filter((c) => c.id !== id));
    if (!id.startsWith("new-")) setDeleted((d) => [...d, id]);
  };

  const save = async () => {
    for (const c of rows) {
      if (c.enabled && !c.identifier.trim()) {
        toast({ title: `${c.label} is missing its ${channelKind(c) === "whatsapp" ? "phone number" : "username"}`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      if (deleted.length) {
        const { error } = await supabase.from("direct_order_channels").delete().in("id", deleted);
        if (error) throw error;
      }
      const inserts = rows.filter((c) => c.id.startsWith("new-")).map((c) => ({
        enabled: c.enabled, label: c.label, identifier: c.identifier.trim(),
        message_template: c.message_template, sort_order: c.sort_order,
      }));
      const updates = rows.filter((c) => !c.id.startsWith("new-"));
      if (inserts.length) {
        const { error } = await supabase.from("direct_order_channels").insert(inserts);
        if (error) throw error;
      }
      for (const c of updates) {
        const { error } = await supabase.from("direct_order_channels").update({
          enabled: c.enabled, label: c.label, identifier: c.identifier.trim(),
          message_template: c.message_template, sort_order: c.sort_order,
        }).eq("id", c.id);
        if (error) throw error;
      }
      bumpStorefrontVersion();
      toast({ title: "Channels saved" });
      load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasWA = rows.some((r) => channelKind(r) === "whatsapp");
  const hasMSG = rows.some((r) => channelKind(r) === "messenger");

  const AddButtons = () => (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => addChannel("whatsapp")} disabled={hasWA}>
        <Plus className="h-4 w-4 mr-1.5" /> Add WhatsApp
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => addChannel("messenger")} disabled={hasMSG}>
        <Plus className="h-4 w-4 mr-1.5" /> Add Messenger
      </Button>
    </div>
  );

  if (loading) {
    return <div className="max-w-2xl space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}</div>;
  }

  return (
    <div className="max-w-2xl space-y-4 pb-8">
      {!hideTitle && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Direct order channels</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">Customer chat shortcuts shown on the product page.</p>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-6 w-6" />}
          title="No direct order channels yet"
          description="Add WhatsApp or Messenger so customers can order directly from product pages."
          action={<AddButtons />}
        />
      ) : (
        (!hasWA || !hasMSG) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-[12px] text-muted-foreground">Add another channel</p>
            <AddButtons />
          </div>
        )
      )}

      {rows.map((c) => {
        const kind = channelKind(c);
        const m = META[kind];
        const fullLink = c.identifier.trim() ? `${m.prefix}${c.identifier.trim()}` : `${m.prefix}…`;
        return (
          <Section
            key={c.id}
            title={m.title}
            meta={
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: c.enabled ? m.color : "hsl(var(--muted-foreground) / 0.4)" }}
                aria-hidden
              />
            }
            actions={
              <div className="flex items-center gap-1.5">
                <Switch checked={c.enabled} onCheckedChange={(v) => update(c.id, { enabled: v })} />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeChannel(c.id)} aria-label="Remove channel">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <FormRow label="Button label">
                <Input className="h-11" value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} placeholder={`Chat on ${m.title}`} />
              </FormRow>
              <FormRow label={m.idLabel} hint={m.idHint}>
                <div className="flex items-stretch rounded-lg border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/30">
                  <span className="px-3 flex items-center text-[12px] font-mono text-muted-foreground bg-muted/40 border-r border-border/40 shrink-0">
                    {m.prefix}
                  </span>
                  <input
                    className="h-11 flex-1 bg-transparent px-3 text-[13px] focus:outline-none min-w-0"
                    inputMode={kind === "whatsapp" ? "tel" : "text"}
                    value={c.identifier}
                    onChange={(e) => update(c.id, { identifier: e.target.value })}
                    placeholder={m.idPlaceholder}
                  />
                </div>
                {c.identifier.trim() && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 font-mono truncate">→ https://{fullLink}</p>
                )}
              </FormRow>
              {kind === "whatsapp" && (
                <FormRow label="Message template" hint="Variables: {product_name}, {product_url}">
                  <Textarea rows={2} value={c.message_template} onChange={(e) => update(c.id, { message_template: e.target.value })} placeholder="Hi! I'd like to order {product_name} ({product_url})" />
                </FormRow>
              )}
            </div>
          </Section>
        );
      })}

      <StickyActionBar visible={dirty} message="Unsaved channel changes">
        <Button className="a-btn a-btn-ghost" size="sm" variant="ghost" onClick={load} disabled={saving}>
          <RotateCcw className="h-3.5 w-3.5" /> Discard
        </Button>
        <Button className="a-btn a-btn-primary" size="sm" onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="animate-spin h-3.5 w-3.5" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save changes</>}
        </Button>
      </StickyActionBar>
    </div>
  );
};

export default DirectOrderChannels;
