"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Business {
  id: string;
  name: string;
  subscription_tier: string;
  subscription_status: string;
}

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

  const [business, setBusiness]     = useState<Business | null>(null);
  const [jobs, setJobs]             = useState<Job[]>([]);
  const [calls, setCalls]           = useState<Call[]>([]);
  const [loading, setLoading]       = useState(true);
  const [greeting, setGreeting]     = useState("Good morning");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, subscription_tier, subscription_status")
        .eq("owner_id", user.id)
        .single();

      if (!biz) { router.push("/onboarding"); return; }
      setBusiness(biz);

      // Fetch today's and upcoming jobs
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data: jobsData } = await supabase
        .from("jobs")
        .select(`
          id, type, status, slot_start, slot_end, amount, source,
          customers (name, phone),
          technicians (name, color)
        `)
        .eq("business_id", biz.id)
        .gte("slot_start", todayStart.toISOString())
        .lte("slot_start", weekEnd.toISOString())
        .order("slot_start", { ascending: true })
        .limit(10);

      setJobs((jobsData as any) ?? []);

      // Fetch recent calls
      const { data: callsData } = await supabase
        .from("calls")
        .select(`
          id, caller_phone, outcome, duration_seconds, created_at, transcript,
          customers (name)
        `)
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(6);

      setCalls((callsData as any) ?? []);
      setLoading(false);

      // Realtime subscriptions
    const callsSub = supabase
  .channel("realtime-calls")
  .on("postgres_changes", {
    event:  "INSERT",
    schema: "public",
    table:  "calls",
    filter: `business_id=eq.${biz.id}`,
  }, (payload) => {
    console.log("New call received:", payload);
    setCalls(prev => [payload.new as Call, ...prev].slice(0, 6));
  })
  .on("postgres_changes", {
    event:  "UPDATE",
    schema: "public",
    table:  "calls",
    filter: `business_id=eq.${biz.id}`,
  }, (payload) => {
    console.log("Call updated:", payload);
    setCalls(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Call } : c));
  })
  .subscribe((status) => {
    console.log("Calls subscription status:", status);
  });

     const jobsSub = supabase
  .channel("realtime-jobs")
  .on("postgres_changes", {
    event:  "*",
    schema: "public",
    table:  "jobs",
    filter: `business_id=eq.${biz.id}`,
  }, (payload) => {
    console.log("Job change received:", payload);
  })
  .subscribe((status) => {
    console.log("Jobs subscription status:", status);
  });

      return () => {
        supabase.removeChannel(callsSub);
        supabase.removeChannel(jobsSub);
      };
    }

    let cleanup: (() => void) | undefined;
    load().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [router]);

  // Stats
  const todayJobs    = jobs.filter(j => {
    const d = new Date(j.slot_start);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const weekRevenue  = jobs
    .filter(j => j.status === "complete" || j.status === "invoiced")
    .reduce((sum, j) => sum + (j.amount ?? 0), 0);

  const todayCalls   = calls.filter(c => {
    const d = new Date(c.created_at);
    return d.toDateString() === new Date().toDateString();
  });

  const aiJobsCount  = jobs.filter(j => j.source === "voice_agent").length;
  const aiRate       = jobs.length > 0 ? Math.round((aiJobsCount / jobs.length) * 100) : 0;

  function outcomeColor(outcome: string) {
    const map: Record<string, string> = {
      booked:    "#10B981",
      missed:    "#EF4444",
      escalated: "#F59E0B",
      voicemail: "#6B7280",
      no_answer: "#6B7280",
      in_progress: "#0cc0df",
    };
    return map[outcome] ?? "#6B7280";
  }

  function statusColor(status: string) {
    const map: Record<string, string> = {
      booked:     "#0cc0df",
      in_progress:"#F59E0B",
      complete:   "#10B981",
      canceled:   "#EF4444",
      invoiced:   "#8B5CF6",
    };
    return map[status] ?? "#6B7280";
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatDuration(secs: number) {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", color: "#0D1B2A", marginBottom: "1rem" }}>
            RENN<span style={{ color: "#0cc0df" }}>OPS</span>
          </div>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>

      <DashboardNav businessName={business?.name} />

      {/* Main content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 2rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>
            {greeting} 👋
          </h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>
            Here's what's happening with {business?.name} today.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
          {[
            { label: "Calls today",      value: todayCalls.length,           sub: "AI answered",        color: "#0cc0df" },
            { label: "Jobs this week",   value: jobs.length,                 sub: `${aiRate}% via AI`,  color: "#8B5CF6" },
            { label: "Revenue this week",value: `$${weekRevenue.toLocaleString()}`, sub: "completed jobs", color: "#10B981" },
            { label: "Today's jobs",     value: todayJobs.length,            sub: "scheduled",          color: "#F59E0B" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.25rem 1.5rem" }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>{label}</p>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: "2.2rem", letterSpacing: "0.02em", color, lineHeight: 1, marginBottom: "0.25rem" }}>{value}</div>
              <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* Two column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

          {/* Upcoming jobs */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A" }}>Upcoming jobs</h2>
              <a href="/dashboard/jobs" style={{ fontSize: "0.8rem", color: "#0cc0df", textDecoration: "none", fontWeight: 600 }}>View all →</a>
            </div>

            {jobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📅</p>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No upcoming jobs this week</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {jobs.slice(0, 5).map(job => (
                  <div key={job.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "#F9FAFB", borderRadius: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: job.technicians?.color ?? "#0cc0df", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {job.customers?.name ?? "Unknown"} — {job.type}
                      </p>
                      <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                        {formatDate(job.slot_start)} · {formatTime(job.slot_start)}
                        {job.technicians?.name ? ` · ${job.technicians.name}` : ""}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 100, background: `${statusColor(job.status)}15`, color: statusColor(job.status) }}>
                        {job.status}
                      </span>
                      {job.source === "voice_agent" && (
                        <span style={{ fontSize: "0.68rem", color: "#8B5CF6", fontWeight: 600 }}>AI booked</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent calls */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A" }}>Recent calls</h2>
              <a href="/dashboard/calls" style={{ fontSize: "0.8rem", color: "#0cc0df", textDecoration: "none", fontWeight: 600 }}>View all →</a>
            </div>

            {calls.length === 0 ? (
              <div style={{ textAlign: "center", padding: "2rem 0" }}>
                <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📞</p>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No calls yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {calls.map(call => (
                  <div key={call.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "#F9FAFB", borderRadius: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${outcomeColor(call.outcome)}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>
                      {call.outcome === "booked" ? "📅" : call.outcome === "missed" ? "📵" : call.outcome === "escalated" ? "⚡" : "📞"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>
                        {call.customers?.name ?? call.caller_phone}
                      </p>
                      <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                        {formatTime(call.created_at)} · {formatDuration(call.duration_seconds)}
                      </p>
                    </div>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 100, background: `${outcomeColor(call.outcome)}15`, color: outcomeColor(call.outcome), whiteSpace: "nowrap" }}>
                      {call.outcome}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI capture banner */}
        {aiRate > 0 && (
          <div style={{ marginTop: "1.5rem", background: "linear-gradient(135deg, #0D1B2A, #1a3a5c)", borderRadius: 12, padding: "1.5rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(12,192,223,0.8)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>AI performance this week</p>
              <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "white" }}>
                Your AI answered calls and booked <span style={{ color: "#0cc0df" }}>{aiJobsCount} job{aiJobsCount !== 1 ? "s" : ""}</span> automatically
              </p>
            </div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3rem", color: "#0cc0df", letterSpacing: "0.02em" }}>
              {aiRate}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}