import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const OPENAI_API_KEY     = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function parseTranscript(transcript: string): Promise<Record<string, any>> {
  const today = new Date().toISOString().split('T')[0]; // e.g. "2026-04-30"

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{
        role: "user",
content: `Today's date is ${today}. Extract structured job data from this call transcript. Return ONLY a valid JSON object with no additional text or markdown.

Required fields:
- customer_name (string or null)
- customer_phone (string or null)
- address (string or null)
- job_type (string or null)
- urgency (string: "normal" or "urgent")
- slot_start (ISO 8601 datetime string using today's date ${today} as reference to calculate the correct date — if they say "Monday" find the next Monday from today, null only if no day or time was mentioned at all)
- slot_end (ISO 8601 datetime string, 2 hours after slot_start, null if slot_start is null)
- notes (string: any additional details mentioned)
- outcome (string: one of the following)
  - "booked" = caller agreed to a SPECIFIC day AND time slot
  - "callback_requested" = caller provided details but no time was confirmed — team will call back
  - "escalated" = ONLY if caller used emergency keywords: flood, gas leak, no heat, burst pipe, emergency
  - "no_answer" = agent answered but caller hung up immediately without providing any details
  - "missed" = call never connected, dropped, or went to voicemail
  - "voicemail" = caller left a voicemail message
- booking_confirmed (boolean: true ONLY if caller agreed to a specific day AND time — false if team will call back to confirm)

Transcript:
${transcript}`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

serve(async (req) => {
  try {
    console.log("=== process-call-transcript called ===");
    console.log("Method:", req.method);
    console.log("Content-Type:", req.headers.get("content-type"));

    const rawBody = await req.text();
    console.log("Raw body length:", rawBody.length);
    console.log("Raw body preview:", rawBody.slice(0, 500));

    const body = JSON.parse(rawBody);

    // Retell wraps everything in an event object
    // Handle both direct call object and event wrapper
    const event = body.event;
    const callData = body.data ?? body.call ?? body;

    console.log("Event type:", event);

    // Only process call_ended events
    if (event && event !== "call_ended") {
      console.log("Skipping event:", event);
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const call_id = callData.call_id;
    const metadata = callData.metadata;
    const transcript = callData.transcript;
    const recording_url = callData.recording_url;
    const duration_ms = callData.duration_ms;
    const disconnection_reason = callData.disconnection_reason;

    console.log("call_id:", call_id);
    console.log("metadata:", JSON.stringify(metadata));
    console.log("transcript length:", transcript?.length ?? 0);
    console.log("disconnection_reason:", disconnection_reason);

    const businessId = metadata?.business_id;
    const callSid = metadata?.call_sid;

    console.log("businessId:", businessId);
    console.log("callSid:", callSid);

    if (!businessId || !callSid) {
      console.log("Missing business_id or call_sid — checking call_id fallback");

      // Try to find call record by Retell call_id if metadata is missing
      if (call_id) {
        const { data: callRecord } = await supabase
          .from("calls")
          .select("id, caller_phone, business_id")
          .eq("twilio_call_sid", call_id)
          .maybeSingle();

        if (!callRecord) {
          console.log("No call record found for call_id:", call_id);
          return new Response(
            JSON.stringify({ error: "Call record not found" }),
            { status: 200 } // Return 200 so Retell doesn't retry
          );
        }

        // Update what we can with just the transcript
        const fallbackDuration = Math.round((duration_ms ?? 0) / 1000);
        const fallbackOutcome = fallbackDuration < 10 ? "missed" : fallbackDuration < 30 ? "no_answer" : "completed";
        await supabase
          .from("calls")
          .update({
            transcript,
            recording_url: recording_url ?? null,
            duration_seconds: fallbackDuration,
            outcome: fallbackOutcome,
          })
          .eq("id", callRecord.id);

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      return new Response(
        JSON.stringify({ error: "Missing business_id or call_sid in metadata" }),
        { status: 200 }
      );
    }

    // Find the call record created by handle-inbound-call
    const { data: callRecord } = await supabase
      .from("calls")
      .select("id, caller_phone")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();

    console.log("Call record found:", callRecord?.id ?? "NOT FOUND");

    if (!callRecord) {
      return new Response(
        JSON.stringify({ error: "Call record not found for callSid: " + callSid }),
        { status: 200 }
      );
    }

    const durationSeconds = Math.round((duration_ms ?? 0) / 1000);

    // Parse transcript with Claude
    console.log("Parsing transcript with Claude...");
    const parsed = transcript ? await parseTranscript(transcript) : {};
    console.log("Parsed job data:", JSON.stringify(parsed));

    // Determine outcome
    const outcome = parsed.outcome ?? (() => {
      if (durationSeconds < 10) return "missed";    // Never really connected
      if (durationSeconds < 30) return "no_answer"; // Connected but very short
      return "completed"; // Claude couldn't determine but call had real conversation
    })();

const escalated = parsed.urgency === "urgent" && parsed.outcome === "escalated";

    // Update call record
    const { error: updateError } = await supabase
      .from("calls")
      .update({
        transcript,
        recording_url: recording_url ?? null,
        duration_seconds: durationSeconds,
        parsed_job: parsed,
        outcome,
        escalated,
      })
      .eq("id", callRecord.id);

    console.log("Call update error:", updateError?.message ?? "none");

    // If booking was confirmed — create customer and job
    if (parsed.booking_confirmed && parsed.slot_start) {
      console.log("Booking confirmed — creating customer and job...");

      const callerPhone = parsed.customer_phone ?? callRecord.caller_phone;

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .upsert({
          business_id: businessId,
          phone: callerPhone,
          name: parsed.customer_name ?? null,
          address: parsed.address ?? null,
        }, { onConflict: "business_id,phone" })
        .select("id")
        .single();

      console.log("Customer upsert:", customer?.id ?? "FAILED", customerError?.message ?? "");

      if (customer) {
        await supabase
          .from("calls")
          .update({ customer_id: customer.id })
          .eq("id", callRecord.id);
      }

      const { data: technician } = await supabase
        .from("technicians")
        .select("id")
        .eq("business_id", businessId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      const slotEnd = parsed.slot_end ?? new Date(
        new Date(parsed.slot_start).getTime() + 2 * 60 * 60 * 1000
      ).toISOString();

      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          business_id: businessId,
          customer_id: customer?.id,
          technician_id: technician?.id ?? null,
          call_id: callRecord.id,
          type: parsed.job_type ?? "General Service",
          status: "booked",
          slot_start: parsed.slot_start,
          slot_end: slotEnd,
          notes: parsed.notes ?? null,
          source: "voice_agent",
        })
        .select("id")
        .single();

      // Handle slot conflict (unique constraint violation)
      if (jobError?.code === "23505") {
        console.log("Slot conflict detected — slot already booked for this technician");
        await supabase
          .from("calls")
          .update({ outcome: "missed" })
          .eq("id", callRecord.id);
        return new Response(
          JSON.stringify({ error: "Slot conflict — customer will be contacted to reschedule" }),
          { status: 200 }
        );
      }

      console.log("Job insert:", job?.id ?? "FAILED", jobError?.message ?? "");

      // Send booking confirmation SMS
      if (customer && job) {
        const { data: business } = await supabase
          .from("businesses")
          .select("name, timezone")
          .eq("id", businessId)
          .single();

        const slotDisplay = new Date(parsed.slot_start).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: business?.timezone ?? "America/New_York",
        });

        const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "booking_confirmation",
            channel: "sms",
            customer_id: customer.id,
            job_id: job.id,
            business_id: businessId,
            template_data: {
              customerName: parsed.customer_name ?? "there",
              businessName: business?.name ?? "us",
              jobType: parsed.job_type ?? "service",
              slotStart: slotDisplay,
              techName: "",
              reviewUrl: "",
            },
          }),
        });

        console.log("SMS send status:", smsRes.status);
        // Notify owner via SMS about new booking
        const { data: ownerBusiness } = await supabase
          .from("businesses")
          .select("phone, name")
          .eq("id", businessId)
          .single();

        if (ownerBusiness?.phone) {
          const ownerMsg = `New booking via RennOps: ${parsed.customer_name ?? "A customer"} booked a ${parsed.job_type ?? "service"} for ${slotDisplay}. Address: ${parsed.address ?? "not provided"}.`;

          await fetch("https://api.twilio.com/2010-04-01/Accounts/" + Deno.env.get("TWILIO_ACCOUNT_SID") + "/Messages.json", {
            method: "POST",
            headers: {
              "Authorization": "Basic " + btoa(Deno.env.get("TWILIO_ACCOUNT_SID")! + ":" + Deno.env.get("TWILIO_AUTH_TOKEN")!),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To:   ownerBusiness.phone,
              From: Deno.env.get("TWILIO_FROM_NUMBER")!,
              Body: ownerMsg,
            }),
          });

          console.log("Owner notification SMS sent to:", ownerBusiness.phone);
        }
        
      }
    } else {
      console.log("Booking not confirmed. booking_confirmed:", parsed.booking_confirmed, "slot_start:", parsed.slot_start);
    }

    // Generate AI job notes
    if (transcript && transcript.length > 100) {
      console.log("Generating AI job notes...");
      const notesRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `Write a brief 2-3 sentence job summary for a trades business owner based on this call transcript.
Cover: what the problem is, any specific details mentioned, and any follow-up needed.
Plain text only, no bullet points.

Transcript:
${transcript}`,
          }],
        }),
      });

      const notesData = await notesRes.json();
      const aiNotes = notesData.content?.[0]?.text ?? null;
      console.log("AI notes generated:", aiNotes?.slice(0, 100));

      if (aiNotes) {
        const { data: latestJob } = await supabase
          .from("jobs")
          .select("id")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestJob) {
          await supabase
            .from("jobs")
            .update({ ai_notes: aiNotes })
            .eq("id", latestJob.id);
        }
      }
    }

    // Generate and store embedding for RAG
    if (transcript && transcript.length > 100) {
      try {
        console.log("Generating embedding for transcript...");

        // Build content to embed — include parsed job data for richer search
        const embeddingContent = `
Call transcript:
${transcript}

Job details:
- Customer: ${parsed.customer_name ?? "Unknown"}
- Service: ${parsed.job_type ?? "Unknown"}
- Address: ${parsed.address ?? "Unknown"}
- Outcome: ${parsed.outcome ?? "Unknown"}
- Notes: ${parsed.notes ?? "None"}
        `.trim();

        const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: embeddingContent,
          }),
        });

        const embeddingData = await embeddingRes.json();
        const embedding = embeddingData.data?.[0]?.embedding;

        if (embedding) {
          await supabase.from("embeddings").insert({
            business_id: businessId,
            source_type: "call",
            source_id:   callRecord.id,
            content:     embeddingContent,
            embedding:   JSON.stringify(embedding),
          });
          console.log("Call embedding stored successfully");
        }
      } catch (embeddingErr) {
        console.error("Embedding generation failed (non-critical):", embeddingErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("process-call-transcript error:", err);
    await captureException(err, { function: "process-call-transcript" });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 200 } // Return 200 so Retell doesn't keep retrying
    );
  }
});