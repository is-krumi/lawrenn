import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { business_name, owner_email, plan } = await request.json();

    // ── Save lead to marketing DB ─────────────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL1!,
      process.env.SUPABASE_SERVICE_ROLE_KEY1!
    );
    await supabase.from("leads").insert({
      email:         owner_email,
      business_name: business_name,
      source:        "trial-modal",
      plan:          plan ?? "Pro",
      status:        "silver",
    });

    // ── Twilio SMS ────────────────────────────────────────────────────────
    const accountSid  = process.env.TWILIO_ACCOUNT_SID!;
    const authToken   = process.env.TWILIO_AUTH_TOKEN!;
    const notifyPhone = process.env.DEMO_NOTIFY_PHONE!;

    const smsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To:   notifyPhone,
          From: "+18666581538",
          Body: `🎉 New RennOps trial!\n\nBusiness: ${business_name}\nEmail: ${owner_email}\nPlan: ${plan ?? "Pro"} (14-day trial)\n\nCheck dashboard: rennops.com/dashboard`,
        }),
      }
    );
    if (!smsRes.ok) {
      const smsErr = await smsRes.text();
      console.error("Twilio SMS error:", smsErr);
    }

    // ── Resend email ──────────────────────────────────────────────────────
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "RennOps <notifications@rennops.com>",
        to:      "hello@rennops.com",
        subject: `🎉 New trial: ${business_name}`,
        html: `
          <h2>New trial started!</h2>
          <p><strong>Business:</strong> ${business_name}</p>
          <p><strong>Email:</strong> ${owner_email}</p>
          <p><strong>Plan:</strong> ${plan ?? "Pro"} — 14-day trial</p>
          <p><a href="https://rennops.com/dashboard">View dashboard →</a></p>
        `,
      }),
    });
    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      console.error("Resend email error:", emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("notify-new-trial error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
