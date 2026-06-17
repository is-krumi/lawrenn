import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { customer, messages, calls } = await request.json();

    if (!customer) {
      return NextResponse.json({ error: "customer is required" }, { status: 400 });
    }

    const hasAnyData =
      (messages?.length ?? 0) > 0 ||
      (calls?.length ?? 0) > 0 ||
      (customer.jobs?.length ?? 0) > 0 ||
      !!customer.notes;

    if (!hasAnyData) {
      return NextResponse.json({ summary: null });
    }

    const msgBlock = messages?.length > 0
      ? messages.map((m: any) =>
          `[${m.direction === "inbound" ? "Client" : "Firm"} — ${new Date(m.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}]: ${m.body}`
        ).join("\n")
      : "";

    const callBlock = calls?.length > 0
      ? calls.map((c: any) =>
          `[Call — ${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — outcome: ${c.outcome ?? "unknown"}]: ${c.transcript ?? "(no transcript)"}`
        ).join("\n\n")
      : "";

    const matterBlock = customer.jobs?.length > 0
      ? customer.jobs.map((j: any) => `${j.type} (${j.status})${j.amount ? ` — $${j.amount}` : ""}`).join(", ")
      : "No previous matters on file";

    const referralSource = (calls?.length ?? 0) > 0 ? "Phone Call" : (messages?.length ?? 0) > 0 ? "SMS" : "Direct";

    const prompt = `You are an AI legal client intelligence assistant for Lawrenn, a platform built for law firms and attorneys.

Client: ${customer.name ?? customer.phone}
Phone: ${customer.phone}
${customer.address ? `Address: ${customer.address}` : ""}
${customer.email ? `Email: ${customer.email}` : ""}
Matter history: ${matterBlock}
${customer.notes ? `Attorney notes: ${customer.notes}` : ""}

${msgBlock ? `--- SMS / MESSAGE THREAD ---\n${msgBlock}` : ""}
${callBlock ? `\n--- CALL TRANSCRIPTS ---\n${callBlock}` : ""}

Based on all available context, produce a concise client intelligence briefing for the attorney or intake team.

Format your response exactly as follows (no markdown headers, no asterisks, no bullet points):

First, write 2–4 plain sentences covering: what legal matter the client is inquiring about, their tone and urgency, any concerns or red flags (e.g. statute of limitations pressure, price sensitivity, prior attorney, emotional distress, confidentiality issues, potential conflicts).

Then on a new line write exactly:
Recommended action:
Then on the next line write 1–2 sentences on what the attorney or intake team should do next (e.g. schedule consultation, send retainer agreement, follow up on documents, check for conflicts).

Be specific and use the client's first name if available. Reference any deadlines, legal urgency, or case-sensitive details you detect. If there is nothing notable, say so briefly.

After the recommended action, output a structured block exactly like this (no extra lines between the markers, no markdown):
---INTELLIGENCE---
Matter Type: [area of law or specific legal matter, e.g. Personal Injury, Family Law – Divorce, Business Formation, Contract Dispute, Immigration, Estate Planning, Criminal Defense, Real Estate, Employment, or "Unknown"]
Engagement Level: [High / Medium / Low]
Urgency: [Emergency / Time-sensitive / Routine / Not urgent]
Client Sentiment: [Positive / Neutral / Concerned / Frustrated / Distressed]
Estimated Fees: [Only output a dollar range if a specific fee, quote, or retainer amount was explicitly mentioned. Otherwise output exactly "Unknown"]
Matter Stage: [Consultation Pending / Retained / Active Matter / Awaiting Documents / Awaiting Response / Closed]
Follow-up Due: [e.g. "Today at 3:00 PM" or "Tomorrow morning" or "Not needed"]
Assigned To: Unassigned
---END---`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Claude API error:", JSON.stringify(data));
      return NextResponse.json({ error: data.error?.message ?? "Claude API error" }, { status: 500 });
    }

    const text: string = data.content?.[0]?.text ?? "";

    if (!text) {
      console.error("Claude returned empty content:", JSON.stringify(data));
      return NextResponse.json({ error: "No summary generated" }, { status: 500 });
    }

    // Extract intelligence block between markers
    const intStart = text.indexOf("---INTELLIGENCE---");
    const intEnd   = text.indexOf("---END---");
    let intelligence: Record<string, string> | null = null;
    if (intStart !== -1 && intEnd !== -1) {
      const block = text.slice(intStart + "---INTELLIGENCE---".length, intEnd).trim();
      intelligence = {};
      for (const line of block.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          intelligence[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
        }
      }
    }

    // Inject computed fields
    if (intelligence) {
      intelligence["Referral Source"] = referralSource;
    }

    const summaryText = intStart !== -1 ? text.slice(0, intStart).trim() : text.trim();

    const splitIdx = summaryText.indexOf("Recommended action:");
    if (splitIdx !== -1) {
      return NextResponse.json({
        summary: summaryText.slice(0, splitIdx).trim(),
        action:  summaryText.slice(splitIdx + "Recommended action:".length).trim(),
        intelligence,
      });
    }

    return NextResponse.json({ summary: summaryText.trim(), action: null, intelligence });

  } catch (err: any) {
    console.error("customer-summary error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
