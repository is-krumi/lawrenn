import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyBusinessAccess, createUserClient } from "@/lib/api-auth";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// GET /api/documents/signed-url?document_id=X&business_id=Y[&download=true]
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const document_id = searchParams.get("document_id");
  const business_id = searchParams.get("business_id");
  const download    = searchParams.get("download") === "true";

  if (!document_id || !business_id) {
    return NextResponse.json({ error: "document_id and business_id required" }, { status: 400 });
  }

  const auth = await verifyBusinessAccess(request, business_id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // User client with RLS — only returns the document if the user's business owns it
  const db = createUserClient(auth.token);
  const { data: doc } = await db
    .from("documents")
    .select("file_path, name")
    .eq("id", document_id)
    .eq("business_id", business_id)
    .maybeSingle();

  if (!doc?.file_path) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const options = download ? { download: doc.name } : {};
  const { data, error } = await adminClient.storage
    .from("business-documents")
    .createSignedUrl(doc.file_path, 300, options);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, name: doc.name });
}
