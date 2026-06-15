"use client";

import { useBusiness } from "@/context/BusinessContext";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  customers: { name: string; phone: string } | null;
  technicians: { name: string; color: string } | null;
}

interface Call {
  id: string;
  caller_phone: string;
  outcome: string;
  duration_seconds: number;
  created_at: string;
  transcript: string | null;
  customers: { name: string } | null;
}

export default function Dashboard() {
  const router = useRouter();

  const { businessId, businessName, loading: bizLoading } = useBusiness();
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [calls, setCalls]             = useState<Call[]>([]);
  const [mattersCount, setMattersCount] = useState(0);
  const [callsTodayCount, setCallsTodayCount] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    async function load() {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [
        { data: jobsData },
        { data: callsData },
        { count: mattersThisWeek },
        { count: callsToday },
      ] = await Promise.all([
        // Upcoming scheduled matters for the list
        supabase
          .from("jobs")
          .select(`id, type, status, slot_start, slot_end, amount, source, customers (name, phone), technicians (name, color)`)
          .eq("business_id", businessId)
          .gte("slot_start", todayStart.toISOString())
          .order("slot_start", { ascending: true })
          .limit(10),
        // Recent calls for the list
        supabase
          .from("calls")
          .select(`id, caller_phone, outcome, duration_seconds, created_at, transcript, customers (name)`)
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(6),
        // Stat: all matters created this week (regardless of slot_start)
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .gte("created_at", weekStart.toISOString()),
        // Stat: calls today
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .gte("created_at", todayStart.toISOString())
          .lte("created_at", todayEnd.toISOString()),
      ]);

      setJobs((jobsData as any) ?? []);
      setCalls((callsData as any) ?? []);
      setMattersCount(mattersThisWeek ?? 0);
      setCallsTodayCount(callsToday ?? 0);
      setLoading(false);
    }
    load();

    const callsSub = supabase
      .channel(`dashboard-calls-${businessId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `business_id=eq.${businessId}` }, () => {
        load();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `business_id=eq.${businessId}` }, (payload) => {
        setCalls(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Call } : c));
      })
      .subscribe();

    const jobsSub = supabase
      .channel(`dashboard-jobs-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `business_id=eq.${businessId}` }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(callsSub);
      supabase.removeChannel(jobsSub);
    };
  }, [businessId, bizLoading, router]);

  const todayJobs = jobs.filter(j => {
    const d = new Date(j.slot_start);
    return d.toDateString() === new Date().toDateString();
  });

  const todayCalls = calls.filter(c => {
    return new Date(c.created_at).toDateString() === new Date().toDateString();
  });

  const aiJobsCount = jobs.filter(j => j.source === "voice_agent").length;
  const aiRate      = jobs.length > 0 ? Math.round((aiJobsCount / jobs.length) * 100) : 0;

  function outcomeStyle(outcome: string): { color: string; bg: string } {
    const map: Record<string, { color: string; bg: string }> = {
      booked:      { color: "#166534", bg: "rgba(22,101,52,0.07)"  },
      missed:      { color: "#991B1B", bg: "rgba(153,27,27,0.07)"  },
      escalated:   { color: "#92400E", bg: "rgba(146,64,14,0.07)"  },
      voicemail:   { color: "#374151", bg: "rgba(0,0,0,0.05)"      },
      no_answer:   { color: "#374151", bg: "rgba(0,0,0,0.05)"      },
      in_progress: { color: "#374151", bg: "rgba(0,0,0,0.05)"      },
    };
    return map[outcome] ?? { color: "#374151", bg: "rgba(0,0,0,0.05)" };
  }

  function statusStyle(status: string): { color: string; bg: string } {
    const map: Record<string, { color: string; bg: string }> = {
      booked:      { color: "#374151", bg: "rgba(0,0,0,0.05)"      },
      in_progress: { color: "#92400E", bg: "rgba(146,64,14,0.07)"  },
      complete:    { color: "#166534", bg: "rgba(22,101,52,0.07)"  },
      canceled:    { color: "#991B1B", bg: "rgba(153,27,27,0.07)"  },
      invoiced:    { color: "#5B21B6", bg: "rgba(91,33,182,0.07)"  },
    };
    return map[status] ?? { color: "#374151", bg: "rgba(0,0,0,0.05)" };
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today    = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString())    return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatDuration(secs: number) {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", color: "#111111", marginBottom: "1rem", letterSpacing: "0.08em" }}>
            LAW<span style={{ color: "rgba(17,17,17,0.3)" }}>RENN</span>
          </div>
          <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const divider: React.CSSProperties = { height: 1, background: "rgba(0,0,0,0.06)" };

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "2.5rem 2rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2.5rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#111111", marginBottom: "0.2rem" }}>
            {greeting}
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
            {businessName} &middot; here&apos;s what&apos;s happening today
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "rgba(0,0,0,0.07)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden", marginBottom: "2.5rem" }}>
          {[
            { label: "Calls today",       value: callsTodayCount,  sub: "AI answered"        },
            { label: "Matters this week", value: mattersCount,      sub: `${aiRate}% via AI`  },
            { label: "Today's schedule",  value: todayJobs.length, sub: "matters scheduled"  },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: "white", padding: "1.5rem 1.25rem" }}>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.6rem" }}>{label}</p>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: "2.4rem", letterSpacing: "0.02em", color: "#111111", lineHeight: 1, marginBottom: "0.3rem" }}>{value}</div>
              <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Two column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          {/* Upcoming matters */}
          <div style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <h2 style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111111", textTransform: "uppercase", letterSpacing: "0.08em" }}>Upcoming matters</h2>
              <a href="/dashboard/jobs" style={{ fontSize: "0.78rem", color: "#111111", textDecoration: "none", fontWeight: 500, opacity: 0.5 }}>View all</a>
            </div>

            {jobs.length === 0 ? (
              <div style={{ padding: "2.5rem 1.25rem", textAlign: "center" }}>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No matters scheduled this week</p>
              </div>
            ) : (
              <div>
                {jobs.slice(0, 5).map((job, i) => {
                  const st = statusStyle(job.status);
                  return (
                    <div key={job.id}>
                      {i > 0 && <div style={divider} />}
                      <div
                        onClick={() => router.push(`/dashboard/jobs?job=${job.id}`)}
                        style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.875rem 1.25rem", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F0")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", marginBottom: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.customers?.name ?? "Unknown"} &mdash; {job.type}
                          </p>
                          <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                            {formatDate(job.slot_start)} &middot; {formatTime(job.slot_start)}
                            {job.technicians?.name ? ` · ${job.technicians.name}` : ""}
                          </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                          <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 4, background: st.bg, color: st.color, textTransform: "capitalize" }}>
                            {job.status.replace("_", " ")}
                          </span>
                          {job.source === "voice_agent" && (
                            <span style={{ fontSize: "0.68rem", color: "#9CA3AF", fontWeight: 500 }}>AI booked</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div style={{ border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              <h2 style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111111", textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent calls</h2>
              <a href="/dashboard/calls" style={{ fontSize: "0.78rem", color: "#111111", textDecoration: "none", fontWeight: 500, opacity: 0.5 }}>View all</a>
            </div>

            {calls.length === 0 ? (
              <div style={{ padding: "2.5rem 1.25rem", textAlign: "center" }}>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No calls yet</p>
              </div>
            ) : (
              <div>
                {calls.map((call, i) => {
                  const oc = outcomeStyle(call.outcome);
                  return (
                    <div key={call.id}>
                      {i > 0 && <div style={divider} />}
                      <div
                        onClick={() => router.push(`/dashboard/calls?call=${call.id}`)}
                        style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.875rem 1.25rem", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F0")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", marginBottom: "0.15rem" }}>
                            {call.customers?.name ?? call.caller_phone}
                          </p>
                          <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                            {formatTime(call.created_at)} &middot; {formatDuration(call.duration_seconds)}
                          </p>
                        </div>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 4, background: oc.bg, color: oc.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
                          {call.outcome.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* AI performance */}
        {aiRate > 0 && (
          <div style={{ marginTop: "1.5rem", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.5rem 1.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.3rem" }}>AI performance this week</p>
              <p style={{ fontSize: "0.975rem", fontWeight: 500, color: "#111111" }}>
                Your AI assistant booked {aiJobsCount} matter{aiJobsCount !== 1 ? "s" : ""} automatically
              </p>
            </div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "2.8rem", color: "#111111", letterSpacing: "0.02em", opacity: 0.15 }}>
              {aiRate}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
