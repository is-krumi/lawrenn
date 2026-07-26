import { NextResponse } from "next/server";

type RecipientType = "client" | "opposing_counsel" | "court" | "internal" | "other";

const TONE_MAP: Record<RecipientType, string> = {
  client:            "Warm but professional. Explain legal concepts clearly and avoid jargon. Reassure the client and acknowledge their concerns.",
  opposing_counsel:  "Formal, precise, and measured. No unnecessary warmth. Maintain professional distance and be deliberate with every word.",
  court:             "Highly formal. Reference proper titles (Your Honor, the Court). Follow standard court correspondence conventions.",
  internal:          "Professional but conversational. Can use first names. Focus on clarity and actionable information.",
  other:             "Professional, clear, and appropriately formal.",
};

const PRIVILEGE_TYPES: RecipientType[] = ["client", "internal"];

export async function POST(request: Request) {
  try {
    const {
      chatHistory,
      clientName,
      matterType,
      recipientType,
      recipientName,
      firmName,
      lawyerName,
      instructions,
    } = await request.json();

    if (!chatHistory || !recipientType || !recipientName || !firmName || !lawyerName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const type = (recipientType as RecipientType) in TONE_MAP ? (recipientType as RecipientType) : "other";
    const includePrivilege = PRIVILEGE_TYPES.includes(type);
    const matterRef = [matterType, clientName].filter(Boolean).join(" — ") || "General Matter";

    const prompt = `You are a legal email drafting assistant for ${firmName}.
You are drafting an email on behalf of ${lawyerName}.

RECIPIENT TYPE: ${type.replace(/_/g, " ").toUpperCase()}
RECIPIENT: ${recipientName}
MATTER: ${matterRef}

TONE GUIDELINES:
${TONE_MAP[type]}

FORMATTING RULES:
- Subject line format: "Re: ${matterRef}" (adjust naturally based on context)
${includePrivilege ? "- Begin the email body with: PRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION" : ""}
- Use appropriate salutation based on recipient type
- Short paragraphs with clear structure
- End with specific next steps and timeline if applicable
- Professional sign-off appropriate to recipient type
- Include firm name and lawyer name in the signature block

CRITICAL RULES:
- Only reference facts, law, or case details EXPLICITLY stated in the conversation below
- NEVER fabricate citations, case names, statutes, or legal authorities
- If the conversation lacks enough detail, note what information is missing rather than inventing content
- This is a DRAFT — include a brief attorney-review note at the end of the body

${instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : ""}

Based on the following intelligence conversation, draft the email:

${chatHistory}

Respond in JSON format only — no markdown backticks, no extra text outside the JSON object:
{
  "subject": "the email subject line",
  "body": "the full email body with appropriate line breaks using \\n",
  "disclaimer": "appropriate disclaimer or confidentiality footer for this recipient type"
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 2048,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const rawText: string = data.content?.[0]?.text ?? "";

    let parsed: { subject: string; body: string; disclaimer: string };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: "Failed to parse email draft from model response" }, { status: 500 });
      }
      parsed = JSON.parse(match[0]);
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("[draft-email]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
