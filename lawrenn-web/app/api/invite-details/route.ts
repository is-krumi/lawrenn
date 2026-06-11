import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: invite, error } = await supabase
    .from("business_members")
    .select("id, invited_email, role, accepted_at, businesses(name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ error: "Invite not found or has expired." }, { status: 404 });
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 400 });
  }

  return NextResponse.json({
    invite: {
      id:             invite.id,
      invited_email:  invite.invited_email,
      role:           invite.role,
      business_name:  (invite.businesses as any)?.name ?? "your firm",
    },
  });
}
