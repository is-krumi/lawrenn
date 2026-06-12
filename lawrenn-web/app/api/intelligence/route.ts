import { getPlanFeatures } from "@/lib/plans";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";
import { decryptContent } from "@/lib/encryption";

// Service role kept only for: plan check (businesses table), all RPCs, source document lookup.
// documents listing and source metadata use the per-request user client.
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:00 ${suffix}`;
}

function buildCallStats(
  weekCount:   number,
  monthCount:  number,
  byDayOfWeek: any[],
  byHour:      any[],
  outcomes:    any[],
  dailyLast7:  any[]
) {
  return `
CALL STATISTICS:

Total calls:
- Last 7 days: ${weekCount}
- Last 30 days: ${monthCount}

Last 7 days breakdown:
${dailyLast7?.length > 0
  ? dailyLast7.map((d: any) => `- ${d.call_date.trim()}: ${d.call_count} call${d.call_count !== 1 ? "s" : ""}`).join("\n")
  : "- No calls in the last 7 days"}

Busiest day of week (last 90 days): ${byDayOfWeek?.[0] ? `${byDayOfWeek[0].day_name.trim()} (${byDayOfWeek[0].call_count} calls)` : "N/A"}
Busiest hour of day (last 90 days): ${byHour?.[0] ? `${formatHour(byHour[0].hour_of_day)} (${byHour[0].call_count} calls)` : "N/A"}

Call outcomes (last 30 days):
${outcomes?.length > 0
  ? outcomes.map((o: any) => `- ${o.outcome}: ${o.call_count}`).join("\n")
  : "- No outcome data"}
  `.trim();
}

export async function POST(request: Request) {
  try {
    const { query, business_id, history } = await request.json();

    if (!query || !business_id) {
      return NextResponse.json({ error: "query and business_id required" }, { status: 400 });
    }

    const auth = await verifyBusinessAccess(request, business_id);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createUserClient(auth.token);

    // Plan check — adminClient intentional: businesses table is not user-scoped
    const { data: biz } = await adminClient
      .from("businesses")
      .select("subscription_tier")
      .eq("id", business_id)
      .single();

    const planFeatures = getPlanFeatures(biz?.subscription_tier ?? "starter");
    if (!planFeatures.intelligence) {
      return NextResponse.json(
        { error: "Intelligence is not available on your current plan." },
        { status: 403 }
      );
    }

    // Step 1 — Fetch document listing + structured call metrics in parallel
    // db (user client) for documents; adminClient for RPCs
    const [
      docsResult,
      weekResult,
      monthResult,
      dayOfWeekResult,
      hourResult,
      outcomeResult,
      dailyResult,
    ] = await Promise.all([
      db
        .from("documents")
        .select("name, file_type, status, doc_type")
        .eq("business_id", business_id)
        .order("created_at", { ascending: false }),
      adminClient.rpc("get_call_count",           { p_business_id: business_id, p_days: 7  }),
      adminClient.rpc("get_call_count",           { p_business_id: business_id, p_days: 30 }),
      adminClient.rpc("get_calls_by_day_of_week", { p_business_id: business_id, p_days: 90 }),
      adminClient.rpc("get_calls_by_hour",        { p_business_id: business_id, p_days: 90 }),
      adminClient.rpc("get_calls_by_outcome",     { p_business_id: business_id, p_days: 30 }),
      adminClient.rpc("get_daily_call_counts",    { p_business_id: business_id, p_days: 7 }),
    ]);

    const callStats = buildCallStats(
      weekResult.data      ?? 0,
      monthResult.data     ?? 0,
      dayOfWeekResult.data ?? [],
      hourResult.data      ?? [],
      outcomeResult.data   ?? [],
      dailyResult.data     ?? []
    );

    const libraryDocs = docsResult.data ?? [];
    const docListing = libraryDocs.length > 0
      ? `LIBRARY (${libraryDocs.length} file${libraryDocs.length !== 1 ? "s" : ""}):\n` +
        libraryDocs.map((d: any) => `- ${d.name}${d.doc_type ? ` (${d.doc_type})` : ""} [${d.status}]`).join("\n")
      : "LIBRARY: No documents uploaded yet.";

    // Step 2 — Embed the query
    const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    const embedData = await embedRes.json();
    const queryEmbedding = embedData.data?.[0]?.embedding;

    if (!queryEmbedding) {
      console.error("OpenAI embedding error:", JSON.stringify(embedData));
      return NextResponse.json(
        { error: "Failed to generate embedding", detail: embedData.error?.message ?? embedData },
        { status: 500 }
      );
    }

    // Step 3 — Similarity search (adminClient: RPC requires elevated access)
    const { data: matches, error: matchError } = await adminClient.rpc("match_embeddings", {
      query_embedding:  queryEmbedding,
      match_threshold:  0.3,
      match_count:      8,
      p_business_id:    business_id,
      p_customer_id:    null,
    });

    if (matchError) {
      console.error("Match error:", matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    // Step 4 — Build context
    function sourceLabel(type: string): string {
      if (type === "call")     return "Call transcript";
      if (type === "message")  return "SMS message";
      if (type === "document") return "Uploaded document";
      return type;
    }

    const ragContext = matches && matches.length > 0
      ? matches.map((m: any, i: number) =>
          `[Source ${i + 1} — ${sourceLabel(m.source_type)} (${Math.round(m.similarity * 100)}% relevant)]:\n${decryptContent(m.content)}`
        ).join("\n\n---\n\n")
      : "No relevant data found.";

    const context = `
[SECTION 1 — CALL METRICS: live database statistics, NOT an uploaded document]
${callStats}

---

[SECTION 2 — LIBRARY: exact list of uploaded files]
${docListing}

---

[SECTION 3 — RELEVANT CONTEXT: semantic search results from transcripts, messages, and uploaded documents]
${ragContext}
    `.trim();

    // Step 5 — Build conversation history
    const historyMessages = (history ?? []).map((m: any) => ({
      role:    m.role,
      content: m.content,
    }));

    // Step 6 — Ask Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `You are an AI business intelligence assistant for a law firm.

You receive three separate blocks of context:
- CALL METRICS: live database statistics about call volume, outcomes, and timing. Not a document.
- LIBRARY: the exact list of files the user has uploaded. Use this to answer "what files do I have" and similar listing questions.
- RELEVANT CONTEXT: semantic search results from call transcripts, SMS messages, and uploaded document content.

Rules:
- For file listing questions ("what files do I have", "what's in my library"), answer from the LIBRARY section.
- For document content questions ("summarize my contract", "what does the NDA say"), answer from RELEVANT CONTEXT items labeled "Uploaded document".
- For call/volume/outcome questions, use CALL METRICS.
- Never treat call metrics as a document.
- Be specific. Use bullet points where helpful. Keep answers concise.
- Do not preface answers with "based on". Just answer directly.
- If the answer isn't in the data, say so.`,

        messages: [
          ...historyMessages,
          {
            role:    "user",
            content: `Context:\n\n${context}\n\nQuestion: ${query}`,
          },
        ],
      }),
    });

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? "I couldn't generate an answer. Please try again.";

    // Step 7 — Enrich document sources with file metadata for clickable links
    const topMatches = matches?.slice(0, 5) ?? [];
    const docIds = [...new Set(
      topMatches.filter((m: any) => m.source_type === "document").map((m: any) => m.source_id)
    )];

    let docMeta: Record<string, { file_path: string; name: string }> = {};
    if (docIds.length > 0) {
      const { data: docs } = await db
        .from("documents")
        .select("id, file_path, name")
        .in("id", docIds);
      for (const doc of docs ?? []) {
        if (doc.file_path) docMeta[doc.id] = { file_path: doc.file_path, name: doc.name };
      }
    }

    // Step 8 — Return answer with sources
    return NextResponse.json({
      answer,
      sources: topMatches.map((m: any) => ({
        type:       m.source_type,
        content:    decryptContent(m.content),
        similarity: m.similarity,
        ...(m.source_type === "document" && docMeta[m.source_id]
          ? { document_id: m.source_id, file_path: docMeta[m.source_id].file_path, file_name: docMeta[m.source_id].name }
          : {}),
      })),
    });

  } catch (err: any) {
    console.error("Intelligence API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}