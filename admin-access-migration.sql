-- Admin read access is keyed to public.profiles.role and the authenticated UID.
CREATE OR REPLACE FUNCTION public.is_jashn_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_jashn_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_jashn_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_jashn_admin() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'jashn_admin_read_profiles') THEN
    CREATE POLICY jashn_admin_read_profiles ON public.profiles
      FOR SELECT TO authenticated USING (public.is_jashn_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'vendors' AND policyname = 'jashn_admin_read_vendors') THEN
    CREATE POLICY jashn_admin_read_vendors ON public.vendors
      FOR SELECT TO authenticated USING (public.is_jashn_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services' AND policyname = 'jashn_admin_read_services') THEN
    CREATE POLICY jashn_admin_read_services ON public.services
      FOR SELECT TO authenticated USING (public.is_jashn_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bookings' AND policyname = 'jashn_admin_read_bookings') THEN
    CREATE POLICY jashn_admin_read_bookings ON public.bookings
      FOR SELECT TO authenticated USING (public.is_jashn_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'booking_items' AND policyname = 'jashn_admin_read_booking_items') THEN
    CREATE POLICY jashn_admin_read_booking_items ON public.booking_items
      FOR SELECT TO authenticated USING (public.is_jashn_admin());
  END IF;
END
$$;

-- A signed-in user may not change their own role through an ordinary client update.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, auth
AS $$
BEGIN
  IF (SELECT auth.uid()) = OLD.id
     AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Users cannot change their own profile role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_profile_role_change ON public.profiles;
CREATE TRIGGER prevent_self_profile_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_change();

-- Vendor status can only be changed by an admin, and only from pending to
-- approved or rejected. This avoids granting broad vendor UPDATE privileges.
CREATE OR REPLACE FUNCTION public.admin_set_vendor_status(p_vendor_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_jashn_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported vendor status';
  END IF;

  UPDATE public.vendors
  SET status = p_status
  WHERE id = p_vendor_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor not found or no longer pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_vendor_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_vendor_status(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_vendor_status(uuid, text) TO authenticated;
