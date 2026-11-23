import { useQuery } from "@tanstack/react-query";
import { fetchActiveDeliveryZones, type DeliveryZone } from "@/lib/checkoutOptions";

// Shared React Query cache key for active delivery zones, used by Cart and
// Checkout (and any other storefront caller). Cached for 5 minutes so the same
// session never refetches between the two pages.
export const deliveryZonesKey = ["public", "delivery-zones"] as const;

export function useDeliveryZones() {
  return useQuery<DeliveryZone[]>({
    queryKey: deliveryZonesKey,
    queryFn: fetchActiveDeliveryZones,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
