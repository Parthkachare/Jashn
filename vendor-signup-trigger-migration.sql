-- Requires vendor-auth-migration.sql so vendors.auth_user_id has a unique index.
-- Replaces the existing public.handle_new_user() trigger function. Vendor
-- signup metadata can request only the vendor role; all other signups remain
-- customers, and admin is never accepted from user-controlled metadata.
-- Any raised exception aborts the Auth insert transaction as well as profile
-- and vendor writes performed by this trigger.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requested_role text;
  profile_role text;
  vendor_name text;
  vendor_city text;
  profile_inserted boolean;
BEGIN
  requested_role := CASE
    WHEN NEW.raw_user_meta_data ->> 'role' = 'vendor' THEN 'vendor'
    ELSE 'customer'
  END;

  INSERT INTO public.profiles (id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''), NEW.email),
    NEW.email,
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    requested_role
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING role INTO profile_role;

  profile_inserted := FOUND;
  IF NOT profile_inserted THEN
    SELECT role
    INTO profile_role
    FROM public.profiles
    WHERE id = NEW.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unable to find or create the profile for this account';
    END IF;
  END IF;

  IF profile_role IS DISTINCT FROM requested_role THEN
    RAISE EXCEPTION 'An existing profile role cannot be changed during signup';
  END IF;

  IF requested_role = 'vendor' THEN
    vendor_name := NULLIF(btrim(NEW.raw_user_meta_data ->> 'business_name'), '');
    vendor_city := NULLIF(btrim(NEW.raw_user_meta_data ->> 'city'), '');
    IF vendor_name IS NULL OR vendor_city IS NULL THEN
      RAISE EXCEPTION 'Vendor signup requires business name and city';
    END IF;

    -- The unique auth_user_id index makes retries idempotent. Existing vendor
    -- details and status are never overwritten by a repeated trigger call.
    INSERT INTO public.vendors (auth_user_id, business_name, city, status)
    VALUES (NEW.id, vendor_name, vendor_city, 'pending')
    ON CONFLICT (auth_user_id) WHERE auth_user_id IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;
