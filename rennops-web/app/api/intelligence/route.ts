import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { query, business_id, history } = await request.json();

    if (!query || !business_id) {
      return NextResponse.json({ error: "query and business_id required" }, { status: 400 });
    }

    // Step 1 — Embed the query using OpenAI
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

    // Step 2 — Similarity search in Supabase
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

    // Step 3 — Build context from matches
    const context = matches && matches.length > 0
      ? matches.map((m: any, i: number) =>
          `[Source ${i + 1} — ${m.source_type === "call" ? "Call transcript" : "SMS message"} (${Math.round(m.similarity * 100)}% relevant)]:\n${m.content}`
        ).join("\n\n---\n\n")
      : "No relevant data found in your call and message history.";

    // Step 4 — Build conversation history
    const historyMessages = (history ?? []).map((m: any) => ({
      role:    m.role,
      content: m.content,
    }));

    // Step 5 — Ask Claude with context
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
        system: `You are an AI business intelligence assistant for ${business_id}. 
You have access to the business's call transcripts, SMS messages, and customer interactions.
Answer questions based on the provided context. Be specific and cite details from the sources.
If the context doesn't contain enough information to answer confidently, say so clearly.
Format your answers clearly — use bullet points or numbered lists when listing multiple items.
Keep answers concise and actionable for a busy business owner.`,
        messages: [
          ...historyMessages,
          {
            role:    "user",
            content: `Context from call and message history:\n\n${context}\n\nQuestion: ${query}`,
          },
        ],
      }),
    });

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text ?? "I couldn't generate an answer. Please try again.";

    // Step 6 — Return answer with sources
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