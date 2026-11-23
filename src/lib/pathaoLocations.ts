import { supabase } from "@/integrations/supabase/client";

/**
 * Session-scoped Pathao location cache.
 *
 * Locations are only fetched when the admin explicitly asks for them
 * ("Fetch Locations") and are then reused for the rest of the browser
 * session — no repeated API calls unless `clearPathaoCache()` runs
 * (manual refresh).
 */
export interface PathaoLocation {
  id: number;
  name: string;
}

type CacheShape = {
  partnerId?: string | null;
  cities?: PathaoLocation[];
  zones: Record<string, PathaoLocation[]>;
  areas: Record<string, PathaoLocation[]>;
};

const cache: CacheShape = { zones: {}, areas: {} };
const inflight = new Map<string, Promise<PathaoLocation[]>>();

export function clearPathaoCache(): void {
  cache.partnerId = undefined;
  cache.cities = undefined;
  cache.zones = {};
  cache.areas = {};
  inflight.clear();
}

export function hasPathaoCities(): boolean {
  return !!cache.cities?.length;
}

async function getPartnerId(): Promise<string | null> {
  if (cache.partnerId !== undefined) return cache.partnerId ?? null;
  const { data } = await (supabase.from("delivery_partners").select("id") as any)
    .eq("slug", "pathao")
    .eq("enabled", true)
    .maybeSingle();
  cache.partnerId = data?.id ?? null;
  return cache.partnerId;
}

async function fetchLocations(
  locationType: "cities" | "zones" | "areas",
  parentId?: number,
): Promise<PathaoLocation[]> {
  const partnerId = await getPartnerId();
  if (!partnerId) throw new Error("Pathao is not configured or not enabled.");

  const resp = await supabase.functions.invoke("courier-proxy", {
    body: {
      action: "pathao_locations",
      partner_id: partnerId,
      location_type: locationType,
      ...(parentId != null ? { parent_id: parentId } : {}),
    },
  });
  if (resp.error) throw new Error(resp.error.message);
  if (!resp.data?.items) throw new Error(resp.data?.error || `Failed to load ${locationType}`);
  return resp.data.items as PathaoLocation[];
}

function dedupe(key: string, run: () => Promise<PathaoLocation[]>): Promise<PathaoLocation[]> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function loadPathaoCities(force = false): Promise<PathaoLocation[]> {
  if (force) clearPathaoCache();
  if (cache.cities) return cache.cities;
  return dedupe("cities", async () => {
    const items = await fetchLocations("cities");
    cache.cities = items;
    return items;
  });
}

export async function loadPathaoZones(cityId: string | number): Promise<PathaoLocation[]> {
  const key = String(cityId);
  if (cache.zones[key]) return cache.zones[key];
  return dedupe(`zones:${key}`, async () => {
    const items = await fetchLocations("zones", Number(cityId));
    cache.zones[key] = items;
    return items;
  });
}

export async function loadPathaoAreas(zoneId: string | number): Promise<PathaoLocation[]> {
  const key = String(zoneId);
  if (cache.areas[key]) return cache.areas[key];
  return dedupe(`areas:${key}`, async () => {
    const items = await fetchLocations("areas", Number(zoneId));
    cache.areas[key] = items;
    return items;
  });
}
