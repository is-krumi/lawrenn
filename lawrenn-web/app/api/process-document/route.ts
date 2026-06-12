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

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("pdf-parse");
  const pdfParse = typeof mod === "function" ? mod : mod.default ?? mod;
  const data = await pdfParse(Buffer.from(buffer));
  return { text: data.text.replace(/\s+/g, " ").trim(), pageCount: data.numpages ?? 0 };
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value.replace(/\s+/g, " ").trim();
}

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

function chunkText(text: string, wordsPerChunk = 800): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(" ");
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/msword", // .doc (treated as plain text fallback)
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

    // adminClient: storage requires service role
    const { error: uploadError } = await adminClient.storage
      .from("business-documents")
      .upload(filePath, buffer, { contentType: file.type });

    if (uploadError) throw uploadError;

    // db (user client): documents INSERT — RLS enforced
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

    // Extract text + page count
    let text = "";
    let pageCount: number | null = null;
    if (file.type === "application/pdf") {
      const pdf = await extractTextFromPDF(buffer);
      text = pdf.text;
      pageCount = pdf.pageCount || null;
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      text = await extractTextFromDocx(buffer);
      pageCount = Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 250));
    } else {
      text = new TextDecoder().decode(buffer);
      pageCount = Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 250));
    }

    if (text.length < 50) {
      await db.from("documents").update({ status: "failed" }).eq("id", doc.id);
      return NextResponse.json({ error: "Could not extract readable text from this document" }, { status: 422 });
    }

    const [docType, chunks] = await Promise.all([
      classifyDocument(text),
      Promise.resolve(chunkText(text)),
    ]);

    let embeddedCount = 0;
    for (const chunk of chunks) {
      const content   = `Document: ${file.name}\n\n${chunk}`;
      const embedding = await embedText(content);
      if (embedding.length > 0) {
        // adminClient: embeddings are a cross-business aggregate used by RPC
        const { error: embErr } = await adminClient.from("embeddings").insert({
          business_id: businessId,
          source_type: "document",
          source_id:   doc.id,
          content:     encryptContent(content),
          embedding,
        });
        if (embErr) {
          console.error("[process-document] embedding insert failed:", embErr.message, embErr.code, embErr.details);
          await db.from("documents").update({ status: "failed" }).eq("id", doc.id);
          return NextResponse.json({ error: "Failed to index document. Please try again." }, { status: 500 });
        } else {
          embeddedCount++;
        }
      }
    }

    await db.from("documents").update({ status: "ready", doc_type: docType, page_count: pageCount }).eq("id", doc.id);

    // Embed a metadata-only chunk so intelligence can discover this file by name/type
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const metaContent = [
      `Document in library: "${file.name}"`,
      docType ? `Document type: ${docType}` : null,
      jobId ? `Linked to matter ID: ${jobId}` : null,
      `File type: ${file.type} | Size: ${sizeMB} MB | ${embeddedCount} section${embeddedCount !== 1 ? "s" : ""} indexed`,
      `This file is available for questions and analysis.`,
    ].filter(Boolean).join("\n");
    const metaEmbedding = await embedText(metaContent);
    if (metaEmbedding.length > 0) {
      await adminClient.from("embeddings").insert({
        business_id: businessId,
        source_type: "document",
        source_id:   doc.id,
        content:     encryptContent(metaContent),
        embedding:   metaEmbedding,
      });
    }

    return NextResponse.json({ success: true, document_id: doc.id, chunks_embedded: embeddedCount, doc_type: docType, page_count: pageCount });

  } catch (err: any) {
    console.error("[process-document]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
