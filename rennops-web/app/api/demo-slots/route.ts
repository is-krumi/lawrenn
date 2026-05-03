import { NextResponse } from "next/server";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "https://rennops.com/api/auth/google/callback"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

export async function GET() {
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const now      = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const eventsRes = await calendar.events.list({
      calendarId:   process.env.GOOGLE_CALENDAR_ID!,
      timeMin:      now.toISOString(),
      timeMax:      twoWeeks.toISOString(),
      singleEvents: true,
      orderBy:      "startTime",
    });

    const existingEvents = eventsRes.data.items ?? [];
    const slots: { start: string; end: string; display: string }[] = [];
    const tz = "America/New_York";

    for (let d = 0; d < 14; d++) {
      const date = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

      const dayName = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short"
      }).format(date).toLowerCase();

      if (dayName === "sat" || dayName === "sun") continue;

      // Get date string in Eastern timezone
      const localDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(date);

      for (let hour = 9; hour < 17; hour++) {
        for (const min of [0, 30]) {
          // Try EDT (-4) first, then EST (-5), pick the one where Eastern hour matches
          const etDate    = new Date(`${localDateStr}T${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-04:00`);
          const etDateEST = new Date(`${localDateStr}T${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-05:00`);

          const checkFormatter = new Intl.DateTimeFormat("en-US", {
            timeZone: tz, hour: "numeric", hour12: false,
          });
          const edtHour = parseInt(checkFormatter.format(etDate));

          const slotStart = edtHour === hour ? etDate : etDateEST;
          const slotEnd   = new Date(slotStart.getTime() + 30 * 60 * 1000);

          if (slotStart < now) continue;

          const hasConflict = existingEvents.some(event => {
            const eStart = new Date(event.start?.dateTime ?? event.start?.date ?? "");
            const eEnd   = new Date(event.end?.dateTime ?? event.end?.date ?? "");
            return slotStart < eEnd && slotEnd > eStart;
          });

          if (!hasConflict) {
            slots.push({
              start:   slotStart.toISOString(),
              end:     slotEnd.toISOString(),
              display: slotStart.toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
                hour: "numeric", minute: "2-digit", timeZone: tz,
              }),
            });
          }
        }
      }
    }

    return NextResponse.json({ slots }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });

  } catch (err: any) {
    console.error("demo-slots error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}