"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Call {
  id: string;
  caller_phone: string;
  outcome: string;
  duration_seconds: number;
  created_at: string;
  transcript: string | null;
  recording_url: string | null;
  escalated: boolean;
  parsed_job: any;
  customers: { name: string; phone: string } | null;
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  booked:      { label: "Booked",     color: "#10B981", icon: "📅" },
  missed:      { label: "Missed",     color: "#EF4444", icon: "📵" },
  escalated:   { label: "Escalated",  color: "#F59E0B", icon: "⚡" },
  no_answer:   { label: "No answer",  color: "#6B7280", icon: "📞" },
  voicemail:   { label: "Voicemail",  color: "#8B5CF6", icon: "📬" },
  in_progress: { label: "In progress",color: "#0cc0df", icon: "🔄" },
};

export default function CallsPage() {
  const router = useRouter();

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [calls, setCalls]           = useState<Call[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState("all");
  const [selected, setSelected]     = useState<Call | null>(null);
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 20;

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
      await fetchCalls(biz.id, filter, 0);
      setLoading(false);

      // Realtime
      supabase
        .channel("calls-page")
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "calls",
          filter: `business_id=eq.${biz.id}`,
        }, (payload) => {
          setCalls(prev => [payload.new as Call, ...prev]);
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "calls",
          filter: `business_id=eq.${biz.id}`,
        }, (payload) => {
          setCalls(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Call } : c));
          if (selected?.id === payload.new.id) setSelected(prev => ({ ...prev!, ...payload.new as Call }));
        })
        .subscribe();
    }
    load();
  }, [router]);

  async function fetchCalls(bizId: string, outcomeFilter: string, pageNum: number) {
    let query = supabase
      .from("calls")
      .select(`
        id, caller_phone, outcome, duration_seconds, created_at,
        transcript, recording_url, escalated, parsed_job,
        customers (name, phone)
      `)
      .eq("business_id", bizId)
      .order("created_at", { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (outcomeFilter !== "all") {
      query = query.eq("outcome", outcomeFilter);
    }

    const { data } = await query;
    if (pageNum === 0) {
      setCalls((data as any) ?? []);
    } else {
      setCalls(prev => [...prev, ...(data as any) ?? []]);
    }
  }

  async function handleFilter(f: string) {
    setFilter(f);
    setPage(0);
    setSelected(null);
    if (businessId) await fetchCalls(businessId, f, 0);
  }

  async function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    if (businessId) await fetchCalls(businessId, filter, nextPage);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return `Today ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatDuration(secs: number) {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading calls...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>

      <DashboardNav />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>
            Call Log
          </h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>Every call your AI has handled</p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {[
            { key: "all",        label: "All calls" },
            { key: "booked",     label: "Booked" },
            { key: "missed",     label: "Missed" },
            { key: "escalated",  label: "Escalated" },
            { key: "no_answer",  label: "No answer" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => handleFilter(key)}
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

          {/* Calls list */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, overflow: "hidden" }}>
            {calls.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <p style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📞</p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.4rem" }}>No calls yet</p>
                <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>Calls will appear here as your AI handles them</p>
              </div>
            ) : (
              <>
                {calls.map((call, i) => {
                  const cfg = OUTCOME_CONFIG[call.outcome] ?? OUTCOME_CONFIG.no_answer;
                  return (
                    <div key={call.id} onClick={() => setSelected(selected?.id === call.id ? null : call)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        padding: "1rem 1.25rem",
                        borderBottom: i < calls.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                        cursor: "pointer",
                        background: selected?.id === call.id ? "#F0FAFE" : "white",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { if (selected?.id !== call.id) e.currentTarget.style.background = "#F9FAFB"; }}
                      onMouseLeave={e => { if (selected?.id !== call.id) e.currentTarget.style.background = "white"; }}>

                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${cfg.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>
                        {cfg.icon}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>
                          {call.customers?.name ?? call.caller_phone}
                        </p>
                        <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                          {formatTime(call.created_at)} · {formatDuration(call.duration_seconds)}
                        </p>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 100, background: `${cfg.color}15`, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        {call.escalated && (
                          <span style={{ fontSize: "0.68rem", color: "#F59E0B", fontWeight: 600 }}>⚡ Escalated</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {calls.length >= PAGE_SIZE && (
                  <div style={{ padding: "1rem", textAlign: "center", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <button onClick={loadMore}
                      style={{ padding: "0.6rem 1.5rem", background: "transparent", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", cursor: "pointer" }}>
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Call detail panel */}
          {selected && (
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", height: "fit-content", position: "sticky", top: 72 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <div>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "0.25rem" }}>
                    {selected.customers?.name ?? selected.caller_phone}
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>{formatTime(selected.created_at)}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.25rem" }}>×</button>
              </div>

              {/* Call stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
                {[
                  { label: "Duration",   value: formatDuration(selected.duration_seconds) },
                  { label: "Outcome",    value: OUTCOME_CONFIG[selected.outcome]?.label ?? selected.outcome },
                  { label: "Phone",      value: selected.caller_phone },
                  { label: "Job type",   value: selected.parsed_job?.job_type ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem" }}>
                    <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>{label}</p>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A" }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* AI job notes */}
              {selected.parsed_job?.notes && (
                <div style={{ background: "rgba(12,192,223,0.04)", border: "1px solid rgba(12,192,223,0.15)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#0cc0df", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Agent notes</p>
                  <p style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.6 }}>{selected.parsed_job.notes}</p>
                </div>
              )}

              {/* Transcript */}
              {selected.transcript && (
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>Transcript</p>
                  <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "1rem", maxHeight: 300, overflowY: "auto" }}>
                    <p style={{ fontSize: "0.82rem", color: "#6B7280", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                      {selected.transcript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}