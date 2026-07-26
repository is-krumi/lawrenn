import { createUserClient, verifyBusinessAccess } from "@/lib/api-auth";
import { decryptContent } from "@/lib/encryption";
import { getPlanFeatures } from "@/lib/plans";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
    const { query, business_id, history, document_ids } = await request.json();

    if (!query || !business_id) {
      return NextResponse.json({ error: "query and business_id required" }, { status: 400 });
    }

    const hasAttached = Array.isArray(document_ids) && document_ids.length > 0;

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

    // Step 1b — If specific documents are attached, fetch their full content directly
    let attachedDocSection = "";
    if (hasAttached) {
      const [chunksResult, namesResult] = await Promise.all([
        adminClient
          .from("embeddings")
          .select("content, source_id")
          .in("source_id", document_ids)
          .eq("source_type", "document")
          .limit(40),                             // cap at 40 chunks total
        db
          .from("documents")
          .select("id, name")
          .in("id", document_ids),
      ]);

      const nameMap: Record<string, string> = {};
      for (const d of namesResult.data ?? []) nameMap[d.id] = d.name;

      // Group chunks by document and reassemble full text
      // Skip metadata-only discovery chunks (content starts with "Document in library:")
      const byDoc: Record<string, string[]> = {};
      for (const chunk of chunksResult.data ?? []) {
        const text = decryptContent(chunk.content);
        if (text && !text.startsWith("Document in library:")) (byDoc[chunk.source_id] ??= []).push(text);
      }

      if (Object.keys(byDoc).length > 0) {
        const parts = Object.entries(byDoc).map(([id, chunks]) => {
          const name = nameMap[id] ?? "Document";
          return `[${name}]:\n${chunks.join("\n\n")}`;
        });
        attachedDocSection = parts.join("\n\n---\n\n");
      }
    }

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

    // Step 3 — Hybrid retrieval: vector + full-text search with RRF fusion
    // Retrieve wide (25 candidates) so the reranker has enough to work with.
    // Falls back to pure vector search (match_embeddings) if hybrid_search hasn't
    // been created yet (migration not run).
    let rawCandidates: any[] = [];
    const { data: hybridData, error: hybridError } = await adminClient.rpc("hybrid_search", {
      query_text:      query,
      query_embedding: queryEmbedding,
      match_count:     25,
      p_business_id:   business_id,
      p_source_ids:    hasAttached ? document_ids : null,
    });

    if (hybridError) {
      console.warn("[intelligence] hybrid_search error, falling back to match_embeddings:", hybridError.message, hybridError);
      const { data: fallback, error: fallbackErr } = await adminClient.rpc("match_embeddings", {
        query_embedding:  queryEmbedding,
        match_threshold:  0.1,   // was 0.3 — lowered so generic queries still surface content
        match_count:      25,
        p_business_id:    business_id,
        p_customer_id:    null,
      });
      if (fallbackErr) {
        console.error("[intelligence] match_embeddings fallback error:", fallbackErr);
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      }
      rawCandidates = fallback ?? [];
      console.log(`[intelligence] match_embeddings fallback returned ${rawCandidates.length} rows`);
    } else {
      rawCandidates = hybridData ?? [];
      console.log(`[intelligence] hybrid_search returned ${rawCandidates.length} rows`);
    }

    // Strip metadata-only discovery chunks before reranking — they match generic queries
    // ("tell me about X") better than actual document content but contain no useful text.
    const beforeFilter = rawCandidates.length;
    rawCandidates = rawCandidates.filter((m: any) => {
      const text = decryptContent(m.content);
      return !text?.startsWith("Document in library:");
    });
    console.log(`[intelligence] candidates: ${beforeFilter} raw → ${rawCandidates.length} after metadata filter`, rawCandidates.slice(0, 2).map((m: any) => decryptContent(m.content)?.slice(0, 80)));

    // Step 4 — Rerank: send 25 candidates to Cohere, keep best 5
    // Wide retrieval (recall) → narrow reranking (precision).
    // Skipped gracefully if COHERE_API_KEY is not set.
    let matches: any[] = rawCandidates;
    if (matches.length > 5 && process.env.COHERE_API_KEY) {
      try {
        const docs = matches.map((m: any) => decryptContent(m.content));
        const rerankRes = await fetch("https://api.cohere.com/v1/rerank", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            model:     "rerank-english-v3.0",
            query,
            documents: docs,
            top_n:     5,
          }),
        });
        if (rerankRes.ok) {
          const rerankData = await rerankRes.json();
          matches = (rerankData.results ?? []).map((r: any) => ({
            ...rawCandidates![r.index],
            similarity: r.relevance_score,
          }));
        }
      } catch (err) {
        console.warn("[intelligence] reranker failed, using raw candidates:", err);
        matches = rawCandidates.slice(0, 5);
      }
    } else {
      matches = matches.slice(0, 5);
    }

    // Step 5 — Build context
    function sourceLabel(type: string): string {
      if (type === "call")     return "Call transcript";
      if (type === "message")  return "SMS message";
      if (type === "document") return "Uploaded document";
      return type;
    }

    const ragContext = matches.length > 0
      ? matches.map((m: any, i: number) => {
          const section = m.section_header ? ` — §${m.section_header}` : "";
          return `[Source ${i + 1} — ${sourceLabel(m.source_type)}${section} (${Math.round((m.similarity ?? 0) * 100)}% relevant)]:\n${decryptContent(m.content)}`;
        }).join("\n\n---\n\n")
      : "No relevant data found.";

    const context = `
${attachedDocSection ? `[ATTACHED DOCUMENTS — the user pinned these; treat them as the primary source for this query]
${attachedDocSection}

---

` : ""}[SECTION 1 — CALL METRICS: live database statistics, NOT an uploaded document]
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
        model:      "claude-sonnet-4-6",
        max_tokens: hasAttached ? 2048 : 1024,
        system: `You are an AI business intelligence assistant for a law firm.

You receive context in labelled sections:
${hasAttached ? "- ATTACHED DOCUMENTS: the exact documents the user pinned to this conversation. Use these as the primary and authoritative source for any questions about document content.\n" : ""}- CALL METRICS: live database statistics about call volume, outcomes, and timing. Not a document.
- LIBRARY: the exact list of files the user has uploaded. Use this to answer "what files do I have" and similar listing questions.
- RELEVANT CONTEXT: semantic search results from call transcripts, SMS messages, and uploaded document content.

Rules:
${hasAttached ? "- When the user asks about \"the document\", \"this file\", \"what I uploaded\", or uses a prompt like \"summarize\" with no further specification, answer using ATTACHED DOCUMENTS — not RELEVANT CONTEXT.\n- Summarize or answer from ATTACHED DOCUMENTS fully; do not say the document is not available.\n" : ""}- For file listing questions ("what files do I have", "what's in my library"), answer from the LIBRARY section.
- For document content questions without an attachment, answer from RELEVANT CONTEXT items labeled "Uploaded document".
- For call/volume/outcome questions, use CALL METRICS.
- Never treat call metrics as a document.
- Be specific and concise. Default to plain prose. Use bullet points or numbered lists only when the content is genuinely a list of discrete items — not for general explanations, summaries, or single-topic answers.
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
    const topMatches = matches;
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
        content:    decryptContent(m.content)?.replace(/^#+\s+[^\n]*\n*/m, "").trim() ?? null,
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