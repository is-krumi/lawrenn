import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPlanFeatures } from "@/lib/plans";

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
      return NextResponse.json({ error: "Failed to generate embedding" }, { status: 500 });
    }

    // Step 3 — Similarity search
    const { data: matches, error: matchError } = await supabase.rpc("match_embeddings", {
      query_embedding:   queryEmbedding,
      match_business_id: business_id,
      match_source_type: null,
      match_count:       8,
    });

    if (matchError) {
      console.error("Match error:", matchError);
      return NextResponse.json({ error: matchError.message }, { status: 500 });
    }

    // Step 4 — Build context
    const ragContext = matches && matches.length > 0
      ? matches.map((m: any, i: number) =>
          `[Source ${i + 1} — ${m.source_type === "call" ? "Call transcript" : "SMS message"} (${Math.round(m.similarity * 100)}% relevant)]:\n${m.content}`
        ).join("\n\n---\n\n")
      : "No relevant transcript data found.";

    const context = `
STRUCTURED CALL METRICS:
${callStats}

---

RELEVANT CALL TRANSCRIPTS AND MESSAGES:
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
        system: `You are an AI business intelligence assistant with access to real call metrics and transcripts.

You have two types of data:
1. STRUCTURED CALL METRICS — exact numbers from the database (use these for quantitative questions like "how many calls", "busiest day", "what time")
2. RELEVANT TRANSCRIPTS — semantic search results (use these for qualitative questions like "what did customers complain about", "what services were requested")

Answer questions using whichever data source is most relevant. For quantitative questions always use the structured metrics, not the transcripts.
Be specific and cite actual numbers. Format answers clearly with bullet points where helpful.
Keep answers concise and actionable for a busy business owner.
If you don't know the answer, say you don't know. Never make up an answer.
-dont preface and aswer by saying based on. just tell the user the answer.`,

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