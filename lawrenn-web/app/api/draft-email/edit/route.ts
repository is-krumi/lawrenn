import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { selectedText, instruction, emailBody } = await req.json();

    if (!selectedText?.trim() || !instruction?.trim()) {
      return NextResponse.json({ error: "selectedText and instruction are required" }, { status: 400 });
    }

    const systemPrompt = `You are an expert email editor for a law firm. The user has selected a portion of an email and wants you to rewrite it.

Return ONLY the replacement text — no explanation, no preamble, no quotes around it. The replacement will be inserted directly into the email where the selection was.

Full email for context:
${(emailBody ?? "").slice(0, 4000)}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Selected text: "${selectedText}"\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const replacement = response.content.find(c => c.type === "text")?.text ?? selectedText;
    return NextResponse.json({ replacement });
  } catch (err) {
    console.error("[draft-email/edit]", err);
    return NextResponse.json({ error: "Failed to edit text" }, { status: 500 });
  }
}
