import { captureException } from "../_shared/sentry.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    const body = await req.json();

    // Retell sends call metadata with every function call
    const job_type      = body.job_type ?? null;
    const preferred_date = body.preferred_date ?? null;
    const retell_call_id = body.call?.call_id ?? null;

    console.log("check-availability called, job_type:", job_type, "retell_call_id:", retell_call_id);

    // Look up business_id from our calls table using the Retell call_id
    let business_id: string | null = null;

    if (retell_call_id) {
      const { data: callRecord } = await supabase
        .from("calls")
        .select("business_id")
        .eq("twilio_call_sid", retell_call_id)
        .maybeSingle();

      business_id = callRecord?.business_id ?? null;
      console.log("Found business_id from call record:", business_id);
    }

    // Fallback to direct business_id if passed
    if (!business_id) {
      business_id = body.business_id ?? null;
    }

    if (!business_id) {
      return new Response(
        JSON.stringify({
          available: false,
          slots: [],
          message: "I'm having trouble checking availability right now. Let me take your details and someone will call you back to confirm a time.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch business settings
    const { data: business } = await supabase
      .from("businesses")
      .select("settings, timezone")
      .eq("id", business_id)
      .single();

    if (!business) {
      return new Response(
        JSON.stringify({
          available: false,
          slots: [],
          message: "I'm unable to check availability right now. Let me take your details and someone will call you back.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch active technicians
    const { data: technicians } = await supabase
      .from("technicians")
      .select("id, name, schedule")
      .eq("business_id", business_id)
      .eq("active", true);

    if (!technicians || technicians.length === 0) {
      return new Response(
        JSON.stringify({
          available: false,
          slots: [],
          message: "No technicians available right now. The owner will call you back to schedule.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get job duration from business settings (default 2 hours)
    const services    = business.settings?.services ?? [];
    const matchedSvc  = services.find((s: any) =>
      s.name?.toLowerCase().includes((job_type ?? "").toLowerCase())
    );
    const durationMins = matchedSvc?.duration_mins ?? 120;
    const bufferMins   = business.settings?.travel_buffer_mins ?? 30;

    // Search window — preferred date or next 7 days
    const now       = new Date();
    const startDate = preferred_date ? new Date(preferred_date) : now;
    const endDate   = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch already booked jobs in window
    const { data: bookedJobs } = await supabase
      .from("jobs")
      .select("slot_start, slot_end, technician_id")
      .eq("business_id", business_id)
      .in("status", ["booked", "in_progress"])
      .gte("slot_start", startDate.toISOString())
      .lte("slot_start", endDate.toISOString());

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const slots: Array<{
      technician_id:   string;
      technician_name: string;
      slot_start:      string;
      slot_end:        string;
      display:         string;
    }> = [];

    // Iterate through days to find available windows
    for (let d = 0; d <= 7 && slots.length < 3; d++) {
      const date   = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
      const dayKey = days[date.getDay()];

      for (const tech of technicians) {
        if (slots.length >= 3) break;

        const schedule = tech.schedule?.[dayKey];
        if (!schedule?.start || !schedule?.end) continue;

        // Check business operating hours
        const bizHours = business.settings?.operating_hours?.[dayKey];
        if (!bizHours?.start || !bizHours?.end) continue;

        const bizOpen        = parseInt(bizHours.start.split(":")[0]);
        const bizClose       = parseInt(bizHours.end.split(":")[0]);
        const techOpen       = parseInt(schedule.start.split(":")[0]);
        const effectiveOpen  = Math.max(bizOpen, techOpen);
        const effectiveClose = Math.min(bizClose, parseInt(schedule.end.split(":")[0]));

        if (effectiveOpen >= effectiveClose) continue;

        const workStart = new Date(date);
        workStart.setHours(effectiveOpen, 0, 0, 0);

        const workEnd = new Date(date);
        workEnd.setHours(effectiveClose, 0, 0, 0);

        // Skip if in the past
        if (workStart < now) continue;

        // Try slots every 30 minutes through the working day
        let cursor = new Date(workStart);
        while (cursor < workEnd && slots.length < 3) {
          const slotEnd = new Date(cursor.getTime() + durationMins * 60 * 1000);

          // Slot must fit within working hours
          if (slotEnd > workEnd) break;

          // Check for conflicts including buffer time
          const bufferedStart = new Date(cursor.getTime() - bufferMins * 60 * 1000);
          const bufferedEnd   = new Date(slotEnd.getTime() + bufferMins * 60 * 1000);

          const hasConflict = bookedJobs?.some((job) => {
            if (job.technician_id !== tech.id) return false;
            const jStart = new Date(job.slot_start);
            const jEnd   = new Date(job.slot_end);
            return bufferedStart < jEnd && bufferedEnd > jStart;
          });

          if (!hasConflict) {
            const display = cursor.toLocaleDateString("en-US", {
              weekday: "long",
              month:   "long",
              day:     "numeric",
              hour:    "numeric",
              minute:  "2-digit",
              timeZone: business.timezone,
            });

            slots.push({
              technician_id:   tech.id,
              technician_name: tech.name,
              slot_start:      cursor.toISOString(),
              slot_end:        slotEnd.toISOString(),
              display,
            });
          }

          // Move to next 30-min window
          cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
        }
      }
    }

    if (slots.length === 0) {
      return new Response(
        JSON.stringify({
          available: false,
          slots: [],
          message: "We are fully booked for the next week. Let me take your details and the owner will call you back to find a time that works.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        available: true,
        slots,
        message: `I have ${slots.length} available slot${slots.length > 1 ? "s" : ""}: ${slots.map(s => s.display).join(", or ")}. Which works best for you?`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("check-availability error:", err);
    await captureException(err, { function: "check-availability" });
    return new Response(
      JSON.stringify({
        available: false,
        slots: [],
        message: "I'm having trouble checking availability right now. Let me take your details and someone will call you back.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});