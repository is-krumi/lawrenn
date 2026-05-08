import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { customer, messages, calls } = await request.json();

    if (!customer) {
      return NextResponse.json({ error: "customer is required" }, { status: 400 });
    }

    const hasData = (messages?.length ?? 0) > 0 || (calls?.length ?? 0) > 0;
    if (!hasData) {
      return NextResponse.json({ summary: null });
    }

    const msgBlock = messages?.length > 0
      ? messages.map((m: any) =>
          `[${m.direction === "inbound" ? "Customer" : "Business"} — ${new Date(m.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}]: ${m.body}`
        ).join("\n")
      : "";

    const callBlock = calls?.length > 0
      ? calls.map((c: any) =>
          `[Call — ${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — outcome: ${c.outcome ?? "unknown"}]: ${c.transcript ?? "(no transcript)"}`
        ).join("\n\n")
      : "";

    const jobBlock = customer.jobs?.length > 0
      ? customer.jobs.map((j: any) => `${j.type} (${j.status})${j.amount ? ` — $${j.amount}` : ""}`).join(", ")
      : "No previous jobs";

    const leadSource = (calls?.length ?? 0) > 0 ? "Phone Call" : "SMS";

    const prompt = `You are an AI assistant helping a home service business owner understand a customer at a glance.

Customer: ${customer.name ?? customer.phone}
Phone: ${customer.phone}
${customer.address ? `Address: ${customer.address}` : ""}
${customer.email ? `Email: ${customer.email}` : ""}
Job history: ${jobBlock}
${customer.notes ? `Owner notes: ${customer.notes}` : ""}

${msgBlock ? `--- SMS MESSAGES ---\n${msgBlock}` : ""}
${callBlock ? `\n--- CALL TRANSCRIPTS ---\n${callBlock}` : ""}

Based on all available context, write a short customer intelligence summary for the business owner.

Format your response exactly like this (no markdown headers, no asterisks):

First, write 2–4 plain sentences covering: what the customer contacted about, their tone/urgency, any concerns or red flags (e.g. price shopping, complaint, unresolved issue, competitor mention).

Then on a new line write exactly:
Recommended action:
Then on the next line write 1–2 sentences on what the business owner should do next and when.

Be direct, specific, and use the customer's first name if available. If there is nothing notable, say so briefly.

After the recommended action, output a structured block exactly like this (no extra lines between the markers, no markdown):
---INTELLIGENCE---
Service Needed: [specific service they need, or "Unknown"]
Intent Level: [High / Medium / Low]
Urgency: [Emergency / Same-day / Routine / Not urgent]
Sentiment: [Positive / Neutral / Frustrated / Angry]
Estimated Revenue: [Only output a dollar range if a specific price, quote, or dollar amount was explicitly mentioned in the conversation. Otherwise output exactly "Unknown"]
Current Stage: [Needs Quote / Booked / Awaiting Response / Follow-up Needed / Completed]
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
        model:      "claude-sonnet-4-20250514",
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

    // Inject computed fields — never rely on Claude for these
    if (intelligence) {
      intelligence["Lead Source"] = leadSource;
    }

    const summaryText = intStart !== -1 ? text.slice(0, intStart).trim() : text.trim();

    // Split on "Recommended action:" label
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
