import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const { invite_id, password } = await request.json();
  if (!invite_id || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: invite } = await supabase
    .from("business_members")
    .select("invited_email, accepted_at")
    .eq("id", invite_id)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
  if (invite.accepted_at) return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 400 });

  const { error } = await supabase.auth.admin.createUser({
    email:         invite.invited_email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.message?.toLowerCase().includes("already") || error.message?.toLowerCase().includes("exists")) {
      return NextResponse.json(
        { error: "An account with this email already exists. Use 'Sign in' instead." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
