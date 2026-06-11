import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get the calling user from their JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invite_id } = await req.json();

  if (!invite_id) {
    return Response.json({ error: "Missing invite_id" }, { status: 400 });
  }

  // 1. Find the pending invitation
  const { data: invite, error: inviteError } = await supabase
    .from("business_members")
    .select("*, businesses(name)")
    .eq("id", invite_id)
    .is("accepted_at", null)
    .single();

  if (inviteError || !invite) {
    return Response.json(
      { error: "Invitation not found or already accepted" },
      { status: 404 }
    );
  }

  // 2. Check if the invite has expired (7 days)
  const invitedAt = new Date(invite.invited_at);
  const now = new Date();
  const daysSinceInvite = (now.getTime() - invitedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceInvite > 7) {
    return Response.json({ error: "Invitation has expired" }, { status: 410 });
  }

  // 3. Verify email matches
  if (invite.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    return Response.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // 4. Check if user is already a member of this business
  const { data: existing } = await supabase
    .from("business_members")
    .select("id")
    .eq("business_id", invite.business_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return Response.json(
      { error: "You are already a member of this firm" },
      { status: 400 }
    );
  }

  // 5. Accept the invitation
  const { error: updateError } = await supabase
    .from("business_members")
    .update({
      user_id: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite_id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    firm_name: invite.businesses?.name || "your firm",
  });
});