import { getPlanFeatures } from "@/lib/plans";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // Plan check — server-side gate
    const { data: biz } = await supabase
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

    // Step 1 — Fetch structured call metrics via SQL functions (aggregated, scalable)
    const [
      weekResult,
      monthResult,
      dayOfWeekResult,
      hourResult,
      outcomeResult,
      dailyResult,
    ] = await Promise.all([
      supabase.rpc("get_call_count",           { p_business_id: business_id, p_days: 7 }),
      supabase.rpc("get_call_count",           { p_business_id: business_id, p_days: 30 }),
      supabase.rpc("get_calls_by_day_of_week", { p_business_id: business_id, p_days: 90 }),
      supabase.rpc("get_calls_by_hour",        { p_business_id: business_id, p_days: 90 }),
      supabase.rpc("get_calls_by_outcome",     { p_business_id: business_id, p_days: 30 }),
      supabase.rpc("get_daily_call_counts",    { p_business_id: business_id, p_days: 7 }),
    ]);

    const callStats = buildCallStats(
      weekResult.data      ?? 0,
      monthResult.data     ?? 0,
      dayOfWeekResult.data ?? [],
      hourResult.data      ?? [],
      outcomeResult.data   ?? [],
      dailyResult.data     ?? []
    );

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

    // Step 3 — Similarity search
    const { data: matches, error: matchError } = await supabase.rpc("match_embeddings", {
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
          `[Source ${i + 1} — ${sourceLabel(m.source_type)} (${Math.round(m.similarity * 100)}% relevant)]:\n${m.content}`
        ).join("\n\n---\n\n")
      : "No relevant data found.";

    const context = `
[SECTION 1 — CALL METRICS: live database statistics, NOT an uploaded document]
${callStats}

---

[SECTION 2 — RELEVANT CONTEXT: semantic search results from transcripts, messages, and uploaded documents]
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

You receive two separate blocks of context:
- STRUCTURED CALL METRICS: live database statistics about call volume, outcomes, and timing. This is NOT a document — it is background data about the firm's phone activity.
- RELEVANT CONTEXT: semantic search results that may include call transcripts, SMS messages, or uploaded documents. Items labeled "Uploaded document" are files the user has shared.

Rules:
- If the user asks about "the document", "this document", or anything about an uploaded file, answer ONLY from content labeled "Uploaded document". Ignore call metrics entirely for these questions.
- If the user asks about calls, volume, outcomes, or timing, use the structured call metrics.
- If the user asks a general business question, use whichever source is relevant.
- Never treat call metrics as part of an uploaded document.
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

    // Step 7 — Return answer with sources
    return NextResponse.json({
      answer,
      sources: matches?.slice(0, 5).map((m: any) => ({
        type:       m.source_type,
        content:    m.content,
        similarity: m.similarity,
      })) ?? [],
    });

  } catch (err: any) {
    console.error("Intelligence API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}