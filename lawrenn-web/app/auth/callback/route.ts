import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { session } } = await supabase.auth.exchangeCodeForSession(code);
  const userId = session?.user?.id;

  if (!userId) return NextResponse.redirect(`${origin}/login`);

  // Check business_members first, then fall back to owner lookup
  const { data: memberships } = await supabase
    .from("business_members")
    .select("id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);

  if (memberships && memberships.length > 0) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const { data: owned } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();

  return NextResponse.redirect(`${origin}${owned ? "/dashboard" : "/onboarding"}`);
}