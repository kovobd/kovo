import { supabase } from "@/integrations/supabase/client";

/**
 * Debounced + coalesced stock writer.
 *
 * - Caller invokes `queueStockUpdate(productId, newStock)` as many times as needed
 *   (e.g. while typing).
 * - The latest value per product is held for `DEBOUNCE_MS`, then a single UPDATE
 *   per product is fired. Rapid edits to many products are flushed together.
 * - Returns a promise that resolves with the value that was actually written.
 */

const DEBOUNCE_MS = 800;

type PendingEntry = {
  value: number;
  resolvers: Array<(v: number) => void>;
  rejecters: Array<(e: unknown) => void>;
};

const pending = new Map<string, PendingEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  if (pending.size === 0) return;
  const batch = Array.from(pending.entries());
  pending.clear();

  await Promise.all(
    batch.map(async ([productId, entry]) => {
      try {
        const { error } = await supabase
          .from("products")
          .update({ stock: entry.value })
          .eq("id", productId);
        if (error) throw error;
        entry.resolvers.forEach((r) => r(entry.value));
      } catch (err) {
        entry.rejecters.forEach((rj) => rj(err));
      }
    }),
  );
}

export function queueStockUpdate(productId: string, newStock: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const existing = pending.get(productId);
    if (existing) {
      existing.value = newStock;
      existing.resolvers.push(resolve);
      existing.rejecters.push(reject);
    } else {
      pending.set(productId, {
        value: newStock,
        resolvers: [resolve],
        rejecters: [reject],
      });
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  });
}

/** Force-flush any pending writes (e.g. on unmount / page navigation). */
export function flushStockUpdates() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return flush();
}
