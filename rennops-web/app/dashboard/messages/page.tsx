"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import DashboardNav from "@/components/DashboardNav";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Thread {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  direction: string;
}

interface Message {
  id: string;
  direction: string;
  body: string;
  sent_at: string;
  read: boolean;
}

export default function MessagesPage() {
  const router = useRouter();
  const { businessId, twilioNumber, loading: bizLoading } = useBusiness();

  const [threads, setThreads]         = useState<Thread[]>([]);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [selected, setSelected]       = useState<Thread | null>(null);
  const [loading, setLoading]         = useState(true);
  const [replyText, setReplyText]     = useState("");
  const [sending, setSending]         = useState(false);
  const [search, setSearch]           = useState("");
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    const inboxChannel = supabase
      .channel(`messages-inbox-${businessId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        const msg = payload.new as any;
        // Update thread list
        loadThreads(businessId!);
        // Add to open thread if matches
        setSelected(curr => {
          if (curr && msg.customer_id === curr.customer_id) {
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
          return curr;
        });
      })
      .subscribe();

    async function load() {
      await loadThreads(businessId!);
      setLoading(false);
    }
    load();

    return () => { supabase.removeChannel(inboxChannel); };
  }, [businessId, bizLoading, router]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadThreads(bizId: string) {
    // Get latest message per customer
    const { data } = await supabase
      .from("messages")
      .select(`
        customer_id,
        body,
        sent_at,
        direction,
        read,
        customers (name, phone)
      `)
      .eq("business_id", bizId)
      .order("sent_at", { ascending: false });

    if (!data) return;

    // Group by customer_id — keep latest per customer
    const threadMap = new Map<string, Thread>();
    for (const msg of data as any[]) {
      if (!msg.customer_id) continue;
      if (!threadMap.has(msg.customer_id)) {
        threadMap.set(msg.customer_id, {
          customer_id:    msg.customer_id,
          customer_name:  msg.customers?.name ?? null,
          customer_phone: msg.customers?.phone ?? "Unknown",
          last_message:   msg.body,
          last_message_at: msg.sent_at,
          unread_count:   0,
          direction:      msg.direction,
        });
      }
      // Count unreads
      if (!msg.read && msg.direction === "inbound") {
        const t = threadMap.get(msg.customer_id)!;
        t.unread_count++;
        threadMap.set(msg.customer_id, t);
      }
    }

    setThreads(Array.from(threadMap.values()).sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    ));
  }

  async function selectThread(thread: Thread) {
    setSelected(thread);
    setReplyText("");

    const { data } = await supabase
      .from("messages")
      .select("id, direction, body, sent_at, read")
      .eq("business_id", businessId)
      .eq("customer_id", thread.customer_id)
      .order("sent_at", { ascending: true });

    setMessages((data as any) ?? []);

    // Mark as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("customer_id", thread.customer_id)
      .eq("read", false);

    // Update unread count in threads
    setThreads(prev => prev.map(t =>
      t.customer_id === thread.customer_id ? { ...t, unread_count: 0 } : t
    ));
  }

  async function sendReply() {
    if (!replyText.trim() || !selected || sending || !businessId || !twilioNumber) return;
    setSending(true);

    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to:   selected.customer_phone,
          from: twilioNumber,
          body: replyText.trim(),
        }),
      });

      if (res.ok) {
        const { data: msg } = await supabase
          .from("messages")
          .insert({
            business_id: businessId,
            customer_id: selected.customer_id,
            direction:   "outbound",
            channel:     "sms",
            body:        replyText.trim(),
            to_number:   selected.customer_phone,
            from_number: twilioNumber,
          })
          .select("id, direction, body, sent_at, read")
          .single();

        if (msg) {
          setMessages(prev => {
            if (prev.some(m => m.id === (msg as any).id)) return prev;
            return [...prev, msg as any];
          });
          setThreads(prev => prev.map(t =>
            t.customer_id === selected.customer_id
              ? { ...t, last_message: replyText.trim(), last_message_at: new Date().toISOString(), direction: "outbound" }
              : t
          ));
        }
        setReplyText("");
      }
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  const filteredThreads = threads.filter(t =>
    (t.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
     t.customer_phone.includes(search) ||
     t.last_message.toLowerCase().includes(search.toLowerCase()))
  );

  const totalUnread = threads.reduce((sum, t) => sum + t.unread_count, 0);

  function formatTime(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading messages...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>

      <DashboardNav />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem", height: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>

        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>
            Messages {totalUnread > 0 && <span style={{ fontSize: "1.2rem", color: "#EF4444" }}>({totalUnread} unread)</span>}
          </h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>SMS conversations with your customers</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem", flex: 1, minHeight: 0 }}>

          {/* Thread list */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Search */}
            <div style={{ padding: "0.75rem", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <input
                type="text"
                placeholder="Search conversations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%", padding: "0.6rem 0.8rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Threads */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredThreads.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                  <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>💬</p>
                  <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No conversations yet</p>
                </div>
              ) : (
                filteredThreads.map((thread, i) => (
                  <div key={thread.customer_id} onClick={() => selectThread(thread)}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: i < filteredThreads.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      cursor: "pointer",
                      background: selected?.customer_id === thread.customer_id ? "#F0FAFE" : "white",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => { if (selected?.customer_id !== thread.customer_id) e.currentTarget.style.background = "#F9FAFB"; }}
                    onMouseLeave={e => { if (selected?.customer_id !== thread.customer_id) e.currentTarget.style.background = "white"; }}>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #0cc0df, #0D1B2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0, position: "relative" }}>
                        {(thread.customer_name ?? thread.customer_phone).charAt(0).toUpperCase()}
                        {thread.unread_count > 0 && (
                          <span style={{ position: "absolute", top: -2, right: -2, width: 14, height: 14, background: "#EF4444", borderRadius: "50%", fontSize: "0.6rem", fontWeight: 700, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {thread.unread_count}
                          </span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
                          <p style={{ fontSize: "0.875rem", fontWeight: thread.unread_count > 0 ? 700 : 600, color: "#0D1B2A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            {thread.customer_name ?? thread.customer_phone}
                          </p>
                          <span style={{ fontSize: "0.72rem", color: "#9CA3AF", flexShrink: 0, marginLeft: "0.5rem" }}>
                            {formatTime(thread.last_message_at)}
                          </span>
                        </div>
                        <p style={{ fontSize: "0.78rem", color: thread.unread_count > 0 ? "#374151" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: thread.unread_count > 0 ? 600 : 400 }}>
                          {thread.direction === "outbound" ? "You: " : ""}{thread.last_message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message thread */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!selected ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ fontSize: "2.5rem" }}>💬</p>
                <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A" }}>Select a conversation</p>
                <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>Choose a customer from the left to view their messages</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #0cc0df, #0D1B2A)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "0.875rem" }}>
                    {(selected.customer_name ?? selected.customer_phone).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A" }}>
                      {selected.customer_name ?? selected.customer_phone}
                    </p>
                    <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>{selected.customer_phone}</p>
                  </div>
                  <a href="/dashboard/customers" style={{ marginLeft: "auto", fontSize: "0.8rem", color: "#0cc0df", textDecoration: "none", fontWeight: 600 }}>
                    View profile
                  </a>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{ display: "flex", justifyContent: msg.direction === "outbound" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "70%",
                        padding: "0.6rem 0.9rem",
                        borderRadius: msg.direction === "outbound" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                        background: msg.direction === "outbound" ? "#0D1B2A" : "#F3F4F6",
                      }}>
                        <p style={{ fontSize: "0.875rem", color: msg.direction === "outbound" ? "white" : "#0D1B2A", lineHeight: 1.5, margin: 0 }}>
                          {msg.body}
                        </p>
                        <p style={{ fontSize: "0.65rem", color: msg.direction === "outbound" ? "rgba(255,255,255,0.45)" : "#9CA3AF", marginTop: "0.25rem", textAlign: msg.direction === "outbound" ? "right" : "left" }}>
                          {new Date(msg.sent_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply box */}
                <div style={{ padding: "1rem", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    style={{ flex: 1, padding: "0.7rem 0.9rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 10, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.875rem", outline: "none", resize: "none", lineHeight: 1.5, boxSizing: "border-box" }}
                    onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
                  />
                  <button onClick={sendReply} disabled={sending || !replyText.trim()}
                    style={{ padding: "0.7rem 1.25rem", background: sending || !replyText.trim() ? "rgba(12,192,223,0.4)" : "#0cc0df", border: "none", borderRadius: 10, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700, cursor: sending || !replyText.trim() ? "not-allowed" : "pointer", transition: "all 0.2s", whiteSpace: "nowrap", height: "fit-content" }}>
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}