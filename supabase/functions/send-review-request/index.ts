import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    let job_id: string | null = null;

    const text = await req.text();
    console.log("Raw body received:", text);
    try {
      const body = JSON.parse(text);
      job_id = body.job_id ?? null;
    } catch {
      console.error("Failed to parse body as JSON:", text);
    }

    console.log("job_id received:", job_id);

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch job with customer and business info
    const { data: job } = await supabase
      .from("jobs")
      .select(`
        id,
        business_id,
        customer_id,
        type,
        completed_at,
        technician_id,
        customers (
          id,
          name,
          phone,
          email,
          sms_opted_out,
          dissatisfied
        ),
        technicians (
          name
        ),
        businesses (
          id,
          name,
          google_review_url,
          settings,
          timezone
        )
      `)
      .eq("id", job_id)
      .single();

    if (!job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const customer = job.customers as any;
    const business = job.businesses as any;
    const tech     = job.technicians as any;

    // Do not send if customer is dissatisfied
    if (customer?.dissatisfied) {
      return new Response(
        JSON.stringify({ skipped: "Customer marked as dissatisfied" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Do not send if customer opted out of SMS
    if (customer?.sms_opted_out) {
      return new Response(
        JSON.stringify({ skipped: "Customer opted out of SMS" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if review request already sent for this job via SMS
    const { data: existingSMS } = await supabase
      .from("review_requests")
      .select("id")
      .eq("job_id", job_id)
      .eq("channel", "sms")
      .single();

    if (existingSMS) {
      return new Response(
        JSON.stringify({ skipped: "Review request already sent via SMS" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check review delay from business settings (default 2 hours)
    const reviewDelayHrs = business?.settings?.review_delay_hrs ?? 2;
    const completedAt    = new Date(job.completed_at);
    const sendAfter      = new Date(completedAt.getTime() + reviewDelayHrs * 60 * 60 * 1000);

    if (new Date() < sendAfter) {
      return new Response(
        JSON.stringify({
          skipped: `Review request not due yet. Send after ${sendAfter.toISOString()}`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const reviewUrl  = business?.google_review_url ?? "";
    const techName   = tech?.name ?? "Our technician";
    const customerName = customer?.name ?? "there";
    const businessName = business?.name ?? "us";
    const jobType    = job.type ?? "service";

    // Send SMS review request
    const notifRes = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        type:        "review_request",
        channel:     "sms",
        customer_id: customer.id,
        job_id:      job.id,
        business_id: job.business_id,
        template_data: {
          customerName,
          businessName,
          jobType,
          slotStart: "",
          techName,
          reviewUrl,
        },
      }),
    });

    if (!notifRes.ok) {
      throw new Error(`Failed to send review request SMS: ${await notifRes.text()}`);
    }

    // Log review request
    await supabase
      .from("review_requests")
      .insert({
        business_id: job.business_id,
        job_id:      job.id,
        customer_id: customer.id,
        channel:     "sms",
      });

    // Schedule email follow-up at +48hrs if customer has email
    if (customer?.email) {
      const emailSendAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // Check if email review request already exists
      const { data: existingEmail } = await supabase
        .from("review_requests")
        .select("id")
        .eq("job_id", job_id)
        .eq("channel", "email")
        .single();

      if (!existingEmail) {
        // Store a pending email touch in quote_touches pattern
        // In production you'd use a dedicated scheduled_notifications table
        // For MVP we insert directly and rely on a cron to pick it up
        await supabase
          .from("review_requests")
          .insert({
            business_id: job.business_id,
            job_id:      job.id,
            customer_id: customer.id,
            channel:     "email",
            sent_at:     emailSendAt.toISOString(),
          });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Review request sent" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("send-review-request error:", err);
    await captureException(err, { function: "send-review-request" });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});