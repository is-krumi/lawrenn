import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureException } from "../_shared/sentry.ts";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER")!;
const RESEND_API_KEY     = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY     = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── SMS via Twilio ────────────────────────────────────────────────────────────
async function sendSMS(to: string, body: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }),
  });
  return res.ok;
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "RennOps <notifications@rennops.com>",
      to,
      subject,
      html,
    }),
  });
  return res.ok;
}

async function generateAndStoreEmbedding(
  businessId: string,
  sourceId: string,
  content: string
) {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: content,
      }),
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
      });
    }
  } catch (err) {
    console.error("Notification embedding failed (non-critical):", err);
  }
}

// ── Message templates ─────────────────────────────────────────────────────────
function getTemplate(type: string, data: Record<string, string>): { sms: string; subject: string; html: string } {
  const { customerName, techName, jobType, slotStart, businessName, reviewUrl } = data;

  const templates: Record<string, { sms: string; subject: string; html: string }> = {
    booking_confirmation: {
      sms: `Hi ${customerName}, your ${jobType} appointment with ${businessName} is confirmed for ${slotStart}. We'll send a reminder the day before.`,
      subject: `Booking Confirmed — ${jobType}`,
      html: `<p>Hi ${customerName},</p><p>Your <b>${jobType}</b> appointment with <b>${businessName}</b> is confirmed for <b>${slotStart}</b>.</p><p>We'll send you a reminder the day before.</p>`,
    },
    reminder_24hr: {
      sms: `Hi ${customerName}, just a reminder — your ${jobType} appointment with ${businessName} is tomorrow at ${slotStart}. Reply STOP to opt out.`,
      subject: `Reminder: Your appointment is tomorrow`,
      html: `<p>Hi ${customerName},</p><p>Your <b>${jobType}</b> appointment with <b>${businessName}</b> is <b>tomorrow at ${slotStart}</b>.</p>`,
    },
    en_route: {
      sms: `Hi ${customerName}, ${techName} from ${businessName} is on the way and will arrive shortly.`,
      subject: `Your technician is on the way`,
      html: `<p>Hi ${customerName},</p><p><b>${techName}</b> from <b>${businessName}</b> is on the way and will arrive shortly.</p>`,
    },
    job_complete: {
      sms: `Hi ${customerName}, ${techName} has completed your ${jobType} service. Thank you for choosing ${businessName}!`,
      subject: `Service Complete`,
      html: `<p>Hi ${customerName},</p><p>Your <b>${jobType}</b> service has been completed. Thank you for choosing <b>${businessName}</b>!</p>`,
    },
    review_request: {
      sms: `Hi ${customerName}, ${techName} from ${businessName} just completed your ${jobType} service. Would you mind leaving a quick review? ${reviewUrl}`,
      subject: `How did we do?`,
      html: `<p>Hi ${customerName},</p><p>We hope you're happy with your <b>${jobType}</b> service from <b>${businessName}</b>.</p><p>Would you mind leaving us a quick review? It means a lot to us.</p><p><a href="${reviewUrl}">Leave a Review</a></p>`,
    },
    quote_touch: {
      sms: `Hi ${customerName}, just checking in on the quote we sent you from ${businessName}. Any questions? Reply here or call us anytime.`,
      subject: `Following up on your quote`,
      html: `<p>Hi ${customerName},</p><p>We wanted to follow up on the quote we sent you. Do you have any questions? We're happy to help.</p>`,
    },
    invoice_sent: {
      sms: `Hi ${customerName}, your invoice from ${businessName} for your ${jobType} service has been sent to your email.`,
      subject: `Your invoice from ${businessName}`,
      html: `<p>Hi ${customerName},</p><p>Your invoice for <b>${jobType}</b> from <b>${businessName}</b> is attached.</p>`,
    },
  };

  return templates[type] ?? {
    sms: `Message from ${businessName}`,
    subject: `Message from ${businessName}`,
    html: `<p>Message from <b>${businessName}</b></p>`,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const {
      type,
      channel,
      customer_id,
      job_id,
      business_id,
      template_data,
    } = await req.json();

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("phone, email, sms_opted_out")
      .eq("id", customer_id)
      .single();

    if (!customer) {
      return new Response(JSON.stringify({ error: "Customer not found" }), { status: 404 });
    }

    // Check opt-out for SMS
    if (channel === "sms" && customer.sms_opted_out) {
      return new Response(JSON.stringify({ skipped: "Customer opted out of SMS" }), { status: 200 });
    }

    const template = getTemplate(type, template_data);
    let success = false;
    let smsBody = template.sms;

    if (channel === "sms" && customer.phone) {
      // Append opt-out footer on the very first SMS to this customer
      const { count } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", customer_id)
        .eq("channel", "sms");

      const isFirstSMS = (count ?? 0) === 0;
      smsBody = isFirstSMS
        ? `${template.sms}\n\nReply STOP to opt out.`
        : template.sms;

      success = await sendSMS(customer.phone, smsBody);
    } else if (channel === "email" && customer.email) {
      success = await sendEmail(customer.email, template.subject, template.html);
    }

    // Log notification
    if (success) {
      const { data: logEntry } = await supabase
        .from("notification_log")
        .insert({
          business_id,
          job_id:      job_id ?? null,
          customer_id,
          type,
          channel,
          body: channel === "sms" ? smsBody : template.html,
        })
        .select("id")
        .single();

      // Also store in messages table for dashboard visibility
      if (channel === "sms") {
        const { data: biz } = await supabase
          .from("businesses")
          .select("twilio_number")
          .eq("id", business_id)
          .single();

        const { data: msgEntry } = await supabase
          .from("messages")
          .insert({
            business_id,
            customer_id,
            direction:   "outbound",
            channel:     "sms",
            body:        smsBody,
            from_number: biz?.twilio_number ?? null,
            to_number:   customer.phone,
            read:        true,
          })
          .select("id")
          .single();

        // Embed the outbound notification
        if (msgEntry) {
          const embeddingContent = `
Outbound ${type} SMS to ${template_data.customerName ?? "customer"}:
"${smsBody}"
Type: ${type}
Customer phone: ${customer.phone}
          `.trim();

          await generateAndStoreEmbedding(business_id, msgEntry.id, embeddingContent);
        }
      }
    }

    return new Response(JSON.stringify({ success }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await captureException(err, { function: "send-notification" });
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});