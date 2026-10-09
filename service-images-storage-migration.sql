BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'service-images',
  'service-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS service_images_public_read ON storage.objects;
CREATE POLICY service_images_public_read
  ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'service-images');

-- Remove legacy policies from earlier versions of this migration. These
-- restrictive predicates affected Storage operations outside this bucket.
DROP POLICY IF EXISTS service_images_no_anon_uploads ON storage.objects;
DROP POLICY IF EXISTS service_images_vendor_insert_scope ON storage.objects;
DROP POLICY IF EXISTS service_images_vendor_update_scope ON storage.objects;
DROP POLICY IF EXISTS service_images_vendor_delete_scope ON storage.objects;

DROP POLICY IF EXISTS service_images_vendor_upload ON storage.objects;
CREATE POLICY service_images_vendor_upload
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = public.current_vendor_id()::text
  );

DROP POLICY IF EXISTS service_images_vendor_update ON storage.objects;
CREATE POLICY service_images_vendor_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = public.current_vendor_id()::text
  )
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = public.current_vendor_id()::text
  );

DROP POLICY IF EXISTS service_images_vendor_delete ON storage.objects;
CREATE POLICY service_images_vendor_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = public.current_vendor_id()::text
  );

COMMIT;
