import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";
import { decryptContent } from "@/lib/encryption";

// Service role kept only for: match_embeddings RPC, direct embeddings table access.
// All user-owned data (jobs, customers) queries use the user-scoped client below.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function dotProduct(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export async function POST(request: Request) {
  try {
    const { query, business_id, job_id, history, doc_id } = await request.json();
    if (!query || !business_id || !job_id) {
      return NextResponse.json({ error: "query, business_id, and job_id are required" }, { status: 400 });
    }

    const auth = await verifyBusinessAccess(request, business_id);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createUserClient(auth.token);

    // Fetch full matter + client data (user client — RLS enforced)
    const [{ data: job }, { data: matterContacts }] = await Promise.all([
      db
        .from("jobs")
        .select(`
          id, name, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, created_at, updated_at, technician_id,
          customers (id, name, phone, address),
          technicians (name, color)
        `)
        .eq("id", job_id)
        .single(),
      db
        .from("matter_contacts")
        .select("contact_type, first_name, last_name, phone, email")
        .eq("job_id", job_id),
    ]);

    const client   = (job?.customers as any) ?? null;
    const attorney = (job?.technicians as any) ?? null;

    const matterContext = job ? [
      `Matter: ${job.name || `${client?.name ?? "Unknown"} — ${job.type}`}`,
      `Status: ${job.status}`,
      `Type: ${job.type}`,
      `Scheduled: ${new Date(job.slot_start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
      `Attorney: ${attorney?.name ?? "Unassigned"}`,
      client?.name    ? `Client Name: ${client.name}`       : null,
      client?.phone   ? `Client Phone: ${client.phone}`     : null,
      client?.address ? `Client Address: ${client.address}` : null,
      job.ai_notes    ? `AI Summary: ${job.ai_notes}`       : null,
      job.notes       ? `Attorney Notes: ${job.notes}`      : null,
    ].filter(Boolean).join("\n") : "Matter data unavailable.";

    const contactsContext = matterContacts && matterContacts.length > 0
      ? "\n\nCONTACTS:\n" + matterContacts.map((c: any) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown";
          const details = [c.phone, c.email].filter(Boolean).join(" | ");
          return `- ${c.contact_type}: ${name}${details ? ` | ${details}` : ""}`;
        }).join("\n")
      : "";

    const fullMatterContext = matterContext + contactsContext;

    // Embed the query
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.data?.[0]?.embedding;
    if (!queryEmbedding) {
      return NextResponse.json({ error: "Failed to generate embedding" }, { status: 500 });
    }

    // When a specific doc is attached, search only its embeddings
    let matches: any[];
    if (doc_id) {
      // adminClient used: embeddings table is a cross-business aggregate (RPC target)
      const { data: rows } = await adminClient
        .from("embeddings")
        .select("id, content, source_type, embedding")
        .eq("source_id", doc_id)
        .eq("business_id", business_id);

      matches = (rows ?? [])
        .map((r: any) => {
          const emb: number[] = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
          return { ...r, content: decryptContent(r.content), similarity: dotProduct(queryEmbedding, emb) };
        })
        .filter((r: any) => r.similarity > 0.2)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, 6);
    } else {
      // adminClient used: match_embeddings RPC requires elevated access
      const customerId = client?.id ?? null;
      const [clientResult, generalResult] = await Promise.all([
        customerId
          ? adminClient.rpc("match_embeddings", { query_embedding: queryEmbedding, match_threshold: 0.25, match_count: 5, p_business_id: business_id, p_customer_id: customerId })
          : Promise.resolve({ data: [] }),
        adminClient.rpc("match_embeddings", { query_embedding: queryEmbedding, match_threshold: 0.3, match_count: 6, p_business_id: business_id, p_customer_id: null }),
      ]);

      const clientIds = new Set((clientResult.data ?? []).map((m: any) => m.id));
      matches = [
        ...(clientResult.data ?? []),
        ...(generalResult.data ?? []).filter((m: any) => !clientIds.has(m.id)),
      ].slice(0, 8);
    }

    function sourceLabel(type: string) {
      if (type === "call")     return "Call transcript";
      if (type === "message")  return "SMS message";
      if (type === "document") return "Uploaded document";
      return type;
    }

    const ragContext = matches.length > 0
      ? matches.map((m: any, i: number) =>
          `[Source ${i + 1} — ${sourceLabel(m.source_type)} (${Math.round(m.similarity * 100)}% relevant)]:\n${decryptContent(m.content)}`
        ).join("\n\n---\n\n")
      : "No relevant data found for this client or matter.";

    const context = `
[SECTION 1 — THIS MATTER (primary reference)]
${fullMatterContext}

---

[SECTION 2 — RELATED CONTEXT: call transcripts, messages, and documents — client-specific results prioritized]
${ragContext}
    `.trim();

    const historyMessages = (history ?? []).map((m: any) => ({ role: m.role, content: m.content }));

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are an AI legal assistant helping an attorney with a specific client matter.

You have access to:
- THIS MATTER: the case details, client info, status, attorney notes, and AI summary — treat this as the primary source
- RELATED CONTEXT: call transcripts, messages, and documents related to this client and business

Rules:
- Prioritize information from THIS MATTER section. Use RELATED CONTEXT to supplement.
- Be specific and concise. Use bullet points where helpful.
- Address questions about the client, case status, call history, and documents directly.
- Do not preface answers with "based on". Just answer directly.
- If the answer isn't in the data, say so clearly.`,
        messages: [
          ...historyMessages,
          { role: "user", content: `Context:\n\n${context}\n\nQuestion: ${query}` },
        ],
      }),
    });

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? "I couldn't generate an answer. Please try again.";

    return NextResponse.json({ answer });

  } catch (err: any) {
    console.error("[intelligence/matter]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
