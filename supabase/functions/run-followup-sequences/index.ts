import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    const now = new Date().toISOString();

    // Fetch all pending touches that are due
    const { data: dueTouches, error } = await supabase
      .from("quote_touches")
      .select(`
        id,
        quote_id,
        business_id,
        touch_number,
        channel,
        quotes (
          id,
          status,
          amount,
          customer_id,
          job_id,
          customers (
            id,
            name,
            phone,
            email,
            sms_opted_out
          ),
          businesses (
            id,
            name,
            google_review_url
          )
        )
      `)
      .eq("status", "pending")
      .lte("scheduled_at", now);

    if (error) throw error;

    if (!dueTouches || dueTouches.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No due touches found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let skipped   = 0;

    for (const touch of dueTouches) {
      const quote    = touch.quotes as any;
      const customer = quote?.customers as any;
      const business = quote?.businesses as any;

      // Skip if quote is no longer in sent status
      if (quote?.status !== "sent") {
        await supabase
          .from("quote_touches")
          .update({ status: "canceled" })
          .eq("id", touch.id);
        skipped++;
        continue;
      }

      // Skip if customer opted out of SMS
      if (touch.channel === "sms" && customer?.sms_opted_out) {
        await supabase
          .from("quote_touches")
          .update({ status: "paused" })
          .eq("id", touch.id);
        skipped++;
        continue;
      }

      // Touch 4 — notify owner instead of customer
      if (touch.touch_number === 4) {
        // Get owner's expo push token
        const { data: ownerBusiness } = await supabase
          .from("businesses")
          .select("owner_id")
          .eq("id", touch.business_id)
          .single();

        if (ownerBusiness) {
          // In a full implementation you'd fetch the expo push token
          // from a push_tokens table and send via Expo Push API
          console.log(`Touch 4: notify owner for business ${touch.business_id} about quote ${quote.id}`);
        }

        await supabase
          .from("quote_touches")
          .update({ status: "sent", sent_at: now })
          .eq("id", touch.id);

        processed++;
        continue;
      }

      // Get message template based on touch number
      const templates: Record<number, { sms: string; subject: string; type: string }> = {
        1: {
          type:    "quote_touch",
          sms:     `Hi ${customer?.name ?? "there"}, just checking in on the quote we sent from ${business?.name}. Any questions? Reply here anytime.`,
          subject: "Following up on your quote",
        },
        2: {
          type:    "quote_touch",
          sms:     `Hi ${customer?.name ?? "there"}, we wanted to follow up on your quote from ${business?.name}. We'd love to help — let us know if you have any questions.`,
          subject: `Your quote from ${business?.name}`,
        },
        3: {
          type:    "quote_touch",
          sms:     `Hi ${customer?.name ?? "there"}, this is a final follow-up on your quote from ${business?.name}. Our schedule is filling up — reply to confirm or let us know if you need more time.`,
          subject: "Final follow-up on your quote",
        },
      };

      const template = templates[touch.touch_number];
      if (!template) continue;

      // Send via send-notification function
      const notifRes = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          type:        template.type,
          channel:     touch.channel,
          customer_id: customer?.id,
          job_id:      quote?.job_id ?? null,
          business_id: touch.business_id,
          template_data: {
            customerName: customer?.name ?? "there",
            businessName: business?.name ?? "",
            jobType:      "",
            slotStart:    "",
            techName:     "",
            reviewUrl:    business?.google_review_url ?? "",
          },
        }),
      });

      if (notifRes.ok) {
        // Mark touch as sent
        await supabase
          .from("quote_touches")
          .update({ status: "sent", sent_at: now })
          .eq("id", touch.id);
        processed++;
      } else {
        console.error(`Failed to send touch ${touch.id}:`, await notifRes.text());
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed, skipped }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("run-followup-sequences error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});