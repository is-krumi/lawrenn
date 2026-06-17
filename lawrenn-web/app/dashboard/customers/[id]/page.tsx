"use client";

import { useBusiness } from "@/context/BusinessContext";
import { createClient } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  dissatisfied: boolean;
  sms_opted_out: boolean;
  ai_sms_replies: boolean | null;
  ai_summary: string | null;
  ai_action: string | null;
  ai_intelligence: AiIntelligence | null;
  created_at: string;
  jobs: { id: string; type: string; status: string; amount: number; slot_start: string | null; name: string | null }[];
}

interface Message {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  sent_at: string;
  read?: boolean;
}

interface Call {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  outcome: string | null;
  transcript: string | null;
  recording_url: string | null;
  summary: string | null;
}

interface AiIntelligence {
  "Matter Type"?: string;
  "Engagement Level"?: string;
  "Urgency"?: string;
  "Client Sentiment"?: string;
  "Estimated Fees"?: string;
  "Matter Stage"?: string;
  "Follow-up Due"?: string;
  "Assigned To"?: string;
  "Referral Source"?: string;
  [key: string]: string | undefined;
}

function formatDuration(sec: number | null) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params?.id as string;
  const { businessId, twilioNumber, loading: bizLoading } = useBusiness();

  const [customer, setCustomer]         = useState<Customer | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [calls, setCalls]               = useState<Call[]>([]);
  const [loading, setLoading]           = useState(true);
  const [notFound, setNotFound]         = useState(false);

  // AI summary
  const [aiSummary, setAiSummary]         = useState<string | null>(null);
  const [aiAction, setAiAction]           = useState<string | null>(null);
  const [aiIntelligence, setAiIntelligence] = useState<AiIntelligence | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiError, setAiError]             = useState<string | null>(null);

  // Editing
  const [editNotes, setEditNotes]           = useState(false);
  const [notesValue, setNotesValue]         = useState("");
  const [editingPhone, setEditingPhone]     = useState(false);
  const [phoneValue, setPhoneValue]         = useState("");

  // Reply
  const [replyText, setReplyText]       = useState("");
  const [sending, setSending]           = useState(false);

  // Calls
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);

  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const regenTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCustomerRef = useRef<Customer | null>(null);
  const latestMessagesRef = useRef<Message[]>([]);
  const latestCallsRef    = useRef<Call[]>([]);

  // Keep refs in sync
  useEffect(() => { latestCustomerRef.current = customer; }, [customer]);
  useEffect(() => { latestMessagesRef.current = messages; }, [messages]);
  useEffect(() => { latestCallsRef.current = calls; }, [calls]);

  // Debounced regenerate — waits 4s after last event before calling API
  function scheduleRegenerate() {
    if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    regenTimerRef.current = setTimeout(() => {
      const c    = latestCustomerRef.current;
      const msgs = latestMessagesRef.current;
      const cls  = latestCallsRef.current;
      if (c) generateSummary(c, msgs, cls);
    }, 4000);
  }

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }
    if (!customerId) return;

    loadCustomer();
  }, [businessId, bizLoading, customerId]);

  // Realtime: new inbound messages or calls trigger a summary refresh
  useEffect(() => {
    if (!customerId) return;

    const channel = supabase
      .channel(`customer-comms-${customerId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `customer_id=eq.${customerId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        // Only add inbound — outbound is added optimistically in sendReply
        if (msg.direction === "inbound") {
          setMessages(prev => [...prev, msg]);
        }
        scheduleRegenerate();
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "calls",
        filter: `customer_id=eq.${customerId}`,
      }, (payload) => {
        setCalls(prev => [payload.new as Call, ...prev]);
        scheduleRegenerate();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    };
  }, [customerId]);

  async function loadCustomer() {
    setLoading(true);

    const { data: c } = await supabase
      .from("customers")
      .select("id, name, phone, email, address, notes, dissatisfied, sms_opted_out, ai_sms_replies, ai_summary, ai_action, ai_intelligence, created_at, jobs (id, type, status, amount, slot_start, name)")
      .eq("id", customerId)
      .eq("business_id", businessId!)
      .single();

    if (!c) { setNotFound(true); setLoading(false); return; }

    setCustomer(c as any);
    setNotesValue(c.notes ?? "");
    setPhoneValue(c.phone);

    // Track recent visit
    const key = `lawrenn-recent-${businessId}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
    const deduped = existing.filter((i: any) => !(i.type === "client" && i.id === c.id));
    const displayName = c.name ?? c.phone;
    localStorage.setItem(key, JSON.stringify([{ type: "client", id: c.id, name: displayName, subtitle: c.phone, visitedAt: Date.now() }, ...deduped].slice(0, 12)));

    const [{ data: msgs }, { data: cls }] = await Promise.all([
      supabase.from("messages").select("id, body, direction, sent_at, read").eq("customer_id", customerId).order("sent_at", { ascending: true }),
      supabase.from("calls").select("id, created_at, duration_seconds, outcome, transcript, recording_url, summary").eq("customer_id", customerId).order("created_at", { ascending: false }),
    ]);

    const msgs_ = (msgs as any) ?? [];
    const cls_  = (cls  as any) ?? [];
    setMessages(msgs_);
    setCalls(cls_);
    setLoading(false);

    const customer_ = c as Customer;

    // Use DB-cached summary if available
    if (customer_.ai_summary) {
      setAiSummary(customer_.ai_summary);
      setAiAction(customer_.ai_action ?? null);
      setAiIntelligence(customer_.ai_intelligence ?? null);
      return;
    }

    // Nothing cached — generate fresh
    await generateSummary(customer_, msgs_, cls_);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function generateSummary(c: Customer, msgs: Message[], cls: Call[]) {
    setLoadingSummary(true);
    setAiError(null);
    try {
      const res = await fetch("/api/customer-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: c, messages: msgs, calls: cls }),
      });
      const data = await res.json();
      if (data.error) {
        setAiError(data.error);
      } else {
        setAiSummary(data.summary ?? null);
        setAiAction(data.action ?? null);
        setAiIntelligence(data.intelligence ?? null);
        await supabase.from("customers").update({
          ai_summary:      data.summary ?? null,
          ai_action:       data.action ?? null,
          ai_intelligence: data.intelligence ?? null,
        }).eq("id", c.id);
      }
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function fetchAndSetSummary(c: Customer, msgs: Message[], cls: Call[]) {
    await generateSummary(c, msgs, cls);
  }

  async function regenerateSummary() {
    if (!customer) return;
    await generateSummary(customer, messages, calls);
  }

  async function sendReply() {
    if (!replyText.trim() || !customer || sending || !businessId) return;
    setSending(true);
    const body = replyText.trim();
    setReplyText("");
    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: customer.phone, from: twilioNumber, body, business_id: businessId }),
      });
      if (res.ok) {
        const { from: resolvedFrom } = await res.json().catch(() => ({}));
        const { data: msg } = await supabase
          .from("messages")
          .insert({
            business_id: businessId,
            customer_id: customer.id,
            direction:   "outbound",
            channel:     "sms",
            body,
            to_number:   customer.phone,
            from_number: resolvedFrom ?? twilioNumber,
          })
          .select("id, body, direction, sent_at, read")
          .single();
        const newMsg: Message = (msg as any) ?? { id: Date.now().toString(), body, direction: "outbound", sent_at: new Date().toISOString() };
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        scheduleRegenerate();
      }
    } finally {
      setSending(false);
    }
  }

  async function saveNotes() {
    if (!customer) return;
    await supabase.from("customers").update({ notes: notesValue || null }).eq("id", customer.id);
    setCustomer(prev => prev ? { ...prev, notes: notesValue || null } : null);
    setEditNotes(false);
  }

  async function savePhone() {
    if (!customer || !phoneValue.trim()) return;
    const val = phoneValue.trim();
    await supabase.from("customers").update({ phone: val }).eq("id", customer.id);
    setCustomer(prev => prev ? { ...prev, phone: val } : null);
    setEditingPhone(false);
  }

  async function toggleOptOut() {
    if (!customer) return;
    const next = !customer.sms_opted_out;
    await supabase.from("customers").update({ sms_opted_out: next }).eq("id", customer.id);
    setCustomer(prev => prev ? { ...prev, sms_opted_out: next } : null);
  }

  async function toggleAiSms() {
    if (!customer) return;
    const next = !customer.ai_sms_replies;
    await supabase.from("customers").update({ ai_sms_replies: next }).eq("id", customer.id);
    setCustomer(prev => prev ? { ...prev, ai_sms_replies: next } : null);
  }

  async function deleteCustomer() {
    if (!customer) return;
    await supabase.from("customers").delete().eq("id", customer.id);
    router.push("/dashboard/customers");
  }

  if (loading || bizLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#6B7280" }}>Loading client...</p>
    </div>
  );

  if (notFound || !customer) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "1rem", color: "#111111", marginBottom: "1rem" }}>Client not found.</p>
        <button onClick={() => router.push("/dashboard/customers")} style={{ padding: "0.5rem 1rem", background: "#111111", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Sans'" }}>
          Back to Clients
        </button>
      </div>
    </div>
  );

  const displayName = customer.name ?? customer.phone;
  const totalRevenue = customer.jobs?.reduce((s, j) => s + (j.amount ?? 0), 0) ?? 0;

  const timeline: { type: "message" | "call"; ts: string; item: Message | Call }[] = [
    ...messages.map(m => ({ type: "message" as const, ts: m.sent_at, item: m })),
    ...calls.map(c => ({ type: "call" as const, ts: c.created_at, item: c })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div style={{ height: "calc(100vh - 52px)", background: "#ffffff", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Body: two columns */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ---- LEFT COLUMN: Detail ---- */}
        <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid rgba(0,0,0,0.07)", overflowY: "auto", background: "white", display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>

          {/* Name / identity */}
          <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#111111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1rem", flexShrink: 0 }}>
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.15rem", letterSpacing: "0.06em", color: "#111111", margin: 0 }}>{displayName.toUpperCase()}</h2>
              <p style={{ fontSize: "0.72rem", color: "#9CA3AF", margin: 0 }}>Client since {new Date(customer.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
            </div>
          </div>

          {/* Contact card */}
          <div style={{ padding: "1.25rem 1.25rem 1rem" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "0.75rem" }}>Contact</p>

            {/* Phone */}
            <div style={{ marginBottom: "0.6rem" }}>
              <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: "0.1rem" }}>Phone</p>
              {editingPhone ? (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    value={phoneValue}
                    onChange={e => setPhoneValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") savePhone(); if (e.key === "Escape") setEditingPhone(false); }}
                    autoFocus
                    style={{ flex: 1, padding: "0.3rem 0.5rem", border: "1px solid #111111", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.85rem", outline: "none" }}
                  />
                  <button onClick={savePhone} style={{ padding: "0.3rem 0.6rem", background: "#111111", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontFamily: "'DM Sans'" }}>Save</button>
                </div>
              ) : (
                <p style={{ fontSize: "0.875rem", color: "#111111", cursor: "pointer" }} onClick={() => setEditingPhone(true)} title="Click to edit">{customer.phone}</p>
              )}
            </div>

            {/* Email */}
            {customer.email && (
              <div style={{ marginBottom: "0.6rem" }}>
                <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: "0.1rem" }}>Email</p>
                <p style={{ fontSize: "0.875rem", color: "#111111" }}>{customer.email}</p>
              </div>
            )}

            {/* Address */}
            {customer.address && (
              <div style={{ marginBottom: "0.6rem" }}>
                <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: "0.1rem" }}>Address</p>
                <p style={{ fontSize: "0.875rem", color: "#111111" }}>{customer.address}</p>
              </div>
            )}

            {/* Stats */}
            {(totalRevenue > 0 || (customer.jobs?.length ?? 0) > 0) && (
              <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <div>
                  <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: "0.1rem" }}>Matters</p>
                  <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#93C5FD" }}>{customer.jobs?.length ?? 0}</p>
                </div>
                {totalRevenue > 0 && (
                  <div>
                    <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginBottom: "0.1rem" }}>Revenue</p>
                    <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#111111" }}>${totalRevenue.toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1.25rem" }} />

          {/* Matters */}
          <div style={{ padding: "1rem 1.25rem" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "0.75rem" }}>Matters</p>
            {(customer.jobs?.length ?? 0) === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#D1D5DB" }}>No matters on file</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {customer.jobs.map(j => (
                  <div
                    key={j.id}
                    onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                    style={{ padding: "0.6rem 0.75rem", background: "#F9FAFB", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(0,0,0,0.06)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                    onMouseLeave={e => e.currentTarget.style.background = "#F9FAFB"}
                  >
                    <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>{j.name ?? j.type}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: 4, background: j.status === "Completed" ? "#D1FAE5" : j.status === "Active" ? "#DBEAFE" : "#F3F4F6", color: j.status === "Completed" ? "#065F46" : j.status === "Active" ? "#1E40AF" : "#6B7280", fontWeight: 600 }}>{j.status}</span>
                      {j.amount > 0 && <span style={{ fontSize: "0.7rem", color: "#9CA3AF" }}>${j.amount.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1.25rem" }} />

          {/* Notes */}
          <div style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase" }}>Notes</p>
              {!editNotes && (
                <button onClick={() => setEditNotes(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center" }} title="Edit notes">
                  <svg style={{ width: 13, height: 13 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              )}
            </div>
            {editNotes ? (
              <div>
                <textarea
                  value={notesValue}
                  onChange={e => setNotesValue(e.target.value)}
                  rows={4}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #111111", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.8rem", resize: "vertical", outline: "none", boxSizing: "border-box" }}
                  autoFocus
                />
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                  <button onClick={saveNotes} style={{ padding: "0.3rem 0.75rem", background: "#111111", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontFamily: "'DM Sans'" }}>Save</button>
                  <button onClick={() => { setNotesValue(customer.notes ?? ""); setEditNotes(false); }} style={{ padding: "0.3rem 0.75rem", background: "none", color: "#6B7280", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontFamily: "'DM Sans'" }}>Cancel</button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "0.8rem", color: customer.notes ? "#111111" : "#D1D5DB", whiteSpace: "pre-wrap" }}>{customer.notes ?? "No notes"}</p>
            )}
          </div>

          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 1.25rem" }} />

          {/* Flags */}
          <div style={{ padding: "1rem 1.25rem" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", color: "#9CA3AF", textTransform: "uppercase", marginBottom: "0.75rem" }}>Settings</p>

            {/* SMS opt-out */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>SMS Opt-Out</p>
                <p style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>Stop all automated SMS</p>
              </div>
              <button
                onClick={toggleOptOut}
                style={{ width: 36, height: 20, borderRadius: 10, background: customer.sms_opted_out ? "#111111" : "#E5E7EB", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: 2, left: customer.sms_opted_out ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
              </button>
            </div>

            {/* AI SMS */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>AI SMS Replies</p>
                <p style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>Let AI respond automatically</p>
              </div>
              <button
                onClick={toggleAiSms}
                style={{ width: 36, height: 20, borderRadius: 10, background: customer.ai_sms_replies ? "#111111" : "#E5E7EB", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
              >
                <div style={{ position: "absolute", top: 2, left: customer.ai_sms_replies ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "white", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Delete */}
          <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ width: "100%", padding: "0.5rem", background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#EF4444", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans'", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.borderColor = "#EF4444"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
              >
                Delete Client
              </button>
            ) : (
              <div style={{ background: "#FEF2F2", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0.75rem" }}>
                <p style={{ fontSize: "0.8rem", color: "#B91C1C", marginBottom: "0.5rem", fontWeight: 600 }}>Delete this client?</p>
                <p style={{ fontSize: "0.75rem", color: "#EF4444", marginBottom: "0.75rem" }}>This cannot be undone. All messages and matter links will be removed.</p>
                {!deleteUnlocked ? (
                  <button onClick={() => setDeleteUnlocked(true)} style={{ width: "100%", padding: "0.4rem", background: "#EF4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem", fontFamily: "'DM Sans'" }}>
                    Yes, delete permanently
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={deleteCustomer} style={{ flex: 1, padding: "0.4rem", background: "#B91C1C", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem", fontFamily: "'DM Sans'", fontWeight: 700 }}>
                      Confirm Delete
                    </button>
                    <button onClick={() => { setConfirmDelete(false); setDeleteUnlocked(false); }} style={{ flex: 1, padding: "0.4rem", background: "none", color: "#6B7280", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, cursor: "pointer", fontSize: "0.78rem", fontFamily: "'DM Sans'" }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---- RIGHT COLUMN: Messages + Calls + AI ---- */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Timeline */}
          <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {timeline.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#9CA3AF", gap: "0.5rem" }}>
                <svg style={{ width: 36, height: 36, opacity: 0.35 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <p style={{ fontSize: "0.85rem" }}>No messages or calls yet</p>
              </div>
            ) : timeline.map(item => {
              if (item.type === "message") {
                const msg = item.item as Message;
                const isOut = msg.direction === "outbound";
                return (
                  <div key={`msg-${msg.id}`} style={{ display: "flex", flexDirection: "column", alignItems: isOut ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "72%", padding: "0.6rem 0.875rem", borderRadius: isOut ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isOut ? "#111111" : "#F3F4F6", color: isOut ? "white" : "#111111", fontSize: "0.85rem", lineHeight: "1.45" }}>
                      {msg.body}
                    </div>
                    <span style={{ fontSize: "0.68rem", color: "#9CA3AF", marginTop: "0.2rem" }}>{timeLabel(msg.sent_at)}</span>
                  </div>
                );
              } else {
                const call = item.item as Call;
                const expanded = expandedCallId === call.id;
                return (
                  <div key={`call-${call.id}`} style={{ background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: call.transcript ? "pointer" : "default" }} onClick={() => call.transcript && setExpandedCallId(expanded ? null : call.id)}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#111111", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg style={{ width: 14, height: 14, color: "white" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.17 6.17l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>
                          {call.outcome ?? "Phone Call"} {call.duration_seconds ? `· ${formatDuration(call.duration_seconds)}` : ""}
                        </p>
                        <p style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>{timeLabel(call.created_at)}</p>
                      </div>
                      {call.transcript && (
                        <svg style={{ width: 14, height: 14, color: "#9CA3AF", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                      )}
                    </div>
                    {expanded && (
                      <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                        {call.summary && <p style={{ fontSize: "0.8rem", color: "#374151", marginBottom: "0.5rem", fontStyle: "italic" }}>{call.summary}</p>}
                        {call.transcript && <p style={{ fontSize: "0.78rem", color: "#6B7280", whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{call.transcript}</p>}
                        {call.recording_url && (
                          <audio controls src={call.recording_url} style={{ marginTop: "0.5rem", width: "100%", height: 32 }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          {!customer.sms_opted_out && (
            <div style={{ padding: "0.875rem 1.5rem", borderTop: "1px solid rgba(0,0,0,0.07)", background: "white" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <textarea
                  placeholder="Type a message..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  rows={2}
                  style={{ flex: 1, padding: "0.6rem 0.75rem", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10, fontFamily: "'DM Sans'", fontSize: "0.85rem", resize: "none", outline: "none" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#111111"}
                  onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  style={{ alignSelf: "flex-end", padding: "0.6rem 1rem", background: replyText.trim() ? "#111111" : "#E5E7EB", color: replyText.trim() ? "white" : "#9CA3AF", border: "none", borderRadius: 10, cursor: replyText.trim() ? "pointer" : "not-allowed", fontSize: "0.85rem", fontFamily: "'DM Sans'", transition: "all 0.15s", whiteSpace: "nowrap" }}
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
              {twilioNumber && <p style={{ fontSize: "0.68rem", color: "#D1D5DB", marginTop: "0.4rem" }}>Sending from {twilioNumber}</p>}
            </div>
          )}

          {/* Lawrenn Intelligence */}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.07)", padding: "0.875rem 1.5rem", background: "#ffffff" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <svg style={{ width: 14, height: 14, color: "#111111" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "#111111", textTransform: "uppercase" }}>Lawrenn Intelligence</span>
              </div>
              <button
                onClick={regenerateSummary}
                disabled={loadingSummary}
                style={{ background: "none", border: "none", cursor: loadingSummary ? "default" : "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", fontFamily: "'DM Sans'" }}
              >
                <svg style={{ width: 12, height: 12, animation: loadingSummary ? "spin 1s linear infinite" : "none" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                {loadingSummary ? "Generating..." : "Refresh"}
              </button>
            </div>

            {loadingSummary && !aiSummary && (
              <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Generating intelligence briefing...</p>
            )}
            {aiError && (
              <p style={{ fontSize: "0.8rem", color: "#EF4444" }}>{aiError}</p>
            )}
            {!loadingSummary && !aiSummary && !aiError && (
              <p style={{ fontSize: "0.8rem", color: "#D1D5DB" }}>No intelligence available yet — add messages, calls, or matters to generate a briefing.</p>
            )}

            {aiSummary && (
              <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
                {/* Left: summary + recommended action */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.82rem", color: "#374151", lineHeight: "1.65" }}>{aiSummary}</p>
                  {aiAction && (
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                      <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>Recommended Action</p>
                      <p style={{ fontSize: "0.82rem", color: "#374151", lineHeight: "1.55" }}>{aiAction}</p>
                    </div>
                  )}
                </div>

                {/* Right: intelligence cards */}
                {aiIntelligence && Object.entries(aiIntelligence).some(([, v]) => v && v !== "Unknown") && (
                  <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {Object.entries(aiIntelligence).map(([k, v]) => v && v !== "Unknown" && (
                      <div key={k} style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 7, padding: "0.35rem 0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <p style={{ fontSize: "0.65rem", color: "#9CA3AF", whiteSpace: "nowrap" }}>{k}</p>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#111111", textAlign: "right" }}>{v}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
