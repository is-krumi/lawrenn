"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";
import FeatureGate from "@/components/FeatureGate";
import RichEmailEditor from "@/components/RichEmailEditor";

function DocTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return (
      <img
        src="/icons/adobeLogo.png"
        alt="PDF"
        width={16}
        height={16}
        style={{ flexShrink: 0, objectFit: "contain" }}
      />
    );
  }

  // Document shape with folded corner for other types
  function DocShape({ color, foldColor, children }: { color: string; foldColor: string; children: React.ReactNode }) {
    return (
      <svg width="16" height="19" viewBox="0 0 16 19" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <path d="M1 2.5C1 1.67 1.67 1 2.5 1H9L15 7V16.5C15 17.33 14.33 18 13.5 18H2.5C1.67 18 1 17.33 1 16.5V2.5Z" fill={color}/>
        <path d="M9 1L15 7H10C9.45 7 9 6.55 9 6V1Z" fill={foldColor}/>
        {children}
      </svg>
    );
  }

  if (ext === "doc" || ext === "docx") {
    return (
      <DocShape color="#2B579A" foldColor="#1E3F73">
        <text x="8" y="15.5" textAnchor="middle" fill="white" fontSize="7" fontWeight="900" fontFamily="Arial,sans-serif">W</text>
      </DocShape>
    );
  }
  if (ext === "xls" || ext === "xlsx") {
    return (
      <DocShape color="#217346" foldColor="#185A34">
        <text x="8" y="15" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="800" fontFamily="Arial,sans-serif">XLS</text>
      </DocShape>
    );
  }
  if (ext === "ppt" || ext === "pptx") {
    return (
      <DocShape color="#D04423" foldColor="#A8341A">
        <text x="8" y="15" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="800" fontFamily="Arial,sans-serif">PPT</text>
      </DocShape>
    );
  }
  return (
    <DocShape color="#6B7280" foldColor="#4B5563">
      <text x="8" y="15" textAnchor="middle" fill="white" fontSize="4" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="0.3">
        {ext.toUpperCase().slice(0, 3) || "DOC"}
      </text>
    </DocShape>
  );
}

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

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

function genId() { return crypto.randomUUID(); }

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SUGGESTED_QUESTIONS = [
  "How many calls did I get last week?",
  "What was my busiest day this month?",
  "What time of day do most customers call?",
  "What are the most common reasons customers call?",
  "Summarize the document I uploaded",
  "What are the key terms in this contract?",
  "What was the outcome breakdown of my calls?",
  "Did any customers complain via text this month?",
  "Which customers asked to reschedule?",
  "Show me calls where customers mentioned an emergency",
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

interface DocRecord {
  id: string;
  name: string;
  status: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
}

export default function IntelligencePage() {
  const router = useRouter();
  const { businessId, businessName, loading: bizLoading } = useBusiness();

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(() => genId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeSources, setActiveSources] = useState<Source[] | null>(null);
  const [activeSourcesLabel, setActiveSourcesLabel] = useState("");
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
  const [isDragging,      setIsDragging]      = useState(false);
  const [showDraftEmail,  setShowDraftEmail]  = useState(false);
  const [draftLoading,    setDraftLoading]    = useState(false);
  const [draftError,      setDraftError]      = useState("");
  const [draftSubject,    setDraftSubject]    = useState("");
  const [draftBody,       setDraftBody]       = useState("");
  const [draftCopied,     setDraftCopied]     = useState(false);
  const [draftWidth,      setDraftWidth]      = useState(600);
  const [draftVersion,    setDraftVersion]    = useState(0);
  const [sourcesWidth,    setSourcesWidth]    = useState(260);
  const draftDragRef   = useRef<{ startX: number; startW: number } | null>(null);
  const sourcesDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [showPurposeInput, setShowPurposeInput] = useState(false);
  const [emailPurpose,     setEmailPurpose]     = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncedRef = useRef<Map<string, number>>(new Map());
  const hasInteracted = useRef(false);

  useEffect(() => {
    if (!bizLoading && !businessId) router.push("/login");
  }, [businessId, bizLoading, router]);

  // Load sessions — localStorage first (instant), then Supabase (authoritative)
  useEffect(() => {
    if (!businessId) return;
    let mounted = true;

    // 1. Instant local load
    const raw = localStorage.getItem(`intel_sessions_${businessId}`);
    const local: ChatSession[] = raw ? JSON.parse(raw) : [];
    if (local.length > 0) {
      const activeId = localStorage.getItem(`intel_active_${businessId}`);
      const active = local.find(s => s.id === activeId) ?? local[0];
      setChatSessions(local);
      setCurrentChatId(active.id);
      setMessages(active.messages as Message[]);
      for (const s of local) syncedRef.current.set(s.id, s.messages.length);
    }

    // 2. Supabase load — overwrite only if user hasn't interacted yet
    fetch(`/api/intelligence/chats?business_id=${businessId}`)
      .then(r => r.json())
      .then(({ conversations }) => {
        if (!mounted || !conversations) return;
        const sessions: ChatSession[] = conversations;
        setChatSessions(sessions);
        localStorage.setItem(`intel_sessions_${businessId}`, JSON.stringify(sessions));
        for (const s of sessions) syncedRef.current.set(s.id, s.messages.length);

        if (!hasInteracted.current) {
          const activeId = localStorage.getItem(`intel_active_${businessId}`);
          const active = sessions.find(s => s.id === activeId) ?? sessions[0];
          if (active) {
            setCurrentChatId(active.id);
            setMessages(active.messages as Message[]);
          } else {
            setMessages([]);
          }
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [businessId]);

  // Auto-save whenever messages change (after at least one exchange)
  useEffect(() => {
    if (!businessId || !currentChatId || messages.length < 2) return;
    const title = (messages.find(m => m.role === "user")?.content ?? "Untitled").slice(0, 60);
    const storedMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Update local state + localStorage
    setChatSessions(prev => {
      const exists = prev.find(s => s.id === currentChatId);
      const updated = exists
        ? prev.map(s => s.id === currentChatId ? { ...s, title, messages: storedMessages } : s)
        : [{ id: currentChatId, title, createdAt: Date.now(), messages: storedMessages }, ...prev];
      localStorage.setItem(`intel_sessions_${businessId}`, JSON.stringify(updated));
      localStorage.setItem(`intel_active_${businessId}`, currentChatId);
      return updated;
    });

    // Sync new messages to Supabase
    const lastSynced = syncedRef.current.get(currentChatId) ?? 0;
    const newMessages = storedMessages.slice(lastSynced);
    if (newMessages.length > 0 || !syncedRef.current.has(currentChatId)) {
      syncedRef.current.set(currentChatId, storedMessages.length);
      fetch("/api/intelligence/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: currentChatId, business_id: businessId, title, new_messages: newMessages }),
      }).catch(() => {});
    }
  }, [messages, currentChatId, businessId]);

  function removeDocument(doc: DocRecord) {
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
  }

  async function generateDraft(purpose: string) {
    setShowPurposeInput(false);
    setEmailPurpose("");
    setShowDraftEmail(true);
    setDraftLoading(true);
    setDraftError("");
    setDraftSubject("");
    setDraftBody("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const lawyerName = user?.user_metadata?.full_name ?? user?.email ?? "Attorney";
      const chatHistory = messages
        .map(m => `${m.role === "user" ? "Lawyer" : "Intelligence"}: ${m.content}`)
        .join("\n\n");
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatHistory,
          recipientType: "client",
          recipientName: "Client",
          firmName:      businessName ?? "Law Firm",
          lawyerName,
          instructions:  purpose.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate draft");
      setDraftSubject(data.subject ?? "");
      setDraftBody(data.body ?? "");
      setDraftVersion(v => v + 1); // force RichEmailEditor remount with new content
    } catch (err: any) {
      setDraftError(err.message);
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleFileDrop(file: File) {
    if (!businessId) return;
    if (documents.some(d => d.name === file.name)) {
      alert(`"${file.name}" is already attached. Remove it first to re-upload.`);
      return;
    }
    setUploading(true);
    setUploadingName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("business_id", businessId);
    try {
      const res  = await fetch("/api/process-document", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setDocuments(prev => [{ id: data.document_id, name: file.name, status: "ready" }, ...prev]);
      } else {
        alert(data.error ?? "Failed to process document");
      }
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onDraftMouseMove = useCallback((e: MouseEvent) => {
    if (!draftDragRef.current) return;
    const dx = draftDragRef.current.startX - e.clientX;
    setDraftWidth(Math.max(340, Math.min(1000, draftDragRef.current.startW + dx)));
  }, []);

  const onDraftMouseUp = useCallback(() => {
    draftDragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const onSourcesMouseMove = useCallback((e: MouseEvent) => {
    if (!sourcesDragRef.current) return;
    const dx = sourcesDragRef.current.startX - e.clientX;
    setSourcesWidth(Math.max(180, Math.min(540, sourcesDragRef.current.startW + dx)));
  }, []);

  const onSourcesMouseUp = useCallback(() => {
    sourcesDragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onDraftMouseMove);
    window.addEventListener("mouseup",   onDraftMouseUp);
    window.addEventListener("mousemove", onSourcesMouseMove);
    window.addEventListener("mouseup",   onSourcesMouseUp);
    return () => {
      window.removeEventListener("mousemove", onDraftMouseMove);
      window.removeEventListener("mouseup",   onDraftMouseUp);
      window.removeEventListener("mousemove", onSourcesMouseMove);
      window.removeEventListener("mouseup",   onSourcesMouseUp);
    };
  }, [onDraftMouseMove, onDraftMouseUp, onSourcesMouseMove, onSourcesMouseUp]);

  function startDraftDrag(e: React.MouseEvent) {
    e.preventDefault();
    draftDragRef.current = { startX: e.clientX, startW: draftWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function startSourcesDrag(e: React.MouseEvent) {
    e.preventDefault();
    sourcesDragRef.current = { startX: e.clientX, startW: sourcesWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function startNewChat() {
    const newId = genId();
    setCurrentChatId(newId);
    setMessages([]);
    setActiveSources(null);
    setShowDraftEmail(false);
    if (businessId) localStorage.setItem(`intel_active_${businessId}`, newId);
  }

  function switchToChat(session: ChatSession) {
    setCurrentChatId(session.id);
    setMessages(session.messages as Message[]);
    setActiveSources(null);
    setShowDraftEmail(false);
    if (businessId) localStorage.setItem(`intel_active_${businessId}`, session.id);
  }

  function deleteChat(id: string) {
    if (!businessId) return;
    setChatSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem(`intel_sessions_${businessId}`, JSON.stringify(updated));
      return updated;
    });
    syncedRef.current.delete(id);
    fetch(`/api/intelligence/chats/${id}?business_id=${businessId}`, { method: "DELETE" }).catch(() => {});
    if (id === currentChatId) startNewChat();
  }

  async function sendMessage(text?: string) {
    const query = text ?? input.trim();
    if (!query || loading || !businessId) return;

    hasInteracted.current = true;
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading...</p>
      </div>
    );
  }

  return (
    <FeatureGate feature="intelligence">
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleFileDrop(file); }}
      style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif", position: "relative" as const }}>

      {/* Drag overlay */}
      {isDragging && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(12,192,223,0.05)", border: "2px dashed rgba(12,192,223,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.75rem", display: "block" }}>
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
            </svg>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0cc0df" }}>Drop to upload document</p>
          </div>
        </div>
      )}

      {/* Hidden file input — shared by both tabs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.doc,.docx"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); e.target.value = ""; }}
      />

      {/* ── Main body: sidebar + messages + sources ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Chat history sidebar */}
        <div style={{ width: 210, flexShrink: 0, borderRight: "1px solid rgba(0,0,0,0.07)", background: "white", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "0.6rem 0.65rem", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <button
              onClick={startNewChat}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", padding: "0.5rem 0.65rem", background: "#F5F5F0", border: "none", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.35rem 0.35rem" }}>
            {chatSessions.length === 0 ? (
              <p style={{ fontSize: "0.72rem", color: "#9CA3AF", textAlign: "center" as const, padding: "1.5rem 0.4rem", lineHeight: 1.55, margin: 0 }}>
                No previous chats
              </p>
            ) : (
              chatSessions.map(session => {
                const isActive = session.id === currentChatId;
                return (
                  <div
                    key={session.id}
                    className="chat-session-row"
                    style={{ position: "relative" as const, display: "flex", alignItems: "center", borderRadius: 7, background: isActive ? "#F3F4F6" : "transparent", marginBottom: 1 }}>
                    <button
                      onClick={() => switchToChat(session)}
                      style={{ flex: 1, textAlign: "left" as const, padding: "0.45rem 0.55rem", background: "transparent", border: "none", borderRadius: 7, fontFamily: "'DM Sans'", cursor: "pointer", minWidth: 0, overflow: "hidden" }}>
                      <p style={{ margin: 0, fontSize: "0.775rem", color: isActive ? "#111111" : "#374151", fontWeight: isActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {session.title}
                      </p>
                      <p style={{ margin: "0.1rem 0 0", fontSize: "0.67rem", color: "#9CA3AF", lineHeight: 1.3 }}>
                        {relTime(session.createdAt)}
                      </p>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteChat(session.id); }}
                      className="chat-delete-btn"
                      title="Delete chat"
                      style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0.4rem", color: "#9CA3AF", display: "flex", borderRadius: 4, opacity: 0, transition: "opacity 0.1s" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Left column: chat messages + input bar */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Messages scroll area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "2rem 1.5rem 1rem" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>

            {messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.75rem", minHeight: "60vh", padding: "2rem 0" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(12,192,223,0.08)", border: "1.5px solid rgba(12,192,223,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.06em", color: "#111111", margin: "0 0 0.5rem" }}>
                    ASK YOUR BUSINESS DATA
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "#9CA3AF", maxWidth: 380, lineHeight: 1.65, margin: "0 auto" }}>
                    Ask about your calls, customers, and uploaded documents.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", width: "100%", maxWidth: 580 }}>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q)}
                      style={{
                        padding: "0.65rem 0.9rem",
                        background: "white",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 8,
                        color: "#374151",
                        fontFamily: "'DM Sans'",
                        fontSize: "0.8rem",
                        textAlign: "left",
                        cursor: "pointer",
                        lineHeight: 1.45,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)"; e.currentTarget.style.background = "white"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; e.currentTarget.style.background = "white"; }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", paddingBottom: "1rem" }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    {msg.role === "user" ? (
                      <div style={{
                        maxWidth: "72%",
                        padding: "0.65rem 1rem",
                        background: "#F5F5F0",
                        borderRadius: "16px 16px 4px 16px",
                        color: "#111111",
                        fontSize: "0.875rem",
                        lineHeight: 1.6,
                      }}>
                        {msg.content}
                      </div>
                    ) : (
                      <div style={{ width: "100%" }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                          Intelligence
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "#111111", lineHeight: 1.75 }}>
                          {renderContent(msg.content ?? "")}
                        </div>
                        {msg.sources && msg.sources.length > 0 && (
                          <button
                            onClick={() => {
                              setActiveSources(msg.sources!);
                              const prevUser = messages.slice(0, i).filter(m => m.role === "user").pop()?.content ?? "";
                              setActiveSourcesLabel(prevUser.length > 48 ? prevUser.slice(0, 48) + "..." : prevUser);
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "0.3rem",
                              marginTop: "0.65rem", padding: "0.2rem 0.6rem",
                              background: "transparent",
                              border: "1px solid rgba(0,0,0,0.1)",
                              borderRadius: 20, cursor: "pointer",
                              color: "#9CA3AF", fontFamily: "'DM Sans'", fontSize: "0.72rem", fontWeight: 500,
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.2)"; (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                            {msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: "0.5rem" }}>Intelligence</div>
                    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", padding: "0.5rem 0" }}>
                      {[0, 1, 2].map(j => (
                        <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input bar — lives inside the left column so email panel can be full height */}
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(0,0,0,0.07)", background: "white", padding: "0.75rem 1.5rem 1rem" }}>
          <div style={{ maxWidth: 780, margin: "0 auto" }}>

            {/* Draft Email button / purpose prompt */}
            {messages.length > 0 && !showDraftEmail && (
              <div style={{ marginBottom: "0.4rem" }}>
                {showPurposeInput ? (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: "0.4rem",
                    padding: "0.6rem 0.75rem",
                    background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
                  }}>
                    <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#374151", fontFamily: "'DM Sans'" }}>
                      What is the purpose of this email?
                    </p>
                    <input
                      autoFocus
                      type="text"
                      value={emailPurpose}
                      onChange={e => setEmailPurpose(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && emailPurpose.trim()) generateDraft(emailPurpose);
                        if (e.key === "Escape") { setShowPurposeInput(false); setEmailPurpose(""); }
                      }}
                      placeholder="e.g. Inform client of settlement offer, follow up on outstanding invoice…"
                      style={{
                        width: "100%", padding: "0.4rem 0.6rem",
                        border: "1px solid rgba(0,0,0,0.12)", borderRadius: 7,
                        fontFamily: "'DM Sans'", fontSize: "0.8rem", color: "#111111",
                        background: "white", outline: "none", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => { setShowPurposeInput(false); setEmailPurpose(""); }}
                        style={{
                          padding: "0.3rem 0.7rem", background: "transparent",
                          border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7,
                          fontFamily: "'DM Sans'", fontSize: "0.75rem", color: "#6B7280", cursor: "pointer",
                        }}>
                        Cancel
                      </button>
                      <button
                        onClick={() => generateDraft(emailPurpose)}
                        disabled={!emailPurpose.trim()}
                        style={{
                          padding: "0.3rem 0.85rem", background: emailPurpose.trim() ? "#111111" : "rgba(0,0,0,0.06)",
                          border: "none", borderRadius: 7,
                          fontFamily: "'DM Sans'", fontSize: "0.75rem", fontWeight: 500,
                          color: emailPurpose.trim() ? "white" : "#9CA3AF",
                          cursor: emailPurpose.trim() ? "pointer" : "not-allowed",
                        }}>
                        Generate Email
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setShowPurposeInput(true)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.35rem",
                        padding: "0.3rem 0.65rem", background: "transparent",
                        border: "1px solid rgba(0,0,0,0.1)", borderRadius: 20,
                        color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.75rem",
                        fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.22)"; e.currentTarget.style.color = "#111111"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; e.currentTarget.style.color = "#374151"; }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Draft Email
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Document chips */}
            {(documents.length > 0 || uploading) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
                {uploading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.5rem 0.2rem 0.4rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, fontSize: "0.72rem", color: "#9CA3AF", fontFamily: "'DM Sans'" }}>
                    <DocTypeIcon name={uploadingName} />
                    <span>{uploadingName.length > 22 ? uploadingName.slice(0, 19) + "..." : uploadingName}</span>
                    <span style={{ marginLeft: 2 }}>Processing...</span>
                  </div>
                )}
                {documents.map(doc => (
                  <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.5rem 0.2rem 0.4rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, fontSize: "0.72rem", color: "#374151", fontFamily: "'DM Sans'" }}>
                    <DocTypeIcon name={doc.name} />
                    <span>{doc.name.length > 22 ? doc.name.slice(0, 19) + "..." : doc.name}</span>
                    <button
                      onClick={() => removeDocument(doc)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 1, color: "#9CA3AF", display: "flex", marginLeft: 1 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 14, padding: "0.75rem 0.6rem 0.75rem 1rem" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Attach document"
                style={{ background: "none", border: "none", cursor: uploading ? "not-allowed" : "pointer", padding: "0.3rem", color: "#9CA3AF", display: "flex", flexShrink: 0, opacity: uploading ? 0.5 : 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px";
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about your business data..."
                rows={4}
                style={{
                  flex: 1, resize: "none", border: "none", outline: "none", background: "transparent",
                  fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", color: "#111111",
                  lineHeight: 1.65, padding: "0.25rem 0", overflowY: "hidden",
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  background: input.trim() && !loading ? "#111111" : "rgba(0,0,0,0.06)",
                  border: "none", cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={input.trim() && !loading ? "white" : "#9CA3AF"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            </div>

            <p style={{ fontSize: "0.68rem", color: "#9CA3AF", textAlign: "center" as const, margin: "0.4rem 0 0", lineHeight: 1.4 }}>
              Intelligence can make mistakes. Review important information.
            </p>
          </div>
        </div>
        </div>{/* end left column */}

        {/* Sources side panel */}
        {activeSources && activeSources.length > 0 && (
          <>
          {/* Drag handle */}
          <div
            onMouseDown={startSourcesDrag}
            style={{ width: 16, flexShrink: 0, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", zIndex: 1 }}
            onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.12)"; }}
            onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}>
            <div style={{ width: 3, height: "100%", minHeight: 80, borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
          </div>
          <div style={{ width: sourcesWidth, flexShrink: 0, borderLeft: "1px solid rgba(0,0,0,0.07)", background: "white", overflowY: "auto" }}>
            <div style={{ position: "sticky" as const, top: 0, background: "white", zIndex: 1 }}>

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
                          ) : src.type === "document" ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                            </svg>
                          )}
                          <span style={{ fontSize: "0.67rem", fontWeight: 700, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>
                            {src.type === "call" ? "Call" : src.type === "document" ? "Document" : "Message"}
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
          </>
        )}

        {/* ── Email draft panel ── */}
        {showDraftEmail && (
          <>
          {/* Drag handle on the left edge of the panel */}
          <div
            onMouseDown={startDraftDrag}
            style={{ width: 16, flexShrink: 0, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch", zIndex: 1 }}
            onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.12)"; }}
            onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}>
            <div style={{ width: 3, height: "100%", minHeight: 80, borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
          </div>
          <div style={{ width: draftWidth, flexShrink: 0, borderLeft: "1px solid rgba(0,0,0,0.07)", background: "white", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" as const }}>

            {/* Close button */}
            <button
              onClick={() => setShowDraftEmail(false)}
              style={{ position: "absolute" as const, top: 8, right: 8, zIndex: 2, background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, cursor: "pointer", padding: "2px 5px", color: "#9CA3AF", display: "flex" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>

            {/* Panel body */}
            {draftLoading ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.6rem" }}>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                  ))}
                </div>
                <p style={{ fontSize: "0.78rem", color: "#9CA3AF", margin: 0 }}>Drafting email…</p>
              </div>
            ) : draftError ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "1.5rem" }}>
                <p style={{ fontSize: "0.82rem", color: "#DC2626", textAlign: "center" as const, margin: 0 }}>{draftError}</p>
                <button onClick={() => generateDraft("")}
                  style={{ padding: "0.4rem 0.9rem", background: "#111111", border: "none", borderRadius: 7, color: "white", fontSize: "0.8rem", fontFamily: "'DM Sans'", cursor: "pointer" }}>
                  Try Again
                </button>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 0.9rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>

                {/* Subject */}
                <div>
                  <p style={{ fontSize: "0.67rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 0.3rem" }}>Subject</p>
                  <input
                    type="text"
                    value={draftSubject}
                    onChange={e => setDraftSubject(e.target.value)}
                    style={{ width: "100%", padding: "0.45rem 0.6rem", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.82rem", color: "#111111", background: "white", outline: "none", boxSizing: "border-box" as const, fontWeight: 500 }}
                  />
                </div>

                {/* Body */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 340 }}>
                  <p style={{ fontSize: "0.67rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em", margin: "0 0 0.3rem" }}>Body</p>
                  <div style={{ flex: 1, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, overflow: "hidden" }}>
                    <RichEmailEditor
                      key={draftVersion}
                      initialContent={draftBody}
                      onChange={text => setDraftBody(text)}
                    />
                  </div>
                </div>


                {/* Actions */}
                <div style={{ display: "flex", gap: "0.4rem", paddingTop: "0.1rem" }}>
                  <button
                    onClick={() => {
                      const full = `Subject: ${draftSubject}\n\n${draftBody}`;
                      navigator.clipboard.writeText(full);
                      setDraftCopied(true);
                      setTimeout(() => setDraftCopied(false), 2200);
                    }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", padding: "0.45rem 0", background: draftCopied ? "#059669" : "#111111", border: "none", borderRadius: 7, color: "white", fontSize: "0.78rem", fontFamily: "'DM Sans'", cursor: "pointer", fontWeight: 500, transition: "background 0.2s" }}>
                    {draftCopied ? (
                      <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Copied</>
                    ) : (
                      <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                    )}
                  </button>
                  <button
                    onClick={() => generateDraft("")}
                    style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.45rem 0.7rem", background: "transparent", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, color: "#374151", fontSize: "0.78rem", fontFamily: "'DM Sans'", cursor: "pointer", fontWeight: 500 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                    </svg>
                    Regenerate
                  </button>
                </div>

              </div>
            )}
          </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        .chat-session-row:hover .chat-delete-btn { opacity: 1 !important; }
        .chat-session-row:hover { background: #F9FAFB; }
      `}</style>
    </div>

    </FeatureGate>
  );
}
