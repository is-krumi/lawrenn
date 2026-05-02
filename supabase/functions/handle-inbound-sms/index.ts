import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN    = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendSMS(to: string, from: string, body: string) {
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    }
  );
}

async function generateAIReply(
  message: string,
  business: any,
  customer: any,
  recentMessages: any[],
  recentJobs: any[]
): Promise<string | null> {

  // Build context
  const jobContext = recentJobs.length > 0
    ? `Recent jobs: ${recentJobs.map(j => {
        const slot = j.slot_start
          ? new Date(j.slot_start).toLocaleDateString("en-US", {
              weekday: "long", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZone: business.settings?.timezone ?? "America/New_York"
            })
          : "time TBD";
        return `${j.type} (${j.status}) scheduled for ${slot}`;
      }).join(", ")}`
    : "No recent jobs";

  const messageHistory = recentMessages.slice(-6).map(m =>
    `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`
  ).join("\n");

  const systemPrompt = `You are the AI receptionist for ${business.name}. 
You are handling SMS replies from customers on behalf of the business owner.

Business info:
- Name: ${business.name}
- Services: ${business.settings?.services?.map((s: any) => s.name).join(", ") ?? "general services"}
- Hours: ${JSON.stringify(business.settings?.operating_hours ?? {})}

Customer info:
- Name: ${customer?.name ?? "Unknown"}
- ${jobContext}

Recent conversation:
${messageHistory}

RULES:
- Keep replies short — 1-3 sentences max, this is SMS
- Never quote specific prices — say the owner will provide a quote
- For scheduling changes — offer to have the owner call them back
- For complaints or disputes — say you will have the owner contact them shortly
- For simple questions about services, hours, or availability — answer directly
- If unsure — say "Great question! Let me have our team follow up with you shortly."
- Always be warm and professional
- Sign off with the business name if it's the first reply
- Never make promises you can't keep
- If the customer seems angry or upset — do NOT try to resolve it via SMS, escalate to owner

Escalate to owner (return null) if message contains:
- Complaints about work quality
- Requests for refunds
- Legal threats
- Anything requiring judgment or negotiation`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{
        role:    "user",
        content: `Customer SMS: "${message}"\n\nGenerate a reply. If this requires escalation to the owner, respond with exactly: ESCALATE`,
      }],
      system: systemPrompt,
    }),
  });

  const data = await res.json();
  const reply = data.content?.[0]?.text?.trim() ?? null;

  if (!reply || reply === "ESCALATE") return null;
  return reply;
}

serve(async (req) => {
  try {
    const rawBody = await req.text();
    const params  = Object.fromEntries(new URLSearchParams(rawBody));

    const fromNumber = params.From;
    const toNumber   = params.To;
    const body       = params.Body?.trim() ?? "";
    const messageSid = params.MessageSid;

    console.log("Inbound SMS from:", fromNumber, "body:", body);

    // Find business by Twilio number
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, phone, settings, ai_sms_replies")
      .eq("twilio_number", toNumber)
      .single();

    if (!business) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Find customer by phone
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, sms_opted_out, ai_sms_replies")
      .eq("business_id", business.id)
      .eq("phone", fromNumber)
      .maybeSingle();

    // Handle STOP
    const stopKeywords  = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
    const startKeywords = ["start", "unstop", "yes"];
    const bodyLower     = body.toLowerCase().trim();

    if (stopKeywords.includes(bodyLower)) {
      if (customer) {
        await supabase.from("customers").update({ sms_opted_out: true }).eq("id", customer.id);
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from ${business.name} messages. Reply START to resubscribe.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    if (startKeywords.includes(bodyLower)) {
      if (customer) {
        await supabase.from("customers").update({ sms_opted_out: false }).eq("id", customer.id);
      }
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been resubscribed to ${business.name} messages. Reply STOP to unsubscribe.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Store inbound message
    const { error: insertError } = await supabase.from("messages").insert({
      business_id: business.id,
      customer_id: customer?.id ?? null,
      direction:   "inbound",
      channel:     "sms",
      body,
      from_number: fromNumber,
      to_number:   toNumber,
      twilio_sid:  messageSid,
      read:        false,
    });

    if (insertError) {
      console.error("Message insert error:", insertError.message);
    }

    // Fetch recent message history for context
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("direction, body, sent_at")
      .eq("business_id", business.id)
      .eq("from_number", fromNumber)
      .order("sent_at", { ascending: false })
      .limit(6);

    // Fetch recent jobs for context
    const { data: recentJobs } = await supabase
      .from("jobs")
      .select("type, status, slot_start, slot_end, notes")
      .eq("business_id", business.id)
      .eq("customer_id", customer?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(3);

    // Check if AI replies are enabled for this business
    const aiRepliesEnabled = customer?.ai_sms_replies !== null && customer?.ai_sms_replies !== undefined
      ? customer.ai_sms_replies
      : business.ai_sms_replies !== false;

  
    const aiReply = aiRepliesEnabled
      ? await generateAIReply(body, business, customer, recentMessages ?? [], recentJobs ?? [])
      : null;

    if (aiReply) {
      // Send AI reply
      await sendSMS(fromNumber, toNumber, aiReply);

      // Store outbound message
      await supabase.from("messages").insert({
        business_id: business.id,
        customer_id: customer?.id ?? null,
        direction:   "outbound",
        channel:     "sms",
        body:        aiReply,
        from_number: toNumber,
        to_number:   fromNumber,
      });

      console.log("AI reply sent:", aiReply);
    } else if (!aiRepliesEnabled) {
      // AI replies off — just notify owner
      console.log("AI replies disabled — notifying owner");

      if (business.phone) {
        await sendSMS(
          business.phone,
          toNumber,
          `💬 New message from ${customer?.name ?? fromNumber}: "${body.slice(0, 100)}" — reply at rennops.com/dashboard/messages`
        );
      }
    } else {
      // AI decided to escalate
      console.log("Escalating to owner — message requires human judgment");

      if (business.phone) {
        await sendSMS(
          business.phone,
          toNumber,
          `⚠️ Customer reply needs your attention from ${customer?.name ?? fromNumber}: "${body.slice(0, 100)}" — rennops.com/dashboard/messages`
        );
      }
    }

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );

  } catch (err) {
    console.error("handle-inbound-sms error:", err);
    await captureException(err, { function: "handle-inbound-sms" });
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
});