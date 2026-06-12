import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";

// DELETE /api/intelligence/chats/[id]?business_id=X
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const business_id = searchParams.get("business_id");

  if (!id || !business_id) {
    return NextResponse.json({ error: "id and business_id required" }, { status: 400 });
  }

  const auth = await verifyBusinessAccess(request, business_id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createUserClient(auth.token);

  const { error } = await db
    .from("intelligence_conversations")
    .delete()
    .eq("id", id)
    .eq("business_id", business_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
