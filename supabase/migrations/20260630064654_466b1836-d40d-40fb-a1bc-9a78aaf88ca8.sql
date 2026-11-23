
-- tracking_pixels
DROP POLICY IF EXISTS "admins_manage" ON public.tracking_pixels;
CREATE POLICY "admins_select" ON public.tracking_pixels FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_insert" ON public.tracking_pixels FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_update" ON public.tracking_pixels FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_delete" ON public.tracking_pixels FOR DELETE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

-- contact_settings
DROP POLICY IF EXISTS "admins_manage" ON public.contact_settings;
CREATE POLICY "admins_select" ON public.contact_settings FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_insert" ON public.contact_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_update" ON public.contact_settings FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_delete" ON public.contact_settings FOR DELETE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

-- coupons
DROP POLICY IF EXISTS "admins_manage" ON public.coupons;
CREATE POLICY "admins_select" ON public.coupons FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_insert" ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_update" ON public.coupons FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_delete" ON public.coupons FOR DELETE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

-- invoice_settings
DROP POLICY IF EXISTS "admins_manage" ON public.invoice_settings;
CREATE POLICY "admins_select" ON public.invoice_settings FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_insert" ON public.invoice_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_update" ON public.invoice_settings FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
CREATE POLICY "admins_delete" ON public.invoice_settings FOR DELETE TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
