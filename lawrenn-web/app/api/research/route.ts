import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";
import { decryptContent } from "@/lib/encryption";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

async function fetchStatuteFromCourtListener(citation: string, name: string): Promise<string | null> {
  const clKey = process.env.COURTLISTENER_API_KEY;
  if (!clKey) return null;
  try {
    const q = `${name} ${citation}`.slice(0, 200);
    const params = new URLSearchParams({ q, type: "s", order_by: "score desc", page_size: "3" });
    const res = await fetch(
      `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
      { headers: { Authorization: `Token ${clKey}`, Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.results ?? []).find((r: any) => r.text || r.snippet);
    if (!hit) return null;
    const text = stripHtml(hit.text || hit.snippet || "").slice(0, 3000);
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}

async function fetchOpinionsFromCourtListener(searchQuery: string): Promise<any[]> {
  const clKey = process.env.COURTLISTENER_API_KEY;
  if (!clKey) return [];
  try {
    const params = new URLSearchParams({ q: searchQuery, type: "o", order_by: "score desc", page_size: "2" });
    const res = await fetch(
      `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
      { headers: { Authorization: `Token ${clKey}`, Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r: any) => ({
      id:          r.id,
      caseName:    r.caseName ?? r.case_name ?? "Untitled",
      citation:    r.citation?.[0] ?? null,
      court:       r.court_citation_string ?? null,
      dateFiled:   r.dateFiled ?? r.date_filed ?? null,
      absoluteUrl: r.absolute_url,
      snippet:     r.snippet ? stripHtml(r.snippet) : null,
    }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { matter_id, business_id } = await request.json();
    if (!matter_id || !business_id) {
      return NextResponse.json({ error: "matter_id and business_id required" }, { status: 400 });
    }

    const auth = await verifyBusinessAccess(request, business_id);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = createUserClient(auth.token);

    // 1. Fetch matter data and contacts in parallel
    const [{ data: job }, { data: contacts }] = await Promise.all([
      db.from("jobs").select(`
        id, name, type, status, notes, ai_notes, created_at,
        customers (id, name, phone, address),
        technicians (name)
      `).eq("id", matter_id).single(),
      db.from("matter_contacts").select("contact_type, first_name, last_name, phone, email").eq("job_id", matter_id),
    ]);

    if (!job) return NextResponse.json({ error: "Matter not found" }, { status: 404 });

    const client   = (job.customers as any) ?? null;
    const attorney = (job.technicians as any) ?? null;

    // 2. RAG: fetch embeddings for documents directly linked to this matter
    let ragContext = "";
    const ragChunks: { text: string; sourceType: string; docName: string }[] = [];

    try {
      const { data: matterDocs } = await adminClient
        .from("documents")
        .select("id, name")
        .eq("job_id", matter_id)
        .is("deleted_at", null);

      const docIds = (matterDocs ?? []).map((d: any) => d.id);
      const docNameMap: Record<string, string> = Object.fromEntries(
        (matterDocs ?? []).map((d: any) => [d.id, d.name])
      );

      if (docIds.length > 0) {
        const { data: rows } = await adminClient
          .from("embeddings")
          .select("id, content, source_type, source_id")
          .in("source_id", docIds)
          .eq("business_id", business_id);

        if (rows && rows.length > 0) {
          for (const r of rows) {
            const text = decryptContent(r.content);
            ragChunks.push({ text, sourceType: r.source_type, docName: docNameMap[r.source_id] ?? "Unknown" });
          }
          ragContext = ragChunks.map((c, i) =>
            `[File chunk ${i + 1} — ${c.docName}]:\n${c.text}`
          ).join("\n\n---\n\n");
        }
      }

      if (!ragContext && client?.id) {
        const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: [job.type, job.notes, job.ai_notes].filter(Boolean).join(" ").slice(0, 500) }),
        });
        const embedData = await embedRes.json();
        const queryEmbedding = embedData.data?.[0]?.embedding;
        if (queryEmbedding) {
          const { data: fallbackMatches } = await adminClient.rpc("match_embeddings", {
            query_embedding: queryEmbedding, match_threshold: 0.25, match_count: 6,
            p_business_id: business_id, p_customer_id: client.id,
          });
          if (fallbackMatches?.length) {
            for (const m of fallbackMatches) {
              const text = decryptContent(m.content);
              ragChunks.push({ text, sourceType: m.source_type, docName: m.source_type });
            }
            ragContext = ragChunks.map((c, i) =>
              `[Context ${i + 1} — ${c.sourceType}]:\n${c.text}`
            ).join("\n\n---\n\n");
          }
        }
      }
    } catch (e) {
      console.warn("[research] RAG retrieval failed (non-fatal):", e);
    }

    // 3. Build full matter context
    const matterContext = [
      `Practice Area: ${job.type}`,
      job.name ? `Matter: ${job.name}` : null,
      `Status: ${job.status}`,
      client?.name    ? `Client: ${client.name}`       : null,
      client?.address ? `Location: ${client.address}`  : null,
      attorney?.name  ? `Attorney: ${attorney.name}`   : null,
      job.ai_notes    ? `AI Summary: ${job.ai_notes}`  : null,
      job.notes       ? `Attorney Notes: ${job.notes}` : null,
      contacts?.length
        ? `Other Parties:\n${contacts.map((c: any) => `  - ${c.contact_type}: ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}`).join("\n")}`
        : null,
      ragContext ? `\nRelated Documents & Transcripts:\n${ragContext}` : null,
    ].filter(Boolean).join("\n");

    // 4. Claude: identify legal issues, statutes, and search queries
    const planRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        system: `You are an expert legal research assistant. Analyze a legal matter and produce a structured research brief.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "jurisdiction": "identified jurisdiction (state + federal if applicable)",
  "synopsis": "3-5 sentence summary of the matter: what it is, who is involved, what the key facts are, and what is at stake legally. Write in plain language as if briefing a senior attorney.",
  "issues": [
    {
      "title": "Concise legal issue title",
      "relevance": "1-2 sentences on how this issue directly applies to this specific matter",
      "statute": {
        "name": "Full official statute name",
        "citation": "Proper legal citation (e.g. N.Y. Dom. Rel. Law § 236(B) or 42 U.S.C. § 1983)",
        "text": "Your best recollection of the statutory language — 3-6 sentences minimum",
        "plainEnglish": "What this statute means for this specific matter in 1-2 plain sentences"
      },
      "searchQuery": "CourtListener full-text opinion search query. Use quoted phrases for the specific legal concept to avoid false matches — e.g. \"criminal trespass\" \"second degree\" New York, NOT loose keywords like 'trespass second degree' which match unrelated crimes. Always quote the core legal phrase and include the jurisdiction."
    }
  ]
}

Rules:
- 2 to 3 issues maximum
- Infer jurisdiction from client address, matter type, or context; default to federal if unclear
- searchQuery MUST use Solr-style quoted phrases for the core legal concept (e.g. "criminal trespass in the second degree") so CourtListener returns opinions specifically about that issue, not tangentially related ones`,
        messages: [{ role: "user", content: `Legal Matter:\n\n${matterContext}` }],
      }),
    });

    const planData  = await planRes.json();
    const planRaw   = planData.content?.[0]?.text ?? "{}";
    const planClean = planRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let plan: { jurisdiction: string; synopsis?: string; issues: any[] };
    try {
      plan = JSON.parse(planClean);
    } catch (e) {
      console.error("[research] plan parse error:", e, "raw:", planRaw.slice(0, 300));
      return NextResponse.json({ error: "Failed to analyze matter — Claude returned unexpected output" }, { status: 500 });
    }

    if (!plan?.issues?.length) {
      return NextResponse.json({ error: "No legal issues identified for this matter" }, { status: 422 });
    }

    // 5. Statute text from CourtListener (fallback: keep Claude's text)
    //    + opinions search — both in parallel per issue
    const issues = await Promise.all(plan.issues.map(async (issue: any) => {
      const statute = issue.statute ?? null;

      const [clStatuteText, opinions] = await Promise.all([
        statute ? fetchStatuteFromCourtListener(statute.citation, statute.name) : Promise.resolve(null),
        fetchOpinionsFromCourtListener(issue.searchQuery),
      ]);

      if (statute && clStatuteText) {
        statute.text = clStatuteText;
      }

      return {
        title:       issue.title,
        relevance:   issue.relevance,
        statute:     statute,
        searchQuery: issue.searchQuery,
        opinions,
      };
    }));

    return NextResponse.json({ jurisdiction: plan.jurisdiction, synopsis: plan.synopsis ?? null, issues, chunks: ragChunks });

  } catch (err: any) {
    console.error("[research] error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
