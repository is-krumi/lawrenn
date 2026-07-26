import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(request: Request) {
  try {
    const { to, from, body, business_id } = await request.json();

    if (!to || !body) {
      return NextResponse.json({ error: "to and body are required" }, { status: 400 });
    }

    // Resolve the from number: use provided value or look it up by business_id
    let fromNumber = from ?? null;
    if (!fromNumber && business_id) {
      const { data: biz } = await adminClient
        .from("businesses")
        .select("twilio_number")
        .eq("id", business_id)
        .single();
      fromNumber = biz?.twilio_number ?? null;
    }

    if (!fromNumber) {
      return NextResponse.json({ error: "No Twilio number configured for this business" }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken  = process.env.TWILIO_AUTH_TOKEN!;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Twilio error:", err);
      return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
    }

    return NextResponse.json({ success: true, from: fromNumber });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
