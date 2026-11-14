-- MANUAL CONFIGURATION ONLY: review after applying the Phase 3 app migration.
-- Create the PRIVATE pet-documents bucket in the Supabase Dashboard, not via SQL.
-- This defines access policies; it does not alter Storage tables or write storage.objects data.
-- Run in the Supabase SQL Editor as the trusted project DB administrator.

-- App tables have RLS with no public policies. This narrowly scoped boolean helper
-- checks the caller's JWT subject without exposing app rows to the Data API.
CREATE OR REPLACE FUNCTION public.pawtrack_document_access(object_path text, operation text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Document" d
    JOIN public."Pet" p ON p.id = d."petId"
    WHERE d."storagePath" = object_path AND p."ownerId" = auth.uid()
      AND CASE operation
        WHEN 'read' THEN d.status IN ('UPLOADING', 'READY', 'DELETING')
        WHEN 'insert' THEN d.status = 'UPLOADING'
        WHEN 'delete' THEN d.status IN ('UPLOADING', 'DELETING')
        ELSE false
      END
  );
$$;
REVOKE ALL ON FUNCTION public.pawtrack_document_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pawtrack_document_access(text, text) TO authenticated;

-- SELECT must allow DELETING too: Storage remove needs SELECT as well as DELETE.
-- The app will only issue signed URLs for READY documents; the owner is always checked.
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
-- No UPDATE policy: the application never overwrites objects.
-- Existing broad policies are OR-combined and may defeat these restrictions.
-- Review them manually before use; this script intentionally does not drop any existing policy.
