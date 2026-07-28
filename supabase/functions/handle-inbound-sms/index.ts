import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID   = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN    = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const ANTHROPIC_API_KEY    = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function sendSMS(to: string, from: string, body: string) {
  const res = await fetch(
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
  const resBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sendSMS] Twilio error:", res.status, JSON.stringify(resBody));
  } else {
    console.log("[sendSMS] Twilio OK — sid:", (resBody as any).sid, "from:", from, "to:", to);
  }
}

async function generateAndStoreEmbedding(
  businessId: string,
  sourceId: string,
  content: string,
  customerId?: string | null
) {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
    });

    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;

    if (embedding) {
      await supabase.from("embeddings").insert({
        business_id: businessId,
        source_type: "message",
        source_id:   sourceId,
        content,
        embedding:   JSON.stringify(embedding),
        customer_id: customerId ?? null,
      });
    }
  } catch (err) {
    console.error("Message embedding failed (non-critical):", err);
  }
}

// Retrieve relevant context for a client using vector similarity search.
// Searches embeddings scoped to this business + client, ranked by similarity to the query.
async function retrieveContext(
  businessId: string,
  customerId: string | null,
  queryText: string,
  matchCount = 5
): Promise<string> {
  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: queryText }),
    });

    const embData = await embRes.json();
    const queryEmbedding = embData.data?.[0]?.embedding;
    if (!queryEmbedding) return "";

    const { data: matches, error } = await supabase.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: 0.45,
      match_count:     matchCount,
      p_business_id:   businessId,
      p_customer_id:   customerId ?? null,
    });

    if (error) {
      console.error("match_embeddings error:", error.message);
      return "";
    }
    if (!matches || matches.length === 0) return "";

    return matches
      .map((m: any) => `[${m.source_type}] ${m.content}`)
      .join("\n\n---\n\n");
  } catch (err) {
    console.error("retrieveContext error (non-critical):", err);
    return "";
  }
}

async function generateAIReply(
  message: string,
  business: any,
  customer: any,
  recentMessages: any[],
  recentJobs: any[],
  ragContext: string
): Promise<string | null> {

  const jobContext = recentJobs.length > 0
    ? `Recent matters: ${recentJobs.map(j => {
        const slot = j.slot_start
          ? new Date(j.slot_start).toLocaleDateString("en-US", {
              weekday: "long", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZone: business.settings?.timezone ?? "America/New_York"
            })
          : "time TBD";
        const noteSuffix = j.notes ? ` — notes: ${j.notes}` : "";
        return `${j.type} (${j.status}) scheduled for ${slot}${noteSuffix}`;
      }).join(", ")}`
    : "No prior matters on file";

  const messageHistory = recentMessages.map(m =>
    `${m.direction === "inbound" ? "Client" : "Firm"}: ${m.body}`
  ).join("\n");

  const contextBlock = ragContext
    ? `\nRelevant context from client history:\n${ragContext}\n`
    : "";

  const notesBlock = customer?.notes
    ? `\nInternal attorney notes on this client (for background context only — these are NOT confirmed appointments or scheduled times, do not tell the client anything is "scheduled" based on this alone):\n${customer.notes}\n`
    : "";

  const services = Array.isArray(business.settings?.services)
    ? business.settings.services.map((s: any) => s.name ?? s).join(", ")
    : "general legal services";

  const clientContext = [
    `Client: ${customer?.name ?? "Unknown"}`,
    jobContext,
    notesBlock,
    contextBlock,
    `Recent conversation:\n${messageHistory}`,
  ].filter(Boolean).join("\n");

  const smsRules = `
SMS RULES (override everything else for this channel):
- This is SMS — keep every reply to 1-3 sentences max
- NEVER escalate for greetings, introductions, or general questions ("hi", "hello", "hola", "how are you", "what do you do", etc.) — always reply warmly
- Reply in the same language the client used
- Never give legal advice or quote specific fees
- For scheduling — offer to have someone call them
- Only treat something as a confirmed scheduled appointment if it appears in "Recent matters" below — internal attorney notes are background context only and must never be presented to the client as a scheduled time or confirmed appointment
- Only reply ESCALATE (exactly, nothing else) for: active threats of malpractice claims, bar complaints, or court emergencies with imminent deadlines — nothing else qualifies

${clientContext}`;

  // Use business-specific system prompt if set (strip call-specific slot logic), otherwise use default
  let systemPrompt: string;
  if (business.system_prompt) {
    systemPrompt = business.system_prompt
      .replace("{{services}}", services)
      .replace("{{slots}}", "")
      + smsRules;
  } else {
    systemPrompt = `You are the AI intake assistant for ${business.name}, a law firm handling SMS replies on behalf of attorneys.

Firm: ${business.name}
Practice areas: ${services}
${smsRules}`;
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role:    "user",
          content: `Client SMS: "${message}"\n\nGenerate a reply. If this requires escalation to an attorney, respond with exactly: ESCALATE`,
        }],
        system: systemPrompt,
      }),
    });
  } catch (err) {
    console.error("generateAIReply fetch failed (non-critical, falling back to owner escalation):", err);
    return null;
  }

  const data = await res.json().catch((err) => {
    console.error("generateAIReply JSON parse failed:", err);
    return null;
  });

  if (!res.ok) {
    console.error("generateAIReply Anthropic API error:", res.status, JSON.stringify(data));
    return null;
  }

  const reply = data?.content?.[0]?.text?.trim() ?? null;

  if (!reply) {
    console.log("generateAIReply: Claude returned an empty reply — escalating to owner");
    return null;
  }
  if (reply === "ESCALATE") {
    console.log("generateAIReply: Claude explicitly returned ESCALATE — escalating to owner");
    return null;
  }
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
      .select("id, name, phone, settings, ai_sms_replies, system_prompt")
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
      .select("id, name, sms_opted_out, ai_sms_replies, notes")
      .eq("business_id", business.id)
      .eq("phone", fromNumber)
      .maybeSingle();

    // Handle STOP / START
    const stopKeywords  = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
    const startKeywords = ["start", "unstop", "yes"];
    const bodyLower     = body.toLowerCase().trim();

    if (stopKeywords.includes(bodyLower)) {
      if (customer) {
        await supabase.from("customers").update({ sms_opted_out: true }).eq("id", customer.id);
      }
      await supabase.from("messages").insert({
        business_id: business.id,
        customer_id: customer?.id ?? null,
        direction:   "inbound",
        channel:     "sms",
        body,
        from_number: fromNumber,
        to_number:   toNumber,
        twilio_sid:  messageSid,
        read:        true,
      });
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from ${business.name} messages. Reply START to resubscribe.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    if (startKeywords.includes(bodyLower)) {
      const wasOptedOut = customer?.sms_opted_out === true;
      if (customer) {
        await supabase.from("customers").update({ sms_opted_out: false }).eq("id", customer.id);
      }

      await supabase.from("messages").insert({
        business_id: business.id,
        customer_id: customer?.id ?? null,
        direction:   "inbound",
        channel:     "sms",
        body,
        from_number: fromNumber,
        to_number:   toNumber,
        twilio_sid:  messageSid,
        read:        true,
      });

      // If they were pending opt-in (sms_opted_out = true), send the welcome AI message now
      if (wasOptedOut) {
        const defaultWelcome = business.settings?.sms_welcome_message
          ?? `You're all set! Thanks for confirming — feel free to text us anytime and we'll get back to you as soon as we can.`;

        let welcomeReply: string | null = null;
        try {
          welcomeReply = await generateAIReply(
            `The client just opted in to receive messages from ${business.name}. Send them a short, warm welcome — 1-2 sentences max.`,
            business, customer, [], [], ""
          );
        } catch (err) {
          console.error("Welcome AI reply generation failed (non-critical):", err);
        }

        // Always send a confirmation, falling back to a deterministic message
        // so the customer never opts in and hears nothing back.
        const finalWelcome = welcomeReply ?? defaultWelcome;

        await sendSMS(fromNumber, toNumber, finalWelcome);
        await supabase.from("messages").insert({
          business_id: business.id,
          customer_id: customer?.id ?? null,
          direction:   "outbound",
          channel:     "sms",
          body:        finalWelcome,
          from_number: toNumber,
          to_number:   fromNumber,
          read:        true,
        });
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
          { headers: { "Content-Type": "text/xml" } }
        );
      }

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been resubscribed to ${business.name} messages. Reply STOP to unsubscribe.</Message></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // New customer texting for the first time — send opt-in request before anything else
    if (!customer) {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({ business_id: business.id, phone: fromNumber, sms_opted_out: true })
        .select("id")
        .single();

      const optInMsg = business.settings?.sms_opt_in_message
        ?? `Hi! This is ${business.name}. Reply YES to receive messages from us, or STOP to opt out. Msg & data rates may apply.`;

      await sendSMS(fromNumber, toNumber, optInMsg);
      await supabase.from("messages").insert([
        {
          business_id: business.id, customer_id: newCustomer?.id ?? null,
          direction: "inbound", channel: "sms", body,
          from_number: fromNumber, to_number: toNumber, twilio_sid: messageSid, read: false,
        },
        {
          business_id: business.id, customer_id: newCustomer?.id ?? null,
          direction: "outbound", channel: "sms", body: optInMsg,
          from_number: toNumber, to_number: fromNumber, read: true,
        },
      ]);

      console.log("New customer opt-in sent to", fromNumber);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Block all further processing for opted-out customers
    if (customer.sms_opted_out === true) {
      console.log("Customer is opted out — dropping message from", fromNumber);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
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

    // Embed inbound message (tagged with customer_id for future RAG retrieval)
    if (!insertError) {
      const { data: insertedMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("business_id", business.id)
        .eq("twilio_sid", messageSid)
        .single();

      if (insertedMsg) {
        const msgContent = `Inbound SMS from ${customer?.name ?? fromNumber}:\n"${body}"\nClient: ${customer?.name ?? "Unknown"}\nPhone: ${fromNumber}`.trim();
        await generateAndStoreEmbedding(business.id, insertedMsg.id, msgContent, customer?.id ?? null);
      }
    }

    // Fetch recent message history
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("direction, body, sent_at")
      .eq("business_id", business.id)
      .or(`from_number.eq.${fromNumber},to_number.eq.${fromNumber}`)
      .order("sent_at", { ascending: true })
      .limit(10);

    // Fetch recent matters for context
    const { data: recentJobs } = await supabase
      .from("jobs")
      .select("type, status, slot_start, slot_end, notes")
      .eq("business_id", business.id)
      .eq("customer_id", customer?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(3);

    // Determine if AI replies are enabled
    const aiRepliesEnabled = customer?.ai_sms_replies !== null && customer?.ai_sms_replies !== undefined
      ? customer.ai_sms_replies
      : business.ai_sms_replies !== false;

    // Retrieve RAG context before generating reply
    const ragContext = aiRepliesEnabled && customer?.id
      ? await retrieveContext(business.id, customer.id, body)
      : "";

    const aiReply = aiRepliesEnabled
      ? await generateAIReply(body, business, customer, recentMessages ?? [], recentJobs ?? [], ragContext)
      : null;

    if (aiReply) {
      await sendSMS(fromNumber, toNumber, aiReply);

      const { data: outboundMsg } = await supabase.from("messages").insert({
        business_id: business.id,
        customer_id: customer?.id ?? null,
        direction:   "outbound",
        channel:     "sms",
        body:        aiReply,
        from_number: toNumber,
        to_number:   fromNumber,
      })
      .select("id")
      .single();

      await supabase.rpc("increment_sms_count", {
        p_business_id: business.id,
        p_count:       1,
      });

      if (outboundMsg) {
        const outboundContent = `Outbound SMS to ${customer?.name ?? fromNumber}:\n"${aiReply}"\nClient: ${customer?.name ?? "Unknown"}\nPhone: ${fromNumber}`.trim();
        await generateAndStoreEmbedding(business.id, outboundMsg.id, outboundContent, customer?.id ?? null);
      }

      console.log("AI reply sent:", aiReply);
    } else if (!aiRepliesEnabled) {
      console.log("AI replies disabled — notifying owner");

      if (business.phone) {
        await sendSMS(
          business.phone,
          toNumber,
          `💬 New message from ${customer?.name ?? fromNumber}: "${body.slice(0, 100)}" — reply at rennops.com/dashboard/messages`
        );
        await supabase.rpc("increment_sms_count", { p_business_id: business.id, p_count: 1 });
      }
    } else {
      console.log("Escalating to owner — message requires attorney attention");

      if (business.phone) {
        await sendSMS(
          business.phone,
          toNumber,
          `⚠️ Client reply needs your attention from ${customer?.name ?? fromNumber}: "${body.slice(0, 100)}" — rennops.com/dashboard/messages`
        );
        await supabase.rpc("increment_sms_count", { p_business_id: business.id, p_count: 1 });
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
