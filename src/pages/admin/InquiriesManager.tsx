import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, Download, Eye, Trash2, Users, Loader2 } from "lucide-react";
import { PageHeader, DataList, EmptyState, Section, StatusPill } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { unreadInquiriesKey } from "@/hooks/useUnreadInquiries";

// Paginated server-side fetches. Previously this page issued unbounded
// `select("*")` reads for both tables, which silently capped at PostgREST's
// 1000-row limit and grew linearly with each new inquiry/subscriber.
const PAGE_SIZE = 50;

type InquiryRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  created_at: string;
  read: boolean | null;
};

type SubscriberRow = {
  id: string;
  email: string;
  subscribed_at: string;
};

const inquiriesKey = ["admin", "inquiries"] as const;
const subscribersKey = ["admin", "newsletter-subscribers"] as const;

async function fetchInquiriesPage({ pageParam = 0 }: { pageParam?: number }) {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("contact_submissions")
    .select("id, name, email, phone, message, created_at, read", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    rows: (data ?? []) as InquiryRow[],
    nextPage: (data ?? []).length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count ?? 0,
  };
}

async function fetchSubscribersPage({ pageParam = 0 }: { pageParam?: number }) {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("newsletter_subscribers")
    .select("id, email, subscribed_at", { count: "exact" })
    .order("subscribed_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    rows: (data ?? []) as SubscriberRow[],
    nextPage: (data ?? []).length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count ?? 0,
  };
}

const InquiriesManager = () => {
  const [tab, setTab] = useState<"inquiries" | "subscribers">("inquiries");
  const { toast } = useToast();
  const qc = useQueryClient();

  const inqQuery = useInfiniteQuery({
    queryKey: inquiriesKey,
    queryFn: fetchInquiriesPage,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30_000,
  });

  const subQuery = useInfiniteQuery({
    queryKey: subscribersKey,
    queryFn: fetchSubscribersPage,
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    staleTime: 30_000,
    enabled: tab === "subscribers",
  });

  const submissions = useMemo<InquiryRow[]>(
    () => (inqQuery.data?.pages ?? []).flatMap((p) => p.rows),
    [inqQuery.data],
  );
  const subscribers = useMemo<SubscriberRow[]>(
    () => (subQuery.data?.pages ?? []).flatMap((p) => p.rows),
    [subQuery.data],
  );

  const inqTotal = inqQuery.data?.pages?.[0]?.total ?? 0;
  const subTotal = subQuery.data?.pages?.[0]?.total ?? 0;

  // Bulk fetch a full export still bounded by the server. Cap to a safe
  // ceiling so a runaway table cannot DoS the browser/PostgREST.
  const fetchAllForExport = async (table: "contact_submissions" | "newsletter_subscribers") => {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(table === "contact_submissions" ? "created_at" : "subscribed_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return data ?? [];
  };

  const loading = tab === "inquiries" ? inqQuery.isLoading : subQuery.isLoading;

  const markRead = async (id: string) => {
    await supabase.from("contact_submissions").update({ read: true }).eq("id", id);
    qc.setQueryData(inquiriesKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          rows: p.rows.map((r: InquiryRow) => (r.id === id ? { ...r, read: true } : r)),
        })),
      };
    });
    qc.invalidateQueries({ queryKey: unreadInquiriesKey });
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm("Delete this inquiry?")) return;
    await supabase.from("contact_submissions").delete().eq("id", id);
    qc.setQueryData(inquiriesKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          rows: p.rows.filter((r: InquiryRow) => r.id !== id),
          total: Math.max(0, (p.total ?? 0) - 1),
        })),
      };
    });
    qc.invalidateQueries({ queryKey: unreadInquiriesKey });
    toast({ title: "Deleted" });
  };

  const deleteSubscriber = async (id: string) => {
    if (!confirm("Remove this subscriber?")) return;
    await supabase.from("newsletter_subscribers").delete().eq("id", id);
    qc.setQueryData(subscribersKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          rows: p.rows.filter((r: SubscriberRow) => r.id !== id),
          total: Math.max(0, (p.total ?? 0) - 1),
        })),
      };
    });
    toast({ title: "Removed" });
  };

  const exportCSV = async () => {
    try {
      const rows = await fetchAllForExport(tab === "inquiries" ? "contact_submissions" : "newsletter_subscribers");
      const columns = tab === "inquiries"
        ? ["name", "email", "phone", "message", "created_at"]
        : ["email", "subscribed_at"];
      const header = columns.join(",");
      const body = rows.map((row: any) =>
        columns.map((col) => `"${String(row[col] ?? "").replace(/"/g, '""')}"`).join(","),
      );
      const csv = [header, ...body].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tab === "inquiries" ? "inquiries" : "subscribers"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${rows.length} records` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  // Unread counter shown in the tab pill. Use loaded submissions (page 0 is
  // sorted DESC, so unread items appear there first); this matches prior
  // behavior closely enough for the visual badge.
  const unreadCount = submissions.filter((s) => !s.read).length;

  return (
    <div>
      <PageHeader
        title="Inquiries & Emails"
        subtitle={`${unreadCount} unread · ${subTotal || subscribers.length} subscribers`}
      />

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl w-fit">
          <button
            onClick={() => setTab("inquiries")}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12px] font-medium transition ${
              tab === "inquiries" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail size={13} /> Inquiries
            {unreadCount > 0 && <StatusPill tone="danger" className="text-[9px] ml-0.5">{unreadCount}</StatusPill>}
          </button>
          <button
            onClick={() => setTab("subscribers")}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12px] font-medium transition ${
              tab === "subscribers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users size={13} /> Subscribers
            <span className="text-[10px] text-muted-foreground/70 ml-0.5">{subTotal || subscribers.length}</span>
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1 h-9"
          onClick={exportCSV}
          disabled={tab === "inquiries" ? inqTotal === 0 : subTotal === 0}
        >
          <Download size={12} /> Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : tab === "inquiries" ? (
        <>
          {submissions.length === 0 ? (
            <Section><EmptyState icon={<Mail size={18} />} title="No inquiries yet" description="Customer messages from the contact form will appear here." /></Section>
          ) : (
            <div className="space-y-2">
              {submissions.map((s) => (
                <div key={s.id} className={`bg-background rounded-2xl border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${s.read ? "border-border/60" : "border-primary/40 bg-primary/5"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] font-medium text-foreground">{s.name}</span>
                        {!s.read && <StatusPill tone="info" className="text-[9px]">New</StatusPill>}
                      </div>
                      <p className="text-[12px] text-muted-foreground">{s.email}{s.phone ? ` · ${s.phone}` : ""}</p>
                      <p className="text-[13px] text-foreground mt-1.5 whitespace-pre-wrap">{s.message}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!s.read && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markRead(s.id)} title="Mark read">
                          <Eye size={14} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteSubmission(s.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {inqQuery.hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 gap-1.5"
                    onClick={() => inqQuery.fetchNextPage()}
                    disabled={inqQuery.isFetchingNextPage}
                  >
                    {inqQuery.isFetchingNextPage && <Loader2 size={12} className="animate-spin" />}
                    Load more ({submissions.length} of {inqTotal})
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <DataList
            rows={subscribers}
            rowKey={(s: any) => s.id}
            empty={<EmptyState icon={<Users size={18} />} title="No subscribers yet" description="Newsletter signups will appear here." />}
            columns={[
              { key: "email", label: "Email", render: (s: any) => <span className="text-foreground">{s.email}</span> },
              { key: "date", label: "Subscribed", render: (s: any) => <span className="text-muted-foreground">{new Date(s.subscribed_at).toLocaleDateString()}</span> },
              { key: "actions", label: "", align: "right", render: (s: any) => (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSubscriber(s.id)}><Trash2 size={12} /></Button>
              ) },
            ]}
            mobileCard={(s: any) => (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground truncate">{s.email}</p>
                  <p className="text-[11px] text-muted-foreground/70">{new Date(s.subscribed_at).toLocaleDateString()}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => deleteSubscriber(s.id)}><Trash2 size={13} /></Button>
              </div>
            )}
          />
          {subQuery.hasNextPage && (
            <div className="flex justify-center pt-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-9 gap-1.5"
                onClick={() => subQuery.fetchNextPage()}
                disabled={subQuery.isFetchingNextPage}
              >
                {subQuery.isFetchingNextPage && <Loader2 size={12} className="animate-spin" />}
                Load more ({subscribers.length} of {subTotal})
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InquiriesManager;
