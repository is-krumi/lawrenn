"use client";

import { useBusiness } from "@/context/BusinessContext";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Job {
  id: string;
  name: string | null;
  type: string;
  status: string;
  slot_start: string;
  slot_end: string;
  amount: number;
  source: string;
  notes: string | null;
  ai_notes: string | null;
  created_at: string;
  updated_at: string | null;
  customers: { id: string; name: string; phone: string; address: string } | null;
  technicians: { name: string; color: string } | null;
  technician_id: string | null;
}

const STATUSES = ["booked", "in_progress", "complete", "invoiced", "canceled"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked:      { label: "Scheduled",   color: "#374151", bg: "rgba(0,0,0,0.05)"      },
  in_progress: { label: "Active",      color: "#92400E", bg: "rgba(146,64,14,0.07)"  },
  complete:    { label: "Closed",      color: "#166534", bg: "rgba(22,101,52,0.07)"  },
  invoiced:    { label: "Billed",      color: "#5B21B6", bg: "rgba(91,33,182,0.07)"  },
  canceled:    { label: "Dismissed",   color: "#991B1B", bg: "rgba(153,27,27,0.07)"  },
};

const inputSt: CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "#F5F5F0",
  border: "1.5px solid rgba(0,0,0,0.1)",
  borderRadius: 8,
  color: "#111111",
  fontFamily: "'DM Sans'",
  fontSize: "0.9rem",
  outline: "none",
  boxSizing: "border-box",
};

function MattersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calendarWrapRef = useRef<HTMLDivElement | null>(null);
  const hoverCellRef = useRef<HTMLDivElement | null>(null);
  const { businessId, settings, loading: bizLoading } = useBusiness();

  const [jobs, setJobs]                 = useState<Job[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState("all");
  const [view, setView]                 = useState<"list" | "calendar">("list");
  const [activeTab,      setActiveTab]      = useState<"all" | "mine" | "favorites">("all");
  const [myTechnicianId, setMyTechnicianId] = useState<string | null>(null);
  const [favoriteIds,    setFavoriteIds]    = useState<Set<string>>(new Set());
  const [showAddJob, setShowAddJob]     = useState(false);
  const [services, setServices]         = useState<{ name: string }[]>([]);
  const [technicians, setTechnicians]   = useState<{ id: string; name: string; color: string }[]>([]);
  const [customers, setCustomers]       = useState<{ id: string; name: string; phone: string }[]>([]);
  const [newJob, setNewJob]             = useState({
    customer_id: "",
    customer_first_name: "",
    customer_last_name: "",
    customer_phone: "",
    job_type: "",
    slot_start: "",
    duration_mins: 120,
    technician_id: "",
    notes: "",
  });
  const [addingJob, setAddingJob]       = useState(false);
  const [jobError, setJobError]         = useState("");
  const [newCustomer, setNewCustomer]   = useState(false);

  useEffect(() => {
    if (view !== "calendar") return;

    const wrapper = calendarWrapRef.current;
    const hoverEl = hoverCellRef.current;
    if (!wrapper || !hoverEl) return;

    const setHidden = () => { hoverEl.style.opacity = "0"; };

    const renderMonthHover = (target: HTMLElement, wrapperRect: DOMRect) => {
      const dayCell = target.closest(".fc-daygrid-day") as HTMLElement | null;
      if (!dayCell) { setHidden(); return; }

      const rect = dayCell.getBoundingClientRect();
      hoverEl.style.left   = `${rect.left - wrapperRect.left + wrapper.scrollLeft}px`;
      hoverEl.style.top    = `${rect.top - wrapperRect.top + wrapper.scrollTop}px`;
      hoverEl.style.width  = `${rect.width}px`;
      hoverEl.style.height = `${rect.height}px`;
      hoverEl.style.borderRadius = "12px";
      hoverEl.style.opacity = "1";
    };

    const renderTimeGridHover = (event: MouseEvent, wrapperRect: DOMRect) => {
      const columns   = Array.from(wrapper.querySelectorAll(".fc-timegrid-col")) as HTMLElement[];
      const slotLanes = Array.from(wrapper.querySelectorAll(".fc-timegrid-slot-lane")) as HTMLElement[];

      if (columns.length === 0 || slotLanes.length === 0) { setHidden(); return; }

      const dayColumn = columns.find((col) => {
        const r = col.getBoundingClientRect();
        return event.clientX >= r.left && event.clientX <= r.right;
      });
      if (!dayColumn) { setHidden(); return; }

      const columnRect  = dayColumn.getBoundingClientRect();
      const hoveredSlot = slotLanes.find((slot) => {
        const r = slot.getBoundingClientRect();
        return event.clientY >= r.top && event.clientY <= r.bottom;
      });
      if (!hoveredSlot) { setHidden(); return; }

      const slotRect = hoveredSlot.getBoundingClientRect();
      hoverEl.style.left   = `${columnRect.left - wrapperRect.left + wrapper.scrollLeft}px`;
      hoverEl.style.top    = `${slotRect.top - wrapperRect.top + wrapper.scrollTop}px`;
      hoverEl.style.width  = `${columnRect.width}px`;
      hoverEl.style.height = `${slotRect.height}px`;
      hoverEl.style.borderRadius = "10px";
      hoverEl.style.opacity = "1";
    };

    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const wrapperRect = wrapper.getBoundingClientRect();

      if (target.closest(".fc-daygrid-body")) { renderMonthHover(target, wrapperRect); return; }
      if (target.closest(".fc-timegrid-body") || target.closest(".fc-timegrid-slots") || target.closest(".fc-timegrid-cols")) {
        renderTimeGridHover(event, wrapperRect); return;
      }
      setHidden();
    };

    wrapper.addEventListener("mousemove", handleMove);
    wrapper.addEventListener("mouseleave", setHidden);
    return () => {
      wrapper.removeEventListener("mousemove", handleMove);
      wrapper.removeEventListener("mouseleave", setHidden);
    };
  }, [view]);

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    const jobsChannel = supabase
      .channel("jobs-page")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "jobs",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setJobs(prev => [payload.new as Job, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new as Job } : j));
        }
      })
      .subscribe();

    async function load() {
      const { data } = await supabase
        .from("jobs")
        .select(`
          id, name, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, created_at, updated_at, technician_id,
          customers (id, name, phone, address),
          technicians (name, color)
        `)
        .eq("business_id", businessId)
        .order("slot_start", { ascending: false })
        .limit(50);

      setJobs((data as any) ?? []);
      setServices(settings?.services ?? []);

      const { data: techsData } = await supabase
        .from("technicians")
        .select("id, name, color")
        .eq("business_id", businessId)
        .eq("active", true);

      setTechnicians((techsData as any) ?? []);

      // Find the current user's linked technician for "My Matters"
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (userId) {
        const { data: myTech } = await supabase
          .from("technicians")
          .select("id")
          .eq("business_id", businessId)
          .eq("user_id", userId)
          .maybeSingle();
        if (myTech) setMyTechnicianId((myTech as any).id);
      }

      const { data: custsData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("business_id", businessId)
        .order("name", { ascending: true });

      setCustomers((custsData as any) ?? []);
      setLoading(false);

      const jobId = searchParams.get("job");
      if (jobId) {
        const { data: single } = await supabase.from("jobs").select(`
          id, name, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, created_at, updated_at, technician_id,
          customers (id, name, phone, address),
          technicians (name, color)
        `).eq("id", jobId).single();
        if (single) router.push(`/dashboard/jobs/${(single as any).id}`);
      }
    }
    load();

    return () => { supabase.removeChannel(jobsChannel); };
  }, [businessId, bizLoading, router]);


  function toLocalDateTimeValue(value: string) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  async function addMatter() {
    setJobError("");

    if (!newJob.job_type.trim()) { setJobError("Enter a practice area"); return; }
    if (!newJob.customer_id && !newJob.customer_phone) {
      setJobError("Select a client or enter a phone number");
      return;
    }

    setAddingJob(true);

    try {
      const slotStart = newJob.slot_start ? new Date(newJob.slot_start) : new Date();
      const slotEnd   = new Date(slotStart.getTime() + newJob.duration_mins * 60 * 1000);

      if (newJob.technician_id) {
        const buffer       = 30 * 60 * 1000;
        const bufferedStart = new Date(slotStart.getTime() - buffer).toISOString();
        const bufferedEnd   = new Date(slotEnd.getTime() + buffer).toISOString();

        const { data: conflicts } = await supabase
          .from("jobs")
          .select("id, slot_start, slot_end")
          .eq("business_id", businessId)
          .eq("technician_id", newJob.technician_id)
          .in("status", ["booked", "in_progress"])
          .lt("slot_start", bufferedEnd)
          .gt("slot_end", bufferedStart);

        if (conflicts && conflicts.length > 0) {
          const conflictTime = new Date(conflicts[0].slot_start).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit",
          });
          setJobError(`Scheduling conflict with existing matter at ${conflictTime}. Choose a different time or attorney.`);
          setAddingJob(false);
          return;
        }
      }

      let customerId = newJob.customer_id;
      if (!customerId && newJob.customer_phone) {
        const { data: customer } = await supabase
          .from("customers")
          .upsert({
            business_id: businessId,
            phone: newJob.customer_phone,
            name: [newJob.customer_first_name, newJob.customer_last_name].filter(Boolean).join(" ") || null,
          }, { onConflict: "business_id,phone" })
          .select("id")
          .single();
        customerId = customer?.id ?? "";
      }

      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          business_id:   businessId,
          customer_id:   customerId || null,
          technician_id: newJob.technician_id || null,
          type:          newJob.job_type,
          status:        "booked",
          slot_start:    slotStart.toISOString(),
          slot_end:      slotEnd.toISOString(),
          notes:         newJob.notes || null,
          source:        "manual",
        })
        .select("id")
        .single();

      if (error) throw error;

      if (job?.id) {
        // Fire-and-forget: embed the new job for RAG
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embed-job`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ job_id: job.id, business_id: businessId, customer_id: customerId || null }),
        }).catch(() => {});

        const { data: createdJob } = await supabase
          .from("jobs")
          .select(`
            id, type, status, slot_start, slot_end, amount, source,
            notes, ai_notes, created_at, technician_id,
            customers (id, name, phone, address),
            technicians (name, color)
          `)
          .eq("id", job.id)
          .single();

        if (createdJob) {
          setJobs(prev => prev.some(e => e.id === (createdJob as any).id) ? prev : [createdJob as any, ...prev]);
          router.push(`/dashboard/jobs/${(createdJob as any).id}`);
        }
      }

      setShowAddJob(false);
      setNewCustomer(false);
      setNewJob({ customer_id: "", customer_first_name: "", customer_last_name: "", customer_phone: "", job_type: "", slot_start: "", duration_mins: 120, technician_id: "", notes: "" });

    } catch (err: any) {
      setJobError(err.message ?? "Failed to create matter");
    } finally {
      setAddingJob(false);
    }
  }

  // Load favorites from localStorage when businessId is known
  useEffect(() => {
    if (!businessId) return;
    const stored = localStorage.getItem(`lawrenn-favorites-${businessId}`);
    if (stored) setFavoriteIds(new Set(JSON.parse(stored)));
  }, [businessId]);

  function toggleFavorite(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      localStorage.setItem(`lawrenn-favorites-${businessId}`, JSON.stringify([...next]));
      return next;
    });
  }

  const tabJobs = activeTab === "mine"
    ? jobs.filter(j => j.technician_id === myTechnicianId)
    : activeTab === "favorites"
    ? jobs.filter(j => favoriteIds.has(j.id))
    : jobs;
  const filtered = filter === "all" ? tabJobs : tabJobs.filter(j => j.status === filter);

  function formatRelative(iso: string | null): string {
    if (!iso) return "—";
    const diff  = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatSlot(start: string, end: string) {
    const s        = new Date(start);
    const e        = new Date(end);
    const today    = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    let day = "";
    if (s.toDateString() === today.toDateString())    day = "Today";
    else if (s.toDateString() === tomorrow.toDateString()) day = "Tomorrow";
    else day = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const timeStart = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const timeEnd   = e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day} · ${timeStart} – ${timeEnd}`;
  }

  const divider: CSSProperties = { height: 1, background: "rgba(0,0,0,0.04)" };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading matters...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "2rem 2rem 2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.75rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#111111", marginBottom: "0.2rem" }}>Matters</h1>
            <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>All scheduled and closed matters</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {/* View tabs */}
            <div style={{ display: "flex", background: "#F0F0EC", borderRadius: 8, padding: 3, gap: 2 }}>
              {([
                { key: "all",       label: "All Matters"  },
                { key: "mine",      label: "My Matters"   },
                { key: "favorites", label: "Favorites"    },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  style={{
                    padding: "0.32rem 0.8rem",
                    background: activeTab === key ? "white" : "transparent",
                    border: "none", borderRadius: 6,
                    color: activeTab === key ? "#111111" : "#9CA3AF",
                    fontFamily: "'DM Sans'", fontSize: "0.8rem",
                    fontWeight: activeTab === key ? 600 : 400,
                    cursor: "pointer",
                    boxShadow: activeTab === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.12s", whiteSpace: "nowrap",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)" }} />

            <button onClick={() => setShowAddJob(true)}
              style={{ padding: "0.5rem 1rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              + Add matter
            </button>
            <button onClick={() => setView("list")}
              style={{ padding: "0.5rem 0.85rem", background: view === "list" ? "#111111" : "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: view === "list" ? "white" : "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}>
              List
            </button>
            <button onClick={() => setView("calendar")}
              style={{ padding: "0.5rem 0.85rem", background: view === "calendar" ? "#111111" : "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: view === "calendar" ? "white" : "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}>
              Calendar
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        {view === "list" && (
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {[{ key: "all", label: "All" }, ...STATUSES.map(s => ({ key: s, label: STATUS_CONFIG[s].label }))].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                style={{
                  padding: "0.4rem 0.9rem",
                  background: filter === key ? "#111111" : "white",
                  border: `1px solid ${filter === key ? "#111111" : "rgba(0,0,0,0.1)"}`,
                  borderRadius: 100,
                  color: filter === key ? "white" : "#6B7280",
                  fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 500,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {view === "list" ? (
          <div>

            {/* Matters table */}
            <div style={{ background: "white", overflow: "hidden" }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 96px 52px 96px 80px", gap: "0.5rem", padding: "0.55rem 0.5rem", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                {["", "Matter Name", "Modified", "Users", "Created", "Status"].map((h, i) => (
                  <span key={i} style={{ fontSize: "0.67rem", fontWeight: 600, color: "#C4C4BD", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                  <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "#111111", marginBottom: "0.4rem" }}>No matters</p>
                  <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>
                    {activeTab === "mine" ? "No matters assigned to you" : activeTab === "favorites" ? "Star a matter to save it here" : "Matters handled by your AI assistant will appear here"}
                  </p>
                </div>
              ) : (
                filtered.map((job, i) => {
                  const cfg      = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.booked;
                  const isFav    = favoriteIds.has(job.id);
                  const initials = job.technicians?.name
                    ? job.technicians.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
                    : null;
                  const matterName = job.name || `${job.customers?.name ?? "Unknown"} — ${job.type}`;

                  return (
                    <div key={job.id}>
                      {i > 0 && <div style={divider} />}
                      <div
                        onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                        style={{
                          display: "grid", gridTemplateColumns: "32px 1fr 96px 52px 96px 80px",
                          gap: "0.5rem", padding: "0.75rem 0.5rem",
                          alignItems: "center", cursor: "pointer",
                          background: "white", transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#F9F9F7"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "white"; }}
                      >
                        {/* Star */}
                        <button
                          onClick={e => toggleFavorite(e, job.id)}
                          title={isFav ? "Remove from favorites" : "Add to favorites"}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: isFav ? "#F59E0B" : "#D1D5DB", display: "flex", alignItems: "center", transition: "color 0.12s" }}
                          onMouseEnter={e => { if (!isFav) (e.currentTarget as HTMLButtonElement).style.color = "#F59E0B"; }}
                          onMouseLeave={e => { if (!isFav) (e.currentTarget as HTMLButtonElement).style.color = "#D1D5DB"; }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>

                        {/* Matter Name */}
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", margin: "0 0 0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {matterName}
                          </p>
                          <p style={{ fontSize: "0.72rem", color: "#9CA3AF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {formatSlot(job.slot_start, job.slot_end)}
                            {job.source === "voice_agent" ? " · AI scheduled" : ""}
                          </p>
                        </div>

                        {/* Modified */}
                        <span style={{ fontSize: "0.78rem", color: "#6B7280" }}>
                          {formatRelative(job.updated_at || job.created_at)}
                        </span>

                        {/* Users */}
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {initials ? (
                            <div title={job.technicians?.name ?? ""} style={{
                              width: 26, height: 26, borderRadius: "50%",
                              background: job.technicians?.color ?? "#6B7280",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.6rem", fontWeight: 700, color: "white",
                              flexShrink: 0,
                            }}>
                              {initials}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.78rem", color: "#D1D5DB" }}>—</span>
                          )}
                        </div>

                        {/* Date Created */}
                        <span style={{ fontSize: "0.78rem", color: "#6B7280" }}>
                          {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>

                        {/* Status */}
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 4, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" as const }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        ) : (
          /* Calendar view */
          <div ref={calendarWrapRef} style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.5rem", position: "relative", overflow: "hidden" }}>
            <style>{`
              .fc { font-family: 'DM Sans', sans-serif; }
              .fc-button { font-family: 'DM Sans', sans-serif !important; font-weight: 500 !important; }
              .fc-button-primary { background: #111111 !important; border-color: #111111 !important; }
              .fc-button-primary:hover { background: #333333 !important; border-color: #333333 !important; }
              .fc-button-primary:not(:disabled):active,
              .fc-button-primary:not(:disabled).fc-button-active { background: #555555 !important; border-color: #555555 !important; }
              .fc-event { cursor: pointer; border: none !important; font-size: 0.78rem !important; font-weight: 600 !important; }
              .fc-day-today { background: rgba(0,0,0,0.02) !important; }
              .fc-col-header-cell { font-weight: 600 !important; color: #111111 !important; }
              .fc-timegrid-slot { height: 40px !important; }
              .fc-daygrid-day, .fc-timegrid-col { cursor: pointer; }
            `}</style>
            <div
              ref={hoverCellRef}
              style={{
                position: "absolute", left: 0, top: 0, width: 0, height: 0,
                opacity: 0, pointerEvents: "none",
                background: "rgba(0,0,0,0.04)",
                boxShadow: "inset 0 0 0 1.5px rgba(0,0,0,0.1)",
                transition: "left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease, opacity 100ms ease",
                zIndex: 2,
              }}
            />
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              eventDisplay="block"
              headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
              events={jobs.map(job => ({
                id:    job.id,
                title: `${job.customers?.name ?? "Unknown"} — ${job.type}`,
                start: job.slot_start,
                end:   job.slot_end,
                backgroundColor: job.technicians?.color ?? "#374151",
                borderColor:     job.technicians?.color ?? "#374151",
                extendedProps: { job },
              }))}
              eventClick={(info) => {
                router.push(`/dashboard/jobs/${info.event.id}`);
              }}
              dateClick={(info) => {
                setNewJob(prev => ({ ...prev, slot_start: toLocalDateTimeValue(info.dateStr) }));
                setShowAddJob(true);
              }}
              height="auto"
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              allDaySlot={false}
              nowIndicator={true}
              weekends={true}
            />
          </div>
        )}

        {/* Add Matter Modal */}
        {showAddJob && (
          <div onClick={() => setShowAddJob(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, padding: "2rem", maxWidth: 520, width: "90%", position: "relative", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
              <button onClick={() => setShowAddJob(false)} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.25rem", lineHeight: 1 }}>&#x2715;</button>

              <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.25rem" }}>ADD MATTER</h3>
              <p style={{ fontSize: "0.85rem", color: "#9CA3AF", marginBottom: "1.5rem" }}>Manually create a matter &mdash; scheduling conflicts are checked automatically</p>

              {jobError && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991B1B" }}>
                  {jobError}
                </div>
              )}

              {/* Client */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>Client</label>
                  <button type="button" onClick={() => setNewCustomer(!newCustomer)}
                    style={{ fontSize: "0.75rem", color: "#374151", background: "none", border: "none", cursor: "pointer", fontWeight: 500, textDecoration: "underline" }}>
                    {newCustomer ? "Select existing" : "New client"}
                  </button>
                </div>

                {newCustomer ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <input type="text" placeholder="First name" value={newJob.customer_first_name}
                        onChange={e => setNewJob(prev => ({ ...prev, customer_first_name: e.target.value }))}
                        style={inputSt} />
                      <input type="text" placeholder="Last name" value={newJob.customer_last_name}
                        onChange={e => setNewJob(prev => ({ ...prev, customer_last_name: e.target.value }))}
                        style={inputSt} />
                    </div>
                    <input type="tel" placeholder="Phone number *" value={newJob.customer_phone}
                      onChange={e => setNewJob(prev => ({ ...prev, customer_phone: e.target.value, customer_id: "" }))}
                      style={inputSt} />
                  </div>
                ) : (
                  <select value={newJob.customer_id}
                    onChange={e => {
                      const c = customers.find(c => c.id === e.target.value);
                      setNewJob(prev => ({ ...prev, customer_id: e.target.value, customer_first_name: "", customer_last_name: "", customer_phone: c?.phone ?? "" }));
                    }}
                    style={inputSt}>
                    <option value="">Select a client...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name ?? c.phone} &mdash; {c.phone}</option>)}
                  </select>
                )}
              </div>

              {/* Practice area */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Practice area</label>
                <input
                  type="text"
                  value={newJob.job_type}
                  onChange={e => setNewJob(prev => ({ ...prev, job_type: e.target.value }))}
                  placeholder="Type or select below..."
                  style={inputSt}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                />
                {services.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "0.35rem", marginTop: "0.5rem" }}>
                    {services.map(s => (
                      <button key={s.name} type="button"
                        onClick={() => setNewJob(prev => ({ ...prev, job_type: s.name }))}
                        style={{
                          padding: "0.3rem 0.75rem",
                          background: newJob.job_type === s.name ? "#111111" : "#F5F5F0",
                          border: `1px solid ${newJob.job_type === s.name ? "#111111" : "rgba(0,0,0,0.12)"}`,
                          borderRadius: 20,
                          color: newJob.job_type === s.name ? "white" : "#374151",
                          fontFamily: "'DM Sans'", fontSize: "0.78rem",
                          cursor: "pointer", transition: "all 0.12s",
                        }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign attorney */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Assign attorney</label>
                <select value={newJob.technician_id}
                  onChange={e => setNewJob(prev => ({ ...prev, technician_id: e.target.value }))}
                  style={inputSt}>
                  <option value="">Unassigned</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Notes</label>
                <textarea value={newJob.notes} onChange={e => setNewJob(prev => ({ ...prev, notes: e.target.value }))} rows={2}
                  placeholder="Any additional details..."
                  style={{ ...inputSt, resize: "vertical" }} />
              </div>

              <button onClick={addMatter} disabled={addingJob}
                style={{ width: "100%", padding: "0.9rem", background: addingJob ? "rgba(17,17,17,0.45)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: addingJob ? "not-allowed" : "pointer" }}>
                {addingJob ? "Checking conflicts..." : "Create matter"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MattersPage() {
  return (
    <Suspense>
      <MattersPageInner />
    </Suspense>
  );
}
