"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DraftResult {
  subject: string;
  body: string;
  disclaimer: string;
}

interface Props {
  messages: ChatMessage[];
  onClose: () => void;
}

export default function DraftEmailModal({ messages, onClose }: Props) {
  const { businessName } = useBusiness();

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [draft,         setDraft]         = useState<DraftResult | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody,    setEditedBody]    = useState("");
  const [copied,        setCopied]        = useState(false);

  function buildChatHistory(): string {
    return messages
      .map(m => `${m.role === "user" ? "Lawyer" : "Intelligence"}: ${m.content}`)
      .join("\n\n");
  }

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const lawyerName = user?.user_metadata?.full_name ?? user?.email ?? "Attorney";

      const res  = await fetch("/api/draft-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatHistory:   buildChatHistory(),
          recipientType: "client",
          recipientName: "Client",
          firmName:      businessName ?? "Law Firm",
          lawyerName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate draft");

      setDraft(data);
      setEditedSubject(data.subject);
      setEditedBody(data.body);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function copyToClipboard() {
    const full = `Subject: ${editedSubject}\n\n${editedBody}${draft?.disclaimer ? `\n\n${draft.disclaimer}` : ""}`;
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.65rem",
    border: "1px solid rgba(0,0,0,0.12)", borderRadius: 7,
    fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem",
    color: "#111111", background: "white", outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.7rem", fontWeight: 700, color: "#9CA3AF",
    textTransform: "uppercase" as const, letterSpacing: "0.08em",
    display: "block", marginBottom: "0.3rem",
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "1rem",
      }}>
      <div style={{
        background: "white", borderRadius: 14,
        width: "100%", maxWidth: 680,
        maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* Header */}
        <div style={{ padding: "1.1rem 1.5rem 0.9rem", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.05rem", letterSpacing: "0.06em", color: "#111111" }}>
              EMAIL DRAFT
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", display: "flex" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem 1.5rem" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 0", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                ))}
              </div>
              <p style={{ fontSize: "0.82rem", color: "#9CA3AF", margin: 0 }}>Drafting email…</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <p style={{ fontSize: "0.85rem", color: "#DC2626", marginBottom: "1rem" }}>{error}</p>
              <button onClick={generate}
                style={{ padding: "0.45rem 1rem", background: "#111111", border: "none", borderRadius: 7, color: "white", fontSize: "0.82rem", fontFamily: "'DM Sans'", cursor: "pointer" }}>
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "0.9rem" }}>
                <label style={labelStyle}>Subject</label>
                <input type="text" value={editedSubject} onChange={e => setEditedSubject(e.target.value)}
                  style={{ ...inputStyle, fontWeight: 500 }} />
              </div>

              <div style={{ marginBottom: "0.9rem" }}>
                <label style={labelStyle}>Body</label>
                <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)}
                  rows={18}
                  style={{ ...inputStyle, resize: "vertical" as const, lineHeight: 1.75, fontSize: "0.855rem" }} />
              </div>

              {draft?.disclaimer && (
                <div style={{ marginBottom: "1rem", padding: "0.65rem 0.8rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 7 }}>
                  <p style={{ fontSize: "0.67rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 0.3rem" }}>Disclaimer</p>
                  <p style={{ fontSize: "0.775rem", color: "#6B7280", margin: 0, lineHeight: 1.55 }}>{draft.disclaimer}</p>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" as const, alignItems: "center" }}>
                <button onClick={copyToClipboard}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", background: copied ? "#059669" : "#111111", border: "none", borderRadius: 7, color: "white", fontSize: "0.82rem", fontFamily: "'DM Sans'", cursor: "pointer", fontWeight: 500, transition: "background 0.2s" }}>
                  {copied ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Copied</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                  )}
                </button>

                <button onClick={generate}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", background: "transparent", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, color: "#374151", fontSize: "0.82rem", fontFamily: "'DM Sans'", cursor: "pointer", fontWeight: 500 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                  </svg>
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
      `}</style>
    </div>
  );
}
