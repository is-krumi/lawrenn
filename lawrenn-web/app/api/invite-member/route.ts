import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PLAN_FEATURES } from "@/lib/plans";

function parseJwt(token: string): { sub: string; email?: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload?.sub ? payload : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Fresh client per request with no session persistence — prevents auth.getUser()
  // from tainting the service-role client's Authorization header for DB queries.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
    }
    const token = authHeader.slice(7);

    // Parse JWT claims without calling the auth API — avoids session mutation
    const claims = parseJwt(token);
    if (!claims) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const userId    = claims.sub;
    const userEmail = claims.email ?? "";

    const { email, role, business_id, resend = false } = await request.json();
    if (!email || !business_id) {
      return NextResponse.json({ error: "email and business_id are required" }, { status: 400 });
    }

    // 1. Verify caller is owner/admin — check membership first, then businesses fallback
    const { data: callerMembership, error: memberErr } = await supabase
      .from("business_members")
      .select("role")
      .eq("business_id", business_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) console.error("[invite-member] membership query err:", memberErr.message);

    let callerRole = callerMembership?.role ?? null;

    if (!callerRole) {
      const { data: owned } = await supabase
        .from("businesses")
        .select("id")
        .eq("id", business_id)
        .eq("owner_id", userId)
        .maybeSingle();
      if (owned) callerRole = "owner";
    }

    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json({ error: "You do not have permission to invite members." }, { status: 403 });
    }

    // 2. Check seat limit
    const { data: business } = await supabase
      .from("businesses")
      .select("name, subscription_tier")
      .eq("id", business_id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const planKey  = (business.subscription_tier ?? "starter") as keyof typeof PLAN_FEATURES;
    const maxSeats = PLAN_FEATURES[planKey]?.maxTeamMembers ?? 1;

    const { count: acceptedCount } = await supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business_id)
      .not("accepted_at", "is", null);

    if ((acceptedCount ?? 0) >= maxSeats) {
      return NextResponse.json(
        { error: `Seat limit reached (${maxSeats} on your plan). Upgrade to invite more members.` },
        { status: 403 }
      );
    }

    // 3. Duplicate invite check
    const { data: existing } = await supabase
      .from("business_members")
      .select("id, accepted_at")
      .eq("business_id", business_id)
      .eq("invited_email", email)
      .maybeSingle();

    if (existing && !resend) {
      const alreadyAccepted = !!existing.accepted_at;
      return NextResponse.json({
        error: alreadyAccepted
          ? "This person has already joined your firm."
          : "This email has already been invited.",
        code: alreadyAccepted ? "already_member" : "already_invited",
      }, { status: 400 });
    }

    // 4a. Resend — refresh invited_at and re-send, no new row
    let invitation: any;
    if (existing && resend) {
      const { data: updated, error: updateError } = await supabase
        .from("business_members")
        .update({ invited_at: new Date().toISOString(), role: role ?? "member" })
        .eq("id", existing.id)
        .select()
        .single();
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      invitation = updated;
    } else {
      // 4b. First invite — insert a new row
      const { data: inserted, error: insertError } = await supabase
        .from("business_members")
        .insert({
          business_id,
          role:          role ?? "member",
          invited_email: email,
          invited_at:    new Date().toISOString(),
        })
        .select()
        .single();
      if (insertError) {
        console.error("[invite-member] insert error:", insertError.message);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      invitation = inserted;
    }

    // 5. Send invite email via Resend
    const appUrl    = process.env.SITE_URL ?? "https://lawrenn.com";
    const inviteUrl = `${appUrl}/accept-invite?id=${invitation.id}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "Lawrenn <notifications@lawrenn.com>",
        to:      email,
        subject: `You've been invited to join ${business.name} on Lawrenn`,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin:0;padding:0;background:#F5F5F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
              <div style="background:#111111;padding:28px 40px;">
                <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:white;letter-spacing:0.06em;">
                  LAW<span style="color:rgba(255,255,255,0.35);">RENN</span>
                </div>
              </div>
              <div style="padding:40px;">
                <h1 style="font-size:22px;font-weight:700;color:#111111;margin:0 0 12px;">
                  You've been invited to ${business.name}
                </h1>
                <p style="font-size:15px;color:#6B7280;line-height:1.7;margin:0 0 32px;">
                  ${userEmail} has invited you to join <strong>${business.name}</strong> on Lawrenn as a <strong>${role ?? "member"}</strong>.
                </p>
                <a href="${inviteUrl}"
                  style="display:inline-block;padding:14px 28px;background:#111111;border-radius:8px;color:white;font-weight:700;font-size:15px;text-decoration:none;">
                  Accept Invitation →
                </a>
                <p style="font-size:13px;color:#9CA3AF;margin:24px 0 0;line-height:1.6;">
                  This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("[invite-member] Resend error:", await emailRes.text());
      // Row created — don't fail the whole request just because the email bounced
    }

    return NextResponse.json({ success: true, invitation_id: invitation.id });

  } catch (err: any) {
    console.error("[invite-member] caught error:", err);
    return NextResponse.json({
      error: err?.message ?? String(err),
      stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    }, { status: 500 });
  }
}
