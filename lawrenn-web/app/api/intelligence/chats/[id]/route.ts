import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { error } = await supabase
    .from("intelligence_conversations")
    .delete()
    .eq("id", id)
    .eq("business_id", business_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
