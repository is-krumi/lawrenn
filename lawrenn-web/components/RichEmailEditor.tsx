"use client";

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react";

export interface RichEmailEditorHandle {
  save: () => Promise<ArrayBuffer | null>;
}

interface Props {
  initialContent: string;
  emailBody?: string;
  onChange?: (text: string) => void;
}

interface BubbleState {
  x: number;
  y: number;
  text: string;
}

function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${p.split("\n").join("<br>")}</p>`)
    .join("");
}

const BTN: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  padding: "3px 6px", borderRadius: 4,
  fontFamily: "'DM Sans', sans-serif",
  color: "#374151", display: "flex", alignItems: "center",
  transition: "background 0.1s",
};

function ToolBtn({ title, onClick, children }: {
  title?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      style={BTN}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.07)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}>
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: "rgba(0,0,0,0.1)", margin: "0 2px", flexShrink: 0 }} />;
}

const PRESETS = [
  { label: "Improve",  instruction: "Improve the writing quality and clarity" },
  { label: "Shorten",  instruction: "Make this more concise" },
  { label: "Formal",   instruction: "Make this more formal and professional" },
  { label: "Casual",   instruction: "Make this more conversational and friendly" },
];

const RichEmailEditor = forwardRef<RichEmailEditorHandle, Props>(
  function RichEmailEditor({ initialContent, emailBody, onChange }, ref) {
    const editorRef     = useRef<HTMLDivElement>(null);
    const bubbleRef     = useRef<HTMLDivElement>(null);
    const highlightRef  = useRef<HTMLSpanElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const inputFocusRef = useRef(false);   // true while custom input is focused

    const [bubble, setBubble]               = useState<BubbleState | null>(null);
    const [bubblePrompt, setBubblePrompt]   = useState("");
    const [bubbleLoading, setBubbleLoading] = useState(false);

    useImperativeHandle(ref, () => ({ async save() { return null; } }));

    useEffect(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = plainToHtml(initialContent || " ");
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Unwrap the highlight span, restoring its children in place
    const removeHighlight = useCallback(() => {
      const span = highlightRef.current;
      if (!span) return;
      if (span.parentNode) {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.parentNode.removeChild(span);
      }
      highlightRef.current = null;
    }, []);

    const dismissBubble = useCallback(() => {
      removeHighlight();
      setBubble(null);
      setBubblePrompt("");
      savedRangeRef.current = null;
    }, [removeHighlight]);

    // ── Trigger bubble on mouseup (selection is finalized, no mid-drag mutations) ──
    useEffect(() => {
      function onMouseUp() {
        // Small delay so the browser finalises the selection range
        setTimeout(() => {
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

          const range  = sel.getRangeAt(0);
          const editor = editorRef.current;
          if (!editor || !editor.contains(range.commonAncestorContainer)) return;

          const text = sel.toString().trim();
          if (!text) return;

          removeHighlight();
          savedRangeRef.current = range.cloneRange();

          // Measure before surroundContents modifies the range
          const fallbackRect = range.getBoundingClientRect();
          let highlightRect  = fallbackRect;

          try {
            const span = document.createElement("span");
            span.className          = "ai-edit-highlight";
            span.style.background   = "rgba(120,120,120,0.18)";
            span.style.borderRadius = "2px";
            range.surroundContents(span);
            highlightRef.current = span;
            highlightRect = span.getBoundingClientRect();
            // Clear browser selection — span is the visual now
            sel.removeAllRanges();
          } catch {
            // Cross-block selection: visual won't persist, but bubble still works
          }

          setBubble({
            x: highlightRect.left + highlightRect.width / 2,
            y: highlightRect.top - 8,
            text,
          });
        }, 10);
      }

      document.addEventListener("mouseup", onMouseUp);
      return () => document.removeEventListener("mouseup", onMouseUp);
    }, [removeHighlight]);

    // ── Dismiss bubble when clicking outside the bubble ──────────────────────
    useEffect(() => {
      function onMouseDown(e: MouseEvent) {
        const target = e.target as Element;
        // closest() traverses the real DOM — no ref timing issues
        if (target.closest?.("[data-ai-bubble]")) return;
        dismissBubble();
      }
      document.addEventListener("mousedown", onMouseDown);
      return () => document.removeEventListener("mousedown", onMouseDown);
    }, [dismissBubble]);

    // ── Apply AI edit ─────────────────────────────────────────────────────────
    async function applyEdit(instruction: string) {
      if (!bubble?.text) return;
      setBubbleLoading(true);

      try {
        const res = await fetch("/api/draft-email/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedText: bubble.text,
            instruction,
            emailBody: emailBody ?? editorRef.current?.innerText ?? "",
          }),
        });
        const data        = await res.json();
        const replacement = (data.replacement ?? bubble.text) as string;

        editorRef.current?.focus();

        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          const replRange = document.createRange();
          if (highlightRef.current?.parentNode) {
            replRange.selectNode(highlightRef.current);
          } else if (savedRangeRef.current) {
            replRange.setStart(savedRangeRef.current.startContainer, savedRangeRef.current.startOffset);
            replRange.setEnd(savedRangeRef.current.endContainer, savedRangeRef.current.endOffset);
          }
          sel.addRange(replRange);
        }

        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand("insertText", false, replacement);
        highlightRef.current = null;

        if (onChange && editorRef.current) onChange(editorRef.current.innerText);
      } catch (e) {
        console.error(e);
        removeHighlight();
      } finally {
        setBubbleLoading(false);
        setBubble(null);
        setBubblePrompt("");
        savedRangeRef.current = null;
      }
    }

    function exec(cmd: string, val?: string) {
      editorRef.current?.focus();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand(cmd, false, val);
    }

    function handleInput() {
      if (!onChange || !editorRef.current) return;
      onChange(editorRef.current.innerText);
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", flexWrap: "wrap" as const, gap: 1,
          padding: "4px 6px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "#FAFAFA",
          alignItems: "center",
        }}>
          <ToolBtn title="Bold"          onClick={() => exec("bold")}>
            <strong style={{ fontSize: "0.82rem" }}>B</strong>
          </ToolBtn>
          <ToolBtn title="Italic"        onClick={() => exec("italic")}>
            <em style={{ fontSize: "0.82rem" }}>I</em>
          </ToolBtn>
          <ToolBtn title="Underline"     onClick={() => exec("underline")}>
            <span style={{ textDecoration: "underline", fontSize: "0.82rem" }}>U</span>
          </ToolBtn>
          <ToolBtn title="Strikethrough" onClick={() => exec("strikeThrough")}>
            <span style={{ textDecoration: "line-through", fontSize: "0.82rem" }}>S</span>
          </ToolBtn>

          <Divider />

          <ToolBtn title="Heading 1" onClick={() => exec("formatBlock", "h1")}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>H1</span>
          </ToolBtn>
          <ToolBtn title="Heading 2" onClick={() => exec("formatBlock", "h2")}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>H2</span>
          </ToolBtn>

          <Divider />

          <ToolBtn title="Bullet list" onClick={() => exec("insertUnorderedList")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
              <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
          </ToolBtn>
          <ToolBtn title="Numbered list" onClick={() => exec("insertOrderedList")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 10h2" strokeLinecap="round"/>
              <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </ToolBtn>

          <Divider />

          <ToolBtn title="Align left" onClick={() => exec("justifyLeft")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
            </svg>
          </ToolBtn>
          <ToolBtn title="Align center" onClick={() => exec("justifyCenter")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </ToolBtn>
          <ToolBtn title="Align right" onClick={() => exec("justifyRight")}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
            </svg>
          </ToolBtn>

          <Divider />

          <ToolBtn title="Clear formatting" onClick={() => { exec("removeFormat"); exec("formatBlock", "p"); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7-4-4-7 7v4h4z"/><line x1="18" y1="13" x2="16" y2="11"/>
              <line x1="2" y1="22" x2="22" y2="2" stroke="#DC2626" strokeWidth="1.5"/>
            </svg>
          </ToolBtn>
        </div>

        {/* ── Page area ───────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", background: "#F3F4F6", padding: "0.75rem 0.9rem" }}>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            style={{
              background: "white",
              minHeight: "100%",
              padding: "1.25rem 1.5rem",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "0.855rem",
              color: "#111111",
              lineHeight: 1.75,
              borderRadius: 4,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          />
        </div>

        {/* ── AI Selection Bubble ──────────────────────────────────────────── */}
        {bubble && (
          <div
            ref={bubbleRef}
            data-ai-bubble=""
            style={{
              position: "fixed",
              left: bubble.x,
              top: bubble.y,
              transform: "translate(-50%, -100%)",
              zIndex: 9999,
              background: "#1a1a1a",
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.06)",
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 268,
              maxWidth: 340,
            }}
          >
            {/* Caret */}
            <div style={{
              position: "absolute",
              bottom: -6, left: "50%",
              transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid #1a1a1a",
            }} />

            {/* Preset buttons — keep e.preventDefault so they don't steal focus */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  disabled={bubbleLoading}
                  onMouseDown={e => { e.preventDefault(); applyEdit(p.instruction); }}
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 5,
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "0.72rem",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                    padding: "3px 9px",
                    cursor: bubbleLoading ? "wait" : "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!bubbleLoading) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom prompt — no preventDefault on container so input receives focus */}
            <div style={{ display: "flex", gap: 4 }}>
              <input
                type="text"
                value={bubblePrompt}
                placeholder="Custom instruction…"
                disabled={bubbleLoading}
                onChange={e => setBubblePrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && bubblePrompt.trim()) {
                    e.preventDefault();
                    applyEdit(bubblePrompt.trim());
                  }
                  if (e.key === "Escape") dismissBubble();
                }}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 5,
                  color: "white",
                  fontSize: "0.72rem",
                  fontFamily: "'DM Sans', sans-serif",
                  padding: "4px 8px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                disabled={bubbleLoading || !bubblePrompt.trim()}
                onMouseDown={e => { e.preventDefault(); if (bubblePrompt.trim()) applyEdit(bubblePrompt.trim()); }}
                style={{
                  background: bubbleLoading || !bubblePrompt.trim()
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(255,255,255,0.18)",
                  border: "none",
                  borderRadius: 5,
                  color: bubbleLoading || !bubblePrompt.trim()
                    ? "rgba(255,255,255,0.4)"
                    : "white",
                  fontSize: "0.72rem",
                  fontFamily: "'DM Sans', sans-serif",
                  padding: "4px 10px",
                  cursor: bubbleLoading || !bubblePrompt.trim() ? "default" : "pointer",
                  transition: "background 0.1s",
                }}
              >
                {bubbleLoading ? "…" : "Go"}
              </button>
            </div>
          </div>
        )}

        <style>{`
          [contenteditable] p  { margin: 0 0 0.5em; }
          [contenteditable] h1 { font-size: 1.25em; font-weight: 700; margin: 0.5em 0 0.25em; }
          [contenteditable] h2 { font-size: 1.05em; font-weight: 700; margin: 0.4em 0 0.2em; }
          [contenteditable] ul, [contenteditable] ol { padding-left: 1.4em; margin: 0.25em 0; }
          [contenteditable] li { margin-bottom: 0.15em; }
          [contenteditable]:empty:before { content: attr(placeholder); color: #9CA3AF; pointer-events: none; }
          [contenteditable] ::selection { background: rgba(120,120,120,0.25); }
          span.ai-edit-highlight { background: rgba(120,120,120,0.18); border-radius: 2px; }
          input[type="text"]::placeholder { color: rgba(255,255,255,0.35); }
        `}</style>
      </div>
    );
  }
);

export default RichEmailEditor;
