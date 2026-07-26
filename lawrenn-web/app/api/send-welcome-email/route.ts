import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { business_id } = await request.json();

    if (!business_id) {
      return NextResponse.json({ error: "business_id required" }, { status: 400 });
    }

    // Fetch business details + owner_id
    const { data: business } = await supabase
      .from("businesses")
      .select("name, phone, twilio_number, timezone, owner_id")
      .eq("id", business_id)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    // Get owner email
    const { data: { user } } = await supabase.auth.admin.getUserById(business.owner_id);
    const ownerEmail = user?.email;

    if (!ownerEmail) {
      return NextResponse.json({ error: "Owner email not found" }, { status: 404 });
    }

    const twilioNumber = business.twilio_number ?? "Being provisioned â€” check your dashboard";

    // Send email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Lawrenn <notifications@lawrenn.com>",
        to:      ownerEmail,
        subject: `You're all set â€” here's how to forward your calls`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="margin:0;padding:0;background:#F8FAFB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <div style="max-width:560px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
              
              <div style="background:#0D1B2A;padding:32px 40px;">
                <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:white;letter-spacing:0.05em;">
                  RENN<span style="color:#111111;">OPS</span>
                </div>
              </div>

              <div style="padding:40px;">
                <h1 style="font-size:24px;font-weight:700;color:#0D1B2A;margin:0 0 8px;">
                  Welcome to Lawrenn, ${business.name}! ðŸŽ‰
                </h1>
                <p style="font-size:15px;color:#6B7280;line-height:1.7;margin:0 0 32px;">
                  Your AI receptionist is configured and ready to answer calls. 
                  The last step is to forward your existing business number to your Lawrenn number.
                </p>

                <div style="background:#F0FAFE;border:1.5px solid rgba(12,192,223,0.25);border-radius:10px;padding:20px 24px;margin-bottom:32px;">
                  <p style="font-size:11px;font-weight:700;color:#111111;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">your Lawrenn number</p>
                  <p style="font-size:28px;font-weight:700;color:#0D1B2A;margin:0 0 4px;letter-spacing:0.05em;">${twilioNumber}</p>
                  <p style="font-size:13px;color:#6B7280;margin:0;">Forward your existing number to this number</p>
                </div>

                <h2 style="font-size:16px;font-weight:700;color:#0D1B2A;margin:0 0 16px;">How to set up call forwarding</h2>

                <div style="display:flex;gap:16px;margin-bottom:16px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:rgba(12,192,223,0.1);border:1.5px solid rgba(12,192,223,0.3);font-size:13px;font-weight:700;color:#111111;text-align:center;line-height:28px;flex-shrink:0;">1</div>
                  <div>
                    <p style="font-size:14px;font-weight:600;color:#0D1B2A;margin:0 0 3px;">Call your carrier or log in online</p>
                    <p style="font-size:13px;color:#6B7280;margin:0;">Contact AT&T, Verizon, T-Mobile, or whichever carrier you use.</p>
                  </div>
                </div>

                <div style="display:flex;gap:16px;margin-bottom:16px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:rgba(12,192,223,0.1);border:1.5px solid rgba(12,192,223,0.3);font-size:13px;font-weight:700;color:#111111;text-align:center;line-height:28px;flex-shrink:0;">2</div>
                  <div>
                    <p style="font-size:14px;font-weight:600;color:#0D1B2A;margin:0 0 3px;">Enable call forwarding</p>
                    <p style="font-size:13px;color:#6B7280;margin:0;">Forward all calls to your Lawrenn number: <strong>${twilioNumber}</strong></p>
                  </div>
                </div>

                <div style="display:flex;gap:16px;margin-bottom:24px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:rgba(12,192,223,0.1);border:1.5px solid rgba(12,192,223,0.3);font-size:13px;font-weight:700;color:#111111;text-align:center;line-height:28px;flex-shrink:0;">3</div>
                  <div>
                    <p style="font-size:14px;font-weight:600;color:#0D1B2A;margin:0 0 3px;">Test it</p>
                    <p style="font-size:13px;color:#6B7280;margin:0;">Call your existing business number. Lawrenn should answer within 2 rings.</p>
                  </div>
                </div>

                <div style="background:#FFFFFF;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                  <p style="font-size:13px;font-weight:600;color:#374151;margin:0 0 12px;">Quick dial codes:</p>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:4px 0;font-size:13px;color:#374151;font-weight:500;">AT&T</td><td style="padding:4px 0;font-size:13px;color:#111111;font-weight:600;font-family:monospace;">*72 + ${twilioNumber} + #</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#374151;font-weight:500;">Verizon</td><td style="padding:4px 0;font-size:13px;color:#111111;font-weight:600;font-family:monospace;">*72 + ${twilioNumber} + #</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#374151;font-weight:500;">T-Mobile</td><td style="padding:4px 0;font-size:13px;color:#111111;font-weight:600;font-family:monospace;">**21* + ${twilioNumber} + #</td></tr>
                    <tr><td style="padding:4px 0;font-size:13px;color:#374151;font-weight:500;">Sprint</td><td style="padding:4px 0;font-size:13px;color:#111111;font-weight:600;font-family:monospace;">*72 + ${twilioNumber} + #</td></tr>
                  </table>
                </div>

                <p style="font-size:14px;color:#6B7280;line-height:1.7;margin:0 0 32px;">
                  Once forwarding is active, every call to your existing number will be answered by your AI receptionist.
                  Monitor all calls and bookings from your 
                  <a href="https://Lawrenn.com/dashboard" style="color:#111111;font-weight:600;">Lawrenn dashboard</a>.
                </p>

                <a href="https://Lawrenn.com/dashboard" style="display:inline-block;padding:14px 28px;background:#111111;border-radius:8px;color:white;font-weight:700;font-size:15px;text-decoration:none;">
                  Go to your dashboard â†’
                </a>
              </div>

              <div style="padding:24px 40px;border-top:1px solid rgba(0,0,0,0.06);">
                <p style="font-size:12px;color:#9CA3AF;margin:0;">
                  Questions? <a href="mailto:hello@Lawrenn.com" style="color:#111111;">hello@Lawrenn.com</a>
                </p>
                <p style="font-size:12px;color:#9CA3AF;margin:6px 0 0;">Â© 2026 Lawrenn. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("send-welcome-email error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
