import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";
import { encryptContent } from "@/lib/encryption";

// Service role kept only for: storage upload, embeddings insert.
// documents INSERT/UPDATE use the per-request user client so RLS is enforced.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Text extraction ──────────────────────────────────────────────────────────
// Preserve paragraph breaks (double newlines) so structure-aware chunking works.
// Collapse only horizontal whitespace within lines; leave \n intact.

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("pdf-parse");
  const pdfParse = typeof mod === "function" ? mod : mod.default ?? mod;
  const data = await pdfParse(Buffer.from(buffer));
  const text = data.text
    .replace(/[ \t]+/g, " ")       // normalize horizontal whitespace
    .replace(/\n{3,}/g, "\n\n")    // collapse 3+ newlines to paragraph break
    .trim();
  return { text, pageCount: data.numpages ?? 0 };
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Document classification ──────────────────────────────────────────────────

const LEGAL_DOC_TYPES = [
  "Civil Complaint", "Motion", "Brief", "Court Order / Judgment", "Subpoena",
  "Affidavit / Declaration", "Deposition Transcript", "Discovery Request",
  "Contract", "NDA / Confidentiality Agreement", "Settlement Agreement",
  "Demand Letter", "Retainer Agreement", "Lease Agreement",
  "Employment Agreement", "Corporate Resolution", "Legal Memo",
  "Correspondence / Letter", "Invoice / Bill", "Other",
];

async function classifyDocument(text: string): Promise<string | null> {
  const excerpt = text.split(/\s+/).slice(0, 500).join(" ");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 20,
        system:     `You classify legal documents. Reply with ONLY the category name from this list, nothing else:\n${LEGAL_DOC_TYPES.join(", ")}`,
        messages:   [{ role: "user", content: `Classify this document:\n\n${excerpt}` }],
      }),
    });
    const data = await res.json();
    const label = data.content?.[0]?.text?.trim() ?? null;
    return LEGAL_DOC_TYPES.includes(label) ? label : "Other";
  } catch {
    return null;
  }
}

// ─── Structure-aware chunking ─────────────────────────────────────────────────
// Splits along paragraph breaks and section markers rather than fixed word counts.
// Each chunk is ~350 words max; section headers are detected as boundaries.

interface Chunk {
  text:    string;
  section: string;
  index:   number;
}

function isSectionHeader(para: string): boolean {
  if (para.length > 120 || para.includes("\n")) return false;
  return (
    /^(SECTION|ARTICLE|CLAUSE|SCHEDULE|EXHIBIT|APPENDIX|RECITAL|WHEREAS)\b/i.test(para) ||
    /^[A-Z][A-Z\s,;]{3,50}$/.test(para) ||          // ALL-CAPS line
    /^(\d+\.)+\d*\s+[A-Z]/.test(para) ||             // 1.1 Title
    /^§\s*\d/.test(para) ||                           // § marker
    /^[IVX]+\.\s+[A-Z]/.test(para) ||                // Roman numeral
    /^[A-Z]\.\s+[A-Z]/.test(para)                    // A. Title
  );
}

function chunkByStructure(text: string): Chunk[] {
  const TARGET_WORDS = 350;
  // Split on blank lines to get paragraphs
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 30);

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentSection = "";
  let idx = 0;

  const flush = () => {
    const joined = current.join("\n\n").trim();
    if (joined.split(/\s+/).length > 50) {
      chunks.push({ text: joined, section: currentSection, index: idx++ });
    }
    current = [];
  };

  for (const para of paragraphs) {
    if (isSectionHeader(para)) {
      // Start a new chunk at section boundaries when current chunk is substantial
      if (current.join(" ").split(/\s+/).length > 80) flush();
      currentSection = para.slice(0, 80);
    }
    current.push(para);
    if (current.join(" ").split(/\s+/).length >= TARGET_WORDS) flush();
  }
  if (current.length) flush();

  return chunks;
}

// ─── Contextual retrieval ─────────────────────────────────────────────────────
// Prepends a 1-2 sentence situating blurb to each chunk before embedding.
// This makes isolated chunks findable even when they lack surrounding context.

async function situateChunk(
  docName:    string,
  docType:    string | null,
  docExcerpt: string,     // first ~1500 chars of document for context
  chunk:      string,
): Promise<string> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 90,
        system:     "Write 1-2 plain sentences (no markdown, no headings, no bullet points) situating this excerpt within its parent document. Name the document type, the parties if visible, and the specific topic of this section. Output only the sentences, nothing else.",
        messages: [{
          role:    "user",
          content: `Document: "${docName}" (${docType ?? "legal document"})\n\nDocument opening (first 1500 chars):\n${docExcerpt.slice(0, 1500)}\n\nExcerpt to situate:\n${chunk.slice(0, 800)}`,
        }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text?.trim() ?? "";
  } catch {
    return "";
  }
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const data = await res.json();
  return data.data?.[0]?.embedding ?? [];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const formData   = await request.formData();
    const file       = formData.get("file") as File | null;
    const businessId = formData.get("business_id") as string | null;
    const jobId      = (formData.get("job_id") as string | null) || null;

    if (!file || !businessId) {
      return NextResponse.json({ error: "file and business_id are required" }, { status: 400 });
    }

    const auth = await verifyBusinessAccess(request, businessId);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createUserClient(auth.token);

    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only PDF, DOCX, DOC, and TXT files are supported" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 10 MB" }, { status: 400 });
    }

    const buffer   = await file.arrayBuffer();
    const ext      = file.name.includes(".") ? file.name.split(".").pop() : "";
    const filePath = `${businessId}/${randomUUID()}${ext ? `.${ext}` : ""}`;

    const { error: uploadError } = await adminClient.storage
      .from("business-documents")
      .upload(filePath, buffer, { contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: doc, error: docError } = await db
      .from("documents")
      .insert({
        business_id: businessId,
        name:        file.name,
        file_path:   filePath,
        file_type:   file.type,
        file_size:   file.size,
        status:      "processing",
        ...(jobId ? { job_id: jobId } : {}),
      })
      .select("id")
      .single();
    if (docError) throw docError;

    // ── Extract text (preserving paragraph breaks for structure-aware chunking)
    let text      = "";
    let pageCount: number | null = null;

    if (file.type === "application/pdf") {
      const pdf = await extractTextFromPDF(buffer);
      text      = pdf.text;
      pageCount = pdf.pageCount || null;
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      text      = await extractTextFromDocx(buffer);
      pageCount = Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 250));
    } else {
      text      = new TextDecoder().decode(buffer);
      pageCount = Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 250));
    }

    if (text.length < 50) {
      await db.from("documents").update({ status: "failed" }).eq("id", doc.id);
      return NextResponse.json({ error: "Could not extract readable text from this document" }, { status: 422 });
    }

    // ── Classify + chunk in parallel (classification doesn't need chunks)
    const [docType, chunks] = await Promise.all([
      classifyDocument(text),
      Promise.resolve(chunkByStructure(text)),
    ]);
    console.log(`[process-document] "${file.name}": ${text.length} chars, ${chunks.length} chunks`);

    const docExcerpt = text.slice(0, 1500); // passed to situateChunk for context

    // ── Situate all chunks in parallel (one cheap Haiku call each)
    const situatedTexts = await Promise.all(
      chunks.map(c => situateChunk(file.name, docType, docExcerpt, c.text))
    );

    // ── Embed and store each chunk
    let embeddedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk      = chunks[i];
      const situating  = situatedTexts[i];
      // Prepend situating context to make isolated chunk self-sufficient at retrieval time
      const plainText  = situating
        ? `${situating}\n\nDocument: ${file.name}\n\n${chunk.text}`
        : `Document: ${file.name}\n\n${chunk.text}`;

      const embedding = await embedText(plainText);
      if (embedding.length === 0) continue;

      // Use the RPC so the tsvector is computed from plaintext inside Postgres
      const { error: embErr } = await adminClient.rpc("insert_embedding_with_fts", {
        p_business_id:    businessId,
        p_source_type:    "document",
        p_source_id:      doc.id,
        p_content_enc:    encryptContent(plainText),
        p_content_plain:  plainText,
        p_embedding:      embedding,
        p_doc_type:       docType ?? null,
        p_chunk_index:    chunk.index,
        p_section_header: chunk.section || null,
      });

      if (embErr) {
        console.error("[process-document] chunk insert failed:", embErr.message, embErr);
        await db.from("documents").update({ status: "failed" }).eq("id", doc.id);
        return NextResponse.json({ error: "Failed to index document. Please try again." }, { status: 500 });
      }
      embeddedCount++;
      console.log(`[process-document] chunk ${chunk.index} inserted ok (${plainText.length} chars)`);
    }

    // ── Metadata-only discovery chunk (lets intelligence find this file by name/type)
    const sizeMB      = (file.size / (1024 * 1024)).toFixed(1);
    const metaPlain   = [
      `Document in library: "${file.name}"`,
      docType ? `Document type: ${docType}` : null,
      jobId   ? `Linked to matter ID: ${jobId}` : null,
      `File type: ${file.type} | Size: ${sizeMB} MB | ${embeddedCount} section${embeddedCount !== 1 ? "s" : ""} indexed`,
      `This file is available for questions and analysis.`,
    ].filter(Boolean).join("\n") as string;

    const metaEmbedding = await embedText(metaPlain);
    if (metaEmbedding.length > 0) {
      await adminClient.rpc("insert_embedding_with_fts", {
        p_business_id:    businessId,
        p_source_type:    "document",
        p_source_id:      doc.id,
        p_content_enc:    encryptContent(metaPlain),
        p_content_plain:  metaPlain,
        p_embedding:      metaEmbedding,
        p_doc_type:       docType ?? null,
        p_chunk_index:    -1,   // sentinel: metadata chunk
        p_section_header: null,
      });
    }

    await db
      .from("documents")
      .update({ status: "ready", doc_type: docType, page_count: pageCount })
      .eq("id", doc.id);

    return NextResponse.json({
      success:         true,
      document_id:     doc.id,
      chunks_embedded: embeddedCount,
      doc_type:        docType,
      page_count:      pageCount,
    });

  } catch (err: any) {
    console.error("[process-document]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
