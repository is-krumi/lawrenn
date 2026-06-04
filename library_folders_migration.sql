-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. Create the folders table
CREATE TABLE public.library_folders (
  id          uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can manage their library folders" ON public.library_folders
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

CREATE INDEX idx_library_folders_business_id ON public.library_folders USING btree (business_id);

-- 2. Add folder_id to the documents table
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.library_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_documents_folder_id ON public.documents USING btree (folder_id);
