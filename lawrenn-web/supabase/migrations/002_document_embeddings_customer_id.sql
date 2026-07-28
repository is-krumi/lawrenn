-- Tag document embedding chunks with customer_id so SMS/call RAG retrieval
-- (which is scoped by customer_id) can also surface uploaded documents.
-- Documents don't have a direct customer_id — it's derived via documents.job_id -> jobs.customer_id.

-- ─── 1. Add p_customer_id to insert_embedding_with_fts ────────────────────────
CREATE OR REPLACE FUNCTION insert_embedding_with_fts(
  p_business_id    uuid,
  p_source_type    text,
  p_source_id      uuid,
  p_content_enc    text,       -- encrypted, stored in content column
  p_content_plain  text,       -- plaintext, used only to compute tsvector
  p_embedding      vector,
  p_doc_type       text    DEFAULT NULL,
  p_chunk_index    int     DEFAULT NULL,
  p_section_header text    DEFAULT NULL,
  p_customer_id    uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO embeddings (
    business_id, source_type, source_id,
    content, embedding, fts,
    doc_type, chunk_index, section_header,
    customer_id
  ) VALUES (
    p_business_id, p_source_type, p_source_id,
    p_content_enc, p_embedding,
    to_tsvector('english', p_content_plain),
    p_doc_type, p_chunk_index, p_section_header,
    p_customer_id
  );
END;
$$;

-- ─── 2. Backfill customer_id for existing document embeddings ────────────────
-- Only fills rows currently NULL; derives via documents.job_id -> jobs.customer_id.
UPDATE embeddings e
SET customer_id = j.customer_id
FROM documents d
JOIN jobs j ON j.id = d.job_id
WHERE e.source_type = 'document'
  AND e.source_id = d.id
  AND e.customer_id IS NULL
  AND j.customer_id IS NOT NULL;
