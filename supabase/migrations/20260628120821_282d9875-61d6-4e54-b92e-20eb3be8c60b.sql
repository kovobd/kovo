-- Variant-aware Batch Offers & Deals
-- 1. Extend product_offers with variant targeting + free variant
ALTER TABLE public.product_offers
  ADD COLUMN IF NOT EXISTS target_variant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS free_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_offers_free_variant ON public.product_offers(free_variant_id) WHERE free_variant_id IS NOT NULL;

-- 2. Variant-aware stock decrement (used by client during checkout for free items
--    and any path that knows the variant id). Public-callable, like decrement_product_stock.
CREATE OR REPLACE FUNCTION public.decrement_variant_stock(_variant_id uuid, _quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _variant_id IS NULL OR COALESCE(_quantity, 0) <= 0 THEN RETURN; END IF;
  UPDATE public.product_variants
     SET stock = GREATEST(0, COALESCE(stock,0) - _quantity)
   WHERE id = _variant_id;
END $$;

GRANT EXECUTE ON FUNCTION public.decrement_variant_stock(uuid, integer) TO anon, authenticated;

-- 3. Restock free gifts on cancellation too (previously skipped is_free_gift).
--    Keep idempotency via the existing unique index.
CREATE OR REPLACE FUNCTION public.orders_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item jsonb;
  _pid uuid;
  _vid uuid;
  _qty integer;
  _name text;
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'order_status_changed',
      jsonb_build_object('order_status', OLD.order_status),
      jsonb_build_object('order_status', NEW.order_status)
    );

    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND NEW.restocked_at IS NULL THEN
      IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
        FOR _item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
          -- Restock BOTH purchased and free-gift items (we deducted both on order placement).
          BEGIN _pid := NULLIF(_item->>'product_id','')::uuid;
          EXCEPTION WHEN others THEN _pid := NULL; END;
          IF _pid IS NULL THEN
            BEGIN _pid := NULLIF(_item->>'id','')::uuid;
            EXCEPTION WHEN others THEN _pid := NULL; END;
          END IF;
          IF _pid IS NULL THEN CONTINUE; END IF;

          BEGIN _vid := NULLIF(_item->>'variant_id','')::uuid;
          EXCEPTION WHEN others THEN _vid := NULL; END;

          _qty := COALESCE(NULLIF(_item->>'quantity','')::integer, 1);
          _name := COALESCE(_item->>'name','item');
          IF _qty <= 0 THEN CONTINUE; END IF;

          BEGIN
            INSERT INTO public.inventory_transactions (order_id, product_id, variant_id, quantity_delta, reason)
            VALUES (NEW.id, _pid, _vid, _qty, 'cancel_restock');
          EXCEPTION WHEN unique_violation THEN
            CONTINUE;
          END;

          -- Restock the exact variant when one is known, otherwise the product.
          IF _vid IS NOT NULL THEN
            UPDATE public.product_variants SET stock = COALESCE(stock,0) + _qty WHERE id = _vid;
          ELSE
            UPDATE public.products SET stock = COALESCE(stock,0) + _qty WHERE id = _pid;
          END IF;

          INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
          VALUES (NEW.id, auth.uid(), 'inventory_restored', NULL,
            jsonb_build_object('product_id', _pid, 'variant_id', _vid, 'quantity', _qty, 'name', _name,
                               'is_free_gift', COALESCE((_item->>'is_free_gift')::boolean, false)));
        END LOOP;
      END IF;
      NEW.restocked_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;