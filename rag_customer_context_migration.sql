-- Run in Supabase SQL Editor

-- 1. Add customer_id to embeddings so we can filter by customer
ALTER TABLE public.embeddings
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_embeddings_customer_id
  ON public.embeddings USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_business_customer
  ON public.embeddings USING btree (business_id, customer_id);

-- 2. Vector similarity search RPC
-- Searches embeddings by cosine similarity.
-- Pass p_customer_id to scope to a specific client; omit (NULL) for business-wide search.
CREATE OR REPLACE FUNCTION match_embeddings(
  query_embedding  vector(1536),
  match_threshold  float,
  match_count      int,
  p_business_id    uuid,
  p_customer_id    uuid DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  content     text,
  source_type text,
  source_id   uuid,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    e.source_type,
    e.source_id,
    1 - (e.embedding::vector(1536) <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE
    e.business_id = p_business_id
    AND (p_customer_id IS NULL OR e.customer_id = p_customer_id)
    AND 1 - (e.embedding::vector(1536) <=> query_embedding) > match_threshold
  ORDER BY e.embedding::vector(1536) <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_embeddings(vector(1536), float, int, uuid, uuid) TO authenticated, service_role;
