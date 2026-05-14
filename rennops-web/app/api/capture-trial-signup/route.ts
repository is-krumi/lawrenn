import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RENNOPS_BUSINESS_ID  = process.env.RENNOPS_BUSINESS_ID!;
const RENNOPS_TWILIO_NUMBER = "+18666581538";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[capture-trial-signup] received:", JSON.stringify(body));
    const { name, email, phone, business_name, business_type, source, status } = body;

    const record: Record<string, string> = { source: source ?? "marketing_site" };
    if (name)          record.name          = name;
    if (email)         record.email         = email;
    if (phone)         record.phone         = phone;
    if (business_name) record.business_name = business_name;
    if (business_type) record.business_type = business_type;
    if (status)        record.status        = status;

    // Upsert on email if provided, otherwise plain insert
    const upsertQuery = email
      ? supabase.from("trial_signups").upsert(record, { onConflict: "email" })
      : supabase.from("trial_signups").insert(record);

    const { error: upsertError } = await upsertQuery;

    if (upsertError) {
      console.error("trial_signups upsert error:", JSON.stringify(upsertError));
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // ── Seed synthetic inbound message so the AI can start a conversation ──
    if (phone && source !== "onboarding" && RENNOPS_BUSINESS_ID) {
      // Upsert a customer record for this lead under the RennOps demo business
      const { data: customer } = await supabase
        .from("customers")
        .upsert(
          {
            business_id: RENNOPS_BUSINESS_ID,
            name:        name ?? null,
            phone,
            email:       email ?? null,
          },
          { onConflict: "business_id,phone" }
        )
        .select("id")
        .single();

      // Insert a synthetic inbound message — as if the lead texted in
      const greeting = name
        ? `Hi, this is ${name} from ${business_name ?? "my business"}. I'm interested in RennOps. Can you tell me more?`
        : `Hi, I'm interested in RennOps. Can you tell me more?`;

      await supabase.from("messages").insert({
        business_id:  RENNOPS_BUSINESS_ID,
        customer_id:  customer?.id ?? null,
        direction:    "inbound",
        channel:      "sms",
        body:         greeting,
        from_number:  phone,
        to_number:    RENNOPS_TWILIO_NUMBER,
        twilio_sid:   `synthetic_${Date.now()}`,
        read:         false,
      });

      console.log("[capture-trial-signup] synthetic inbound message seeded for", phone);
    }

    // Notify via SMS — only for new signups (not status updates)
    if (source !== "onboarding") {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const twilioAuth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const smsBody = `🚀 New trial signup!\n\n${name ?? "Unknown"} from ${business_name ?? "unknown business"}\nEmail: ${email}\nPhone: ${phone ?? "not provided"}\nType: ${business_type ?? "unknown"}`;
      const recipients = [process.env.DEMO_NOTIFY_PHONE!, "+18666581538"];
      await Promise.all(recipients.map(to =>
        fetch(twilioUrl, {
          method: "POST",
          headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, From: "+18666581538", Body: smsBody }),
        })
      ));
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
