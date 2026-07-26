-- RAG improvement migration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Safe to run on a live database — all changes are additive.

-- ─── 1. Add metadata columns to embeddings ────────────────────────────────────
ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS doc_type       text,
  ADD COLUMN IF NOT EXISTS chunk_index    int,
  ADD COLUMN IF NOT EXISTS section_header text,
  ADD COLUMN IF NOT EXISTS parent_id      uuid REFERENCES embeddings(id),
  ADD COLUMN IF NOT EXISTS fts            tsvector;   -- populated from plaintext at insert time

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS embeddings_fts_idx ON embeddings USING GIN (fts);

-- ─── 2. Atomic insert function (handles fts computation from plaintext) ────────
-- The content column is encrypted so we can't compute fts from it.
-- This function receives the plaintext separately just for tsvector generation.
CREATE OR REPLACE FUNCTION insert_embedding_with_fts(
  p_business_id    uuid,
  p_source_type    text,
  p_source_id      uuid,
  p_content_enc    text,       -- encrypted, stored in content column
  p_content_plain  text,       -- plaintext, used only to compute tsvector
  p_embedding      vector,
  p_doc_type       text    DEFAULT NULL,
  p_chunk_index    int     DEFAULT NULL,
  p_section_header text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO embeddings (
    business_id, source_type, source_id,
    content, embedding, fts,
    doc_type, chunk_index, section_header
  ) VALUES (
    p_business_id, p_source_type, p_source_id,
    p_content_enc, p_embedding,
    to_tsvector('english', p_content_plain),
    p_doc_type, p_chunk_index, p_section_header
  );
END;
$$;

-- ─── 3. Hybrid search with Reciprocal Rank Fusion ─────────────────────────────
-- Runs vector similarity search and full-text search in parallel, fuses the
-- ranked lists with RRF (rrf_k=60 is the standard default), returns top N.
-- Old rows without fts populated are found only via vector search — graceful degradation.
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text       text,
  query_embedding  vector,
  match_count      int,
  p_business_id    uuid,
  p_source_ids     uuid[]  DEFAULT NULL,
  p_doc_type       text    DEFAULT NULL,
  rrf_k            int     DEFAULT 60
)
RETURNS TABLE (
  source_id    uuid,
  source_type  text,
  content      text,
  similarity   float,
  section_header text,
  doc_type     text
)
LANGUAGE plpgsql AS $$
DECLARE
  fts_query tsquery;
BEGIN
  -- Build tsquery safely; fall back to NULL (disables FTS leg) on bad input
  BEGIN
    fts_query := websearch_to_tsquery('english', query_text);
  EXCEPTION WHEN OTHERS THEN
    fts_query := NULL;
  END;

  RETURN QUERY
  WITH
  vec AS (
    SELECT e.id, e.source_id, e.source_type, e.content, e.section_header, e.doc_type,
           ROW_NUMBER() OVER (ORDER BY e.embedding <=> query_embedding) AS rn
    FROM embeddings e
    WHERE e.business_id = p_business_id
      AND (e.chunk_index IS NULL OR e.chunk_index != -1)   -- exclude metadata-only sentinel chunks
      AND (p_source_ids IS NULL OR e.source_id = ANY(p_source_ids))
      AND (p_doc_type   IS NULL OR e.doc_type   = p_doc_type)
    ORDER BY e.embedding <=> query_embedding
    LIMIT 60
  ),
  fts AS (
    SELECT e.id, e.source_id, e.source_type, e.content, e.section_header, e.doc_type,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(e.fts, fts_query) DESC
           ) AS rn
    FROM embeddings e
    WHERE e.business_id = p_business_id
      AND (e.chunk_index IS NULL OR e.chunk_index != -1)   -- exclude metadata-only sentinel chunks
      AND fts_query IS NOT NULL
      AND e.fts @@ fts_query
      AND (p_source_ids IS NULL OR e.source_id = ANY(p_source_ids))
      AND (p_doc_type   IS NULL OR e.doc_type   = p_doc_type)
    LIMIT 60
  ),
  fused AS (
    SELECT
      COALESCE(v.id, f.id)                      AS id,
      COALESCE(v.source_id, f.source_id)        AS source_id,
      COALESCE(v.source_type, f.source_type)    AS source_type,
      COALESCE(v.content, f.content)            AS content,
      COALESCE(v.section_header, f.section_header) AS section_header,
      COALESCE(v.doc_type, f.doc_type)          AS doc_type,
      COALESCE(1.0 / (rrf_k + v.rn), 0.0)
        + COALESCE(1.0 / (rrf_k + f.rn), 0.0)  AS rrf_score
    FROM vec v
    FULL OUTER JOIN fts f ON v.id = f.id
  )
  SELECT
    fused.source_id, fused.source_type, fused.content,
    fused.rrf_score   AS similarity,
    fused.section_header,
    fused.doc_type
  FROM fused
  ORDER BY fused.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- ─── 4. (Optional) HNSW index for better recall/latency at scale ──────────────
-- Uncomment and run separately once you have >10k embeddings.
-- The build takes a few minutes on large tables.
--
-- DROP INDEX IF EXISTS embeddings_embedding_idx;   -- remove IVFFlat if it exists
-- CREATE INDEX CONCURRENTLY embeddings_hnsw_idx
--   ON embeddings USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
