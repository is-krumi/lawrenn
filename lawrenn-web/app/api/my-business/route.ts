import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_FEATURES } from "@/lib/plans";

function parseJwt(token: string): { sub: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claims = parseJwt(authHeader.slice(7));
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.sub;

  // Fresh client per request — no session state bleed from JWT parsing
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Check business_members (accepted invites) first
  const { data: memberships } = await supabase
    .from("business_members")
    .select("role, businesses(id, name, twilio_number, settings, subscription_tier)")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);

  let membership = memberships?.[0] ?? null;
  let biz = membership ? (membership.businesses as any) : null;

  // Fallback for owners who predate the business_members table
  if (!biz) {
    const { data: owned } = await supabase
      .from("businesses")
      .select("id, name, twilio_number, settings, subscription_tier")
      .eq("owner_id", userId)
      .maybeSingle();
    if (owned) {
      biz = owned;
      membership = { role: "owner", businesses: owned } as any;
    }
  }

  if (!biz) {
    return NextResponse.json({ business: null, userRole: null, planFeatures: null, memberCount: 0 });
  }

  const planKey      = (biz.subscription_tier ?? "starter") as keyof typeof PLAN_FEATURES;
  const planFeatures = PLAN_FEATURES[planKey] ?? PLAN_FEATURES.starter;

  const { count: memberCount } = await supabase
    .from("business_members")
    .select("id", { count: "exact", head: true })
    .eq("business_id", biz.id)
    .not("accepted_at", "is", null);

  return NextResponse.json({
    business:     biz,
    userRole:     membership?.role ?? null,
    planFeatures,
    memberCount:  memberCount ?? 0,
  });
}
