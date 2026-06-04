import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://Lawrenn.com/api/auth/google/callback"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

export async function POST(request: Request) {
  try {
    const { slot_start, slot_end, name, email, business, phone } = await request.json();

    if (!slot_start || !slot_end || !name || !email) {
      return NextResponse.json({ error: "slot_start, slot_end, name and email are required" }, { status: 400 });
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Double check slot is still available
    const conflictCheck = await calendar.events.list({
      calendarId:   process.env.GOOGLE_CALENDAR_ID!,
      timeMin:      slot_start,
      timeMax:      slot_end,
      singleEvents: true,
    });

    if ((conflictCheck.data.items ?? []).length > 0) {
      return NextResponse.json({ error: "This slot was just booked. Please choose another time." }, { status: 409 });
    }

    // Create Google Calendar event with Meet link
    const event = await calendar.events.insert({
      calendarId:          process.env.GOOGLE_CALENDAR_ID!,
      conferenceDataVersion: 1,
      requestBody: {
        summary:     `Lawrenn Demo â€” ${name}`,
        description: `Demo call with ${name} from ${business ?? "unknown business"}.\n\nPhone: ${phone ?? "not provided"}\nEmail: ${email}`,
        start: { dateTime: slot_start, timeZone: "America/New_York" },
        end:   { dateTime: slot_end,   timeZone: "America/New_York" },
        attendees: [{ email }],
        conferenceData: {
          createRequest: {
            requestId:  `lawrenn-demo-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 10 },
          ],
        },
      },
    });

    const meetLink     = event.data.hangoutLink ?? "";
    const eventId      = event.data.id ?? "";
    console.log("Calendar event created:", eventId);

    // Save to Supabase
    await supabase.from("demo_bookings").insert({
      slot_start,
      slot_end,
      booker_name:     name,
      booker_email:    email,
      booker_business: business ?? null,
      booker_phone:    phone ?? null,
      meet_link:       meetLink,
      calendar_event_id: eventId,
    });

    // Send confirmation email via Resend
    const slotDisplay = new Date(slot_start).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
    });

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Lawrenn <notifications@lawrenn.com>",
        to:      email,
        subject: `Your Lawrenn Demo is confirmed â€” ${slotDisplay}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
            <div style="background: #0D1B2A; padding: 32px 40px;">
              <h1 style="color: white; font-size: 24px; margin: 0;">
                RENN<span style="color: #111111;">OPS</span>
              </h1>
            </div>
            <div style="padding: 40px;">
              <h2 style="color: #0D1B2A; font-size: 22px; margin-bottom: 8px;">
                Your demo is confirmed! ðŸŽ‰
              </h2>
              <p style="color: #6B7280; font-size: 15px; line-height: 1.7; margin-bottom: 32px;">
                Hi ${name}, we're looking forward to showing you Lawrenn.
              </p>

              <div style="background: #F0FAFE; border: 1.5px solid rgba(12,192,223,0.25); border-radius: 10px; padding: 20px 24px; margin-bottom: 32px;">
                <p style="font-size: 11px; font-weight: 700; color: #111111; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 6px;">Your demo details</p>
                <p style="font-size: 20px; font-weight: 700; color: #0D1B2A; margin: 0 0 4px;">${slotDisplay} ET</p>
                <p style="font-size: 13px; color: #6B7280; margin: 0;">30 minutes Â· Google Meet</p>
              </div>

              <a href="${meetLink}" style="display: inline-block; padding: 14px 28px; background: #111111; border-radius: 8px; color: white; font-weight: 700; font-size: 15px; text-decoration: none; margin-bottom: 32px;">
                Join Google Meet
              </a>

              <p style="color: #6B7280; font-size: 14px; line-height: 1.7;">
                During the demo we'll show you how Lawrenn answers every call, books every job, and follows up on every quote â€” automatically.
              </p>

              <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
                Questions before the call? Reply to this email or text us at <strong>+1 (866) 658-1538</strong>.
              </p>
            </div>
            <div style="padding: 24px 40px; border-top: 1px solid rgba(0,0,0,0.06);">
              <p style="font-size: 12px; color: #9CA3AF; margin: 0;">Â© 2026 Lawrenn. All rights reserved.</p>
            </div>
          </div>
        `,
      }),
    });

    // Notify yourself via SMS
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To:   process.env.DEMO_NOTIFY_PHONE ?? "",
          From: "+18666581538",
          Body: `ðŸŽ¯ New demo booked! ${name} from ${business ?? "unknown"} â€” ${slotDisplay}. Email: ${email}. Meet: ${meetLink}`,
        }),
      }
    );

    // Send Meet link to booker via SMS if they provided a phone number
    if (phone) {
      const firstName = name.split(" ")[0];
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
            "Content-Type":  "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To:   phone,
            From: "+18666581538",
            Body: `Hi ${firstName}! Your Lawrenn Demo is confirmed for ${slotDisplay} ET. Join here: ${meetLink}`,
          }),
        }
      );
    }

    return NextResponse.json({ success: true, meetLink });

  } catch (err: any) {
    console.error("book-demo error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
