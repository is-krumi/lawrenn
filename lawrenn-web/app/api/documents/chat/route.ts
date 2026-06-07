import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { question, documentText, chatHistory = [] } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const systemPrompt = documentText?.trim()
      ? `You are an AI document editor assistant for a law firm. The user can ask questions about the document OR give instructions to edit it.

DOCUMENT CONTENT:
${documentText.slice(0, 12000)}

You MUST respond with valid JSON in exactly this format:
{
  "reply": "Short conversational reply to show in the chat (1-2 sentences)",
  "edits": []
}

If the user asks you to make changes to the document, populate the "edits" array.
Each edit must be one of these types:

Text replacement:
{ "type": "replace", "search": "<exact current text from the document>", "replace_with": "<new text>" }

Paragraph style change:
{ "type": "set_style", "search": "<text in the target paragraph>", "style_id": "<Heading1|Heading2|Heading3|Normal|Quote|ListParagraph>" }

Text formatting:
{ "type": "format", "search": "<text to format>", "marks": { "bold": true, "italic": false, "color": { "rgb": "FF0000" } } }

RULES FOR EDITS:
- "search" must be exact text that appears verbatim in the document — copy it character-for-character
- For a title change: use "replace" with the current title text as "search"
- For a style change (make heading): use "set_style" with the paragraph text as "search"
- To DELETE or REMOVE text: use "replace" with replace_with set to "" (empty string)
- If the current text is unclear, make your best guess and say so in the reply
- Never invent text that isn't in the document
- For questions or summaries, return "edits": []

Examples:
User: "Change the title to Retainer Agreement"
→ { "reply": "Updated the title.", "edits": [{ "type": "replace", "search": "Service Agreement", "replace_with": "Retainer Agreement" }] }

User: "Make the first paragraph a heading"
→ { "reply": "Applied Heading 1 style.", "edits": [{ "type": "set_style", "search": "This agreement is entered", "style_id": "Heading1" }] }

User: "Remove the confidentiality clause"
→ { "reply": "Removed the confidentiality clause.", "edits": [{ "type": "replace", "search": "All information shared under this agreement shall remain confidential.", "replace_with": "" }] }

User: "Delete the last sentence in section 2"
→ { "reply": "Deleted the sentence.", "edits": [{ "type": "replace", "search": "<exact last sentence text>", "replace_with": "" }] }

User: "What is this document about?"
→ { "reply": "This is a retainer agreement between...", "edits": [] }

Return ONLY the JSON object — no markdown, no explanation.`
      : `You are a helpful document assistant for a law firm. No document has been loaded yet.
Respond with JSON: { "reply": "your message here", "edits": [] }`;

    const messages = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...chatHistory.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: question },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const raw = response.content.find(c => c.type === "text")?.text ?? "{}";

    // Extract JSON object from the response — Claude may wrap it in markdown fences
    // or include literal tab/control characters in string values (invalid JSON).
    function extractAndParse(text: string): { reply?: string; edits?: unknown[] } | null {
      // Strip ```json ... ``` or ``` ... ``` fences
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const candidate  = fenceMatch ? fenceMatch[1].trim() : text.trim();

      // If there's preamble text, pull out the first {...} block
      const objStart = candidate.indexOf("{");
      const objEnd   = candidate.lastIndexOf("}");
      const jsonStr  = objStart !== -1 && objEnd > objStart
        ? candidate.slice(objStart, objEnd + 1)
        : candidate;

      // First attempt: parse as-is
      try { return JSON.parse(jsonStr); } catch { /* fall through */ }

      // Second attempt: escape unescaped control characters inside string literals
      // (e.g. literal tab characters Claude copies from the document)
      const sanitized = jsonStr.replace(
        /"((?:[^"\\]|\\.)*)"/g,
        (_, inner) => `"${inner.replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`,
      );
      try { return JSON.parse(sanitized); } catch { /* fall through */ }

      return null;
    }

    let parsed: { reply?: string; edits?: unknown[] };
    const extracted = extractAndParse(raw);
    if (extracted) {
      parsed = extracted;
    } else {
      // Last-resort: show the raw text but strip any JSON-like block so the
      // user sees a readable error rather than a wall of JSON.
      const replyOnly = raw.replace(/\{[\s\S]*\}/, "").trim();
      parsed = { reply: replyOnly || "Sorry, I couldn't format my response correctly.", edits: [] };
    }

    return NextResponse.json({
      answer: parsed.reply ?? "",
      edits: parsed.edits ?? [],
    });
  } catch (err) {
    console.error("[documents/chat]", err);
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}
