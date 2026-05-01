import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RETELL_API_KEY       = Deno.env.get("RETELL_API_KEY")!;
const RETELL_AGENT_ID      = Deno.env.get("RETELL_AGENT_ID")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

      // Check business operating hours
      const bizHours = business.settings?.operating_hours?.[dayName];
      if (!bizHours?.start || !bizHours?.end) continue;

      // Use the later of business open and tech start
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

function buildSystemPrompt(business: any, slots: string[]): string {
  const services  = Array.isArray(business.settings?.services)
    ? business.settings.services.map((s: any) => s.name ?? s).join(", ")
    : "general services";
  const agentName = business.settings?.ai_persona?.name ?? "Alex";
  const greeting  = business.settings?.ai_persona?.greeting ?? `Thanks for calling ${business.name}`;
  const slotsText = slots.length > 0
    ? `Available appointment slots: ${slots.join(" | ")}`
    : "We are currently fully booked — take the customer details and let them know the owner will call back.";

  // Check if currently after hours
  const now = new Date();
  const hour = parseInt(now.toLocaleTimeString("en-US", {
    hour: "2-digit", hour12: false, timeZone: business.timezone
  }));
  const days = ["sun","mon","tue","wed","thu","fri","sat"];
  const dayKey = days[new Date().toLocaleDateString("en-US", { timeZone: business.timezone, weekday: "short" }).toLowerCase().slice(0,3) as unknown as number];
  const operatingHours = business.settings?.operating_hours;
  const todayHours = operatingHours?.[days[now.getDay()]];
  const openHour  = todayHours?.start ? parseInt(todayHours.start.split(":")[0]) : 8;
  const closeHour = todayHours?.end   ? parseInt(todayHours.end.split(":")[0])   : 17;
  const isAfterHours = !todayHours?.start || hour < openHour || hour >= closeHour;

  const afterHoursNote = isAfterHours
    ? `IMPORTANT — IT IS CURRENTLY OUTSIDE BUSINESS HOURS: Do NOT offer specific appointment slots. Still greet the caller warmly and collect their name, phone number, service address, and what service they need. Then say "I have all your details — someone from our team will call you first thing tomorrow morning to get you scheduled." Confirm their callback number before ending the call.`
    : "";

  return `You are ${agentName}, the AI receptionist for ${business.name}.

${greeting}

Your job is to:
1. Greet the caller warmly and ask how you can help
2. Find out what service they need (we offer: ${services})
3. Get their full name and service address
4. Call check_availability with the job_type to get real-time available slots
5. Offer the slots returned and get the caller to confirm a specific day and time
6. ${isAfterHours ? "Do NOT offer slots — collect their details and promise a morning callback" : "Confirm the booking and let them know they will receive an SMS confirmation"}

${afterHoursNote}

IMPORTANT RULES:
- Always call check_availability before offering any appointment times — never make up slots
- Never quote prices — say the owner will provide a quote when they arrive
- If the caller says flood, gas leak, no heat, burst pipe, or emergency — say this sounds urgent let me get the owner on the line right away then immediately call transfer_to_owner
- If the caller says talk to a person or speak to someone — immediately call transfer_to_owner
- Always be friendly, concise, and professional
- Only confirm a booking after the caller has agreed to a specific day AND time

Business timezone: ${business.timezone}`;
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
    const { data: business } = await supabase
      .from("businesses")
      .select("id, name, settings, timezone, subscription_status")
      .eq("twilio_number", toNumber)
      .single();

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

    // Create call record in Supabase
    await supabase.from("calls").insert({
      business_id:     business.id,
      twilio_call_sid: callSid,
      caller_phone:    fromNumber,
      outcome:         "in_progress",
    });

    // Get available slots
    const slots = await getAvailableSlots(business.id);
    console.log("Available slots:", slots);

    // Build dynamic system prompt
    const systemPrompt = buildSystemPrompt(business, slots);

    // Step 1: Register the inbound call with Retell
    // This assigns the agent and returns a unique call_id
const registerRes = await fetch("https://api.retellai.com/v2/register-phone-call", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${RETELL_API_KEY}`,
    "Content-Type":  "application/json",
  },
  body: JSON.stringify({
    agent_id:  RETELL_AGENT_ID,
    from_number: fromNumber,
    to_number:   toNumber,
    direction:   "inbound",
    metadata: {
      business_id: business.id,
      call_sid:    callSid,
    },
  }),
});

    const registerText = await registerRes.text();
    console.log("Retell register status:", registerRes.status);
    console.log("Retell register body:", registerText);

    if (!registerRes.ok) {
      throw new Error(`Retell register error: ${registerText}`);
    }

    const { call_id } = JSON.parse(registerText);
    console.log("Retell call_id:", call_id);

    // Step 2: Return TwiML that connects Twilio audio to Retell
    // The call_id in the URL tells Retell which registered call this is
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