"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  ai_sms_replies: boolean | null;
  dissatisfied: boolean;
  sms_opted_out: boolean;
  created_at: string;
  jobs: { id: string; type: string; status: string; amount: number; created_at: string }[];
}

export default function CustomersPage() {
  const router = useRouter();
  const { businessId, twilioNumber, loading: bizLoading } = useBusiness();

  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<Customer | null>(null);
  const [saving, setSaving]         = useState(false);
  const [editNotes, setEditNotes]   = useState("");
  const [messages, setMessages]     = useState<any[]>([]);
  const [replyText, setReplyText]   = useState("");
  const [sending, setSending]       = useState(false);

  // Column widths (px). col1 = list, col2 = detail, col3 = messages (remainder)
  const [col1Width, setCol1Width] = useState(280);
  const [col2Width, setCol2Width] = useState(360);
  const dragRef = useRef<{ which: 1 | 2; startX: number; startW: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (dragRef.current.which === 1) {
      setCol1Width(Math.max(200, Math.min(500, dragRef.current.startW + dx)));
    } else {
      setCol2Width(Math.max(240, Math.min(600, dragRef.current.startW + dx)));
    }
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startDrag(which: 1 | 2, e: React.MouseEvent, startW: number) {
    e.preventDefault();
    dragRef.current = { which, startX: e.clientX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    const customersChannel = supabase
      .channel(`customers-page-${businessId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "customers",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        setCustomers(prev => [{ ...payload.new as Customer, jobs: [] }, ...prev]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "customers",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        setCustomers(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Customer } : c));
        if (selected?.id === payload.new.id) setSelected(prev => ({ ...prev!, ...payload.new as Customer }));
      })
      .subscribe();

    const messagesChannel = supabase
      .channel(`customers-messages-${businessId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        const msg = payload.new as any;
        // Only add to thread if it's for the selected customer
        setSelected(curr => {
          if (curr && msg.customer_id === curr.id) {
            setMessages(prev => {
              // Only add if not already in the list
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
          return curr;
        });
      })
      .subscribe();

    async function load() {
      const { data } = await supabase
        .from("customers")
        .select(`
          id, name, phone, email, address, notes, ai_sms_replies,
          dissatisfied, sms_opted_out, created_at,
          jobs (id, type, status, amount, created_at)
        `)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });

      setCustomers((data as any) ?? []);
      setLoading(false);
    }
    load();

    return () => {
      supabase.removeChannel(customersChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [businessId, bizLoading, router]);

  async function selectCustomer(c: Customer) {
    setSelected(c);
    setEditNotes(c.notes ?? "");
    setReplyText("");

    // Fetch message thread
    const { data } = await supabase
      .from("messages")
      .select("id, direction, body, sent_at, read")
      .eq("business_id", businessId)
      .eq("customer_id", c.id)
      .order("sent_at", { ascending: true });

    setMessages((data as any) ?? []);

    // Mark unread as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("customer_id", c.id)
      .eq("read", false);
  }

async function sendReply() {
  if (!replyText.trim() || !selected || sending || !businessId || !twilioNumber) return;
  setSending(true);

  try {
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to:   selected.phone,
        from: twilioNumber,
        body: replyText.trim(),
      }),
    });

    if (res.ok) {
      const { data: msg } = await supabase
        .from("messages")
        .insert({
          business_id: businessId,
          customer_id: selected.id,
          direction:   "outbound",
          channel:     "sms",
          body:        replyText.trim(),
          to_number:   selected.phone,
          from_number: twilioNumber,
        })
        .select("id, direction, body, sent_at, read")
        .single();

      if (msg) setMessages(prev => [...prev, msg as any]);
      setReplyText("");
    } else {
      console.error("SMS send failed:", await res.text());
    }
  } catch (err) {
    console.error("Send reply error:", err);
  } finally {
    setSending(false);
  }
}

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    await supabase.from("customers").update({ notes: editNotes }).eq("id", selected.id);
    setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, notes: editNotes } : c));
    setSelected(prev => prev ? { ...prev, notes: editNotes } : null);
    setSaving(false);
  }

  async function toggleDissatisfied() {
    if (!selected) return;
    const val = !selected.dissatisfied;
    await supabase.from("customers").update({ dissatisfied: val }).eq("id", selected.id);
    setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, dissatisfied: val } : c));
    setSelected(prev => prev ? { ...prev, dissatisfied: val } : null);
  }

  async function toggleOptOut() {
    if (!selected) return;
    const val = !selected.sms_opted_out;
    await supabase.from("customers").update({ sms_opted_out: val }).eq("id", selected.id);
    setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, sms_opted_out: val } : c));
    setSelected(prev => prev ? { ...prev, sms_opted_out: val } : null);
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  function totalRevenue(c: Customer) {
    return c.jobs?.reduce((sum, j) => sum + (j.amount ?? 0), 0) ?? 0;
  }

  function jobCount(c: Customer) {
    return c.jobs?.length ?? 0;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading customers...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "2rem" }}>

        <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Customers</h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>{customers.length} total customers</p>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <span style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: "1rem" }}>🔍</span>
          <input
            type="text"
            placeholder="Search by name, phone, email, or address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", padding: "0.75rem 1rem 0.75rem 2.5rem", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"}
          />
        </div>

        {/* Split view */}
        <div ref={containerRef} style={{ display: selected ? "flex" : "block", gap: 0, alignItems: "flex-start" }}>

          {/* Customer list */}
          <div style={{ width: selected ? col1Width : "100%", flexShrink: 0, background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <p style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>👥</p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.4rem" }}>
                  {search ? "No customers found" : "No customers yet"}
                </p>
                <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>
                  {search ? "Try a different search" : "Customers will appear here after your first call"}
                </p>
              </div>
            ) : (
              filtered.map((customer, i) => (
                <div key={customer.id} onClick={() => selectCustomer(customer)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "1rem 1.25rem",
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                    cursor: "pointer",
                    background: selected?.id === customer.id ? "#F0FAFE" : "white",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { if (selected?.id !== customer.id) e.currentTarget.style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { if (selected?.id !== customer.id) e.currentTarget.style.background = "white"; }}>

                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg, #0cc0df, #0D1B2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "0.9rem", flexShrink: 0 }}>
                    {(customer.name ?? customer.phone).charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {customer.name ?? customer.phone}
                    </p>
                    <p style={{ fontSize: "0.78rem", color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {customer.phone}
                      {customer.address ? ` · ${customer.address}` : ""}
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#10B981" }}>
                      {jobCount(customer) > 0 ? `${jobCount(customer)} job${jobCount(customer) !== 1 ? "s" : ""}` : "No jobs"}
                    </span>
                    {totalRevenue(customer) > 0 && (
                      <span style={{ fontSize: "0.72rem", color: "#6B7280" }}>${totalRevenue(customer).toLocaleString()}</span>
                    )}
                    {customer.dissatisfied && (
                      <span style={{ fontSize: "0.68rem", color: "#EF4444", fontWeight: 600 }}>⚠ Dissatisfied</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Customer detail panel */}
          {selected && (
            <>
              {/* Drag handle 1 */}
              <div
                onMouseDown={e => startDrag(1, e, col1Width)}
                onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}
                style={{
                  width: 16, flexShrink: 0, cursor: "col-resize",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  alignSelf: "stretch",
                }}>
                <div style={{ width: 4, height: "100%", minHeight: 80, borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
              </div>
            <div style={{ width: col2Width, flexShrink: 0, background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", position: "sticky", top: 72 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #0cc0df, #0D1B2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1.1rem" }}>
                    {(selected.name ?? selected.phone).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "0.1rem" }}>
                      {selected.name ?? "Unknown"}
                    </h3>
                    <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Customer since {formatDate(selected.created_at)}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.25rem" }}>×</button>
              </div>

              {/* Contact info */}
              <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>Contact</p>
                <p style={{ fontSize: "0.875rem", color: "#0D1B2A", marginBottom: "0.25rem" }}>📞 {selected.phone}</p>
                {selected.email && <p style={{ fontSize: "0.875rem", color: "#0D1B2A", marginBottom: "0.25rem" }}>✉️ {selected.email}</p>}
                {selected.address && <p style={{ fontSize: "0.875rem", color: "#0D1B2A" }}>📍 {selected.address}</p>}
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>Total jobs</p>
                  <p style={{ fontSize: "1.4rem", fontFamily: "'Bebas Neue'", color: "#0cc0df", letterSpacing: "0.02em" }}>{jobCount(selected)}</p>
                </div>
                <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>Total revenue</p>
                  <p style={{ fontSize: "1.4rem", fontFamily: "'Bebas Neue'", color: "#10B981", letterSpacing: "0.02em" }}>${totalRevenue(selected).toLocaleString()}</p>
                </div>
              </div>

              {/* Job history */}
              {selected.jobs?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Job history</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {selected.jobs.slice(0, 4).map(job => (
                      <div key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: "#F9FAFB", borderRadius: 6 }}>
                        <span style={{ fontSize: "0.82rem", color: "#374151" }}>{job.type}</span>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          {job.amount > 0 && <span style={{ fontSize: "0.78rem", color: "#10B981", fontWeight: 600 }}>${job.amount}</span>}
                          <span style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>{formatDate(job.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Notes</p>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes about this customer..."
                  style={{ width: "100%", padding: "0.7rem 0.9rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.85rem", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; saveNotes(); }}
                />
                <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "0.25rem" }}>Auto-saves on blur</p>
              </div>

              {/* Flags */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>Mark as dissatisfied</p>
                    <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>Excludes from review requests</p>
                  </div>
                  <button onClick={toggleDissatisfied}
                    style={{ width: 40, height: 22, borderRadius: 11, background: selected.dissatisfied ? "#EF4444" : "rgba(0,0,0,0.12)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: selected.dissatisfied ? 21 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>SMS opted out</p>
                    <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>No SMS messages will be sent</p>
                  </div>
                  <button onClick={toggleOptOut}
                    style={{ width: 40, height: 22, borderRadius: 11, background: selected.sms_opted_out ? "#F59E0B" : "rgba(0,0,0,0.12)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: selected.sms_opted_out ? 21 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>AI SMS replies</p>
                    <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                      {selected.ai_sms_replies === null || selected.ai_sms_replies === undefined
                        ? "Using business default"
                        : selected.ai_sms_replies ? "Always on for this customer" : "Always off for this customer"}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {[
                      { label: "Auto", value: null },
                      { label: "On", value: true },
                      { label: "Off", value: false },
                    ].map(({ label, value }) => (
                      <button key={label}
                        onClick={async () => {
                          await supabase.from("customers").update({ ai_sms_replies: value }).eq("id", selected.id);
                          setCustomers(prev => prev.map(c => c.id === selected.id ? { ...c, ai_sms_replies: value } : c));
                          setSelected(prev => prev ? { ...prev, ai_sms_replies: value } : null);
                        }}
                        style={{
                          padding: "0.3rem 0.65rem",
                          background: selected.ai_sms_replies === value ? "#0D1B2A" : "#F9FAFB",
                          border: `1px solid ${selected.ai_sms_replies === value ? "#0D1B2A" : "rgba(0,0,0,0.1)"}`,
                          borderRadius: 6,
                          color: selected.ai_sms_replies === value ? "white" : "#6B7280",
                          fontFamily: "'DM Sans'", fontSize: "0.75rem", fontWeight: 600,
                          cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </>
          )}

          {/* Messages column */}
          {selected && (
            <>
              {/* Drag handle 2 */}
              <div
                onMouseDown={e => startDrag(2, e, col2Width)}
                onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.15)"; }}
                onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}
                style={{
                  width: 16, flexShrink: 0, cursor: "col-resize",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  alignSelf: "stretch",
                }}>
                <div style={{ width: 4, height: "100%", minHeight: 80, borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
              </div>
            <div style={{ flex: 1, minWidth: 0, background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, display: "flex", flexDirection: "column", position: "sticky", top: 72, maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#0D1B2A", margin: "0 0 0.1rem" }}>
                  Messages{messages.length > 0 && <span style={{ fontWeight: 400, color: "#9CA3AF" }}> ({messages.length})</span>}
                </p>
                <p style={{ fontSize: "0.75rem", color: "#9CA3AF", margin: 0 }}>{selected.phone}</p>
              </div>

              {/* Messages list */}
              <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {messages.length === 0 ? (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0" }}>
                    <p style={{ fontSize: "0.82rem", color: "#9CA3AF", fontStyle: "italic" }}>No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg: any) => (
                    <div key={msg.id} style={{ display: "flex", justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "82%",
                        padding: "0.55rem 0.8rem",
                        borderRadius: msg.direction === "outbound" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                        background: msg.direction === "outbound" ? "#E8F4FD" : "#F9FAFB",
                        border: msg.direction === "inbound" ? "1px solid rgba(0,0,0,0.07)" : "1px solid rgba(12,192,223,0.2)",
                      }}>
                        <p style={{ fontSize: "0.85rem", color: msg.direction === "outbound" ? "#0D1B2A" : "#374151", lineHeight: 1.5, margin: 0 }}>
                          {msg.body}
                        </p>
                        <p style={{ fontSize: "0.65rem", color: msg.direction === "outbound" ? "#6B7280" : "#9CA3AF", marginTop: "0.25rem", margin: "0.25rem 0 0", textAlign: msg.direction === "outbound" ? "right" : "left" }}>
                          {new Date(msg.sent_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Reply input */}
              <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: "0.5rem", flexShrink: 0, background: "white" }}>
                <input
                  type="text"
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") sendReply(); }}
                  style={{ flex: 1, padding: "0.6rem 0.85rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.09)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.875rem", outline: "none" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                  onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.09)"}
                />
                <button onClick={sendReply} disabled={sending || !replyText.trim()}
                  style={{ padding: "0.6rem 1rem", background: sending || !replyText.trim() ? "#E5E7EB" : "#0D1B2A", border: "none", borderRadius: 8, color: sending || !replyText.trim() ? "#9CA3AF" : "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: sending || !replyText.trim() ? "not-allowed" : "pointer", transition: "all 0.15s", whiteSpace: "nowrap" as const }}>
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}