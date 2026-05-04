import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.redirect(new URL("/unsubscribe?error=missing", request.url));
    }

    // 2. Update the leads table — mark as unsubscribed and change status
    await supabase
      .from("leads")
      .update({
        unsubscribed: true,
        unsubscribed_at: new Date().toISOString(),
        status: "unsubscribed",
      })
      .eq("owner_email", email);

    return NextResponse.redirect(
      new URL(
        `/unsubscribe?success=true&email=${encodeURIComponent(email)}`,
        request.url
      )
    );
  } catch (err: any) {
    console.error("Unsubscribe error:", err);
    return NextResponse.redirect(new URL("/unsubscribe?error=true", request.url));
  }
}