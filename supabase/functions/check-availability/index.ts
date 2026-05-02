import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fromZonedTime, toZonedTime } from "https://esm.sh/date-fns-tz@3";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    const body = await req.json();

    const job_type       = body.job_type ?? null;
    const preferred_date = body.preferred_date ?? null;
    const retell_call_id = body.call?.call_id ?? null;

    console.log("check-availability called, job_type:", job_type, "retell_call_id:", retell_call_id);

    // Look up business_id from calls table using Retell call_id
    let business_id: string | null = null;

    if (retell_call_id) {
      const { data: callRecord } = await supabase
        .from("calls")
        .select("business_id")
        .eq("retell_call_id", retell_call_id)
        .maybeSingle();

      business_id = callRecord?.business_id ?? null;
      console.log("Found business_id from call record:", business_id);
    }

    if (!business_id) business_id = body.business_id ?? null;

    if (!business_id) {
      return new Response(JSON.stringify({
        available: false, slots: [],
        message: "I'm having trouble checking availability right now. Let me take your details and someone will call you back to confirm a time.",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Fetch business
    const { data: business } = await supabase
      .from("businesses")
      .select("settings, timezone")
      .eq("id", business_id)
      .single();

    if (!business) {
      return new Response(JSON.stringify({
        available: false, slots: [],
        message: "I'm unable to check availability right now. Let me take your details and someone will call you back.",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const tz = business.timezone ?? "America/New_York";

    // Fetch active technicians
    const { data: technicians } = await supabase
      .from("technicians")
      .select("id, name, schedule")
      .eq("business_id", business_id)
      .eq("active", true);

    if (!technicians || technicians.length === 0) {
      return new Response(JSON.stringify({
        available: false, slots: [],
        message: "No technicians available right now. The owner will call you back to schedule.",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Get job duration
    const services    = business.settings?.services ?? [];
    const matchedSvc  = services.find((s: any) =>
      s.name?.toLowerCase().includes((job_type ?? "").toLowerCase())
    );
    const durationMins = matchedSvc?.duration_mins ?? 120;
    const bufferMins   = business.settings?.travel_buffer_mins ?? 30;

    // Search window for booked jobs lookup
    const now       = new Date();
    const startDate = preferred_date ? new Date(preferred_date) : now;
    const endDate   = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);

    // Fetch booked jobs for full 60 day window
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

    const collectSlots = (startDay: number, endDay: number, maxSlots?: number) => {
      for (let d = startDay; d <= endDay; d++) {
        if (maxSlots && slots.length >= maxSlots) break;

        const date = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);

        // Get day index in business timezone
        const zonedDate = toZonedTime(date, tz);
        const dayName   = days[zonedDate.getDay()];

        for (const tech of technicians) {
          if (maxSlots && slots.length >= maxSlots) break;

          const schedule = tech.schedule?.[dayName];
          if (!schedule?.start || !schedule?.end) continue;

          const bizHours = business.settings?.operating_hours?.[dayName];
          if (!bizHours?.start || !bizHours?.end) continue;

          const bizOpen        = parseInt(bizHours.start.split(":")[0]);
          const bizClose       = parseInt(bizHours.end.split(":")[0]);
          const techOpen       = parseInt(schedule.start.split(":")[0]);
          const effectiveOpen  = Math.max(bizOpen, techOpen);
          const effectiveClose = Math.min(bizClose, parseInt(schedule.end.split(":")[0]));

          console.log(`Day: ${dayName}, effectiveOpen: ${effectiveOpen}, effectiveClose: ${effectiveClose}`);

          if (effectiveOpen >= effectiveClose) continue;

          // Get date string in business timezone (YYYY-MM-DD)
          const localDateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric", month: "2-digit", day: "2-digit",
          }).format(date);

          // Create work start/end in business timezone -> convert to UTC
          const workStart = fromZonedTime(
            `${localDateStr} ${String(effectiveOpen).padStart(2, "0")}:00:00`,
            tz
          );
          const workEnd = fromZonedTime(
            `${localDateStr} ${String(effectiveClose).padStart(2, "0")}:00:00`,
            tz
          );

          // Skip if entirely in the past
          if (workEnd < now) continue;

          // Start cursor at workStart or now (whichever is later)
          let cursor = workStart < now ? now : workStart;

          // Round cursor up to next 30-min boundary
          const minutes = cursor.getMinutes();
          if (minutes > 0) {
            cursor = new Date(cursor.getTime() + (30 - (minutes % 30)) * 60 * 1000);
            cursor.setSeconds(0, 0);
          }

          while (cursor < workEnd && (!maxSlots || slots.length < maxSlots)) {
            const slotEnd = new Date(cursor.getTime() + durationMins * 60 * 1000);

            if (slotEnd > workEnd) break;

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
                weekday: "long", month: "long", day: "numeric",
                hour: "numeric", minute: "2-digit",
                timeZone: tz,
              });

              slots.push({
                technician_id:   tech.id,
                technician_name: tech.name,
                slot_start:      cursor.toISOString(),
                slot_end:        slotEnd.toISOString(),
                display,
              });
            }

            cursor = new Date(cursor.getTime() + 30 * 60 * 1000);
          }
        }
      }
    };

    // Always gather available slots across the full 60-day window.
    collectSlots(0, 60);

    if (slots.length === 0) {
      return new Response(JSON.stringify({
        available: false, slots: [],
        message: "We don't have any available slots in the next 60 days. Let me take your details and the owner will call you back to find a time that works.",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Group slots by day for a natural message
    const byDay: Record<string, string[]> = {};
    for (const s of slots) {
      const day = new Date(s.slot_start).toLocaleDateString("en-US", {
        weekday: "long", month: "short", day: "numeric", timeZone: tz,
      });
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(
        new Date(s.slot_start).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: tz,
        })
      );
    }

    // Build compact slotsByDay — day label + array of time strings.
    // This replaces sending raw slot objects (which can be 100KB+ for 60 days
    // and hits Retell's LLM context limit, causing silent truncation to ~7 days).
    const slotsByDay = Object.entries(byDay).map(([day, times]) => ({ day, times }));

    const firstDay  = slotsByDay[0]?.day ?? "";
    const lastDay   = slotsByDay[slotsByDay.length - 1]?.day ?? "";
    const totalDays = slotsByDay.length;

    const message = `Availability loaded for ${totalDays} days from ${firstDay} through ${lastDay}. Present the nearest 3 days to the caller first. Use slotsByDay to answer any specific day or time request — do not say a time is unavailable unless it is truly absent from slotsByDay.`;

    console.log("Total slots found:", slots.length);
    console.log("Total days with availability:", totalDays, "from", firstDay, "to", lastDay);
    console.log("Slots by day:", JSON.stringify(byDay, null, 2));

    return new Response(JSON.stringify({
      available: true,
      slotsByDay,
      message,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("check-availability error:", err);
    await captureException(err, { function: "check-availability" });
    return new Response(JSON.stringify({
      available: false, slots: [],
      message: "I'm having trouble checking availability right now. Let me take your details and someone will call you back.",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});