import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";

export type AdminNotification = {
  id: string;
  type: "order" | "incomplete_order";
  reference_id: string | null;
  customer_name: string | null;
  amount: number;
  title: string;
  message: string | null;
  url: string | null;
  admin_seen: boolean;
  seen_at: string | null;
  created_at: string;
};

export const adminNotifKeys = {
  list: ["admin", "notifications"] as const,
};

const NOTIF_LIMIT = 50;

async function fetchNotifications(): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id,type,reference_id,customer_name,amount,title,message,url,admin_seen,seen_at,created_at")
    .order("created_at", { ascending: false })
    .limit(NOTIF_LIMIT);
  if (error) throw error;
  return (data ?? []) as AdminNotification[];
}

function fireBrowserNotification(n: AdminNotification) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const body =
      n.amount > 0
        ? `${n.message ?? ""}${n.message ? " · " : ""}৳${Math.round(n.amount)}`
        : n.message ?? "";
    const notif = new Notification(n.title, {
      body,
      tag: n.id,
      icon: "/favicon.ico",
    });
    notif.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      if (n.url) {
        try {
          // SPA navigation via history API so React Router picks it up — avoids full reload.
          window.history.pushState({}, "", n.url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = n.url;
        }
      }
      notif.close();
    };
  } catch { /* ignore */ }
}

export function useAdminNotifications() {
  const { user, role } = useAdmin();
  const qc = useQueryClient();
  const enabled = Boolean(user && (role === "admin" || role === "staff"));
  const seenIdsRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: adminNotifKeys.list,
    queryFn: fetchNotifications,
    enabled,
    staleTime: 60_000,
  });

  // Request notification permission once admin is in.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => { /* ignore */ });
    }
  }, [enabled]);

  // Realtime subscription scoped to the admin layout lifetime.
  // Visibility-paused: unsubscribe when tab is hidden, resubscribe + refetch when visible.
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      if (channel) return;
      const channelName = `admin-notifications:${Math.random().toString(36).slice(2)}`;
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "admin_notifications" },
          (payload) => {
            const row = payload.new as AdminNotification;
            if (seenIdsRef.current.has(row.id)) return;
            seenIdsRef.current.add(row.id);
            qc.setQueryData<AdminNotification[]>(adminNotifKeys.list, (prev) => {
              const list = prev ?? [];
              if (list.find((p) => p.id === row.id)) return list;
              return [row, ...list].slice(0, NOTIF_LIMIT);
            });
            qc.invalidateQueries({
              queryKey: row.type === "order" ? ["admin", "orders"] : ["admin", "incomplete-orders"],
            });
            fireBrowserNotification(row);
          },
        )
        .subscribe();
    };

    const unsubscribe = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        subscribe();
        qc.invalidateQueries({ queryKey: adminNotifKeys.list });
      } else {
        unsubscribe();
      }
    };

    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubscribe();
    };
  }, [enabled, qc]);

  const items = query.data ?? [];
  const unseen = items.filter((n) => !n.admin_seen);
  const unseenByType = {
    order: unseen.filter((n) => n.type === "order").length,
    incomplete_order: unseen.filter((n) => n.type === "incomplete_order").length,
    total: unseen.length,
  };

  const markSeen = async (type?: "order" | "incomplete_order") => {
    // Optimistic UI
    qc.setQueryData<AdminNotification[]>(adminNotifKeys.list, (prev) =>
      (prev ?? []).map((n) =>
        !type || n.type === type ? { ...n, admin_seen: true, seen_at: new Date().toISOString() } : n,
      ),
    );
    await supabase.rpc("mark_admin_notifications_seen", { _type: type ?? null });
  };

  return {
    items,
    unseenByType,
    isLoading: query.isLoading,
    markSeen,
    markAllSeen: () => markSeen(undefined),
  };
}
