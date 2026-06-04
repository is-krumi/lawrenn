"use client";

import "@eigenpal/docx-js-editor/styles.css";
import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { DocxEditorRef } from "@eigenpal/docx-js-editor/react";
import FeatureGate from "@/components/FeatureGate";
import { listDocMeta, getDoc, saveDoc, deleteDoc } from "./docStore";
import type { DocMeta } from "./docStore";

const DocxEditor = dynamic(
  () => import("@eigenpal/docx-js-editor/react").then(m => ({ default: m.DocxEditor })),
  { ssr: false }
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)          return "just now";
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function DocumentsPage() {
  const [docBuffer, setDocBuffer]       = useState<ArrayBuffer | null>(null);
  const [docName, setDocName]           = useState("Untitled.docx");
  const [docText, setDocText]           = useState("");
  const [docWordCount, setDocWordCount] = useState(0);
  const [isDragOver, setIsDragOver]     = useState(false);
  const [chat, setChat]                 = useState<ChatMessage[]>([]);
  const [question, setQuestion]         = useState("");
  const [aiLoading, setAiLoading]       = useState(false);
  const [leftWidth, setLeftWidth]       = useState(300);
  const [leftTab, setLeftTab]           = useState<"ai" | "docs">("ai");
  const [docList, setDocList]           = useState<DocMeta[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

  const [selBubble, setSelBubble] = useState<{
    x: number; y: number;
    text: string; before: string; paragraphText: string; paraId: string | null;
    pmFrom: number; pmTo: number;
  } | null>(null);
  const [selLoading, setSelLoading] = useState(false);
  const [selPrompt, setSelPrompt]   = useState("");

  const editorRef     = useRef<DocxEditorRef>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const dragState     = useRef<{ startX: number; startW: number } | null>(null);
  const chatEndRef    = useRef<HTMLDivElement>(null);
  const pendingSelPos = useRef<{ x: number; y: number } | null>(null);

  // ── Restore last doc + load list on mount ─────────────────────────────────
  useEffect(() => {
    listDocMeta().then(setDocList).catch(() => {});
    const lastId = localStorage.getItem("lawrenn-last-doc-id");
    if (!lastId) return;
    getDoc(lastId).then(async doc => {
      if (!doc) { localStorage.removeItem("lawrenn-last-doc-id"); return; }
      setDocBuffer(doc.buffer);
      setDocName(doc.name);
      setCurrentDocId(doc.id);
      try {
        const core = await import("@eigenpal/docx-js-editor/core");
        const agent = await core.DocumentAgent.fromBuffer(doc.buffer);
        setDocText(agent.getText());
        setDocWordCount(agent.getWordCount());
      } catch {}
    }).catch(() => {});
  }, []);

  // ── Auto-save every 30 s while a doc is open ──────────────────────────────
  useEffect(() => {
    if (!currentDocId) return;
    const id   = currentDocId;
    const name = docName;
    const iv = setInterval(async () => {
      const editor = editorRef.current;
      if (!editor) return;
      try {
        const buf = await editor.save();
        if (buf) await saveDoc({ id, name, buffer: buf, updatedAt: Date.now() });
      } catch {}
    }, 30_000);
    return () => clearInterval(iv);
  }, [currentDocId, docName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // ── IndexedDB helpers ──────────────────────────────────────────────────────
  async function persistCurrentDoc(idOverride?: string, nameOverride?: string) {
    const id   = idOverride   ?? currentDocId;
    const name = nameOverride ?? docName;
    if (!id) return;
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const buf = await editor.save();
      if (!buf) return;
      await saveDoc({ id, name, buffer: buf, updatedAt: Date.now() });
      listDocMeta().then(setDocList).catch(() => {});
    } catch {}
  }

  async function loadDocIntoState(id: string) {
    const doc = await getDoc(id);
    if (!doc) return;
    setDocBuffer(doc.buffer);
    setDocName(doc.name);
    setCurrentDocId(id);
    setChat([]);
    localStorage.setItem("lawrenn-last-doc-id", id);
    try {
      const core = await import("@eigenpal/docx-js-editor/core");
      const agent = await core.DocumentAgent.fromBuffer(doc.buffer);
      setDocText(agent.getText());
      setDocWordCount(agent.getWordCount());
    } catch { setDocText(""); setDocWordCount(0); }
  }

  async function switchToDoc(id: string) {
    if (id === currentDocId) return;
    await persistCurrentDoc();
    await loadDocIntoState(id);
  }

  async function removeDoc(id: string) {
    await deleteDoc(id);
    const metas = await listDocMeta();
    setDocList(metas);
    if (id !== currentDocId) return;
    if (metas.length > 0) {
      await loadDocIntoState(metas[0].id);
    } else {
      setDocBuffer(null);
      setDocName("Untitled.docx");
      setCurrentDocId(null);
      setDocText(""); setDocWordCount(0); setChat([]);
      localStorage.removeItem("lawrenn-last-doc-id");
    }
  }

  // ── Selection bubble events ────────────────────────────────────────────────
  useEffect(() => {
    function captureSelPos(e: MouseEvent) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) {
          pendingSelPos.current = { x: rect.left + rect.width / 2, y: rect.top };
          return;
        }
      }
      // No selection yet (e.g. second mouseup before dblclick fires) — store raw coords
      // so onSelectionChange triggered by the dblclick still has a position to use
      pendingSelPos.current = { x: e.clientX, y: e.clientY };
    }
    function onMouseDown(e: MouseEvent) {
      if ((e.target as Element).closest?.("[data-sel-bubble]")) return;
      setSelBubble(null); setSelPrompt(""); pendingSelPos.current = null;
    }
    function onScroll() { setSelBubble(null); setSelPrompt(""); pendingSelPos.current = null; }
    // capture=true so we run before ProseMirror's dblclick handler (which fires onSelectionChange)
    document.addEventListener("mouseup",   captureSelPos);
    document.addEventListener("dblclick",  captureSelPos, true);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll",      onScroll, true);
    return () => {
      document.removeEventListener("mouseup",   captureSelPos);
      document.removeEventListener("dblclick",  captureSelPos, true);
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll",      onScroll, true);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorSelectionChange(state: any) {
    if (!state?.hasSelection) {
      setSelBubble(null); setSelPrompt(""); pendingSelPos.current = null;
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const info = editor.getSelectionInfo();
    if (!info || info.selectedText.trim().length < 2) return;

    const paged  = editor.getEditorRef();
    const view   = paged?.getView();
    const pmFrom = view?.state.selection.from ?? -1;
    const pmTo   = view?.state.selection.to   ?? -1;

    let pos = pendingSelPos.current;
    if (!pos) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) pos = { x: rect.left + rect.width / 2, y: rect.top };
      }
    }
    if (!pos) pos = { x: window.innerWidth / 2, y: window.innerHeight / 3 };

    setSelBubble({
      x: pos.x, y: pos.y,
      text: info.selectedText, before: info.before,
      paragraphText: info.paragraphText, paraId: info.paraId,
      pmFrom, pmTo,
    });
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    setLeftWidth(Math.max(220, Math.min(560, dragState.current.startW + dx)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup",   onMouseUp);
  }, [onMouseMove]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startW: leftWidth };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
  }

  // ── File loading ───────────────────────────────────────────────────────────
  async function loadFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      alert("Only .docx files are supported.");
      return;
    }
    const buf = await file.arrayBuffer();
    const id  = crypto.randomUUID();
    await saveDoc({ id, name: file.name, buffer: buf, updatedAt: Date.now() });
    setDocBuffer(buf);
    setDocName(file.name);
    setCurrentDocId(id);
    setChat([]);
    localStorage.setItem("lawrenn-last-doc-id", id);
    listDocMeta().then(setDocList).catch(() => {});
    try {
      const core = await import("@eigenpal/docx-js-editor/core");
      const agent = await core.DocumentAgent.fromBuffer(buf);
      setDocText(agent.getText());
      setDocWordCount(agent.getWordCount());
    } catch { setDocText(""); setDocWordCount(0); }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function handleDocNameChange(name: string) {
    setDocName(name);
    setDocList(prev => prev.map(d => d.id === currentDocId ? { ...d, name } : d));
  }

  async function handleDocChange(doc: unknown) {
    try {
      const core = await import("@eigenpal/docx-js-editor/core");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agent = core.DocumentAgent.fromDocument(doc as any);
      setDocText(agent.getText());
      setDocWordCount(agent.getWordCount());
    } catch {}
  }

  // ── Download ───────────────────────────────────────────────────────────────
  async function downloadDocx() {
    const buf = await editorRef.current?.save();
    if (!buf) return;
    if (currentDocId) {
      await saveDoc({ id: currentDocId, name: docName, buffer: buf, updatedAt: Date.now() });
      listDocMeta().then(setDocList).catch(() => {});
    }
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = docName; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Apply AI edits ─────────────────────────────────────────────────────────
  async function applyEdits(edits: { type: string; search?: string; replace_with?: string; style_id?: string; marks?: Record<string, unknown> }[]): Promise<number> {
    try {
      const editor = editorRef.current;
      if (!editor || !edits.length) return 0;
      const paged = editor.getEditorRef();
      const view  = paged?.getView();
      if (!paged || !view) return 0;
      const core = await import("@eigenpal/docx-js-editor/core");
      let applied = 0;

      for (const edit of edits) {
        try {
          if (!edit.search) continue;
          if (edit.type === "replace" && edit.replace_with !== undefined) {
            const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
            if (!hits.length) { console.warn("[applyEdits] not found:", edit.search); continue; }
            const { paraId, before, match } = hits[0];
            const matchLower = match.toLowerCase();
            const beforeLen  = before.length;
            let start = -1, end = -1;
            const locate = (node: { textContent: string }, pos: number) => {
              const t   = node.textContent.toLowerCase();
              const idx = t.indexOf(matchLower, Math.max(0, beforeLen - 5));
              if (idx !== -1) { start = pos + 1 + idx; end = start + match.length; }
            };
            const para = core.findParagraphByParaId(view.state.doc, paraId);
            if (para) locate(para.node, para.from);
            if (start === -1) {
              view.state.doc.descendants((node, pos) => {
                if (start !== -1) return false;
                if (node.isTextblock) locate(node, pos);
              });
            }
            if (start === -1) { console.warn("[applyEdits] position not found:", match); continue; }
            paged.dispatch(view.state.tr.insertText(edit.replace_with, start, end));
            applied++;
          } else if (edit.type === "set_style" && edit.style_id) {
            const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
            if (!hits.length) continue;
            if (editor.setParagraphStyle({ paraId: hits[0].paraId, styleId: edit.style_id })) applied++;
          } else if (edit.type === "format" && edit.marks) {
            const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
            if (!hits.length) continue;
            if (editor.applyFormatting({
              paraId: hits[0].paraId,
              search: hits[0].match,
              marks:  edit.marks as Parameters<typeof editor.applyFormatting>[0]["marks"],
            })) applied++;
          }
        } catch (editErr) { console.error("[applyEdits] edit error:", edit, editErr); }
      }

      if (applied > 0) paged.relayout();
      return applied;
    } catch (err) { console.error("[applyEdits] unexpected error:", err); return 0; }
  }

  // ── Selection bubble AI edit ───────────────────────────────────────────────
  async function applySelectionEdit(instruction: string) {
    if (!selBubble) return;
    setSelLoading(true);
    const { text, paragraphText, pmFrom, pmTo } = selBubble;

    try {
      const res = await fetch("/api/documents/selection-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText: text, instruction, documentContext: paragraphText }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data        = await res.json();
      const replacement = (data.replacement ?? text) as string;

      const editor = editorRef.current;
      const paged  = editor?.getEditorRef();
      const view   = paged?.getView();
      if (!paged || !view) return;

      if (pmFrom !== -1 && pmTo !== -1 && pmFrom < pmTo) {
        paged.dispatch(view.state.tr.insertText(replacement, pmFrom, pmTo));
        paged.relayout();
      } else {
        await applyEdits([{ type: "replace", search: text, replace_with: replacement }]);
      }

      await persistCurrentDoc();
      setSelBubble(null);
      setSelPrompt("");
    } catch (e) {
      console.error("[selectionEdit]", e);
    } finally {
      setSelLoading(false);
    }
  }

  // ── AI chat ────────────────────────────────────────────────────────────────
  async function sendQuestion() {
    const q = question.trim();
    if (!q || aiLoading) return;
    setQuestion("");
    setChat(prev => [...prev, { role: "user", content: q }]);
    setAiLoading(true);

    try {
      const liveText = editorRef.current?.getAgent()?.getText() ?? docText;
      const res = await fetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, documentText: liveText, chatHistory: chat.slice(-10) }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data         = await res.json();
      const appliedCount = await applyEdits(data.edits ?? []);
      if (appliedCount > 0) await persistCurrentDoc();
      const suffix = appliedCount > 0 ? ` (${appliedCount} change${appliedCount > 1 ? "s" : ""} applied)` : "";
      setChat(prev => [...prev, { role: "assistant", content: (data.answer || "No response.") + suffix }]);
    } catch (err) {
      console.error("[sendQuestion]", err);
      setChat(prev => [...prev, { role: "assistant", content: "Failed to get a response. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  }

  async function improveWithAI() {
    if (!docText) return;
    const prompt = "Please review this document and suggest specific improvements for clarity, structure, and professional tone. List the top 3–5 suggestions.";
    setChat(prev => [...prev, { role: "user", content: prompt }]);
    setAiLoading(true);
    try {
      const res  = await fetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, documentText: docText, chatHistory: [] }),
      });
      const data = await res.json();
      setChat(prev => [...prev, { role: "assistant", content: data.answer || "No response." }]);
    } catch {
      setChat(prev => [...prev, { role: "assistant", content: "Failed to get suggestions." }]);
    } finally {
      setAiLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <FeatureGate feature="intelligence">
      <input ref={fileInputRef} type="file" accept=".docx" style={{ display: "none" }} onChange={handleFileInput} />

      <div style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", background: "#F9FAFB" }}>

        {/* Top bar */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.5rem 1.25rem", background: "white", borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              padding: "0.35rem 0.75rem", background: "#111111", border: "none", borderRadius: 7,
              color: "white", fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer",
            }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Open DOCX
          </button>

          {docBuffer && (
            <>
              <span style={{ flex: 1, fontSize: "0.82rem", color: "#374151", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {docName}
              </span>
              {docWordCount > 0 && (
                <span style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>{docWordCount.toLocaleString()} words</span>
              )}
              <button
                onClick={downloadDocx}
                style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.35rem 0.75rem", background: "transparent", border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 7, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.78rem",
                  fontWeight: 500, cursor: "pointer",
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </button>
            </>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Left panel */}
          <div style={{ width: leftWidth, flexShrink: 0, display: "flex", flexDirection: "column", background: "white", borderRight: "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>

            {/* Tab bar */}
            <div style={{ flexShrink: 0, display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              {(["ai", "docs"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLeftTab(tab)}
                  style={{
                    flex: 1, padding: "0.55rem 0", background: "transparent", border: "none",
                    borderBottom: leftTab === tab ? "2px solid #111111" : "2px solid transparent",
                    fontFamily: "'DM Sans', sans-serif", fontSize: "0.72rem",
                    fontWeight: leftTab === tab ? 700 : 500,
                    color: leftTab === tab ? "#111111" : "#9CA3AF",
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                    transition: "color 0.15s",
                  }}>
                  {tab === "ai" ? "AI" : "Documents"}
                </button>
              ))}
            </div>

            {/* AI tab */}
            {leftTab === "ai" && (
              <>
                <div style={{
                  flexShrink: 0, padding: "0.75rem 1rem 0.5rem",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    AI Assistant
                  </p>
                  {docBuffer && (
                    <button
                      onClick={improveWithAI} disabled={aiLoading}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.25rem",
                        padding: "0.25rem 0.55rem", background: "#111111", border: "none", borderRadius: 5,
                        color: "white", fontFamily: "'DM Sans'", fontSize: "0.7rem",
                        fontWeight: 500, cursor: aiLoading ? "not-allowed" : "pointer", opacity: aiLoading ? 0.6 : 1,
                      }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      Improve
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {!docBuffer && chat.length === 0 && (
                    <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: "0.78rem", marginTop: "2rem", lineHeight: 1.6 }}>
                      Open a .docx file to start chatting with AI about its contents.
                    </div>
                  )}
                  {docBuffer && chat.length === 0 && !aiLoading && (
                    <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: "0.78rem", marginTop: "2rem", lineHeight: 1.6 }}>
                      Ask anything about <strong style={{ color: "#374151" }}>{docName}</strong>, or click <strong style={{ color: "#374151" }}>Improve</strong> for AI suggestions.
                    </div>
                  )}
                  {chat.map((msg, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", gap: "0.2rem" }}>
                      <div style={{
                        maxWidth: "88%", padding: "0.5rem 0.7rem",
                        borderRadius: msg.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                        background: msg.role === "user" ? "#111111" : "#F3F4F6",
                        color: msg.role === "user" ? "white" : "#111111",
                        fontSize: "0.78rem", lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif", whiteSpace: "pre-wrap",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div style={{ display: "flex", gap: "0.25rem", padding: "0.4rem 0" }}>
                      {[0, 1, 2].map(j => (
                        <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                      ))}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ flexShrink: 0, padding: "0.6rem 0.75rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{
                    display: "flex", alignItems: "flex-end", gap: "0.4rem",
                    background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8,
                    padding: "0.4rem 0.4rem 0.4rem 0.6rem",
                  }}>
                    <textarea
                      value={question}
                      onChange={e => setQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }}
                      placeholder={docBuffer ? "Ask a question or give an edit instruction…" : "Open a document first…"}
                      disabled={!docBuffer}
                      rows={2}
                      style={{
                        flex: 1, resize: "none", border: "none", outline: "none",
                        background: "transparent", fontFamily: "'DM Sans', sans-serif",
                        fontSize: "0.78rem", color: "#111111", lineHeight: 1.5, padding: "0.2rem 0",
                      }}
                    />
                    <button
                      onClick={sendQuestion}
                      disabled={!question.trim() || aiLoading || !docBuffer}
                      style={{
                        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: question.trim() && !aiLoading && docBuffer ? "#111111" : "rgba(0,0,0,0.06)",
                        border: "none",
                        cursor: question.trim() && !aiLoading && docBuffer ? "pointer" : "not-allowed",
                      }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke={question.trim() && !aiLoading && docBuffer ? "white" : "#9CA3AF"}
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Documents tab */}
            {leftTab === "docs" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ flexShrink: 0, padding: "0.75rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem",
                      padding: "0.45rem 0", background: "#111111", border: "none", borderRadius: 7,
                      color: "white", fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 500, cursor: "pointer",
                    }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Open DOCX
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {docList.length === 0 && (
                    <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.78rem", lineHeight: 1.6 }}>
                      No documents yet.<br />Open a .docx file to get started.
                    </div>
                  )}
                  {docList.map(doc => {
                    const isActive = doc.id === currentDocId;
                    return (
                      <div
                        key={doc.id}
                        style={{
                          display: "flex", alignItems: "center",
                          padding: "0.6rem 0.75rem 0.6rem 1rem",
                          background: isActive ? "#F3F4F6" : "transparent",
                          borderLeft: isActive ? "3px solid #111111" : "3px solid transparent",
                          borderBottom: "1px solid rgba(0,0,0,0.04)",
                          transition: "background 0.1s",
                        }}
                      >
                        <button
                          onClick={() => switchToDoc(doc.id)}
                          style={{ flex: 1, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0, minWidth: 0 }}
                        >
                          <div style={{
                            fontSize: "0.78rem", fontWeight: isActive ? 600 : 400, color: "#111111",
                            fontFamily: "'DM Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {doc.name}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#9CA3AF", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                            {relativeTime(doc.updatedAt)}
                          </div>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); removeDoc(doc.id); }}
                          title="Remove"
                          style={{
                            flexShrink: 0, marginLeft: 8, width: 22, height: 22,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "none", border: "none", borderRadius: 4,
                            cursor: "pointer", color: "#9CA3AF", fontSize: "1rem", lineHeight: 1,
                            fontFamily: "sans-serif",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.color = "#374151"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={startDrag}
            style={{ width: 4, flexShrink: 0, cursor: "col-resize", background: "rgba(0,0,0,0.04)", transition: "background 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.1)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,0.04)"; }}
          />

          {/* Editor or drop zone */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {docBuffer ? (
              <DocxEditor
                ref={editorRef}
                documentBuffer={docBuffer}
                documentName={docName}
                onDocumentNameChange={handleDocNameChange}
                onChange={handleDocChange}
                onSelectionChange={handleEditorSelectionChange}
                showToolbar
                showZoomControl
                style={{ flex: 1, height: "100%" }}
              />
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: "1rem", cursor: "pointer",
                  border: `2px dashed ${isDragOver ? "#374151" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 12, margin: "2rem",
                  background: isDragOver ? "rgba(0,0,0,0.02)" : "transparent",
                  transition: "all 0.15s",
                }}>
                <div style={{ width: 52, height: 52, background: "#F3F4F6", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                  </svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#374151", margin: "0 0 0.3rem", fontFamily: "'DM Sans', sans-serif" }}>
                    Drop a .docx file here
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "#9CA3AF", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    or click to browse
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selection bubble */}
      {selBubble && (
        <div
          data-sel-bubble=""
          style={{
            position: "fixed", left: selBubble.x, top: selBubble.y,
            transform: "translate(-50%, calc(-100% - 8px))", zIndex: 9999,
            background: "#1a1a1a", borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.06)",
            padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6,
            minWidth: 268, maxWidth: 340,
          }}
        >
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1a1a1a",
          }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { label: "Tighten",  instruction: "Make this clause more precise and legally airtight, removing ambiguity" },
              { label: "Simplify", instruction: "Rewrite in plain English while preserving the full legal meaning" },
              { label: "Qualify",  instruction: "Add appropriate qualifications, limitations, or carve-outs to this clause" },
              { label: "Formalize", instruction: "Rewrite using formal legal language and standard legal drafting conventions" },
            ].map(p => (
              <button
                key={p.label} type="button" disabled={selLoading}
                onMouseDown={e => { e.preventDefault(); applySelectionEdit(p.instruction); }}
                style={{
                  background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 5, color: "rgba(255,255,255,0.9)",
                  fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500, padding: "3px 9px", cursor: selLoading ? "wait" : "pointer",
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text" value={selPrompt} placeholder="Custom instruction…"
              disabled={selLoading}
              autoFocus
              onChange={e => setSelPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && selPrompt.trim()) { e.preventDefault(); applySelectionEdit(selPrompt.trim()); }
                if (e.key === "Escape") { setSelBubble(null); setSelPrompt(""); }
                if (e.key === "Backspace" && selPrompt === "") {
                  // User wants to delete the selected text — apply it via PM and close bubble
                  e.preventDefault();
                  const paged = editorRef.current?.getEditorRef();
                  const view  = paged?.getView();
                  const f = selBubble?.pmFrom ?? -1;
                  const t = selBubble?.pmTo   ?? -1;
                  if (paged && view && f !== -1 && t !== -1 && f < t) {
                    paged.dispatch(view.state.tr.insertText("", f, t));
                    paged.relayout();
                    persistCurrentDoc();
                  }
                  setSelBubble(null);
                  setSelPrompt("");
                }
              }}
              style={{
                flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 5, color: "white", fontSize: "0.72rem",
                fontFamily: "'DM Sans', sans-serif", padding: "4px 8px", outline: "none",
              }}
            />
            <button
              type="button" disabled={selLoading || !selPrompt.trim()}
              onMouseDown={e => { e.preventDefault(); if (selPrompt.trim()) applySelectionEdit(selPrompt.trim()); }}
              style={{
                background: selLoading || !selPrompt.trim() ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.18)",
                border: "none", borderRadius: 5,
                color: selLoading || !selPrompt.trim() ? "rgba(255,255,255,0.4)" : "white",
                fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", padding: "4px 10px",
                cursor: selLoading || !selPrompt.trim() ? "default" : "pointer",
              }}>
              {selLoading ? "…" : "Go"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        input[placeholder]::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>
    </FeatureGate>
  );
}
