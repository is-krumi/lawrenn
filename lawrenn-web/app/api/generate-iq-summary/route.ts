import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";
import { decryptContent } from "@/lib/encryption";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(request: Request) {
  try {
    const { job_id, business_id } = await request.json();
    if (!job_id || !business_id) {
      return NextResponse.json({ error: "job_id and business_id required" }, { status: 400 });
    }

    const auth = await verifyBusinessAccess(request, business_id);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createUserClient(auth.token);

    // 1. Fetch matter + contacts
    const [{ data: job }, { data: contacts }] = await Promise.all([
      db.from("jobs").select(`
        id, name, type, status, notes, created_at,
        customers (id, name, phone, address),
        technicians (name)
      `).eq("id", job_id).single(),
      db.from("matter_contacts").select("contact_type, first_name, last_name, phone, email").eq("job_id", job_id),
    ]);

    if (!job) return NextResponse.json({ error: "Matter not found" }, { status: 404 });

    const client   = (job.customers as any) ?? null;
    const attorney = (job.technicians as any) ?? null;

    // 2. Gather all embeddings linked to this matter's documents (content chunks only)
    const { data: matterDocs } = await adminClient
      .from("documents")
      .select("id, name, doc_type")
      .eq("job_id", job_id)
      .is("deleted_at", null);

    const docIds = (matterDocs ?? []).map((d: any) => d.id);
    const docChunks: string[] = [];

    if (docIds.length > 0) {
      const { data: rows } = await adminClient
        .from("embeddings")
        .select("content, source_id")
        .in("source_id", docIds)
        .eq("business_id", business_id);

      for (const r of rows ?? []) {
        const text = decryptContent(r.content);
        // Skip metadata-only summary chunks
        if (!text.startsWith("Document in library:")) {
          docChunks.push(text);
        }
      }
    }

    // 3. Gather call transcripts and messages for this client
    const callChunks: string[] = [];
    if (client?.id) {
      const { data: callRows } = await adminClient
        .from("embeddings")
        .select("content, source_type")
        .eq("business_id", business_id)
        .in("source_type", ["call", "message"]);

      for (const r of callRows ?? []) {
        const text = decryptContent(r.content);
        callChunks.push(text);
      }
    }

    // 4. Build full context
    const matterInfo = [
      `Practice Area: ${job.type}`,
      job.name ? `Matter Name: ${job.name}` : null,
      `Status: ${job.status}`,
      client?.name    ? `Client: ${client.name}`       : null,
      client?.address ? `Location: ${client.address}`  : null,
      attorney?.name  ? `Attorney: ${attorney.name}`   : null,
      job.notes       ? `Attorney Notes:\n${job.notes}` : null,
      contacts?.length
        ? `Other Parties:\n${contacts.map((c: any) =>
            `  - ${c.contact_type}: ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}${c.phone ? ` | ${c.phone}` : ""}${c.email ? ` | ${c.email}` : ""}`
          ).join("\n")}`
        : null,
    ].filter(Boolean).join("\n");

    const docContext = docChunks.length > 0
      ? `\n\nUPLOADED DOCUMENTS:\n${docChunks.slice(0, 20).join("\n\n---\n\n")}`
      : "";

    const callContext = callChunks.length > 0
      ? `\n\nCALL & MESSAGE HISTORY:\n${callChunks.slice(0, 10).join("\n\n---\n\n")}`
      : "";

    const fullContext = matterInfo + docContext + callContext;

    // 5. Generate summary with Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: `You are a legal AI assistant generating a brief IQ Summary for an attorney's matter file.

Write exactly 2 sentences maximum. Be specific — include names, charges, and current status. No bullet points, no headers, no preamble.`,
        messages: [{ role: "user", content: `Generate an IQ Summary for this matter:\n\n${fullContext}` }],
      }),
    });

    const claudeData = await claudeRes.json();
    const summary = claudeData.content?.[0]?.text?.trim();

    if (!summary) {
      return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }

    // 6. Save back to the job
    await db.from("jobs").update({ ai_notes: summary }).eq("id", job_id);

    return NextResponse.json({ summary });

  } catch (err: any) {
    console.error("[generate-iq-summary]", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
