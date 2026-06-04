import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const RENNOPS_BUSINESS_ID   = process.env.RENNOPS_BUSINESS_ID!;
const RENNOPS_TWILIO_NUMBER = "+18666581538";

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

    // ── Seed synthetic inbound message + send AI reply via Twilio ──
    if (phone && source !== "onboarding" && RENNOPS_BUSINESS_ID) {
      // Upsert customer, then always re-fetch to guarantee we have the id
      await supabase
        .from("customers")
        .upsert(
          { business_id: RENNOPS_BUSINESS_ID, name: name ?? null, phone, email: email ?? null },
          { onConflict: "business_id,phone" }
        );

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("business_id", RENNOPS_BUSINESS_ID)
        .eq("phone", phone)
        .single();

      const inboundBody = name
        ? `Hi, this is ${name} from ${business_name ?? "my business"}. I'm interested in RennOps. Can you tell me more?`
        : `Hi, I'm interested in RennOps. Can you tell me more?`;

      // Store the synthetic inbound message
      await supabase.from("messages").insert({
        business_id:  RENNOPS_BUSINESS_ID,
        customer_id:  customer?.id ?? null,
        direction:    "inbound",
        channel:      "sms",
        body:         inboundBody,
        from_number:  phone,
        to_number:    RENNOPS_TWILIO_NUMBER,
        twilio_sid:   `synthetic_${Date.now()}`,
        read:         false,
      });

      // Generate AI reply with Claude
      try {
        const aiRes = await anthropic.messages.create({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 300,
          system: `You are Alex, the AI assistant for Lawrenn — an AI-powered legal platform for law firms and legal professionals (document drafting, contract analysis, legal research, billing automation).

A potential customer just signed up for a free trial and you are texting them back to start the conversation.

RULES:
- Keep it short — 2-3 sentences max, this is SMS
- Be warm, professional, and confident
- Mention that this text itself is a quick demonstration of AI at work
- Ask what practice area they work in if not already known
- Do NOT mention pricing yet`,
          messages: [{
            role:    "user",
            content: `New trial signup from ${name ?? "someone"} (${business_name ? `business: ${business_name}` : "business type unknown"}). Draft a short, warm opening SMS reply.`,
          }],
        });

        const aiReply = aiRes.content?.[0]?.type === "text" ? aiRes.content[0].text.trim() : null;

        if (aiReply) {
          // Send the AI reply via Twilio to the lead's phone
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const twilioAuth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ To: phone, From: RENNOPS_TWILIO_NUMBER, Body: aiReply }),
          });
          const twilioBody = await twilioRes.json().catch(() => ({}));
          if (!twilioRes.ok) {
            console.error("[capture-trial-signup] Twilio AI SMS failed:", twilioRes.status, JSON.stringify(twilioBody));
          } else {
            console.log("[capture-trial-signup] AI reply sent to", phone, "sid:", (twilioBody as any).sid);
          }
          await supabase.from("messages").insert({
            business_id:  RENNOPS_BUSINESS_ID,
            customer_id:  customer?.id ?? null,
            direction:    "outbound",
            channel:      "sms",
            body:         aiReply,
            from_number:  RENNOPS_TWILIO_NUMBER,
            to_number:    phone,
            read:         true,
          });

          console.log("[capture-trial-signup] AI reply sent to", phone);
        }
      } catch (aiErr) {
        console.error("[capture-trial-signup] AI reply failed (non-critical):", aiErr);
      }
    }

    // Notify via SMS — only for new signups (not status updates)
    if (source !== "onboarding") {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
        const twilioAuth = "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const smsBody = `🚀 New trial signup!\n\n${name ?? "Unknown"} from ${business_name ?? "unknown business"}\nEmail: ${email}\nPhone: ${phone ?? "not provided"}\nType: ${business_type ?? "unknown"}`;
        const recipients = [process.env.DEMO_NOTIFY_PHONE!, "+18666581538"];
        await Promise.all(recipients.map(to =>
          fetch(twilioUrl, {
            method: "POST",
            headers: { Authorization: twilioAuth, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ To: to, From: "+18666581538", Body: smsBody }),
          }).then(async r => {
            if (!r.ok) console.error("[capture-trial-signup] notify SMS failed:", r.status, await r.text());
          })
        ));
      } catch (notifyErr) {
        console.error("[capture-trial-signup] notify SMS error:", notifyErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
