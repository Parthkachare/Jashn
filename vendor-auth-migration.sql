-- Add the authenticated owner link required by the vendor workspace.
-- Existing vendor rows remain unlinked until they are explicitly reconciled.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users (id);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_auth_user_id_key
  ON public.vendors (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
