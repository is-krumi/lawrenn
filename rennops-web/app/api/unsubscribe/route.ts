import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL1!,
    process.env.SUPABASE_SERVICE_ROLE_KEY1!
  );

  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.redirect(new URL("/unsubscribe?error=missing", request.url));
    }

    // Update the leads table — mark as unsubscribed and change status
    const { error, count } = await supabase
      .from("leads")
      .update({
        unsubscribed: true,
        unsubscribed_at: new Date().toISOString(),
        status: "unsubscribed",
      })
      .eq("owner_email", email);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.redirect(new URL("/unsubscribe?error=true", request.url));
    }

    console.log(`Unsubscribed ${email}, rows affected: ${count}`);

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