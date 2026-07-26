import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const apiKey = process.env.COURTLISTENER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "COURTLISTENER_API_KEY not set in environment" }, { status: 500 });
    }

    // 1. Fetch from CourtListener
    const params = new URLSearchParams({ q, type: "o", order_by: "score desc", page_size: "10" });
    const clRes = await fetch(
      `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
      { headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" } }
    );

    const clText = await clRes.text();
    console.log("[courtlistener] status:", clRes.status, "preview:", clText.slice(0, 120));

    if (!clRes.ok) {
      return NextResponse.json({ error: `CourtListener ${clRes.status}: ${clText.slice(0, 300)}` }, { status: clRes.status });
    }

    const clData = JSON.parse(clText);
    const results: any[] = clData.results ?? [];

    if (results.length === 0) {
      return NextResponse.json({ count: 0, results: [], analysis: null });
    }

    // 2. Ask Claude to organize results by legal issue
    const caseList = results.map((r: any, i: number) =>
      `[${i}] ${r.caseName ?? r.case_name ?? "Untitled"} | ${r.court_citation_string ?? ""} | ${r.dateFiled ?? r.date_filed ?? ""}\nCitation: ${r.citation?.[0] ?? "—"}\nSnippet: ${stripHtml(r.snippet ?? "")}`
    ).join("\n\n");

    const aiRes = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1500,
      system: `You are a legal research assistant. Analyze case law search results and organize them by key legal issues.
Return ONLY a JSON object in this exact format, no markdown, no explanation:
{"issues":[{"title":"string","summary":"string","indices":[0,1],"passages":[{"index":0,"text":"string"},{"index":1,"text":"string"}]}]}
- 2–4 issues maximum
- indices: the [N] numbers of relevant cases for each issue
- passages: for each case in this issue, the single most legally significant sentence from its snippet
- summary: one sentence explaining this legal principle`,
      messages: [{ role: "user", content: `Search query: "${q}"\n\nCases:\n${caseList}` }],
    });

    let analysis: any = null;
    try {
      const raw = aiRes.content.find(c => c.type === "text")?.text ?? "{}";
      const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(clean);
    } catch (e) {
      console.error("[courtlistener] Claude parse error:", e);
    }

    return NextResponse.json({ count: clData.count, results, analysis });

  } catch (err: any) {
    console.error("[courtlistener] route error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
