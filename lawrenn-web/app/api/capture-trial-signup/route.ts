import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const RENNOPS_BUSINESS_ID = process.env.RENNOPS_BUSINESS_ID!;

export async function POST(request: Request) {
  // Log which env vars are present (values redacted) so Vercel logs show what's missing
  console.log("[capture-trial-signup] env check:", {
    SUPABASE_URL:        !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_ROLE_KEY:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY:   !!process.env.ANTHROPIC_API_KEY,
    TWILIO_ACCOUNT_SID:  !!process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:   !!process.env.TWILIO_AUTH_TOKEN,
    RENNOPS_BUSINESS_ID: !!process.env.RENNOPS_BUSINESS_ID,
    DEMO_NOTIFY_PHONE:   !!process.env.DEMO_NOTIFY_PHONE,
  });
  try {
    const body = await request.json();
    console.log("[capture-trial-signup] received:", JSON.stringify(body));
    const { name, email, phone, business_name, business_type, source, status, sms_consent } = body;

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

    // ── Seed synthetic inbound message + send AI reply via Twilio ──
    // Only text the lead if they checked the SMS consent box on the intake form (A2P 10DLC compliance).
    if (phone && sms_consent === true && source !== "onboarding" && RENNOPS_BUSINESS_ID) {
      // Look up the business Twilio number from DB — same pattern as handle-inbound-sms
      const { data: rennopsBiz } = await supabase
        .from("businesses")
        .select("twilio_number")
        .eq("id", RENNOPS_BUSINESS_ID)
        .single();
      const LAWRENN_TWILIO_NUMBER = rennopsBiz?.twilio_number ?? null;
      if (!LAWRENN_TWILIO_NUMBER) {
        console.error("[capture-trial-signup] No twilio_number on business — skipping SMS");
      } else {

      // Upsert customer as sms_opted_out = true (pending opt-in) so no AI replies until they say YES
      await supabase
        .from("customers")
        .upsert(
          { business_id: RENNOPS_BUSINESS_ID, name: name ?? null, phone, email: email ?? null, sms_opted_out: true },
          { onConflict: "business_id,phone" }
        );

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("business_id", RENNOPS_BUSINESS_ID)
        .eq("phone", phone)
        .single();

      // Send fixed opt-in request — no AI yet, compliance requires explicit consent first
      const firstName = name ? name.split(" ")[0] : null;
      const optInMsg = firstName
        ? `Hi ${firstName}! This is Lawrenn, your AI legal assistant. Reply YES to receive updates & tips for your free trial, or STOP to opt out. Msg & data rates may apply.`
        : `Hi! This is Lawrenn, your AI legal assistant. Reply YES to receive updates & tips for your free trial, or STOP to opt out. Msg & data rates may apply.`;

      try {
        const twilioUrl  = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
        const twilioAuth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const twilioRes  = await fetch(twilioUrl, {
          method: "POST",
          headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: phone, From: LAWRENN_TWILIO_NUMBER, Body: optInMsg }),
        });
        const twilioBody = await twilioRes.json().catch(() => ({}));
        if (!twilioRes.ok) {
          console.error("[capture-trial-signup] opt-in SMS failed:", twilioRes.status, JSON.stringify(twilioBody));
        } else {
          console.log("[capture-trial-signup] opt-in SMS sent to", phone, "sid:", (twilioBody as any).sid);
          await supabase.from("messages").insert({
            business_id:  RENNOPS_BUSINESS_ID,
            customer_id:  customer?.id ?? null,
            direction:    "outbound",
            channel:      "sms",
            body:         optInMsg,
            from_number:  LAWRENN_TWILIO_NUMBER,
            to_number:    phone,
            read:         true,
          });
        }
      } catch (smsErr) {
        console.error("[capture-trial-signup] opt-in SMS error:", smsErr);
      }
      } // end else (twilio_number found)
    }

    // Notify via SMS — only for new signups (not status updates)
    if (source !== "onboarding") {
      try {
        const { data: rennopsBizForNotify } = await supabase
          .from("businesses")
          .select("twilio_number")
          .eq("id", RENNOPS_BUSINESS_ID)
          .single();
        const notifyFromNumber = rennopsBizForNotify?.twilio_number;
        if (notifyFromNumber) {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const twilioAuth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const smsBody = `🚀 New trial signup!\n\n${name ?? "Unknown"} from ${business_name ?? "unknown business"}\nEmail: ${email}\nPhone: ${phone ?? "not provided"}\nType: ${business_type ?? "unknown"}`;
          const recipients = [process.env.DEMO_NOTIFY_PHONE!].filter(Boolean);
          await Promise.all(recipients.map(to =>
            fetch(twilioUrl, {
              method: "POST",
              headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ To: to, From: notifyFromNumber, Body: smsBody }),
            }).then(async r => {
              if (!r.ok) console.error("[capture-trial-signup] notify SMS failed:", r.status, await r.text());
            })
          ));
        }
      } catch (notifyErr) {
        console.error("[capture-trial-signup] notify SMS error:", notifyErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
