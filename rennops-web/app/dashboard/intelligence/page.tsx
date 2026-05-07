"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Source {
  type: string;
  content: string;
  similarity: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const SUGGESTED_QUESTIONS = [
  "How many calls did I get last week?",
  "What was my busiest day this month?",
  "What time of day do most customers call?",
  "What are the most common reasons customers call?",
  "How many calls were escalated this month?",
  "What was the outcome breakdown of my calls?",
  "Did any customers complain via text this month?",
  "Which customers asked to reschedule?",
  "Show me calls where customers mentioned an emergency",
  "How many review requests went out this month?",
];

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700, color: "#0D1B2A" }}>{p.slice(2, -2)}</strong>;
    }
    return p;
  });
}

function renderContent(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    if (line.startsWith("## ")) {
      nodes.push(
        <p key={i} style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0D1B2A", margin: nodes.length > 0 ? "0.75rem 0 0.3rem" : "0 0 0.3rem" }}>
          {renderInline(line.slice(3))}
        </p>
      );
      i++; continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(
        <p key={i} style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151", margin: nodes.length > 0 ? "0.6rem 0 0.25rem" : "0 0 0.25rem" }}>
          {renderInline(line.slice(4))}
        </p>
      );
      i++; continue;
    }

    if (line.match(/^[-*] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(
          <li key={i} style={{ marginBottom: "0.2rem", paddingLeft: "0.15rem" }}>
            {renderInline(lines[i].replace(/^[-*] /, ""))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} style={{ margin: "0.35rem 0", paddingLeft: "1.2rem", listStyleType: "disc" }}>
          {items}
        </ul>
      );
      continue;
    }

    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(
          <li key={i} style={{ marginBottom: "0.2rem", paddingLeft: "0.15rem" }}>
            {renderInline(lines[i].replace(/^\d+\. /, ""))}
          </li>
        );
        i++;
      }
      nodes.push(
        <ol key={`ol-${i}`} style={{ margin: "0.35rem 0", paddingLeft: "1.35rem" }}>
          {items}
        </ol>
      );
      continue;
    }

    nodes.push(
      <p key={i} style={{ margin: "0 0 0.35rem 0", lineHeight: 1.7 }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div style={{ fontSize: "0.9rem", color: "#1F2937" }}>{nodes}</div>;
}

export default function IntelligencePage() {
  const router = useRouter();
  const { businessId, loading: bizLoading } = useBusiness();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSources, setActiveSources] = useState<Source[] | null>(null);
  const [activeSourcesLabel, setActiveSourcesLabel] = useState("");
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!bizLoading && !businessId) router.push("/login");
  }, [businessId, bizLoading, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const query = text ?? input.trim();
    if (!query || loading || !businessId) return;

    setInput("");
    setLoading(true);
    setMessages(prev => [...prev, { role: "user", content: query }]);

    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          business_id: businessId,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      }]);

      if (data.sources && data.sources.length > 0) {
        setActiveSources(data.sources);
        setActiveSourcesLabel(query.length > 48 ? query.slice(0, 48) + "..." : query);
        setExpandedSource(null);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I had trouble processing that. Please try again.",
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  if (bizLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "2rem 1.5rem", flex: 1, display: "flex", flexDirection: "column", width: "100%", boxSizing: "border-box" as const }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", margin: 0 }}>
            <span style={{ color: "#0cc0df" }}>Renn</span> Intelligence
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Ask anything about your calls, messages, and customer conversations
          </p>
        </div>

        {/* Two-column layout */}
        <div style={{ flex: 1, display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>

          {/* Chat panel */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 16, overflow: "hidden", minWidth: 0 }}>

            {/* Messages */}
            <div style={{ overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", minHeight: 480, maxHeight: "calc(100vh - 300px)" }}>

              {messages.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5rem", height: "100%", padding: "2rem 0" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(12,192,223,0.08)", border: "1.5px solid rgba(12,192,223,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                    </div>
                    <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.25rem", letterSpacing: "0.04em", color: "#0D1B2A", margin: "0 0 0.4rem" }}>
                      ASK YOUR BUSINESS DATA
                    </h3>
                    <p style={{ fontSize: "0.86rem", color: "#9CA3AF", maxWidth: 360, lineHeight: 1.6, margin: "0 auto" }}>
                      Ask about your calls, customers, and bookings. I will search through your data and give you real answers.
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem", width: "100%", maxWidth: 540 }}>
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <button key={i} onClick={() => sendMessage(q)}
                        style={{
                          padding: "0.6rem 0.85rem",
                          background: "#F9FAFB",
                          border: "1px solid rgba(0,0,0,0.07)",
                          borderRadius: 8,
                          color: "#374151",
                          fontFamily: "'DM Sans'",
                          fontSize: "0.795rem",
                          textAlign: "left",
                          cursor: "pointer",
                          lineHeight: 1.45,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#0cc0df"; e.currentTarget.style.background = "rgba(12,192,223,0.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.07)"; e.currentTarget.style.background = "#F9FAFB"; }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: "0.6rem", alignItems: "flex-start" }}>

                      {msg.role === "assistant" && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(12,192,223,0.08)", border: "1.5px solid rgba(12,192,223,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                        </div>
                      )}

                      <div style={{ maxWidth: msg.role === "user" ? "68%" : "86%" }}>
                        <div style={{
                          padding: "0.7rem 1rem",
                          borderRadius: msg.role === "user" ? "14px 3px 14px 14px" : "3px 14px 14px 14px",
                          background: msg.role === "user" ? "#E8F4FD" : "#FAFAFA",
                          border: msg.role === "assistant" ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(12,192,223,0.2)",
                        }}>
                          {msg.role === "user" ? (
                            <p style={{ fontSize: "0.875rem", color: "#0D1B2A", lineHeight: 1.6, margin: 0 }}>
                              {msg.content}
                            </p>
                          ) : (
                            renderContent(msg.content)
                          )}
                        </div>

                        {/* Source pill */}
                        {msg.sources && msg.sources.length > 0 && (
                          <button
                            onClick={() => {
                              setActiveSources(msg.sources!);
                              const prevUser = messages.slice(0, i).filter(m => m.role === "user").pop()?.content ?? "";
                              setActiveSourcesLabel(prevUser.length > 48 ? prevUser.slice(0, 48) + "..." : prevUser);
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              marginTop: "0.4rem", padding: "0.2rem 0.55rem",
                              background: "rgba(12,192,223,0.06)",
                              border: "1px solid rgba(12,192,223,0.2)",
                              borderRadius: 20, cursor: "pointer",
                              color: "#0aa8bf", fontFamily: "'DM Sans'", fontSize: "0.72rem", fontWeight: 600,
                              transition: "all 0.15s",
                            }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(12,192,223,0.08)", border: "1.5px solid rgba(12,192,223,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                      </div>
                      <div style={{ padding: "0.7rem 1rem", background: "#FAFAFA", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "3px 14px 14px 14px" }}>
                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                          {[0, 1, 2].map(j => (
                            <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: "#0cc0df", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input bar */}
            <div style={{ padding: "0.875rem 1rem", borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: "0.65rem", alignItems: "center", background: "white" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything about your calls and customers... (Enter to send)"
                rows={2}
                style={{
                  flex: 1, padding: "0.7rem 0.9rem",
                  background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.09)",
                  borderRadius: 10, color: "#0D1B2A",
                  fontFamily: "'DM Sans'", fontSize: "0.875rem",
                  outline: "none", resize: "none", lineHeight: 1.5,
                  boxSizing: "border-box" as const, transition: "border-color 0.15s",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.09)"}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{
                  padding: "0.7rem 1.1rem",
                  background: loading || !input.trim() ? "#E5E7EB" : "#0D1B2A",
                  border: "none", borderRadius: 9,
                  color: loading || !input.trim() ? "#9CA3AF" : "white",
                  fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600,
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.15s", whiteSpace: "nowrap" as const,
                  display: "flex", alignItems: "center", gap: "0.4rem",
                }}
                onMouseEnter={e => { if (!loading && input.trim()) (e.currentTarget as HTMLButtonElement).style.background = "#1a2f45"; }}
                onMouseLeave={e => { if (!loading && input.trim()) (e.currentTarget as HTMLButtonElement).style.background = "#0D1B2A"; }}>
                Send
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Sources side panel */}
          <div style={{
            width: !(activeSources && activeSources.length > 0) ? 0 : expandedSource !== null ? 420 : 272,
            flexShrink: 0, overflow: "hidden",
            opacity: activeSources && activeSources.length > 0 ? 1 : 0,
            pointerEvents: activeSources && activeSources.length > 0 ? "auto" : "none",
            transition: "opacity 0.2s, width 0.2s ease",
          }}>
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, overflow: "hidden" }}>

              {/* Panel header */}
              <div style={{ padding: "0.8rem 0.9rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.09em", margin: "0 0 0.2rem" }}>
                    Sources
                  </p>
                  {activeSourcesLabel && (
                    <p style={{ fontSize: "0.75rem", color: "#374151", margin: 0, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      &ldquo;{activeSourcesLabel}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActiveSources(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "#9CA3AF", display: "flex", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Source cards */}
              <div style={{ padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.45rem", maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
                {activeSources?.map((src, i) => {
                  const isExpanded = expandedSource === i;
                  const truncated = src.content.length > 180;
                  return (
                    <div
                      key={i}
                      onClick={() => setExpandedSource(isExpanded ? null : i)}
                      style={{
                        background: isExpanded ? "#F0FAFE" : "#F9FAFB",
                        border: `1px solid ${isExpanded ? "rgba(12,192,223,0.25)" : "rgba(0,0,0,0.06)"}`,
                        borderRadius: 10, padding: "0.6rem 0.7rem",
                        cursor: truncated ? "pointer" : "default",
                        transition: "all 0.15s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          {src.type === "call" ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                          )}
                          <span style={{ fontSize: "0.67rem", fontWeight: 700, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                            {src.type === "call" ? "Call" : "Message"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontSize: "0.68rem", color: "#0cc0df", fontWeight: 700 }}>
                            {Math.round(src.similarity * 100)}%
                          </span>
                          {truncated && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: "0.775rem", color: "#374151", lineHeight: 1.55, margin: 0 }}>
                        {isExpanded ? src.content : src.content.slice(0, 180)}{!isExpanded && truncated ? "..." : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
