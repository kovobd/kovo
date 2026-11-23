import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";

export function useReorderReminderAttention() {
  const { user, role } = useAdmin();
  const enabled = Boolean(user && (role === "admin" || role === "staff"));

  return useQuery({
    queryKey: ["admin", "reminders", "attention-count"],
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_reminder_attention_counts" as any);
      if (error) throw error;
      const d = (data ?? {}) as { dueToday?: number; missed?: number; total?: number };
      return {
        dueToday: Number(d.dueToday ?? 0),
        missed: Number(d.missed ?? 0),
        total: Number(d.total ?? 0),
      };
    },
  });
}
