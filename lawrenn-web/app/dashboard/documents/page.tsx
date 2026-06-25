"use client";

import FeatureGate from "@/components/FeatureGate";
import type { DocxEditorRef } from "@eigenpal/docx-js-editor/react";
import "@eigenpal/docx-js-editor/styles.css";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocMeta } from "./docStore";
import { deleteDoc, getDoc, listDocMeta, saveDoc } from "./docStore";

const DocxEditor = dynamic(
  () => import("@eigenpal/docx-js-editor/react").then(m => ({ default: m.DocxEditor })),
  { ssr: false }
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TrackedChange {
  id: string;
  instruction: string;
  rationale: string;
  originalText: string;
  proposedText: string;
  status: "accepted" | "rejected";
  timestamp: number;
}

interface InlineChange {
  id: string;
  delFrom: number;
  delTo: number;
  insFrom: number;
  insTo: number;
  originalText: string;
  proposedText: string;
  rationale: string;
  instruction: string;
  textblocks: Array<{ from: number; to: number; text: string }> | null;
  barY: number;
  isParagraphInsert?: boolean;
  noMarks?: boolean;
}

type DiffPart = { v: string; t: "eq" | "del" | "ins" };

function wordDiff(a: string, b: string): DiffPart[] {
  const tok = (s: string) => s.match(/\S+|\s+/g) ?? [];
  const aW = tok(a), bW = tok(b);
  const m = aW.length, n = bW.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aW[i-1] === bW[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: DiffPart[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aW[i-1] === bW[j-1]) { result.unshift({ v: aW[i-1], t: "eq" }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ v: bW[j-1], t: "ins" }); j--; }
    else { result.unshift({ v: aW[i-1], t: "del" }); i--; }
  }
  return result;
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
  const [leftTab, setLeftTab]           = useState<"ai" | "docs" | "changes">("ai");
  const [docList, setDocList]           = useState<DocMeta[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

  const [selBubble, setSelBubble] = useState<{
    x: number; y: number;
    text: string; before: string; paragraphText: string; paraId: string | null;
    pmFrom: number; pmTo: number;
    textblocks: Array<{ from: number; to: number; text: string }> | null;
  } | null>(null);
  const [selLoading, setSelLoading] = useState(false);
  const [selPrompt, setSelPrompt]   = useState("");
  const [selAsk, setSelAsk]         = useState("");
  const [inlineChange, setInlineChange]   = useState<InlineChange | null>(null);
  const [changeHistory, setChangeHistory] = useState<TrackedChange[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const inlineChangeRef = useRef<InlineChange | null>(null);
  const chatEditQueueRef = useRef<Array<{
    type: string;
    search?: string;
    replace_with?: string;
    text?: string;
    style_id?: string;
    marks?: Record<string, unknown>;
    chatInstruction: string;
    chatReply: string;
  }>>([]);

  const editorRef        = useRef<DocxEditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const docHighlightEls  = useRef<HTMLElement[]>([]);
  const tempDiffRef      = useRef<{ revert: () => void } | null>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const dragState        = useRef<{ startX: number; startW: number } | null>(null);
  const chatEndRef       = useRef<HTMLDivElement>(null);
  const pendingSelPos    = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    inlineChangeRef.current = inlineChange;
  }, [inlineChange]);

  // When the expanded history item is collapsed, revert any temporary diff marks
  // and clear any DOM highlights.
  useEffect(() => {
    if (!expandedHistoryId) {
      tempDiffRef.current?.revert();
      tempDiffRef.current = null;
      editorContainerRef.current?.removeAttribute("data-preview-diff");
      docHighlightEls.current.forEach(el => {
        el.style.backgroundColor = el.dataset.prevBg ?? "";
        el.style.outline = "";
        el.style.borderRadius = "";
        delete el.dataset.prevBg;
      });
      docHighlightEls.current = [];
    }
  }, [expandedHistoryId]);

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
      // Ignore clicks inside the history/changes panel — those shouldn't reposition the bubble
      if ((e.target as Element).closest?.("[data-lawrenn-panel]")) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) {
          // Anchor to the actual cursor position so the popup appears directly above the mouse
          pendingSelPos.current = { x: e.clientX, y: e.clientY };
          return;
        }
      }
      // No selection yet (e.g. second mouseup before dblclick fires) — store raw coords
      // so onSelectionChange triggered by the dblclick still has a position to use
      pendingSelPos.current = { x: e.clientX, y: e.clientY };
    }
    function onMouseDown(e: MouseEvent) {
      if ((e.target as Element).closest?.("[data-sel-bubble]")) return;
      setSelBubble(null); setSelPrompt(""); setSelAsk(""); pendingSelPos.current = null;
    }
    function onScroll() { setSelBubble(null); setSelPrompt(""); setSelAsk(""); pendingSelPos.current = null; }
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
    if (inlineChangeRef.current) return; // freeze bubble while change is pending
    if (!state?.hasSelection) {
      setSelBubble(null); setSelPrompt(""); setSelAsk("");
      pendingSelPos.current = null;
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

    // Collect textblocks in selection — multiple means list items or multi-paragraph
    let textblocks: Array<{ from: number; to: number; text: string }> | null = null;
    if (view && pmFrom !== -1 && pmTo !== -1) {
      const blocks: Array<{ from: number; to: number; text: string }> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      view.state.doc.nodesBetween(pmFrom, pmTo, (node: any, pos: number) => {
        if (node.isTextblock && node.textContent.trim()) {
          blocks.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: node.textContent });
        }
      });
      if (blocks.length > 1) textblocks = blocks;
    }

    let pos = pendingSelPos.current;
    if (!pos) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) pos = { x: rect.right, y: rect.bottom };
      }
    }
    if (!pos) pos = { x: window.innerWidth / 2, y: window.innerHeight / 3 };

    setSelBubble({
      x: pos.x, y: pos.y,
      text: info.selectedText, before: info.before,
      paragraphText: info.paragraphText, paraId: info.paraId,
      pmFrom, pmTo, textblocks,
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
  async function applyEdits(edits: { type: string; search?: string; replace_with?: string; style_id?: string; marks?: Record<string, unknown>; text?: string }[]): Promise<number> {
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
          } else if (edit.type === "insert_list_item" && edit.text) {
            // Insert a new list paragraph after the item whose text matches edit.search.
            // In eigenpal/DOCX, list items are paragraphs with numPr attrs — no list_item
            // wrapper node — so we clone the found paragraph's type+attrs to inherit
            // the list formatting (bullet style, indent level, numId, etc.).
            const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
            if (!hits.length) { console.warn("[applyEdits] insert_list_item: not found:", edit.search); continue; }
            const para = core.findParagraphByParaId(view.state.doc, hits[0].paraId);
            if (!para) { console.warn("[applyEdits] insert_list_item: para not found"); continue; }
            const schema = view.state.schema;
            // para.from is the opening tag of the paragraph; para.from + para.node.nodeSize
            // is the position immediately after it (where a sibling paragraph belongs).
            const insertPos = para.from + para.node.nodeSize;
            const newNode = para.node.type.create(
              para.node.attrs,
              edit.text ? schema.text(edit.text) : null,
            );
            console.log("[applyEdits] insert_list_item at", insertPos, "node:", newNode.type.name);
            paged.dispatch(view.state.tr.insert(insertPos, newNode));
            applied++;
          }
        } catch (editErr) { console.error("[applyEdits] edit error:", edit, editErr); }
      }

      if (applied > 0) paged.relayout();
      return applied;
    } catch (err) { console.error("[applyEdits] unexpected error:", err); return 0; }
  }

  // ── Chat edit queue: show one edit at a time as a tracked-change ──────────
  async function showNextChatEdit() {
    const queue = chatEditQueueRef.current;
    if (!queue.length) return;

    const edit = queue[0];
    chatEditQueueRef.current = queue.slice(1);

    const editor = editorRef.current;
    if (!editor) return;
    const paged = editor.getEditorRef();
    const view  = paged?.getView();
    if (!paged || !view) return;

    const core = await import("@eigenpal/docx-js-editor/core");

    const getBarY = (pmPos: number) => {
      try {
        const v = editor.getEditorRef()?.getView();
        if (v && pmPos !== -1) return v.coordsAtPos(pmPos).top + 28;
      } catch {}
      return -1;
    };

    if (edit.type === "replace" && edit.replace_with !== undefined && edit.search) {
      const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
      if (!hits.length) { console.warn("[chatEdit] replace: not found:", edit.search); showNextChatEdit(); return; }

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
      if (start === -1) { console.warn("[chatEdit] replace: pos not found:", match); showNextChatEdit(); return; }

      const proposed   = edit.replace_with;
      const revisionId = Date.now();
      let marksApplied = false;

      // Use direct ProseMirror marks (not proposeChange) to avoid eigenpal's annotation.
      const schema  = view.state.schema;
      const date    = new Date().toISOString();
      const delMark = schema.marks.deletion?.create({ revisionId, author: "AI", date });
      const insMark = schema.marks.insertion?.create({ revisionId, author: "AI", date });
      if (delMark && insMark && proposed.length > 0) {
        view.dispatch(view.state.tr.addMark(start, end, delMark).insert(end, schema.text(proposed, [insMark])));
        paged.relayout(); marksApplied = true;
      } else if (delMark && proposed.length === 0) {
        view.dispatch(view.state.tr.addMark(start, end, delMark));
        paged.relayout(); marksApplied = true;
      } else {
        paged.dispatch(view.state.tr.insertText(proposed, start, end));
        paged.relayout(); await persistCurrentDoc(); showNextChatEdit(); return;
      }

      setInlineChange({
        id: String(revisionId),
        delFrom: start, delTo: end,
        insFrom: end,   insTo: end + proposed.length,
        originalText: match, proposedText: proposed,
        rationale: edit.chatReply.slice(0, 120),
        instruction: edit.chatInstruction,
        textblocks: null, barY: getBarY(start),
      });
      setLeftTab("changes");

    } else if (edit.type === "insert_list_item" && edit.text && edit.search) {
      const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
      if (!hits.length) { console.warn("[chatEdit] insert_list_item: not found:", edit.search); showNextChatEdit(); return; }
      const para = core.findParagraphByParaId(view.state.doc, hits[0].paraId);
      if (!para) { console.warn("[chatEdit] insert_list_item: para not found"); showNextChatEdit(); return; }

      const schema     = view.state.schema;
      const insertPos  = para.from + para.node.nodeSize;
      const revisionId = Date.now();
      const insMark    = schema.marks.insertion?.create({ revisionId, author: "AI", date: new Date().toISOString() });
      const textNode   = insMark ? schema.text(edit.text, [insMark]) : schema.text(edit.text);
      const newNode    = para.node.type.create(para.node.attrs, textNode);
      paged.dispatch(view.state.tr.insert(insertPos, newNode));
      paged.relayout();

      const textFrom = insertPos + 1;
      const textTo   = textFrom + edit.text.length;
      setInlineChange({
        id: String(revisionId),
        delFrom: textFrom, delTo: textFrom,
        insFrom: textFrom, insTo: textTo,
        originalText: "", proposedText: edit.text,
        rationale: edit.chatReply.slice(0, 120),
        instruction: edit.chatInstruction,
        textblocks: null, barY: getBarY(insertPos),
        isParagraphInsert: true,
      });
      setLeftTab("changes");

    } else {
      // set_style or format: apply directly, no review needed
      try {
        if (edit.type === "set_style" && edit.style_id && edit.search) {
          const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
          if (hits.length) editor.setParagraphStyle({ paraId: hits[0].paraId, styleId: edit.style_id });
        } else if (edit.type === "format" && edit.marks && edit.search) {
          const hits = editor.findInDocument(edit.search, { caseSensitive: false, limit: 1 });
          if (hits.length) editor.applyFormatting({
            paraId: hits[0].paraId, search: hits[0].match,
            marks: edit.marks as Parameters<typeof editor.applyFormatting>[0]["marks"],
          });
        }
      } catch (e) { console.error("[chatEdit] style/format error:", e); }
      paged.relayout();
      await persistCurrentDoc();
      showNextChatEdit();
    }
  }

  // ── Selection bubble AI edit ───────────────────────────────────────────────
  async function applySelectionEdit(instruction: string) {
    if (!selBubble) return;
    setSelLoading(true);
    const { text, paragraphText, pmFrom, pmTo, textblocks } = selBubble;

    const selectedText = textblocks
      ? textblocks.map(tb => `- ${tb.text}`).join("\n")
      : text;

    try {
      const res = await fetch("/api/documents/selection-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText, instruction, documentContext: paragraphText }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data      = await res.json();
      const proposed  = (data.replacement ?? text) as string;
      const rationale = (data.rationale   ?? "")   as string;
      const originalText = textblocks ? textblocks.map(tb => tb.text).join("\n") : text;

      const editor = editorRef.current;
      const paged  = editor?.getEditorRef();
      const view   = paged?.getView();

      // Capture bar position from PM coords BEFORE the selection collapses
      const getBarY = () => {
        try {
          const v = editor?.getEditorRef()?.getView();
          if (v && pmFrom !== -1) return v.coordsAtPos(pmFrom).top + 28;
        } catch {}
        return -1;
      };

      if (textblocks && textblocks.length > 1) {
        setInlineChange({
          id: crypto.randomUUID(),
          delFrom: pmFrom, delTo: pmTo,
          insFrom: pmTo, insTo: pmTo,
          originalText, proposedText: proposed,
          rationale, instruction, textblocks,
          barY: getBarY(),
        });
      } else if (pmFrom !== -1 && pmTo !== -1 && pmFrom < pmTo) {
        const revisionId = Date.now();
        let marksApplied = false;

        // Use direct ProseMirror marks (not proposeChange) to avoid eigenpal's
        // own tracked-change annotation rendering in the document margin.
        if (view) {
          const schema = view.state.schema;
          const date = new Date().toISOString();
          const deletionMark  = schema.marks.deletion?.create({ revisionId, author: "AI", date });
          const insertionMark = schema.marks.insertion?.create({ revisionId, author: "AI", date });

          if (deletionMark && insertionMark && proposed.length > 0) {
            const insNode = schema.text(proposed, [insertionMark]);
            view.dispatch(
              view.state.tr
                .addMark(pmFrom, pmTo, deletionMark)
                .insert(pmTo, insNode)
            );
            paged?.relayout();
            marksApplied = true;
          } else if (deletionMark && proposed.length === 0) {
            view.dispatch(view.state.tr.addMark(pmFrom, pmTo, deletionMark));
            paged?.relayout();
            marksApplied = true;
          }
          // else: schema has no tracked-change marks — stage without touching the doc.
          // acceptInlineChange (noMarks path) will apply the insertText on accept.
        }

        setInlineChange({
          id: String(revisionId),
          delFrom: pmFrom, delTo: pmTo,
          insFrom: marksApplied ? pmTo   : pmFrom,
          insTo:   marksApplied ? pmTo + proposed.length : pmFrom,
          originalText, proposedText: proposed,
          rationale, instruction, textblocks: null,
          barY: getBarY(),
          noMarks: !marksApplied,
        });
      }

      // Close bubble immediately — diff is visible in the document.
      // Open the Changes tab so Accept/Reject is right there.
      setSelBubble(null);
      setSelPrompt("");
      setSelAsk("");
      setLeftTab("changes");
    } catch (e) {
      console.error("[selectionEdit]", e);
    } finally {
      setSelLoading(false);
    }
  }

  // ── Accept ─────────────────────────────────────────────────────────────────
  async function acceptInlineChange() {
    const change = inlineChangeRef.current;
    if (!change) return;

    const editor = editorRef.current;
    const paged  = editor?.getEditorRef();
    const view   = paged?.getView();

    if (change.textblocks && change.textblocks.length > 1) {
      // List path: replace each item individually; insert new nodes if AI added more
      if (paged && view) {
        const lines = change.proposedText
          .split("\n")
          .map(l => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
          .filter(l => l.length > 0);
        let tr = view.state.tr;
        const existingCount = change.textblocks.length;
        const updateCount = Math.min(existingCount, lines.length);

        // Update existing items backwards to keep earlier positions valid
        for (let i = updateCount - 1; i >= 0; i--) {
          tr = tr.insertText(lines[i], change.textblocks[i].from, change.textblocks[i].to);
        }

        // Insert extra items the AI added beyond the original selection
        if (lines.length > existingCount) {
          const schema = view.state.schema;
          const listItemType = schema.nodes.list_item ?? schema.nodes.listItem;
          const paragraphType = schema.nodes.paragraph;
          if (listItemType && paragraphType) {
            try {
              const lastTb = change.textblocks[existingCount - 1];
              const $last = view.state.doc.resolve(lastTb.from);
              // paragraph is at $last.depth; list_item is one level up
              const liDepth = $last.depth - 1;
              const liNode  = $last.node(liDepth);
              const liStart = $last.start(liDepth) - 1; // opening pos of list_item
              const insertPosOrig = liStart + liNode.nodeSize; // right after the list_item

              const existingParaAttrs = $last.node($last.depth).attrs;

              // Insert in reverse so forward order is preserved (each lands before previous)
              for (let i = lines.length - 1; i >= existingCount; i--) {
                const newPara = paragraphType.create(existingParaAttrs, lines[i] ? schema.text(lines[i]) : undefined);
                const newItem = listItemType.create(liNode.attrs, newPara);
                tr = tr.insert(tr.mapping.map(insertPosOrig, -1), newItem);
              }
            } catch (e) {
              console.warn("[acceptInlineChange] could not insert new list items:", e);
            }
          }
        }

        paged.dispatch(tr);
        paged.relayout();
      }
    } else if (view) {
      if (change.noMarks) {
        // No tracked-change marks were applied — just do a plain replacement now.
        view.dispatch(view.state.tr.insertText(change.proposedText, change.delFrom, change.delTo));
      } else {
        const schema = view.state.schema;
        const proposedLen = change.insTo - change.insFrom;
        // Delete original text; proposed text shifts left to delFrom..delFrom+proposedLen
        let tr = view.state.tr.delete(change.delFrom, change.delTo);
        if (schema.marks.insertion) {
          tr = tr.removeMark(change.delFrom, change.delFrom + proposedLen, schema.marks.insertion);
        }
        view.dispatch(tr);
      }
    }

    await persistCurrentDoc();
    setChangeHistory(prev => [...prev, {
      id: change.id, instruction: change.instruction, rationale: change.rationale,
      originalText: change.originalText, proposedText: change.proposedText,
      status: "accepted", timestamp: Date.now(),
    }]);
    setInlineChange(null);
    setSelBubble(null); setSelPrompt(""); setSelAsk("");
    showNextChatEdit();
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  async function rejectInlineChange() {
    const change = inlineChangeRef.current;
    if (!change) return;

    const paged = editorRef.current?.getEditorRef();
    const view  = paged?.getView();

    if (change.isParagraphInsert && view) {
      // Delete the entire inserted paragraph: insFrom-1 is the opening paragraph token
      view.dispatch(view.state.tr.delete(change.insFrom - 1, change.insTo + 1));
      await persistCurrentDoc();
    } else if (!change.textblocks && view && change.insFrom < change.insTo) {
      const schema = view.state.schema;
      // Delete proposed (insertion-marked) text first — it's after the original
      // so original positions (delFrom..delTo) are unaffected by this deletion.
      let tr = view.state.tr.delete(change.insFrom, change.insTo);
      if (schema.marks.deletion) {
        tr = tr.removeMark(change.delFrom, change.delTo, schema.marks.deletion);
      }
      view.dispatch(tr);
      await persistCurrentDoc();
    }
    // Lists: nothing was inserted, nothing to undo

    setChangeHistory(prev => [...prev, {
      id: change.id, instruction: change.instruction, rationale: change.rationale,
      originalText: change.originalText, proposedText: change.proposedText,
      status: "rejected", timestamp: Date.now(),
    }]);
    setInlineChange(null);
    setSelBubble(null); setSelPrompt(""); setSelAsk("");
    showNextChatEdit();
  }

  // ── Temporarily re-show tracked-change markup for a history entry ─────────
  function applyTempDiff(ch: TrackedChange) {
    // Tear down any previous preview first
    tempDiffRef.current?.revert();
    tempDiffRef.current = null;
    editorContainerRef.current?.removeAttribute("data-preview-diff");
    docHighlightEls.current.forEach(el => {
      el.style.backgroundColor = el.dataset.prevBg ?? "";
      el.style.outline = ""; el.style.borderRadius = "";
      delete el.dataset.prevBg;
    });
    docHighlightEls.current = [];

    const paged  = editorRef.current?.getEditorRef();
    const view   = paged?.getView();
    if (!view || !paged) return;

    const schema = view.state.schema;
    const revId  = Date.now();
    const date   = new Date().toISOString();
    const delMark = schema.marks.deletion?.create({ revisionId: revId, author: "AI", date });
    const insMark = schema.marks.insertion?.create({ revisionId: revId, author: "AI", date });

    // Helper: smallest DOM element (within editor) whose textContent contains needle.
    // Eigenpal splits text into many child spans; .textContent concatenates all of them.
    const normWS  = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
    function findDOMNode(needle: string): HTMLElement | null {
      function walk(el: Element): Element | null {
        if (!normWS(el.textContent ?? "").includes(needle)) return null;
        for (const c of Array.from(el.children)) { const h = walk(c); if (h) return h; }
        return el;
      }
      return walk(editorContainerRef.current ?? document.body) as HTMLElement | null;
    }

    // Helper: find position of text in the PM document (first block that contains it).
    function findPMPos(text: string): { from: number; to: number } | null {
      let result: { from: number; to: number } | null = null;
      view.state.doc.descendants((node, pos) => {
        if (result) return false;
        if (node.isBlock) {
          const idx = node.textContent.indexOf(text);
          if (idx !== -1) { result = { from: pos + 1 + idx, to: pos + 1 + idx + text.length }; return false; }
        }
      });
      return result;
    }

    // Fallback: CSS-only highlight when marks aren't available or text not found
    function fallbackHighlight() {
      const raw    = (ch.status === "accepted" ? ch.proposedText : ch.originalText).trim();
      const needle = normWS(raw).slice(0, 60);
      const target = findDOMNode(needle);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const color  = ch.status === "accepted" ? "#16a34a" : "#dc2626";
      target.dataset.prevBg = target.style.backgroundColor ?? "";
      target.style.backgroundColor = "#fef9c3";
      target.style.outline = `2px solid ${color}`;
      target.style.borderRadius = "3px";
      docHighlightEls.current = [target];
    }

    if (!delMark || !insMark) { fallbackHighlight(); return; }

    if (ch.status === "accepted") {
      // proposedText is in the doc. Show: ~~originalText~~ proposedText
      const pos = findPMPos(ch.proposedText.trim());
      if (!pos) { fallbackHighlight(); return; }
      const { from, to } = pos;
      const origLen = ch.originalText.length;

      // Guard: PM disallows empty text nodes
      if (!ch.originalText) { fallbackHighlight(); return; }
      const origNode = schema.text(ch.originalText, [delMark]);
      // Step 1: mark proposedText as insertion; Step 2: insert originalText (deletion) before it
      view.dispatch(view.state.tr.addMark(from, to, insMark).insert(from, origNode));
      paged.relayout();
      editorContainerRef.current?.setAttribute("data-preview-diff", "1");

      // Scroll to the deletion (originalText, which is the newly inserted part)
      setTimeout(() => {
        const needle = normWS(ch.originalText).slice(0, 60);
        const target = findDOMNode(needle);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);

      tempDiffRef.current = {
        revert: () => {
          const v = editorRef.current?.getEditorRef()?.getView();
          const p = editorRef.current?.getEditorRef();
          if (!v) return;
          // Remove the inserted originalText, then strip insertion mark from proposedText
          const im = v.state.schema.marks.insertion;
          v.dispatch(v.state.tr
            .delete(from, from + origLen)
            .removeMark(from, from + ch.proposedText.length, im));
          p?.relayout();
        },
      };

    } else {
      // originalText is in the doc. Show: ~~originalText~~ proposedText
      const pos = findPMPos(ch.originalText.trim());
      if (!pos) { fallbackHighlight(); return; }
      const { from, to } = pos;
      const propLen = ch.proposedText.length;

      // Guard: PM disallows empty text nodes
      if (!ch.proposedText) { fallbackHighlight(); return; }
      const propNode = schema.text(ch.proposedText, [insMark]);
      // Step 1: mark originalText as deletion; Step 2: insert proposedText (insertion) after it
      view.dispatch(view.state.tr.addMark(from, to, delMark).insert(to, propNode));
      paged.relayout();
      editorContainerRef.current?.setAttribute("data-preview-diff", "1");

      // Scroll to the deletion (originalText, already at [from, to])
      setTimeout(() => {
        const needle = normWS(ch.originalText).slice(0, 60);
        const target = findDOMNode(needle);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);

      tempDiffRef.current = {
        revert: () => {
          const v = editorRef.current?.getEditorRef()?.getView();
          const p = editorRef.current?.getEditorRef();
          if (!v) return;
          // Remove the inserted proposedText, then strip deletion mark from originalText
          const dm = v.state.schema.marks.deletion;
          v.dispatch(v.state.tr
            .delete(to, to + propLen)
            .removeMark(from, to, dm));
          p?.relayout();
        },
      };
    }
  }

  // ── Undo a history entry ──────────────────────────────────────────────────
  async function undoChange(id: string) {
    const ch = changeHistory.find(c => c.id === id);
    const paged = editorRef.current?.getEditorRef();
    const view  = paged?.getView();

    if (ch && view) {
      // Accepted: proposedText is now in the doc → replace it back with originalText.
      // Rejected: originalText is still in the doc → re-insert proposedText.
      const searchFor   = ch.status === "accepted" ? ch.proposedText : ch.originalText;
      const replaceWith = ch.status === "accepted" ? ch.originalText : ch.proposedText;

      if (searchFor) {
        let found = false;
        view.state.doc.descendants((node, pos) => {
          if (found) return false;
          if (node.isBlock) {
            const blockText = node.textContent;
            const idx = blockText.indexOf(searchFor);
            if (idx !== -1) {
              const from = pos + 1 + idx; // +1 past the block's opening token
              const to   = from + searchFor.length;
              view.dispatch(view.state.tr.insertText(replaceWith ?? "", from, to));
              paged?.relayout();
              found = true;
              return false;
            }
          }
        });
      }
    }

    setChangeHistory(prev => prev.filter(c => c.id !== id));
    setExpandedHistoryId(null);
    await persistCurrentDoc();
  }

  // ── Selection bubble ask ──────────────────────────────────────────────────
  async function askAboutSelection(q: string) {
    if (!selBubble || !q.trim()) return;
    const { text, paragraphText } = selBubble;
    // Show only the user's question in the chat; include the selection as context for the API only
    const apiQuestion = `Regarding this highlighted text: "${text}"\n\n${q}`;
    setSelBubble(null);
    setSelPrompt("");
    setSelAsk("");
    setLeftTab("ai");
    setChat(prev => [...prev, { role: "user", content: q }]);
    setAiLoading(true);
    try {
      // Prefer live editor text; fall back to paragraphText (always fresh, captured at selection
      // time) rather than docText which can be stale from a previously loaded document.
      const liveText = editorRef.current?.getAgent()?.getText() || paragraphText;
      const res = await fetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: apiQuestion, documentText: liveText, chatHistory: [] }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setChat(prev => [...prev, { role: "assistant", content: data.answer || "No response." }]);
    } catch (err) {
      console.error("[askAboutSelection]", err);
      setChat(prev => [...prev, { role: "assistant", content: "Failed to get a response. Please try again." }]);
    } finally {
      setAiLoading(false);
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
      const data  = await res.json();
      const reply = data.answer || "No response.";
      setChat(prev => [...prev, { role: "assistant", content: reply }]);
      const edits = (data.edits ?? []) as Array<{ type: string; search?: string; replace_with?: string; text?: string; style_id?: string; marks?: Record<string, unknown> }>;
      if (edits.length > 0) {
        chatEditQueueRef.current = edits.map(e => ({ ...e, chatInstruction: q, chatReply: reply }));
        showNextChatEdit();
      }
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
          <div data-lawrenn-panel="1" style={{ width: leftWidth, flexShrink: 0, display: "flex", flexDirection: "column", background: "white", borderRight: "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>

            {/* Tab bar */}
            <div style={{ flexShrink: 0, display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              {([
                { id: "ai",      label: "AI" },
                { id: "docs",    label: "Docs" },
                { id: "changes", label: `Changes${changeHistory.length > 0 ? ` (${changeHistory.length})` : ""}` },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  style={{
                    flex: 1, padding: "0.55rem 0", background: "transparent", border: "none",
                    borderBottom: leftTab === tab.id ? "2px solid #111111" : "2px solid transparent",
                    fontFamily: "'DM Sans', sans-serif", fontSize: "0.68rem",
                    fontWeight: leftTab === tab.id ? 700 : 500,
                    color: leftTab === tab.id ? "#111111" : "#9CA3AF",
                    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                    transition: "color 0.15s",
                  }}>
                  {tab.label}
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
                        background: msg.role === "user" ? "#ffffff" : "#F3F4F6",
                        color: "#111111",
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
            {/* Changes tab */}
            {leftTab === "changes" && (
              <div style={{ flex: 1, overflowY: "auto" }}>

                {/* Pending change — Accept / Reject */}
                {inlineChange && (
                  <div style={{
                    padding: "0.85rem 1rem",
                    background: "rgba(251,191,36,0.06)",
                    borderBottom: "2px solid rgba(251,191,36,0.25)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                      <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em", color: "#b45309", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>
                        Pending Review
                      </span>
                    </div>

                    {inlineChange.rationale && (
                      <p style={{ fontSize: "0.73rem", color: "#374151", margin: "0 0 0.5rem", fontStyle: "italic", lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>
                        "{inlineChange.rationale}"
                      </p>
                    )}

                    {/* Word diff — always shown so user can see the proposed change */}
                    {(inlineChange.originalText || inlineChange.proposedText) && (
                      <div style={{
                        fontSize: "0.72rem", lineHeight: 1.6, marginBottom: "0.5rem",
                        padding: "6px 8px", background: "rgba(0,0,0,0.03)", borderRadius: 5,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {wordDiff(
                          inlineChange.originalText,
                          inlineChange.proposedText.replace(/^[-*•]\s*/gm, ""),
                        ).map((part, i) => {
                          if (part.t === "del") return <span key={i} style={{ textDecoration: "line-through", color: "#dc2626" }}>{part.v}</span>;
                          if (part.t === "ins") return <span key={i} style={{ color: "#16a34a", fontWeight: 500 }}>{part.v}</span>;
                          return <span key={i} style={{ color: "#374151" }}>{part.v}</span>;
                        })}
                      </div>
                    )}

                  </div>
                )}

                {/* History */}
                {changeHistory.length === 0 && !inlineChange ? (
                  <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.78rem", lineHeight: 1.6 }}>
                    No AI edits yet.<br />Highlight text and give an instruction to propose a redline.
                  </div>
                ) : (
                  [...changeHistory].reverse().map(ch => {
                    const isOpen = expandedHistoryId === ch.id;
                    const diff = wordDiff(ch.originalText, ch.proposedText);
                    return (
                      <div key={ch.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                        {/* Collapsed row — click to expand */}
                        <button
                          onClick={() => {
                            const next = isOpen ? null : ch.id;
                            setExpandedHistoryId(next);
                            if (next) applyTempDiff(ch);
                          }}
                          style={{
                            width: "100%", textAlign: "left", background: isOpen ? "#F9FAFB" : "transparent",
                            border: "none", padding: "0.7rem 1rem", cursor: "pointer", display: "block",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                            <span style={{
                              fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
                              fontFamily: "'DM Sans', sans-serif",
                              color: ch.status === "accepted" ? "#16a34a" : "#9CA3AF",
                            }}>
                              {ch.status}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontSize: "0.65rem", color: "#9CA3AF", fontFamily: "'DM Sans', sans-serif" }}>{relativeTime(ch.timestamp)}</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
                                style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </div>
                          </div>
                          {ch.rationale && (
                            <p style={{ fontSize: "0.72rem", color: "#374151", margin: 0, fontStyle: "italic", lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ch.rationale}
                            </p>
                          )}
                        </button>

                        {/* Expanded: full diff + undo */}
                        {isOpen && (
                          <div style={{ padding: "0 1rem 0.85rem", background: "#F9FAFB" }}>
                            <div style={{
                              fontSize: "0.72rem", lineHeight: 1.7,
                              padding: "8px 10px", background: "white",
                              border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6,
                              fontFamily: "'DM Sans', sans-serif", marginBottom: "0.6rem",
                            }}>
                              {diff.map((part, i) => {
                                if (part.t === "del") return <span key={i} style={{ textDecoration: "line-through", color: "#dc2626" }}>{part.v}</span>;
                                if (part.t === "ins") return <span key={i} style={{ color: "#16a34a", fontWeight: 500 }}>{part.v}</span>;
                                return <span key={i} style={{ color: "#374151" }}>{part.v}</span>;
                              })}
                            </div>
                            <button
                              onClick={() => undoChange(ch.id)}
                              style={{
                                width: "100%", padding: "5px 0",
                                background: "white", border: "1px solid rgba(0,0,0,0.12)",
                                borderRadius: 6, color: "#374151",
                                fontSize: "0.73rem", fontFamily: "'DM Sans', sans-serif",
                                fontWeight: 500, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
                              }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                              </svg>
                              Undo
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
          <div ref={editorContainerRef} style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
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

            {/* Floating accept / decline bar — pinned just below the changed text */}
            {inlineChange && docBuffer && (
              <div style={{
                position: "fixed",
                top: inlineChange.barY > 0 ? inlineChange.barY : "50%",
                left: "50%",
                transform: inlineChange.barY > 0 ? "translateX(-50%)" : "translate(-50%, -50%)",
                zIndex: 9000, display: "flex", flexDirection: "column", gap: "0.5rem",
                background: "white", borderRadius: 12,
                boxShadow: "0 4px 24px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.07)",
                padding: "10px 14px", pointerEvents: "auto", maxWidth: 420,
              }}>
                {/* Rationale row */}
                {inlineChange.rationale && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span style={{ fontSize: "0.75rem", color: "#374151", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4 }}>
                      {inlineChange.rationale}
                    </span>
                  </div>
                )}
                {/* Buttons row */}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  onClick={rejectInlineChange}
                  style={{
                    flexShrink: 0, padding: "5px 14px",
                    background: "white", border: "1px solid rgba(220,38,38,0.35)",
                    borderRadius: 7, color: "#dc2626",
                    fontSize: "0.75rem", fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600, cursor: "pointer",
                  }}>
                  Decline
                </button>
                <button
                  onClick={acceptInlineChange}
                  style={{
                    flexShrink: 0, padding: "5px 14px",
                    background: "#111111", border: "none",
                    borderRadius: 7, color: "white",
                    fontSize: "0.75rem", fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600, cursor: "pointer",
                  }}>
                  Accept
                </button>
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
            background: "white", borderRadius: 8,
            boxShadow: "0 4px 24px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.08)",
            padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6,
            minWidth: 268, maxWidth: 340,
          }}
        >
          <div style={{
            position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid white",
          }} />

          {(
            /* ── Edit / ask form ──────────────────────────────────────────── */
            <>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[
                  { label: "Tighten",   instruction: "Make this clause more precise and legally airtight, removing ambiguity" },
                  { label: "Simplify",  instruction: "Rewrite in plain English while preserving the full legal meaning" },
                  { label: "Qualify",   instruction: "Add appropriate qualifications, limitations, or carve-outs to this clause" },
                  { label: "Formalize", instruction: "Rewrite using formal legal language and standard legal drafting conventions" },
                ].map(p => (
                  <button
                    key={p.label} type="button" disabled={selLoading}
                    onMouseDown={e => { e.preventDefault(); applySelectionEdit(p.instruction); }}
                    style={{
                      background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: 5, color: "#111111",
                      fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 500, padding: "3px 9px", cursor: selLoading ? "wait" : "pointer",
                    }}>
                    {selLoading ? "…" : p.label}
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
                    if (e.key === "Escape") { setSelBubble(null); setSelPrompt(""); setSelAsk(""); }
                    if (e.key === "Backspace" && selPrompt === "") {
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
                      setSelBubble(null); setSelPrompt(""); setSelAsk("");
                    }
                  }}
                  style={{
                    flex: 1, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 5, color: "#111111", fontSize: "0.72rem",
                    fontFamily: "'DM Sans', sans-serif", padding: "4px 8px", outline: "none",
                  }}
                />
                <button
                  type="button" disabled={selLoading || !selPrompt.trim()}
                  onMouseDown={e => { e.preventDefault(); if (selPrompt.trim()) applySelectionEdit(selPrompt.trim()); }}
                  style={{
                    background: selLoading || !selPrompt.trim() ? "rgba(0,0,0,0.05)" : "#111111",
                    border: "none", borderRadius: 5,
                    color: selLoading || !selPrompt.trim() ? "rgba(0,0,0,0.3)" : "white",
                    fontSize: "0.72rem", fontFamily: "'DM Sans', sans-serif", padding: "4px 10px",
                    cursor: selLoading || !selPrompt.trim() ? "default" : "pointer",
                  }}>
                  {selLoading ? "…" : "Go"}
                </button>
              </div>

              <div style={{ height: 1, background: "rgba(0,0,0,0.08)", margin: "2px -2px 0" }} />

              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.07em", color: "rgba(0,0,0,0.35)", fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>ASK</span>
                <input
                  type="text" value={selAsk} placeholder="Ask about this…"
                  disabled={selLoading}
                  onChange={e => setSelAsk(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && selAsk.trim()) { e.preventDefault(); askAboutSelection(selAsk.trim()); }
                    if (e.key === "Escape") { setSelBubble(null); setSelPrompt(""); setSelAsk(""); }
                  }}
                  style={{
                    flex: 1, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 5, color: "#111111", fontSize: "0.72rem",
                    fontFamily: "'DM Sans', sans-serif", padding: "4px 8px", outline: "none",
                  }}
                />
                <button
                  type="button" disabled={selLoading || !selAsk.trim()}
                  onMouseDown={e => { e.preventDefault(); if (selAsk.trim()) askAboutSelection(selAsk.trim()); }}
                  style={{
                    background: selLoading || !selAsk.trim() ? "rgba(0,0,0,0.05)" : "rgba(99,102,241,0.85)",
                    border: "none", borderRadius: 5,
                    color: selLoading || !selAsk.trim() ? "rgba(0,0,0,0.3)" : "white",
                    fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif", padding: "3px 10px",
                    cursor: selLoading || !selAsk.trim() ? "default" : "pointer",
                  }}>
                  &#8594;
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        .docx-insertion { border-bottom: none !important; padding-bottom: 0 !important; background-color: transparent !important; }
        .docx-deletion  { background-color: transparent !important; }
        [data-preview-diff] .docx-insertion { background-color: rgba(22,163,74,0.12) !important; border-bottom: 2px solid #16a34a !important; padding-bottom: 1px !important; color: #15803d !important; }
        [data-preview-diff] .docx-deletion  { background-color: rgba(220,38,38,0.08) !important; }
        input[placeholder]::placeholder { color: rgba(255,255,255,0.35); }
      `}</style>
    </FeatureGate>
  );
}
