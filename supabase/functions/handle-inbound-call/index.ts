import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RETELL_API_KEY       = Deno.env.get("RETELL_API_KEY")!;
const RETELL_AGENT_ID      = Deno.env.get("RETELL_AGENT_ID")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Retrieve relevant embeddings for a client via vector similarity search
async function retrieveContext(
  businessId: string,
  customerId: string,
  queryText: string,
  matchCount = 6
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
      match_threshold: 0.4,
      match_count:     matchCount,
      p_business_id:   businessId,
      p_customer_id:   customerId,
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

async function getAvailableSlots(businessId: string): Promise<string[]> {
  const { data: business } = await supabase
    .from("businesses")
    .select("settings, timezone")
    .eq("id", businessId)
    .single();

  if (!business) return [];

  const { data: technicians } = await supabase
    .from("technicians")
    .select("id, name, schedule")
    .eq("business_id", businessId)
    .eq("active", true);

  if (!technicians || technicians.length === 0) return [];

  const now  = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: bookedJobs } = await supabase
    .from("jobs")
    .select("slot_start, slot_end, technician_id")
    .eq("business_id", businessId)
    .in("status", ["booked", "in_progress"])
    .gte("slot_start", now.toISOString())
    .lte("slot_start", week.toISOString());

  const slots: string[] = [];
  const days = ["sun","mon","tue","wed","thu","fri","sat"];

  for (let d = 1; d <= 7 && slots.length < 3; d++) {
    const date    = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dayName = days[date.getDay()];

    for (const tech of technicians) {
      const schedule = tech.schedule?.[dayName];
      if (!schedule?.start || !schedule?.end) continue;

      const bizHours = business.settings?.operating_hours?.[dayName];
      if (!bizHours?.start || !bizHours?.end) continue;

      const bizOpen        = parseInt(bizHours.start.split(":")[0]);
      const bizClose       = parseInt(bizHours.end.split(":")[0]);
      const techOpen       = parseInt(schedule.start.split(":")[0]);
      const effectiveOpen  = Math.max(bizOpen, techOpen);
      const effectiveClose = Math.min(bizClose, parseInt(schedule.end.split(":")[0]));

      if (effectiveOpen >= effectiveClose) continue;

      const slotTime = new Date(date);
      slotTime.setHours(effectiveOpen, 0, 0, 0);

      const conflict = bookedJobs?.some(j => {
        const jStart = new Date(j.slot_start);
        const jEnd   = new Date(j.slot_end);
        return j.technician_id === tech.id &&
               slotTime >= jStart && slotTime < jEnd;
      });

      if (!conflict) {
        slots.push(
          slotTime.toLocaleDateString("en-US", {
            weekday: "long", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZone: business.timezone,
          })
        );
        break;
      }
    }
  }

  return slots;
}

function buildSystemPrompt(business: any, slots: string[], isAfterHours: boolean): string {
  if (business.system_prompt) {
    const services = Array.isArray(business.settings?.services) && business.settings.services.length > 0
      ? business.settings.services.map((s: any) =>
          `- ${s.name ?? s}${s.description ? `: ${s.description}` : ""}`
        ).join("\n")
      : "general legal services";

    const slotsText = slots.length > 0
      ? `PRE-LOADED (use immediately, no tool call needed): ${slots.map((s: any) => s.display ?? s).join(" | ")}`
      : "No slots pre-loaded — call check_availability to find available times.";

    return business.system_prompt
      .replace("{{services}}", services)
      .replace("{{slots}}", slotsText);
  }

  const services  = Array.isArray(business.settings?.services) && business.settings.services.length > 0
    ? business.settings.services.map((s: any) => s.name ?? s).join(", ")
    : "general legal services";
  const agentName = business.settings?.ai_persona?.name ?? "Alex";

  const tone = `TONE & PERSONALITY:
- Warm, professional, and reassuring. You represent a law firm.
- Empathetic but concise. Mirror the caller's urgency.
- Sound confident. If you don't know something, say "Let me make sure the right person follows up with you on that."

RULES:
- Never give legal advice — schedule consultations and take intake only
- Never quote fees — the attorney will discuss fees during the consultation
- If the caller mentions an emergency or court deadline — say "This sounds urgent, let me get an attorney on the line right away" then call transfer_to_owner
- If the caller asks to speak to a person — call transfer_to_owner immediately`;

  if (isAfterHours) {
    return `You are ${agentName}, the AI intake receptionist for ${business.name}, a law firm. The caller has already been greeted — do NOT say hello again.

IT IS CURRENTLY AFTER HOURS. Do NOT offer or discuss appointment slots.

Your job:
1. Find out what legal matter they need help with (${services})
2. Collect their full name and best callback number
3. Say: "I have all your details — an attorney from our team will call you first thing in the morning." Then confirm their callback number.
4. If they mention an emergency or court deadline — call transfer_to_owner immediately

${tone}

Business timezone: ${business.timezone}`;
  }

  if (slots.length > 0) {
    return `You are ${agentName}, the AI intake receptionist for ${business.name}, a law firm. The caller has already been greeted — do NOT say hello again.

PRE-LOADED SLOTS — use these immediately, no tool call needed:
${slots.join(" | ")}

Your job:
1. Find out what legal matter they need help with (${services})
2. Collect their full name and contact number
3. Offer the pre-loaded slots above — present the nearest 2–3 options first
4. Once they confirm a day AND time, repeat it back to confirm
5. Let them know they will receive an SMS confirmation shortly
- Only call check_availability if the caller rejects ALL pre-loaded slots or asks for a date not listed

${tone}

Business timezone: ${business.timezone}`;
  }

  return `You are ${agentName}, the AI intake receptionist for ${business.name}, a law firm. The caller has already been greeted — do NOT say hello again.

Your job:
1. Find out what legal matter they need help with (${services})
2. Collect their full name and contact number
3. Call check_availability to find available appointment times, then offer the nearest 2–3 options
4. Once they confirm a day AND time, repeat it back to confirm
5. Let them know they will receive an SMS confirmation shortly

${tone}

Business timezone: ${business.timezone}`;
}

// Build a client recognition context block to prepend to the system prompt
async function buildClientContext(
  business: any,
  customer: any,
  fromNumber: string
): Promise<string> {
  // Fetch recent matters
  const { data: recentJobs } = await supabase
    .from("jobs")
    .select("type, status, slot_start, amount, notes")
    .eq("business_id", business.id)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(4);

  // Fetch recent messages
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("direction, body, sent_at")
    .eq("business_id", business.id)
    .eq("customer_id", customer.id)
    .order("sent_at", { ascending: false })
    .limit(5);

  // Fetch recent calls
  const { data: recentCalls } = await supabase
    .from("calls")
    .select("outcome, transcript, created_at")
    .eq("business_id", business.id)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(2);

  // RAG: retrieve relevant embeddings for this client
  const ragQuery = [
    customer.name ?? "",
    recentJobs?.map((j: any) => j.type).join(" ") ?? "",
    customer.notes ?? "",
  ].filter(Boolean).join(" ") || "client history matters notes";

  const ragContext = await retrieveContext(business.id, customer.id, ragQuery);

  // Format matters
  const mattersText = recentJobs && recentJobs.length > 0
    ? recentJobs.map((j: any) => {
        const slot = j.slot_start
          ? new Date(j.slot_start).toLocaleDateString("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZone: business.timezone,
            })
          : null;
        return `${j.type} (${j.status})${slot ? ` — ${slot}` : ""}${j.amount ? ` — $${j.amount}` : ""}`;
      }).join("\n  ")
    : "No prior matters on file";

  // Format recent messages
  const messagesText = recentMessages && recentMessages.length > 0
    ? recentMessages
        .slice(0, 4)
        .reverse()
        .map((m: any) => `  ${m.direction === "inbound" ? "Client" : "Firm"}: ${m.body}`)
        .join("\n")
    : "";

  // Format recent calls
  const callsText = recentCalls && recentCalls.length > 0
    ? recentCalls.map((c: any) => `  Call (${c.outcome ?? "unknown outcome"}) on ${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`).join("\n")
    : "";

  return [
    "=== KNOWN CLIENT ===",
    `This call is from a known client: ${customer.name ?? "Unknown"}`,
    `Phone: ${fromNumber}`,
    customer.notes ? `Attorney notes: ${customer.notes}` : null,
    "",
    "Recent matters:",
    `  ${mattersText}`,
    callsText ? `\nRecent calls:\n${callsText}` : null,
    messagesText ? `\nRecent messages:\n${messagesText}` : null,
    ragContext
      ? `\nRelevant context from client file:\n${ragContext.split("\n").map(l => `  ${l}`).join("\n")}`
      : null,
    "",
    "INSTRUCTIONS FOR THIS CALL:",
    `- Address the client by their first name (${(customer.name ?? "").split(" ")[0] || "the client"})`,
    "- You already have their contact info — do NOT ask for their name or phone number again",
    "- Reference their history naturally when relevant (e.g. prior matter, last call)",
    "- If they are calling about an existing matter, acknowledge it",
    "===================",
  ].filter(line => line !== null).join("\n");
}

serve(async (req) => {
  try {
    console.log("=== handle-inbound-call start ===");
    const rawBody = await req.text();

    const params     = Object.fromEntries(new URLSearchParams(rawBody));
    const toNumber   = params.To;
    const fromNumber = params.From;
    const callSid    = params.CallSid;
    console.log("To:", toNumber, "From:", fromNumber, "CallSid:", callSid);

    // Look up business by Twilio number
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("id, name, settings, timezone, subscription_status, subscription_tier, system_prompt, monthly_call_count, usage_reset_at")
      .eq("twilio_number", toNumber)
      .single();

    console.log("Business query error:", JSON.stringify(bizError));
    console.log("Business found:", business?.name ?? "NOT FOUND");

    if (!business) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured. Goodbye.</Say></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    if (!["active", "trialing"].includes(business.subscription_status)) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This service is currently unavailable. Please call back later.</Say></Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Look up caller as a known client
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, notes")
      .eq("business_id", business.id)
      .eq("phone", fromNumber)
      .maybeSingle();

    console.log("Known client:", customer ? `${customer.name ?? "unnamed"} (${customer.id})` : "new caller");

    // Get effective limits for this business
    const { data: limits } = await supabase
      .rpc("get_business_limits", { p_business_id: business.id })
      .single();

    const callCount = business.monthly_call_count ?? 0;

    if (callCount >= (limits?.monthly_call_cap ?? 100)) {
      console.log(`Business ${business.id} has hit call cap: ${callCount}/${limits?.monthly_call_cap ?? 100}`);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say>Thank you for calling ${business.name}. We are unable to take your call right now.</Say>
    </Response>`,
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Create call record, associating with client if known
    await supabase.from("calls").insert({
      business_id:     business.id,
      twilio_call_sid: callSid,
      caller_phone:    fromNumber,
      customer_id:     customer?.id ?? null,
      outcome:         "in_progress",
    });

    // Compute after-hours before fetching slots so we can skip the DB query when not needed
    const nowForHours = new Date();
    const hourNow = parseInt(nowForHours.toLocaleTimeString("en-US", {
      hour: "2-digit", hour12: false, timeZone: business.timezone ?? "America/New_York",
    }));
    const daysOfWeek = ["sun","mon","tue","wed","thu","fri","sat"];
    const todayKey   = daysOfWeek[nowForHours.getDay()];
    const todayHrs   = business.settings?.operating_hours?.[todayKey];
    const isAfterHours = !todayHrs?.start
      || hourNow < parseInt(todayHrs.start.split(":")[0])
      || hourNow >= parseInt(todayHrs.end?.split(":")[0] ?? "17");

    console.log("isAfterHours:", isAfterHours, "hour:", hourNow);

    // Fetch available slots (skipped after hours) and client context in parallel
    const [slots, clientContextBlock] = await Promise.all([
      isAfterHours ? Promise.resolve([]) : getAvailableSlots(business.id),
      customer ? buildClientContext(business, customer, fromNumber) : Promise.resolve(""),
    ]);

    console.log("Available slots:", slots);
    console.log("Client context built:", customer ? "yes" : "no (new caller)");

    // Build final system prompt: client context block (if known) + base prompt
    const basePrompt   = buildSystemPrompt(business, slots, isAfterHours);
    const systemPrompt = clientContextBlock
      ? `${clientContextBlock}\n\n${basePrompt}`
      : basePrompt;

    const agentName = business.settings?.ai_persona?.name ?? "Alex";

    // Personalize the greeting for known clients
    const firstName = customer?.name?.split(" ")[0] ?? "";
    const baseGreeting = business.settings?.ai_persona?.greeting
      ?? `Thanks for calling ${business.name}! This is ${agentName} — how can I help you today?`;
    const beginMessage = customer?.name
      ? `Hi ${firstName}! ${baseGreeting}`
      : baseGreeting;

    console.log("beginMessage:", beginMessage);
    console.log("system_prompt from DB:", business.system_prompt ? "SET (custom)" : "NULL (using fallback)");
    console.log("Prompt length:", systemPrompt.length);

    const voiceId = business.settings?.ai_persona?.voice_id ?? "auq43ws1oslv0tO4BDa7";

    const registerPayload = {
      agent_id:    RETELL_AGENT_ID,
      from_number: fromNumber,
      to_number:   toNumber,
      direction:   "inbound",
      retell_llm_dynamic_variables: {
        business_id:   business.id,
        system_prompt: systemPrompt,
        begin_message: beginMessage,
      },
      override_agent_config: {
        voice_id: voiceId,
      },
      metadata: {
        business_id: business.id,
        call_sid:    callSid,
        customer_id: customer?.id ?? null,
      },
    };

    console.log("Register payload (no prompt):", JSON.stringify({
      ...registerPayload,
      retell_llm_dynamic_variables: { business_id: business.id },
    }));

    const registerRes = await fetch("https://api.retellai.com/v2/register-phone-call", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RETELL_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(registerPayload),
    });

    const registerText = await registerRes.text();
    console.log("Retell register status:", registerRes.status);
    console.log("Retell register body:", registerText);

    if (!registerRes.ok) {
      throw new Error(`Retell register error: ${registerText}`);
    }

    const { call_id } = JSON.parse(registerText);
    console.log("Retell call_id:", call_id);

    await supabase
      .from("calls")
      .update({ retell_call_id: call_id })
      .eq("twilio_call_sid", callSid);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>sip:${call_id}@5t4n6j0wnrl.sip.livekit.cloud</Sip>
  </Dial>
</Response>`;

    console.log("Returning TwiML with call_id:", call_id);

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
    });

  } catch (err) {
    console.error("handle-inbound-call error:", err);
    await captureException(err, { function: "handle-inbound-call" });
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Thank you for calling. We are unable to take your call right now. Please leave a message after the tone and we will call you back as soon as possible.</Say>
        <Record maxLength="60"/>
      </Response>`,
      { headers: { "Content-Type": "text/xml" } }
    );
  }
});
