BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_vendor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vendor.id
  FROM public.vendors AS vendor
  WHERE vendor.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.owns_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings AS booking
    WHERE booking.id = p_booking_id
      AND booking.customer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.vendor_has_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_items AS item
    WHERE item.booking_id = p_booking_id
      AND item.vendor_id = public.current_vendor_id()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.current_vendor_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_vendor_id() TO authenticated;
REVOKE ALL ON FUNCTION public.owns_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_booking(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.vendor_has_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_has_booking(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_self_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Users cannot change their own profile role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_profile_role_change ON public.profiles;
CREATE TRIGGER prevent_self_profile_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_profile_role_change();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;

-- Remove conflicting policies on the five scoped tables. Their intended
-- customer/public behavior is recreated below with explicit ownership checks.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'vendors', 'services', 'bookings', 'booking_items')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY profiles_insert_own_customer_or_vendor
  ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND role IN ('customer', 'vendor')
  );

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY vendors_read_public_approved
  ON public.vendors
  FOR SELECT TO anon, authenticated
  USING (status IN ('approved', 'active'));

CREATE POLICY vendors_read_own
  ON public.vendors
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY vendors_read_admin
  ON public.vendors
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY services_read_active
  ON public.services
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY services_read_own
  ON public.services
  FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

CREATE POLICY services_read_admin
  ON public.services
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY services_insert_own
  ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (
    vendor_id = public.current_vendor_id()
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS vendor
      WHERE vendor.id = services.vendor_id
        AND vendor.auth_user_id = auth.uid()
        AND vendor.status IN ('approved', 'active')
    )
  );

CREATE POLICY services_update_own
  ON public.services
  FOR UPDATE TO authenticated
  USING (
    vendor_id = public.current_vendor_id()
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS vendor
      WHERE vendor.id = services.vendor_id
        AND vendor.auth_user_id = auth.uid()
        AND vendor.status IN ('approved', 'active')
    )
  )
  WITH CHECK (
    vendor_id = public.current_vendor_id()
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS vendor
      WHERE vendor.id = services.vendor_id
        AND vendor.auth_user_id = auth.uid()
        AND vendor.status IN ('approved', 'active')
    )
  );

CREATE POLICY services_delete_own
  ON public.services
  FOR DELETE TO authenticated
  USING (vendor_id = public.current_vendor_id());

CREATE POLICY bookings_insert_own
  ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND status = 'pending'
    AND payment_status = 'pending'
  );

CREATE POLICY bookings_read_own
  ON public.bookings
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY bookings_read_vendor
  ON public.bookings
  FOR SELECT TO authenticated
  USING (public.vendor_has_booking(id));

CREATE POLICY bookings_read_admin
  ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY booking_items_insert_customer_own_booking
  ON public.booking_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_booking(booking_id)
    AND EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.id = booking_items.service_id
        AND service.vendor_id = booking_items.vendor_id
        AND service.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.vendors AS vendor
      WHERE vendor.id = booking_items.vendor_id
        AND vendor.status IN ('approved', 'active')
    )
  );

CREATE POLICY booking_items_read_customer
  ON public.booking_items
  FOR SELECT TO authenticated
  USING (public.owns_booking(booking_id));

CREATE POLICY booking_items_read_vendor
  ON public.booking_items
  FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

CREATE POLICY booking_items_read_admin
  ON public.booking_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMIT;
