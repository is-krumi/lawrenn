import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";

// GET /api/intelligence/chats?business_id=X
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const business_id = searchParams.get("business_id");
  if (!business_id) return NextResponse.json({ error: "business_id required" }, { status: 400 });

  const auth = await verifyBusinessAccess(request, business_id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createUserClient(auth.token);

  const { data: convs, error: convErr } = await db
    .from("intelligence_conversations")
    .select("id, title, created_at, updated_at")
    .eq("business_id", business_id)
    .order("updated_at", { ascending: false });

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!convs || convs.length === 0) return NextResponse.json({ conversations: [] });

  const { data: msgs, error: msgErr } = await db
    .from("intelligence_messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", convs.map(c => c.id))
    .order("created_at", { ascending: true });

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  const msgsByConv = new Map<string, any[]>();
  for (const msg of msgs ?? []) {
    if (!msgsByConv.has(msg.conversation_id)) msgsByConv.set(msg.conversation_id, []);
    msgsByConv.get(msg.conversation_id)!.push({ role: msg.role, content: msg.content });
  }

  return NextResponse.json({
    conversations: convs.map(c => ({
      id: c.id,
      title: c.title,
      createdAt: new Date(c.created_at).getTime(),
      messages: msgsByConv.get(c.id) ?? [],
    })),
  });
}

// POST /api/intelligence/chats
// Body: { conversation_id, business_id, title, new_messages: [{role, content}] }
export async function POST(request: Request) {
  const { conversation_id, business_id, title, new_messages } = await request.json();
  if (!conversation_id || !business_id) {
    return NextResponse.json({ error: "conversation_id and business_id required" }, { status: 400 });
  }

  const auth = await verifyBusinessAccess(request, business_id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createUserClient(auth.token);

  const { error: convErr } = await db
    .from("intelligence_conversations")
    .upsert(
      { id: conversation_id, business_id, title, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

  if (new_messages && new_messages.length > 0) {
    const { error: msgErr } = await db
      .from("intelligence_messages")
      .insert(
        new_messages.map((m: { role: string; content: string }) => ({
          conversation_id,
          business_id,
          role: m.role,
          content: m.content,
        }))
      );
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
