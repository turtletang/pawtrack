-- MANUAL CONFIGURATION ONLY: Phase 4 policy replacement, review after the VERIFYING enum migration.
-- Create the PRIVATE pet-documents bucket in the Supabase Dashboard, not via SQL.
-- This defines access policies; it does not alter Storage tables or write storage.objects data.
-- Run in the Supabase SQL Editor as the trusted project DB administrator.

-- App tables have RLS with no public policies. This narrowly scoped boolean helper
-- checks the caller's JWT subject without exposing app rows to the Data API.
-- Only staging keys can receive user upload grants. Final objects are written exclusively
-- by the server after validating a bounded byte snapshot. Never add user final-key INSERT/UPDATE access.
CREATE OR REPLACE FUNCTION public.pawtrack_document_access(object_path text, operation text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Document" d
    JOIN public."Pet" p ON p.id = d."petId"
    WHERE p."ownerId" = auth.uid()
      AND CASE operation
        WHEN 'read' THEN d."storagePath" = object_path AND d.status IN ('READY', 'DELETING')
        WHEN 'delete' THEN d."storagePath" = object_path AND d.status = 'DELETING'
        WHEN 'insert' THEN d.status = 'UPLOADING'
          AND object_path = p."ownerId"::text || '/' || p.id::text || '/staging/' || d.id::text || '.' ||
            CASE d."mimeType" WHEN 'application/pdf' THEN 'pdf' WHEN 'image/jpeg' THEN 'jpg'
              WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE NULL END
          AND EXISTS (SELECT 1 FROM public."StorageObject" s WHERE s.path = object_path
            AND s."ownerId" = p."ownerId" AND s."petId" = p.id AND s.status = 'UPLOADING'
            AND s."leaseUntil" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
        ELSE false
      END
  );
$$;
REVOKE ALL ON FUNCTION public.pawtrack_document_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pawtrack_document_access(text, text) TO authenticated;

-- SELECT must allow DELETING too: Storage remove needs SELECT as well as DELETE.
-- The app will only issue signed URLs for READY final documents; staging is not readable.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pawtrack_documents_select') THEN
    CREATE POLICY pawtrack_documents_select ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'pet-documents' AND public.pawtrack_document_access(name, 'read'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pawtrack_documents_insert') THEN
    CREATE POLICY pawtrack_documents_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'pet-documents' AND public.pawtrack_document_access(name, 'insert'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='pawtrack_documents_delete') THEN
    CREATE POLICY pawtrack_documents_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'pet-documents' AND public.pawtrack_document_access(name, 'delete'));
  END IF;
END $$;
-- No UPDATE policy: browsers cannot overwrite staging or validated final objects.
-- Existing broad policies are OR-combined and may defeat these restrictions.
-- Review them manually before use; this script intentionally does not drop any existing policy.
