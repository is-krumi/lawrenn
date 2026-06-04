import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { business_name, owner_email, plan } = await request.json();

    // â”€â”€ Save lead to marketing DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Resend email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Lawrenn <notifications@lawrenn.com>",
        to:      "hello@lawrenn.com",
        subject: `ðŸŽ‰ New trial: ${business_name}`,
        html: `
          <h2>New trial started!</h2>
          <p><strong>Business:</strong> ${business_name}</p>
          <p><strong>Email:</strong> ${owner_email}</p>
          <p><strong>Plan:</strong> ${plan ?? "Pro"} â€” 14-day trial</p>
          <p><a href="https://lawrenn.com/dashboard">View dashboard â†’</a></p>
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
