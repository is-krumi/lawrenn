import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { selectedText, instruction, documentContext } = await req.json();

    if (!selectedText?.trim() || !instruction?.trim()) {
      return NextResponse.json({ error: "selectedText and instruction are required" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: `You are an AI assistant for a law firm document editor.
The user has selected a portion of text and wants you to rewrite it.
Return ONLY the replacement text — no explanations, no quotes, no markdown formatting.
Preserve the professional, legal tone of the document unless instructed otherwise.
Match the style and length of the surrounding context unless the instruction says otherwise.`,
      messages: [{
        role: "user",
        content: `Paragraph context: "${documentContext}"

Selected text to rewrite: "${selectedText}"

Instruction: ${instruction}

Return the rewritten version of ONLY the selected text.`,
      }],
    });

    const replacement = response.content.find(c => c.type === "text")?.text ?? selectedText;
    return NextResponse.json({ replacement: replacement.trim() });
  } catch (err) {
    console.error("[documents/selection-edit]", err);
    return NextResponse.json({ error: "Failed to edit text" }, { status: 500 });
  }
}
