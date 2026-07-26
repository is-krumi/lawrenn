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
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `You are an AI assistant for a law firm document editor.
The user has selected a portion of text and wants you to rewrite it.
Return a JSON object with exactly two fields:
- "replacement": the rewritten text (only the selected portion, no preamble or explanation)
- "rationale": one brief sentence, max 12 words, explaining the key change made

Rules:
- Preserve the professional, legal tone unless instructed otherwise.
- Match the style and length of the surrounding context unless instructed otherwise.
- If the selected text contains bullet points or numbered lists:
  • Return ALL items (existing + any new ones) using "- " prefix, one per line.
  • Never omit existing items — only add, reorder, or rewrite as instructed.
  • Do not add extra blank lines between items.
- Return only valid JSON — no markdown code blocks, no extra text.`,
      messages: [{
        role: "user",
        content: `Paragraph context: "${documentContext}"

Selected text to rewrite: "${selectedText}"

Instruction: ${instruction}

Return JSON: {"replacement": "...", "rationale": "..."}`,
      }],
    });

    const raw = response.content.find(c => c.type === "text")?.text ?? "";
    let replacement = selectedText;
    let rationale = "";
    try {
      const parsed = JSON.parse(raw);
      replacement = parsed.replacement ?? selectedText;
      rationale   = parsed.rationale   ?? "";
    } catch {
      replacement = raw.trim() || selectedText;
    }
    return NextResponse.json({ replacement: replacement.trim(), rationale: rationale.trim() });
  } catch (err) {
    console.error("[documents/selection-edit]", err);
    return NextResponse.json({ error: "Failed to edit text" }, { status: 500 });
  }
}
