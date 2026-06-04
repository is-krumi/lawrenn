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
        return `${j.type} (${j.status}) scheduled for ${slot}`;
      }).join(", ")}`
    : "No prior matters on file";

  const messageHistory = recentMessages.map(m =>
    `${m.direction === "inbound" ? "Client" : "Firm"}: ${m.body}`
  ).join("\n");

  const contextBlock = ragContext
    ? `\nRelevant context from client history:\n${ragContext}\n`
    : "";

  const systemPrompt = `You are the AI intake assistant for ${business.name}, a law firm.
You are handling SMS replies from clients on behalf of the attorneys.

Firm info:
- Name: ${business.name}
- Practice areas: ${business.settings?.services?.map((s: any) => s.name ?? s).join(", ") ?? "general legal services"}
- Hours: ${JSON.stringify(business.settings?.operating_hours ?? {})}

Client info:
- Name: ${customer?.name ?? "Unknown"}
- ${jobContext}
${contextBlock}
Recent conversation:
${messageHistory}

RULES:
- Keep replies short — 1-3 sentences max, this is SMS
- If you know the client's name and this is the first or second message in the conversation, open with "Hi ${customer?.name ? customer.name.split(" ")[0] : "[Name]"}," — use their first name naturally
- Never give legal advice or quote specific fees — say an attorney will follow up
- For scheduling or intake questions — offer to have the attorney or intake team call them
- For complaints or disputes — say you will have an attorney contact them shortly
- For simple questions about practice areas or availability — answer directly and professionally
- If unsure — say "Great question! Let me have our team follow up with you shortly."
- Always be warm and professional
- Sign off with the firm name if it's the first reply
- Never make promises you cannot keep
- If the client seems distressed or mentions a legal emergency — do NOT try to resolve via SMS, escalate immediately

Escalate to attorney (return ESCALATE) if message contains:
- Complaints about legal representation
- Requests for refunds or fee disputes
- Threats of bar complaints or malpractice
- Anything requiring legal judgment or negotiation
- Mention of court dates, deadlines, or emergencies`;

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
        content: `Client SMS: "${message}"\n\nGenerate a reply. If this requires escalation to an attorney, respond with exactly: ESCALATE`,
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
