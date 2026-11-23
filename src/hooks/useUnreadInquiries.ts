import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";

export const unreadInquiriesKey = ["admin", "inquiries", "unread-count"] as const;

async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("contact_submissions")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  if (error) throw error;
  return count ?? 0;
}

function fireBrowserNotification(name: string | null, message: string | null) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const notif = new Notification("New inquiry received", {
      body: `${name ?? "Customer"}${message ? ` · ${message.slice(0, 80)}` : ""}`,
      icon: "/favicon.ico",
      tag: `inquiry-${Date.now()}`,
    });
    notif.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      window.location.href = "/admin/inquiries";
      notif.close();
    };
  } catch { /* ignore */ }
}

export function useUnreadInquiries() {
  const { user, role } = useAdmin();
  const qc = useQueryClient();
  const enabled = Boolean(user && (role === "admin" || role === "staff"));
  const seenIdsRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: unreadInquiriesKey,
    queryFn: fetchUnreadCount,
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      if (channel) return;
      channel = supabase
        .channel(`inquiries-unread:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contact_submissions" },
          (payload) => {
            const row = payload.new as { id: string; name: string | null; message: string | null };
            if (seenIdsRef.current.has(row.id)) return;
            seenIdsRef.current.add(row.id);
            qc.setQueryData<number>(unreadInquiriesKey, (prev) => (prev ?? 0) + 1);
            qc.invalidateQueries({ queryKey: ["admin", "inquiries", "list"] });
            fireBrowserNotification(row.name, row.message);
          },
        )
        .subscribe();
    };
    const unsubscribe = () => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        subscribe();
        qc.invalidateQueries({ queryKey: unreadInquiriesKey });
      } else unsubscribe();
    };

    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubscribe();
    };
  }, [enabled, qc]);

  return { count: query.data ?? 0, isLoading: query.isLoading };
}
