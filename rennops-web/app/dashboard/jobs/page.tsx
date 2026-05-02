"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Job {
  id: string;
  type: string;
  status: string;
  slot_start: string;
  slot_end: string;
  amount: number;
  source: string;
  notes: string | null;
  ai_notes: string | null;
  created_at: string;
  customers: { id: string; name: string; phone: string; address: string } | null;
  technicians: { name: string; color: string } | null;
}

const STATUSES = ["booked", "in_progress", "complete", "invoiced", "canceled"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked:      { label: "Booked",      color: "#0cc0df", bg: "rgba(12,192,223,0.08)"  },
  in_progress: { label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.08)"  },
  complete:    { label: "Complete",    color: "#10B981", bg: "rgba(16,185,129,0.08)"  },
  invoiced:    { label: "Invoiced",    color: "#8B5CF6", bg: "rgba(139,92,246,0.08)"  },
  canceled:    { label: "Canceled",    color: "#EF4444", bg: "rgba(239,68,68,0.08)"   },
};

export default function JobsPage() {
  const router = useRouter();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Job | null>(null);
  const [filter, setFilter]         = useState("all");
  const [updating, setUpdating]     = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (!biz) { router.push("/onboarding"); return; }
      setBusinessId(biz.id);

      const { data } = await supabase
        .from("jobs")
        .select(`
          id, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, created_at,
          customers (id, name, phone, address),
          technicians (name, color)
        `)
        .eq("business_id", biz.id)
        .order("slot_start", { ascending: false })
        .limit(50);

      setJobs((data as any) ?? []);
      setLoading(false);

      // Realtime
      supabase
        .channel("jobs-page")
        .on("postgres_changes", {
          event: "*", schema: "public", table: "jobs",
          filter: `business_id=eq.${biz.id}`,
        }, (payload) => {
          if (payload.eventType === "INSERT") {
            setJobs(prev => [payload.new as Job, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new as Job } : j));
            if (selected?.id === payload.new.id) setSelected(prev => ({ ...prev!, ...payload.new as Job }));
          }
        })
        .subscribe();
    }
    load();
  }, [router]);

  async function updateStatus(jobId: string, status: string) {
    setUpdating(true);
    const updates: any = { status };
    if (status === "complete") updates.completed_at = new Date().toISOString();

    await supabase.from("jobs").update(updates).eq("id", jobId);

    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
    if (selected?.id === jobId) setSelected(prev => ({ ...prev!, ...updates }));

    // Trigger review request if completed
    if (status === "complete") {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-review-request`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ job_id: jobId }),
      });
    }

    setUpdating(false);
  }

  async function updateAmount(jobId: string, amount: number) {
    await supabase.from("jobs").update({ amount }).eq("id", jobId);
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, amount } : j));
    if (selected?.id === jobId) setSelected(prev => ({ ...prev!, amount }));
  }

  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);

  function formatSlot(start: string, end: string) {
    const s = new Date(start);
    const e = new Date(end);
    const today     = new Date();
    const tomorrow  = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    let day = "";
    if (s.toDateString() === today.toDateString()) day = "Today";
    else if (s.toDateString() === tomorrow.toDateString()) day = "Tomorrow";
    else day = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const timeStart = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const timeEnd   = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} · ${timeStart} – ${timeEnd}`;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading jobs...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>

      <DashboardNav />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>

        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Jobs</h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>All booked and completed jobs</p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {[{ key: "all", label: "All" }, ...STATUSES.map(s => ({ key: s, label: STATUS_CONFIG[s].label }))].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                padding: "0.45rem 1rem",
                background: filter === key ? "#0D1B2A" : "white",
                border: `1px solid ${filter === key ? "#0D1B2A" : "rgba(0,0,0,0.1)"}`,
                borderRadius: 100,
                color: filter === key ? "white" : "#6B7280",
                fontFamily: "'DM Sans'", fontSize: "0.85rem", fontWeight: 500,
                cursor: "pointer", transition: "all 0.15s",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Split view */}
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: "1.5rem" }}>

          {/* Jobs list */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <p style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.4rem" }}>No jobs yet</p>
                <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>Jobs booked by your AI will appear here</p>
              </div>
            ) : (
              filtered.map((job, i) => {
                const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.booked;
                return (
                  <div key={job.id} onClick={() => setSelected(selected?.id === job.id ? null : job)}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "1rem 1.25rem",
                      borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      cursor: "pointer",
                      background: selected?.id === job.id ? "#F0FAFE" : "white",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (selected?.id !== job.id) e.currentTarget.style.background = "#F9FAFB"; }}
                    onMouseLeave={e => { if (selected?.id !== job.id) e.currentTarget.style.background = "white"; }}>

                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: job.technicians?.color ?? "#0cc0df", flexShrink: 0 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {job.customers?.name ?? "Unknown"} — {job.type}
                      </p>
                      <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                        {formatSlot(job.slot_start, job.slot_end)}
                        {job.technicians?.name ? ` · ${job.technicians.name}` : ""}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 100, background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {job.source === "voice_agent" && (
                        <span style={{ fontSize: "0.68rem", color: "#8B5CF6", fontWeight: 600 }}>AI booked</span>
                      )}
                      {job.amount > 0 && (
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#10B981" }}>${job.amount}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Job detail panel */}
          {selected && (
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", height: "fit-content", position: "sticky", top: 72 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "0.2rem" }}>{selected.type}</h3>
                  <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>{formatSlot(selected.slot_start, selected.slot_end)}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.25rem" }}>×</button>
              </div>

              {/* Customer info */}
              {selected.customers && (
                <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>Customer</p>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.2rem" }}>{selected.customers.name}</p>
                  <p style={{ fontSize: "0.82rem", color: "#6B7280", marginBottom: "0.15rem" }}>{selected.customers.phone}</p>
                  {selected.customers.address && (
                    <p style={{ fontSize: "0.82rem", color: "#6B7280" }}>{selected.customers.address}</p>
                  )}
                </div>
              )}

              {/* Update status */}
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Update status</p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {STATUSES.map(s => {
                    const cfg = STATUS_CONFIG[s];
                    return (
                      <button key={s} onClick={() => updateStatus(selected.id, s)}
                        disabled={updating || selected.status === s}
                        style={{
                          padding: "0.35rem 0.75rem",
                          background: selected.status === s ? cfg.bg : "transparent",
                          border: `1.5px solid ${selected.status === s ? cfg.color : "rgba(0,0,0,0.1)"}`,
                          borderRadius: 100,
                          color: selected.status === s ? cfg.color : "#6B7280",
                          fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 600,
                          cursor: updating || selected.status === s ? "not-allowed" : "pointer",
                          opacity: updating ? 0.6 : 1,
                          transition: "all 0.15s",
                        }}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Job value */}
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Job value</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1rem", color: "#6B7280" }}>$</span>
                  <input
                    type="number"
                    defaultValue={selected.amount || ""}
                    placeholder="0"
                    onBlur={e => updateAmount(selected.id, Number(e.target.value))}
                    style={{ width: "100%", padding: "0.6rem 0.75rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none" }}
                    onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                  />
                </div>
              </div>

              {/* AI notes */}
              {selected.ai_notes && (
                <div style={{ background: "rgba(12,192,223,0.04)", border: "1px solid rgba(12,192,223,0.15)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#0cc0df", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>AI summary</p>
                  <p style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.6 }}>{selected.ai_notes}</p>
                </div>
              )}

              {/* Notes */}
              {selected.notes && (
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Notes</p>
                  <p style={{ fontSize: "0.85rem", color: "#6B7280", lineHeight: 1.6 }}>{selected.notes}</p>
                </div>
              )}

              {/* Source badge */}
              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                  {selected.source === "voice_agent" ? "🤖 Booked by AI" : "✍️ Manually created"}
                </span>
                <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                  {new Date(selected.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}