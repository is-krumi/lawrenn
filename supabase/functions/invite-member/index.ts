import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get the calling user from their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json({ error: "Missing authorization header" }, { status: 401, headers: CORS_HEADERS });
  }

  const { data: { user } } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });

  const { email, role, business_id } = await req.json();

  // 1. Verify caller is owner/admin of this business.
  //    Check business_members first; fall back to businesses.owner_id for
  //    owners who predate the membership table.
  const { data: callerMembership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", business_id)
    .eq("user_id", user.id)
    .maybeSingle();

  let callerRole = callerMembership?.role ?? null;

  if (!callerRole) {
    const { data: ownedBiz } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", business_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (ownedBiz) callerRole = "owner";
  }

  if (!callerRole || !["owner", "admin"].includes(callerRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers: CORS_HEADERS });
  }

  // 2. Check seat limit
  const { data: seatCount } = await supabase
    .rpc("get_seat_count", { p_business_id: business_id });

  const { data: business } = await supabase
    .from("businesses")
    .select("subscription_tier")
    .eq("id", business_id)
    .single();

  const { data: planFeatures } = await supabase
    .from("plan_features")
    .select("max_seats")
    .eq("plan", business.subscription_tier)
    .single();

  if (seatCount >= planFeatures.max_seats) {
    return Response.json(
      { error: "Seat limit reached. Upgrade your plan to add more members." },
      { status: 403, headers: CORS_HEADERS }
    );
  }

  // 3. Check if already invited
  const { data: existing } = await supabase
    .from("business_members")
    .select("id")
    .eq("business_id", business_id)
    .eq("invited_email", email)
    .maybeSingle();

  if (existing) {
    return Response.json({ error: "Already invited" }, { status: 400, headers: CORS_HEADERS });
  }

  // 4. Create the invitation row
  const { data: invitation, error } = await supabase
    .from("business_members")
    .insert({
      business_id,
      role,
      invited_email: email,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  // 5. Get business name for the email
  const { data: biz } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", business_id)
    .single();

  // 6. Send invite email via Resend
  const inviteUrl = `https://lawrenn.com/accept-invite?id=${invitation.id}`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Lawrenn <noreply@lawrenn.com>",
      to: email,
      subject: `You've been invited to join ${biz.name} on Lawrenn`,
      html: `
        <h2>You've been invited to ${biz.name}</h2>
        <p>${user.email} has invited you to join their firm on Lawrenn
        as a ${role}.</p>
        <p><a href="${inviteUrl}"
          style="background:#111111;color:white;padding:12px 24px;
          text-decoration:none;border-radius:6px;display:inline-block;">
          Accept Invitation
        </a></p>
        <p>This invitation will expire in 7 days.</p>
      `,
    }),
  });

  return Response.json({ success: true, invitation_id: invitation.id }, { headers: CORS_HEADERS });
});