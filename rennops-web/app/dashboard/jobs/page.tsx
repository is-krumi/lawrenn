"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useBusiness } from "@/context/BusinessContext";

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

const inputSt: CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "#F9FAFB",
  border: "1.5px solid rgba(0,0,0,0.1)",
  borderRadius: 8,
  color: "#0D1B2A",
  fontFamily: "'DM Sans'",
  fontSize: "0.9rem",
  outline: "none",
  boxSizing: "border-box",
};

export default function JobsPage() {
  const router = useRouter();
  const calendarWrapRef = useRef<HTMLDivElement | null>(null);
  const hoverCellRef = useRef<HTMLDivElement | null>(null);
  const { businessId, settings, loading: bizLoading } = useBusiness();

  const [jobs, setJobs]             = useState<Job[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Job | null>(null);
  const [filter, setFilter]         = useState("all");
  const [view, setView]             = useState<"list" | "calendar">("list");
  const [showAddJob, setShowAddJob] = useState(false);
  const [updating, setUpdating]     = useState(false);
  const [services, setServices]     = useState<{name: string; duration_mins: number}[]>([]);
  const [technicians, setTechnicians] = useState<{id: string; name: string; color: string}[]>([]);
  const [customers, setCustomers]   = useState<{id: string; name: string; phone: string}[]>([]);
  const [newJob, setNewJob]         = useState({
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    job_type: "",
    slot_start: "",
    duration_mins: 120,
    technician_id: "",
    notes: "",
  });
  const [addingJob, setAddingJob]   = useState(false);
  const [jobError, setJobError]     = useState("");
  const [newCustomer, setNewCustomer] = useState(false);

  useEffect(() => {
    if (view !== "calendar") return;

    const wrapper = calendarWrapRef.current;
    const hoverEl = hoverCellRef.current;
    if (!wrapper || !hoverEl) return;

    const setHidden = () => {
      hoverEl.style.opacity = "0";
    };

    const renderMonthHover = (target: HTMLElement, wrapperRect: DOMRect) => {
      const dayCell = target.closest(".fc-daygrid-day") as HTMLElement | null;
      if (!dayCell) {
        setHidden();
        return;
      }

      const rect = dayCell.getBoundingClientRect();
      hoverEl.style.left = `${rect.left - wrapperRect.left + wrapper.scrollLeft}px`;
      hoverEl.style.top = `${rect.top - wrapperRect.top + wrapper.scrollTop}px`;
      hoverEl.style.width = `${rect.width}px`;
      hoverEl.style.height = `${rect.height}px`;
      hoverEl.style.borderRadius = "12px";
      hoverEl.style.opacity = "1";
    };

    const renderTimeGridHover = (event: MouseEvent, wrapperRect: DOMRect) => {
      const columns = Array.from(wrapper.querySelectorAll(".fc-timegrid-col")) as HTMLElement[];
      const slotLanes = Array.from(wrapper.querySelectorAll(".fc-timegrid-slot-lane")) as HTMLElement[];

      if (columns.length === 0 || slotLanes.length === 0) {
        setHidden();
        return;
      }

      const dayColumn = columns.find((column) => {
        const rect = column.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right;
      });

      if (!dayColumn) {
        setHidden();
        return;
      }

      const columnRect = dayColumn.getBoundingClientRect();
      const hoveredSlot = slotLanes.find((slot) => {
        const rect = slot.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      });

      if (!hoveredSlot) {
        setHidden();
        return;
      }

      const slotRect = hoveredSlot.getBoundingClientRect();

      hoverEl.style.left = `${columnRect.left - wrapperRect.left + wrapper.scrollLeft}px`;
      hoverEl.style.top = `${slotRect.top - wrapperRect.top + wrapper.scrollTop}px`;
      hoverEl.style.width = `${columnRect.width}px`;
      hoverEl.style.height = `${slotRect.height}px`;
      hoverEl.style.borderRadius = "10px";
      hoverEl.style.opacity = "1";
    };

    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const wrapperRect = wrapper.getBoundingClientRect();

      if (target.closest(".fc-daygrid-body")) {
        renderMonthHover(target, wrapperRect);
        return;
      }

      if (target.closest(".fc-timegrid-body") || target.closest(".fc-timegrid-slots") || target.closest(".fc-timegrid-cols")) {
        renderTimeGridHover(event, wrapperRect);
        return;
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

    async function load() {
      const { data } = await supabase
        .from("jobs")
        .select(`
          id, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, created_at,
          customers (id, name, phone, address),
          technicians (name, color)
        `)
        .eq("business_id", businessId)
        .order("slot_start", { ascending: false })
        .limit(50);

      setJobs((data as any) ?? []);

      // Services come from BusinessContext settings — no extra round-trip needed
      setServices(settings?.services ?? []);

      const { data: techsData } = await supabase
        .from("technicians")
        .select("id, name, color")
        .eq("business_id", businessId)
        .eq("active", true);

      setTechnicians((techsData as any) ?? []);

      const { data: custsData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("business_id", businessId)
        .order("name", { ascending: true });

      setCustomers((custsData as any) ?? []);
      setLoading(false);

      // Realtime
      supabase
        .channel("jobs-page")
        .on("postgres_changes", {
          event: "*", schema: "public", table: "jobs",
          filter: `business_id=eq.${businessId}`,
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
  }, [businessId, bizLoading, router]);

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

  function toLocalDateTimeValue(value: string) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  async function addJob() {
    setJobError("");

    if (!newJob.job_type) { setJobError("Select a job type"); return; }
    if (!newJob.slot_start) { setJobError("Select a date and time"); return; }

    if (!newJob.customer_id && !newJob.customer_phone) {
      setJobError("Select a customer or enter a phone number");
      return;
    }

    setAddingJob(true);

    try {
      const slotStart = new Date(newJob.slot_start);
      const slotEnd = new Date(slotStart.getTime() + newJob.duration_mins * 60 * 1000);

      // Conflict check
      if (newJob.technician_id) {
        const buffer = 30 * 60 * 1000;
        const bufferedStart = new Date(slotStart.getTime() - buffer).toISOString();
        const bufferedEnd = new Date(slotEnd.getTime() + buffer).toISOString();

        const { data: conflicts } = await supabase
          .from("jobs")
          .select("id, slot_start, slot_end")
          .eq("business_id", businessId)
          .eq("technician_id", newJob.technician_id)
          .in("status", ["booked", "in_progress"])
          .lt("slot_start", bufferedEnd)
          .gt("slot_end", bufferedStart);

        if (conflicts && conflicts.length > 0) {
          const conflict = conflicts[0];
          const conflictTime = new Date(conflict.slot_start).toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit"
          });
          setJobError(`Conflict with existing job at ${conflictTime}. Choose a different time or technician.`);
          setAddingJob(false);
          return;
        }
      }

      // Upsert customer
      let customerId = newJob.customer_id;
      if (!customerId && newJob.customer_phone) {
        const { data: customer } = await supabase
          .from("customers")
          .upsert({
            business_id: businessId,
            phone: newJob.customer_phone,
            name: newJob.customer_name || null,
          }, { onConflict: "business_id,phone" })
          .select("id")
          .single();
        customerId = customer?.id ?? "";
      }

      // Insert job
      const { data: job, error } = await supabase
        .from("jobs")
        .insert({
          business_id: businessId,
          customer_id: customerId || null,
          technician_id: newJob.technician_id || null,
          type: newJob.job_type,
          status: "booked",
          slot_start: slotStart.toISOString(),
          slot_end: slotEnd.toISOString(),
          notes: newJob.notes || null,
          source: "manual",
        })
        .select("id")
        .single();

      if (error) throw error;

      if (job?.id) {
        const { data: createdJob } = await supabase
          .from("jobs")
          .select(`
            id, type, status, slot_start, slot_end, amount, source,
            notes, ai_notes, created_at,
            customers (id, name, phone, address),
            technicians (name, color)
          `)
          .eq("id", job.id)
          .single();

        if (createdJob) {
          setJobs(prev => prev.some(existing => existing.id === (createdJob as any).id) ? prev : [createdJob as any, ...prev]);
          setSelected(createdJob as any);
          setView("list");
        }
      }

      setShowAddJob(false);
      setNewCustomer(false);
      setNewJob({ customer_id: "", customer_name: "", customer_phone: "", job_type: "", slot_start: "", duration_mins: 120, technician_id: "", notes: "" });

    } catch (err: any) {
      setJobError(err.message ?? "Failed to create job");
    } finally {
      setAddingJob(false);
    }
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

        {/* Header */}
        <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Jobs</h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>All booked and completed jobs</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setShowAddJob(true)}
              style={{ padding: "0.5rem 1rem", background: "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer" }}>
              + Add job
            </button>
            <button onClick={() => setView("list")}
              style={{ padding: "0.5rem 1rem", background: view === "list" ? "#0D1B2A" : "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: view === "list" ? "white" : "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
              ☰ List
            </button>
            <button onClick={() => setView("calendar")}
              style={{ padding: "0.5rem 1rem", background: view === "calendar" ? "#0D1B2A" : "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: view === "calendar" ? "white" : "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
              📅 Calendar
            </button>
          </div>
        </div>

        {/* Filter tabs — only show in list view */}
        {view === "list" && (
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
        )}

        {view === "list" ? (
        /* existing split view code */
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
        ) : (
          /* Calendar view */
          <div ref={calendarWrapRef} style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", position: "relative", overflow: "hidden" }}>
            <style>{`
              .fc { font-family: 'DM Sans', sans-serif; }
              .fc-button { font-family: 'DM Sans', sans-serif !important; font-weight: 600 !important; }
              .fc-button-primary { background: #0D1B2A !important; border-color: #0D1B2A !important; }
              .fc-button-primary:hover { background: #1a3a5c !important; border-color: #1a3a5c !important; }
              .fc-button-primary:not(:disabled):active, .fc-button-primary:not(:disabled).fc-button-active { background: #0cc0df !important; border-color: #0cc0df !important; }
              .fc-event { cursor: pointer; border: none !important; font-size: 0.78rem !important; font-weight: 600 !important; }
              .fc-day-today { background: rgba(12,192,223,0.04) !important; }
              .fc-col-header-cell { font-weight: 700 !important; color: #0D1B2A !important; }
              .fc-timegrid-slot { height: 40px !important; }
              .fc-daygrid-day,
              .fc-timegrid-col {
                cursor: pointer;
              }
            `}</style>
            <div
              ref={hoverCellRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                opacity: 0,
                pointerEvents: "none",
                background: "rgba(12,192,223,0.12)",
                boxShadow: "inset 0 0 0 1.5px rgba(12,192,223,0.34)",
                transition: "left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease, opacity 100ms ease",
                zIndex: 2,
              }}
            />
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              eventDisplay="block"
              headerToolbar={{
                left:   "prev,next today",
                center: "title",
                right:  "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              events={jobs.map(job => ({
                id:    job.id,
                title: `${job.customers?.name ?? "Unknown"} — ${job.type}`,
                start: job.slot_start,
                end:   job.slot_end,
                backgroundColor: job.technicians?.color ?? "#0cc0df",
                borderColor:     job.technicians?.color ?? "#0cc0df",
                extendedProps: { job },
              }))}
              eventClick={(info) => {
                const job = info.event.extendedProps.job as Job;
                setSelected(job);
                setView("list");
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

        {/* Add Job Modal */}
        {showAddJob && (
          <div onClick={() => setShowAddJob(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: "2rem", maxWidth: 520, width: "90%", position: "relative", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
              <button onClick={() => setShowAddJob(false)} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.25rem" }}>✕</button>

              <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.25rem" }}>ADD JOB</h3>
              <p style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "1.5rem" }}>Manually create a job — conflicts are checked automatically</p>

              {jobError && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991B1B" }}>
                  {jobError}
                </div>
              )}

              {/* Customer */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>Customer</label>
                  <button onClick={() => setNewCustomer(!newCustomer)}
                    style={{ fontSize: "0.75rem", color: "#0cc0df", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    {newCustomer ? "← Select existing" : "+ New customer"}
                  </button>
                </div>

                {newCustomer ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input type="text" placeholder="Name (optional)" value={newJob.customer_name}
                      onChange={e => setNewJob(prev => ({ ...prev, customer_name: e.target.value }))}
                      style={inputSt} />
                    <input type="tel" placeholder="Phone number *" value={newJob.customer_phone}
                      onChange={e => setNewJob(prev => ({ ...prev, customer_phone: e.target.value, customer_id: "" }))}
                      style={inputSt} />
                  </div>
                ) : (
                  <select value={newJob.customer_id}
                    onChange={e => {
                      const customer = customers.find(c => c.id === e.target.value);
                      setNewJob(prev => ({ ...prev, customer_id: e.target.value, customer_name: customer?.name ?? "", customer_phone: customer?.phone ?? "" }));
                    }}
                    style={inputSt}>
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name ?? c.phone} — {c.phone}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Job type */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Job type</label>
                <select value={newJob.job_type} onChange={e => {
                  const svc = services.find(s => s.name === e.target.value);
                  setNewJob(prev => ({ ...prev, job_type: e.target.value, duration_mins: svc?.duration_mins ?? 120 }));
                }} style={inputSt}>
                  <option value="">Select a service...</option>
                  {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  <option value="General Service">General Service</option>
                </select>
              </div>

              {/* Date + time */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Date & time</label>
                  <input type="datetime-local" value={newJob.slot_start}
                    onChange={e => setNewJob(prev => ({ ...prev, slot_start: e.target.value }))}
                    style={inputSt} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Duration</label>
                  <select value={newJob.duration_mins}
                    onChange={e => setNewJob(prev => ({ ...prev, duration_mins: Number(e.target.value) }))}
                    style={inputSt}>
                    {[30, 60, 90, 120, 150, 180, 240, 300, 360].map(m => (
                      <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)}hr${m % 60 > 0 ? ` ${m % 60}min` : ""}` : `${m}min`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Technician */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Assign to</label>
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

              <button onClick={addJob} disabled={addingJob}
                style={{ width: "100%", padding: "0.9rem", background: addingJob ? "rgba(12,192,223,0.6)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: addingJob ? "not-allowed" : "pointer" }}>
                {addingJob ? "Checking conflicts..." : "Create job"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}