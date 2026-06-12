import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseJwt(token: string): { sub: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

function makeClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const claims = parseJwt(authHeader.slice(7));
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId  = claims.sub;
  const supabase = makeClient();

  // Resolve which business this user belongs to
  let businessId: string | null = null;

  const { data: myMembership } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (myMembership) {
    businessId = myMembership.business_id;
  } else {
    const { data: owned } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (owned) businessId = owned.id;
  }

  if (!businessId) return NextResponse.json({ members: [] });

  // Attempt to select with `color`; fall back gracefully if the column doesn't exist yet.
  let { data: rows, error: rowsErr } = await supabase
    .from("business_members")
    .select("id, user_id, role, invited_email, invited_at, accepted_at, color")
    .eq("business_id", businessId)
    .order("invited_at", { ascending: true });

  if (rowsErr?.code === "42703") {
    const fallback = await supabase
      .from("business_members")
      .select("id, user_id, role, invited_email, invited_at, accepted_at")
      .eq("business_id", businessId)
      .order("invited_at", { ascending: true });
    rows = fallback.data as typeof rows;
  }

  const members = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rows ?? []) as any[]).map(async (m) => {
      let firstName = "", lastName = "", email = m.invited_email ?? "";
      if (m.user_id && m.accepted_at) {
        const { data: u } = await supabase.auth.admin.getUserById(m.user_id);
        if (u?.user) {
          firstName = u.user.user_metadata?.first_name ?? "";
          lastName  = u.user.user_metadata?.last_name ?? "";
          email     = u.user.email ?? email;
        }
      }
      return {
        id:          m.id,
        user_id:     m.user_id ?? null,
        role:        m.role,
        email,
        first_name:  firstName,
        last_name:   lastName,
        invited_at:  m.invited_at,
        accepted_at: m.accepted_at,
        color:       m.color ?? null,
        status:      (m.accepted_at ? "active" : "pending") as "active" | "pending",
        is_owner:    false,
      };
    })
  );

  // Prepend owner if they have no business_members row
  const ownerInList = members.some(m => m.user_id === userId);
  if (!ownerInList) {
    const { data: u } = await supabase.auth.admin.getUserById(userId);
    if (u?.user) {
      members.unshift({
        id:          `owner-${userId}`,
        user_id:     userId,
        role:        "owner",
        email:       u.user.email ?? "",
        first_name:  u.user.user_metadata?.first_name ?? "",
        last_name:   u.user.user_metadata?.last_name ?? "",
        invited_at:  null,
        accepted_at: new Date().toISOString(),
        color:       null,
        status:      "active" as const,
        is_owner:    true,
      });
    }
  }

  return NextResponse.json({ members });
}

// DELETE /api/team-members — remove a member from the firm (and delete their auth account)
export async function DELETE(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const claims = parseJwt(authHeader.slice(7));
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId   = claims.sub;
  const supabase = makeClient();

  const { member_id } = await request.json();
  if (!member_id) return NextResponse.json({ error: "member_id is required" }, { status: 400 });

  // Fetch the target member
  const { data: target } = await supabase
    .from("business_members")
    .select("business_id, user_id, is_owner")
    .eq("id", member_id)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Verify caller is the owner of this business
  const { data: owned } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", target.business_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!owned) return NextResponse.json({ error: "Only the firm owner can remove members." }, { status: 403 });

  // Prevent owner from deleting themselves
  if (target.user_id === userId) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  // Delete the business_members row
  const { error: deleteRowErr } = await supabase
    .from("business_members")
    .delete()
    .eq("id", member_id);

  if (deleteRowErr) return NextResponse.json({ error: deleteRowErr.message }, { status: 500 });

  // If they had an auth account, delete it too
  if (target.user_id) {
    await supabase.auth.admin.deleteUser(target.user_id);
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/team-members — update a member's display color
export async function PATCH(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const claims = parseJwt(authHeader.slice(7));
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId  = claims.sub;
  const supabase = makeClient();

  const { member_id, color } = await request.json();
  if (!member_id || !color) {
    return NextResponse.json({ error: "member_id and color are required" }, { status: 400 });
  }

  // Verify caller is owner/admin of the same business as the target member
  const { data: target } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("id", member_id)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const businessId = target.business_id;

  // Check caller's role
  const { data: callerMembership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  let callerRole = callerMembership?.role ?? null;
  if (!callerRole) {
    const { data: owned } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (owned) callerRole = "owner";
  }

  if (!callerRole || !["owner", "admin"].includes(callerRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("business_members")
    .update({ color })
    .eq("id", member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
