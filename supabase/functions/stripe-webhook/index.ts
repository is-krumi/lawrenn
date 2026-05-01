import { captureException } from "../_shared/sentry.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const STRIPE_SECRET_KEY     = Deno.env.get("STRIPE_SECRET_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Verify Stripe webhook signature ──────────────────────────────────────────
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts     = signature.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
    const v1        = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !v1) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sig    = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const hexSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hexSig === v1;
  } catch {
    return false;
  }
}

// ── Get tier from Stripe price ID ─────────────────────────────────────────────
function getTierFromPriceId(priceId: string): string {
  // Map your Stripe price IDs to tiers
  // Update these with your actual Stripe price IDs
  const tierMap: Record<string, string> = {
    "price_starter": "starter",
    "price_pro":     "pro",
    "price_growth":  "growth",
  };
  return tierMap[priceId] ?? "pro";
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const payload   = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    // Verify signature
    const isValid = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error("Invalid Stripe signature");
      return new Response("Unauthorized", { status: 403 });
    }

    const event = JSON.parse(payload);
    console.log(`Stripe event received: ${event.type}`);

    switch (event.type) {

      // ── Subscription created ───────────────────────────────────────────────
      case "customer.subscription.created": {
        const subscription   = event.data.object;
        const stripeCustomer = subscription.customer;
        const priceId        = subscription.items?.data?.[0]?.price?.id;
        const tier           = getTierFromPriceId(priceId);
        const trialEnd       = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;

        await supabase
          .from("businesses")
          .update({
            subscription_status: subscription.status === "trialing" ? "trialing" : "active",
            subscription_tier:   tier,
            trial_ends_at:       trialEnd,
          })
          .eq("stripe_customer_id", stripeCustomer);

        break;
      }

      // ── Subscription updated ───────────────────────────────────────────────
      case "customer.subscription.updated": {
        const subscription   = event.data.object;
        const stripeCustomer = subscription.customer;
        const priceId        = subscription.items?.data?.[0]?.price?.id;
        const tier           = getTierFromPriceId(priceId);

        const statusMap: Record<string, string> = {
          active:             "active",
          trialing:           "trialing",
          past_due:           "past_due",
          canceled:           "canceled",
          unpaid:             "suspended",
          incomplete:         "suspended",
          incomplete_expired: "canceled",
          paused:             "suspended",
        };

        await supabase
          .from("businesses")
          .update({
            subscription_status: statusMap[subscription.status] ?? "suspended",
            subscription_tier:   tier,
          })
          .eq("stripe_customer_id", stripeCustomer);

        break;
      }

      // ── Subscription deleted / canceled ────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription   = event.data.object;
        const stripeCustomer = subscription.customer;

        await supabase
          .from("businesses")
          .update({
            subscription_status: "canceled",
          })
          .eq("stripe_customer_id", stripeCustomer);

        break;
      }

      // ── Payment succeeded ──────────────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice        = event.data.object;
        const stripeCustomer = invoice.customer;

        // Make sure account is active after successful payment
        await supabase
          .from("businesses")
          .update({ subscription_status: "active" })
          .eq("stripe_customer_id", stripeCustomer);

        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice        = event.data.object;
        const stripeCustomer = invoice.customer;

        await supabase
          .from("businesses")
          .update({ subscription_status: "past_due" })
          .eq("stripe_customer_id", stripeCustomer);

        // Fetch business to notify owner
        const { data: business } = await supabase
          .from("businesses")
          .select("name, owner_id")
          .eq("stripe_customer_id", stripeCustomer)
          .single();

        if (business) {
          console.log(`Payment failed for business: ${business.name}. Owner should be notified.`);
          // In production: send push notification to owner via Expo Push API
        }

        break;
      }

      // ── Customer created ───────────────────────────────────────────────────
      case "customer.created": {
        const customer = event.data.object;

        // Link Stripe customer ID to business by email match
        if (customer.email) {
          const { data: authUser } = await supabase
            .from("businesses")
            .select("id")
            .eq("stripe_customer_id", null as any)
            .limit(1)
            .single();

          // In production you'd match by email from auth.users
          // For now just log it
          console.log(`New Stripe customer created: ${customer.id} for ${customer.email}`);
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("stripe-webhook error:", err);
    await captureException(err, { function: "stripe-webhook" });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});