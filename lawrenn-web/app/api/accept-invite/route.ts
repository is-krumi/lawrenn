import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseJwt(token: string): { sub: string; email?: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const claims = parseJwt(authHeader.slice(7));
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invite_id, first_name, last_name } = await request.json();
  if (!invite_id) return NextResponse.json({ error: "Missing invite_id" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: invite } = await supabase
    .from("business_members")
    .select("id, invited_email, accepted_at")
    .eq("id", invite_id)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  if (invite.accepted_at) return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 400 });

  if (invite.invited_email.toLowerCase() !== (claims.email ?? "").toLowerCase()) {
    return NextResponse.json(
      { error: `This invite was sent to ${invite.invited_email}. You're signed in with a different account.` },
      { status: 403 }
    );
  }

  const { error: updateError } = await supabase
    .from("business_members")
    .update({ accepted_at: new Date().toISOString(), user_id: claims.sub })
    .eq("id", invite_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (first_name || last_name) {
    await supabase.auth.admin.updateUserById(claims.sub, {
      user_metadata: {
        first_name: first_name ?? "",
        last_name:  last_name ?? "",
        full_name:  `${first_name ?? ""} ${last_name ?? ""}`.trim(),
      },
    });
  }

  return NextResponse.json({ success: true });
}
