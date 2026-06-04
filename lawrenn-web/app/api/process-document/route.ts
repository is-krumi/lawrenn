import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("pdf-parse");
  const pdfParse = typeof mod === "function" ? mod : mod.default ?? mod;
  const data = await pdfParse(Buffer.from(buffer));
  return data.text.replace(/\s+/g, " ").trim();
}

async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value.replace(/\s+/g, " ").trim();
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

    if (!file || !businessId) {
      return NextResponse.json({ error: "file and business_id are required" }, { status: 400 });
    }

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
    const filePath = `${businessId}/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("business-documents")
      .upload(filePath, buffer, { contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        business_id: businessId,
        name:        file.name,
        file_path:   filePath,
        file_type:   file.type,
        file_size:   file.size,
        status:      "processing",
      })
      .select("id")
      .single();

    if (docError) throw docError;

    // Extract text
    let text = "";
    if (file.type === "application/pdf") {
      text = await extractTextFromPDF(buffer);
    } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      text = await extractTextFromDocx(buffer);
    } else {
      text = new TextDecoder().decode(buffer);
    }

    if (text.length < 50) {
      await supabase.from("documents").update({ status: "failed" }).eq("id", doc.id);
      return NextResponse.json({ error: "Could not extract readable text from this document" }, { status: 422 });
    }

    const chunks = chunkText(text);

    let embeddedCount = 0;
    for (const chunk of chunks) {
      const content   = `Document: ${file.name}\n\n${chunk}`;
      const embedding = await embedText(content);
      if (embedding.length > 0) {
        const { error: embErr } = await supabase.from("embeddings").insert({
          business_id: businessId,
          source_type: "document",
          source_id:   doc.id,
          content,
          embedding,
        });
        if (embErr) {
          console.error("[process-document] embedding insert failed:", embErr.message, embErr.code, embErr.details);
          await supabase.from("documents").update({ status: "failed" }).eq("id", doc.id);
          return NextResponse.json({
            error: `Embedding insert failed: ${embErr.message} (code: ${embErr.code ?? "?"}, details: ${embErr.details ?? "none"})`,
          }, { status: 500 });
        } else {
          embeddedCount++;
        }
      }
    }

    await supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);

    return NextResponse.json({ success: true, document_id: doc.id, chunks_embedded: embeddedCount });

  } catch (err: any) {
    console.error("[process-document]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
