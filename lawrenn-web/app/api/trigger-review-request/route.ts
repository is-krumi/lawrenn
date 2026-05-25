import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { job_id } = await request.json();
    console.log("trigger-review-request called with job_id:", job_id);

    if (!job_id) {
      return NextResponse.json({ error: "job_id required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log("Supabase URL:", supabaseUrl);
    console.log("Service key present:", !!serviceKey);

    const url = `${supabaseUrl}/functions/v1/send-review-request`;
    console.log("Calling URL:", url);

    const body = JSON.stringify({ job_id });
    console.log("Sending body:", body);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type":  "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });

    const data = await res.json();
    console.log("Edge function response:", data);
    return NextResponse.json(data);

  } catch (err: any) {
    console.error("trigger-review-request error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}