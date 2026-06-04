import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY       = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    const { job_id, business_id, customer_id } = await req.json();

    if (!job_id || !business_id) {
      return new Response(JSON.stringify({ error: "job_id and business_id required" }), { status: 400 });
    }

    // Fetch the job with customer details
    const { data: job } = await supabase
      .from("jobs")
      .select("type, status, slot_start, amount, notes, ai_notes, customers(name, phone, address)")
      .eq("id", job_id)
      .single();

    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), { status: 404 });
    }

    const customerName = (job.customers as any)?.name ?? "Unknown";
    const slot = job.slot_start
      ? new Date(job.slot_start).toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
        })
      : null;

    const content = [
      `Matter: ${job.type} (${job.status})`,
      slot ? `Scheduled: ${slot}` : null,
      job.amount ? `Fee: $${job.amount}` : null,
      `Client: ${customerName}`,
      (job.customers as any)?.phone ? `Phone: ${(job.customers as any).phone}` : null,
      (job.customers as any)?.address ? `Address: ${(job.customers as any).address}` : null,
      job.notes ? `Notes: ${job.notes}` : null,
      job.ai_notes ? `Summary: ${job.ai_notes}` : null,
    ].filter(Boolean).join("\n");

    // Generate embedding
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: content }),
    });

    const embData = await embRes.json();
    const embedding = embData.data?.[0]?.embedding;

    if (!embedding) {
      return new Response(JSON.stringify({ error: "Embedding generation failed" }), { status: 500 });
    }

    // Upsert so re-running after edits replaces the old embedding
    await supabase.from("embeddings").upsert({
      business_id,
      source_type: "job",
      source_id:   job_id,
      content,
      embedding:   JSON.stringify(embedding),
      customer_id: customer_id ?? null,
    }, { onConflict: "source_type,source_id" });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err) {
    console.error("embed-job error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
