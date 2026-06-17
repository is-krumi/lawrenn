"use client";

import FeatureGate from "@/components/FeatureGate";
import { useBusiness } from "@/context/BusinessContext";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface DocRecord {
  id: string;
  name: string;
  status: string;
  file_type?: string;
  file_size?: number;
  created_at?: string;
  file_path?: string;
  folder_id?: string | null;
  doc_type?: string | null;
  page_count?: number | null;
  deleted_at?: string | null;
}

interface Folder {
  id: string;
  name: string;
}

// ── Icons ──────────────────────────────────────────────────────────────────

function DocTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    return (
      <img src="/icons/adobeLogo.png" alt="PDF" width={16} height={16}
        style={{ flexShrink: 0, objectFit: "contain" }} />
    );
  }

  function DocShape({ color, foldColor, children }: { color: string; foldColor: string; children: React.ReactNode }) {
    return (
      <svg width="16" height="19" viewBox="0 0 16 19" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <path d="M1 2.5C1 1.67 1.67 1 2.5 1H9L15 7V16.5C15 17.33 14.33 18 13.5 18H2.5C1.67 18 1 17.33 1 16.5V2.5Z" fill={color}/>
        <path d="M9 1L15 7H10C9.45 7 9 6.55 9 6V1Z" fill={foldColor}/>
        {children}
      </svg>
    );
  }

  if (ext === "doc" || ext === "docx") return <DocShape color="#2B579A" foldColor="#1E3F73"><text x="8" y="15.5" textAnchor="middle" fill="white" fontSize="7" fontWeight="900" fontFamily="Arial,sans-serif">W</text></DocShape>;
  if (ext === "xls" || ext === "xlsx") return <DocShape color="#217346" foldColor="#185A34"><text x="8" y="15" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="800" fontFamily="Arial,sans-serif">XLS</text></DocShape>;
  if (ext === "ppt" || ext === "pptx") return <DocShape color="#D04423" foldColor="#A8341A"><text x="8" y="15" textAnchor="middle" fill="white" fontSize="4.5" fontWeight="800" fontFamily="Arial,sans-serif">PPT</text></DocShape>;
  return (
    <DocShape color="#6B7280" foldColor="#4B5563">
      <text x="8" y="15" textAnchor="middle" fill="white" fontSize="4" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="0.3">
        {ext.toUpperCase().slice(0, 3) || "DOC"}
      </text>
    </DocShape>
  );
}

function FolderSvg({ filled = false, size = 18 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  );
}

function daysRemaining(deletedAt: string): number {
  const expiresAt = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter();
  const { businessId, loading: bizLoading } = useBusiness();

  const [documents,        setDocuments]        = useState<DocRecord[]>([]);
  const [folders,          setFolders]          = useState<Folder[]>([]);
  const [currentFolderId,  setCurrentFolderId]  = useState<string | null>(null);

  const [uploading,        setUploading]        = useState(false);
  const [uploadingName,    setUploadingName]    = useState("");
  const [isDraggingFile,   setIsDraggingFile]   = useState(false);

  const [draggingDocId,    setDraggingDocId]    = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const [creatingFolder,   setCreatingFolder]   = useState(false);
  const [newFolderName,    setNewFolderName]    = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue,      setRenameValue]      = useState("");
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<string | null>(null);

  const fileInputRef           = useRef<HTMLInputElement>(null);
  const newFolderInputRef      = useRef<HTMLInputElement>(null);
  const renameInputRef         = useRef<HTMLInputElement>(null);
  const newFolderCommittedRef  = useRef(false);

  const [previewDoc,      setPreviewDoc]      = useState<{ url: string; name: string } | null>(null);
  const [previewWidth,    setPreviewWidth]    = useState(480);
  const [previewDragging, setPreviewDragging] = useState(false);
  const [contextMenu,    setContextMenu]    = useState<{ x: number; y: number; doc: DocRecord } | null>(null);
  const [renamingDocId,  setRenamingDocId]  = useState<string | null>(null);
  const [renameDocValue, setRenameDocValue] = useState("");
  const previewDragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Trash state
  const [trashOpen,       setTrashOpen]       = useState(false);
  const [trashDocs,       setTrashDocs]       = useState<DocRecord[]>([]);
  const [trashLoading,    setTrashLoading]    = useState(false);
  const [trashCount,      setTrashCount]      = useState(0);

  const onPreviewMouseMove = useCallback((e: MouseEvent) => {
    if (!previewDragRef.current) return;
    const dx = previewDragRef.current.startX - e.clientX;
    setPreviewWidth(Math.max(320, Math.min(900, previewDragRef.current.startW + dx)));
  }, []);

  const onPreviewMouseUp = useCallback(() => {
    previewDragRef.current = null;
    setPreviewDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onPreviewMouseMove);
    window.addEventListener("mouseup",   onPreviewMouseUp);
    return () => {
      window.removeEventListener("mousemove", onPreviewMouseMove);
      window.removeEventListener("mouseup",   onPreviewMouseUp);
    };
  }, [onPreviewMouseMove, onPreviewMouseUp]);

  function startPreviewDrag(e: React.MouseEvent) {
    e.preventDefault();
    previewDragRef.current = { startX: e.clientX, startW: previewWidth };
    setPreviewDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    if (!contextMenu) return;
    function close() { setContextMenu(null); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [contextMenu]);

  async function renameDocument(doc: DocRecord, newName: string) {
    const trimmed = newName.trim();
    setRenamingDocId(null);
    if (!trimmed || trimmed === doc.name) return;
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, name: trimmed } : d));
    await supabase.from("documents").update({ name: trimmed }).eq("id", doc.id);
  }

  async function openPreview(doc: DocRecord) {
    if (!doc.id || doc.status !== "ready" || !businessId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ? `Bearer ${session.access_token}` : "";
    const res = await fetch(`/api/documents/signed-url?document_id=${doc.id}&business_id=${businessId}`, { headers: { Authorization: token } });
    const json = await res.json();
    if (json.url) {
      const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";
      const viewerUrl = ext === "pdf"
        ? json.url + "#toolbar=0&navpanes=0&zoom=100"
        : ext === "txt"
        ? json.url
        : `https://docs.google.com/viewer?url=${encodeURIComponent(json.url)}&embedded=true`;
      setPreviewDoc({ url: viewerUrl, name: doc.name });
    }
  }

  useEffect(() => { if (!bizLoading && !businessId) router.push("/login"); }, [businessId, bizLoading, router]);

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!businessId) return;

    supabase
      .from("documents")
      .select("id, name, status, file_type, file_size, created_at, file_path, folder_id, doc_type, page_count, deleted_at")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const seen = new Set<string>();
        const unique = ((data as DocRecord[]) ?? []).filter(d => {
          if (seen.has(d.name)) return false;
          seen.add(d.name); return true;
        });
        setDocuments(unique);
      });

    supabase
      .from("library_folders")
      .select("id, name")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setFolders((data as Folder[]) ?? []));

    // Fetch trash count
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .not("deleted_at", "is", null)
      .then(({ count }) => setTrashCount(count ?? 0));
  }, [businessId]);

  // Load trash when panel opens
  useEffect(() => {
    if (!trashOpen || !businessId) return;
    setTrashLoading(true);
    supabase
      .from("documents")
      .select("id, name, status, file_type, file_size, created_at, file_path, folder_id, doc_type, page_count, deleted_at")
      .eq("business_id", businessId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .then(({ data }) => {
        setTrashDocs((data as DocRecord[]) ?? []);
        setTrashLoading(false);
      });
  }, [trashOpen, businessId]);

  useEffect(() => { if (creatingFolder) newFolderInputRef.current?.focus(); }, [creatingFolder]);
  useEffect(() => { if (renamingFolderId) renameInputRef.current?.focus(); }, [renamingFolderId]);

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  async function confirmCreateFolder() {
    if (newFolderCommittedRef.current) return;
    newFolderCommittedRef.current = true;
    const name = newFolderName.trim();
    setCreatingFolder(false); setNewFolderName("");
    if (!name || !businessId) return;

    const tempId = crypto.randomUUID();
    setFolders(prev => [...prev, { id: tempId, name }]);

    const { data, error } = await supabase
      .from("library_folders")
      .insert({ business_id: businessId, name })
      .select("id, name")
      .single();

    if (error || !data) {
      console.error("[library_folders insert]", error);
      alert(`Failed to save folder: ${error?.message ?? "unknown error"}`);
      setFolders(prev => prev.filter(f => f.id !== tempId)); return;
    }
    setFolders(prev => prev.map(f => f.id === tempId ? data as Folder : f));
  }

  async function confirmRename() {
    const name = renameValue.trim();
    const id   = renamingFolderId;
    setRenamingFolderId(null);
    if (!name || !id) return;

    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    await supabase.from("library_folders").update({ name }).eq("id", id);
  }

  async function deleteFolder(folderId: string) {
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setDocuments(prev => prev.map(d => d.folder_id === folderId ? { ...d, folder_id: null } : d));
    if (currentFolderId === folderId) setCurrentFolderId(null);
    await supabase.from("library_folders").delete().eq("id", folderId);
  }

  // ── Document → folder assignment ──────────────────────────────────────────

  async function moveDocToFolder(docId: string, folderId: string | null) {
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, folder_id: folderId } : d));
    await supabase.from("documents").update({ folder_id: folderId }).eq("id", docId);
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFileDrop(file: File) {
    if (!businessId) return;
    if (documents.some(d => d.name === file.name)) {
      alert(`"${file.name}" is already in the library.`); return;
    }
    setUploading(true); setUploadingName(file.name);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("business_id", businessId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ? `Bearer ${session.access_token}` : "";
      const res  = await fetch("/api/process-document", { method: "POST", body: formData, headers: { Authorization: token } });
      const data = await res.json();
      if (res.ok) {
        const newDoc: DocRecord = { id: data.document_id, name: file.name, status: "ready", folder_id: currentFolderId, doc_type: data.doc_type ?? null, page_count: data.page_count ?? null };
        setDocuments(prev => [newDoc, ...prev]);
        if (currentFolderId) await supabase.from("documents").update({ folder_id: currentFolderId }).eq("id", data.document_id);
      } else {
        alert(data.error ?? "Failed to process document");
      }
    } catch { alert("Upload failed. Please try again."); }
    finally { setUploading(false); }
  }

  async function downloadDocument(doc: DocRecord) {
    if (!doc.id || !businessId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ? `Bearer ${session.access_token}` : "";
    const res = await fetch(`/api/documents/signed-url?document_id=${doc.id}&business_id=${businessId}&download=true`, { headers: { Authorization: token } });
    const json = await res.json();
    if (!json.url) { alert("Failed to generate download link."); return; }
    const a = document.createElement("a");
    a.href = json.url; a.download = doc.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // Soft-delete: move to trash (sets deleted_at)
  async function softDeleteDocument(doc: DocRecord) {
    const now = new Date().toISOString();
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    setTrashCount(c => c + 1);
    if (trashOpen) setTrashDocs(prev => [{ ...doc, deleted_at: now }, ...prev]);
    await supabase.from("documents").update({ deleted_at: now }).eq("id", doc.id);
  }

  // Restore from trash
  async function restoreDocument(doc: DocRecord) {
    setTrashDocs(prev => prev.filter(d => d.id !== doc.id));
    setTrashCount(c => Math.max(0, c - 1));
    setDocuments(prev => [{ ...doc, deleted_at: null }, ...prev]);
    await supabase.from("documents").update({ deleted_at: null }).eq("id", doc.id);
  }

  // Permanently delete: remove from DB + storage + embeddings
  async function permanentlyDeleteDocument(doc: DocRecord) {
    setTrashDocs(prev => prev.filter(d => d.id !== doc.id));
    setTrashCount(c => Math.max(0, c - 1));
    await supabase.from("embeddings").delete().eq("source_id", doc.id).eq("source_type", "document");
    if (doc.file_path) await supabase.storage.from("business-documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const currentFolder    = folders.find(f => f.id === currentFolderId) ?? null;
  const folderDocCount   = (folderId: string) => documents.filter(d => d.folder_id === folderId).length;
  const visibleDocuments = documents.filter(d =>
    currentFolderId === null ? !d.folder_id : d.folder_id === currentFolderId
  );

  // ── Drag helpers ──────────────────────────────────────────────────────────

  function onDocDragStart(e: React.DragEvent, docId: string) {
    setDraggingDocId(docId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-lawrenn-doc", docId);
  }

  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    if (!draggingDocId) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  }

  function onFolderDragLeave(e: React.DragEvent, folderId: string) {
    if (!e.currentTarget.contains(e.relatedTarget as Node))
      if (dragOverFolderId === folderId) setDragOverFolderId(null);
  }

  function onFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault(); e.stopPropagation();
    const docId = draggingDocId ?? e.dataTransfer.getData("application/x-lawrenn-doc");
    if (docId) moveDocToFolder(docId, folderId);
    setDraggingDocId(null); setDragOverFolderId(null);
  }

  function onPageDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (Array.from(e.dataTransfer.types).includes("Files")) setIsDraggingFile(true);
  }
  function onPageDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false);
  }
  function onPageDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDraggingFile(false);
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      const file = e.dataTransfer.files[0]; if (file) handleFileDrop(file);
    }
  }

  if (bizLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#6B7280" }}>Loading...</p>
    </div>
  );

  return (
    <FeatureGate feature="intelligence">
      <div
        onDragOver={onPageDragOver}
        onDragLeave={onPageDragLeave}
        onDrop={onPageDrop}
        style={{ minHeight: "calc(100vh - 52px)", background: "#ffffff", fontFamily: "'DM Sans', sans-serif", position: "relative", padding: "2rem" }}
      >
        {isDraggingFile && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(12,192,223,0.05)", border: "2px dashed rgba(12,192,223,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
            <div style={{ textAlign: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0cc0df" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.75rem", display: "block" }}>
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
              </svg>
              <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0cc0df" }}>Drop to upload document</p>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept=".pdf,.txt" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); e.target.value = ""; }} />

        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* ── Header ──────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              {currentFolder ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button onClick={() => setCurrentFolderId(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#9CA3AF", fontFamily: "'DM Sans'", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    Library
                  </button>
                  <span style={{ color: "#D1D5DB", fontSize: "0.8rem" }}>/</span>
                  <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.5rem", letterSpacing: "0.06em", color: "#111111", margin: 0 }}>
                    {currentFolder.name.toUpperCase()}
                  </h1>
                </div>
              ) : (
                <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.5rem", letterSpacing: "0.06em", color: "#111111", margin: "0 0 0.2rem" }}>
                  DOCUMENT LIBRARY
                </h1>
              )}
              <p style={{ fontSize: "0.8rem", color: "#9CA3AF", margin: 0 }}>
                {currentFolder
                  ? `${folderDocCount(currentFolder.id)} document${folderDocCount(currentFolder.id) !== 1 ? "s" : ""}`
                  : "Uploaded documents are available to Intelligence for context."}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {!currentFolder && (
                <button
                  onClick={() => { newFolderCommittedRef.current = false; setCreatingFolder(true); setNewFolderName(""); }}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.45rem 0.9rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 7, color: "#374151", fontSize: "0.8rem", fontFamily: "'DM Sans'", cursor: "pointer", fontWeight: 500 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}>
                  <FolderSvg size={13} />
                  New Folder
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.45rem 0.9rem", background: "#111111", border: "none", borderRadius: 7, color: "white", fontSize: "0.8rem", fontFamily: "'DM Sans'", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1, fontWeight: 500 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>

          {/* ── Folder grid (root only) ──────────────────────────────── */}
          {!currentFolder && (folders.length > 0 || creatingFolder) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {folders.map(folder => {
                const isOver     = dragOverFolderId === folder.id;
                const isRenaming = renamingFolderId === folder.id;
                const count      = folderDocCount(folder.id);
                return (
                  <div
                    key={folder.id}
                    onDragOver={e => onFolderDragOver(e, folder.id)}
                    onDragLeave={e => onFolderDragLeave(e, folder.id)}
                    onDrop={e => onFolderDrop(e, folder.id)}
                    onClick={() => { if (!isRenaming) setCurrentFolderId(folder.id); }}
                    style={{
                      width: 148, padding: "0.9rem 0.85rem 0.75rem",
                      background: isOver ? "#F0FDF4" : "white",
                      border: isOver ? "1.5px solid #4ADE80" : "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 10, cursor: isRenaming ? "default" : "pointer",
                      position: "relative", transition: "border-color 0.12s, background 0.12s",
                      userSelect: "none",
                    }}
                    onMouseEnter={e => {
                      const actions = (e.currentTarget as HTMLDivElement).querySelector(".folder-actions") as HTMLElement | null;
                      if (actions) actions.style.opacity = "1";
                    }}
                    onMouseLeave={e => {
                      const actions = (e.currentTarget as HTMLDivElement).querySelector(".folder-actions") as HTMLElement | null;
                      if (actions) actions.style.opacity = "0";
                      setConfirmDeleteId(null);
                    }}
                  >
                    <div className="folder-actions" style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 2, opacity: confirmDeleteId === folder.id ? 1 : 0, transition: "opacity 0.1s" }}
                      onClick={e => e.stopPropagation()}>
                      {confirmDeleteId === folder.id ? (
                        <>
                          <span style={{ fontSize: "0.62rem", color: "#374151", display: "flex", alignItems: "center", marginRight: 2 }}>Delete?</span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteFolder(folder.id); setConfirmDeleteId(null); }}
                            style={{ background: "#EF4444", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 6px", color: "white", fontSize: "0.62rem", fontFamily: "'DM Sans'", fontWeight: 600 }}>
                            Yes
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            style={{ background: "#F3F4F6", border: "none", borderRadius: 4, cursor: "pointer", padding: "2px 6px", color: "#374151", fontSize: "0.62rem", fontFamily: "'DM Sans'", fontWeight: 600 }}>
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button title="Rename"
                            onClick={e => { e.stopPropagation(); setRenamingFolderId(folder.id); setRenameValue(folder.name); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "#9CA3AF", display: "flex", borderRadius: 4 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button title="Delete folder"
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(folder.id); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "#9CA3AF", display: "flex", borderRadius: 4 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#EF4444"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    <div style={{ color: isOver ? "#16A34A" : "#374151", marginBottom: "0.5rem" }}>
                      <FolderSvg filled={isOver} size={26} />
                    </div>

                    {isRenaming ? (
                      <input ref={renameInputRef} value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmRename(); } if (e.key === "Escape") setRenamingFolderId(null); }}
                        onBlur={() => setRenamingFolderId(null)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "100%", border: "none", borderBottom: "1.5px solid #111111", outline: "none", fontSize: "0.82rem", fontFamily: "'DM Sans'", fontWeight: 600, color: "#111111", background: "transparent", padding: "0 0 1px" }}
                      />
                    ) : (
                      <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111111", margin: "0 0 0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {folder.name}
                      </p>
                    )}
                    <p style={{ fontSize: "0.7rem", color: "#9CA3AF", margin: 0 }}>
                      {count} {count === 1 ? "document" : "documents"}
                    </p>

                    {draggingDocId && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: 10, border: isOver ? "2px solid #4ADE80" : "2px dashed #D1D5DB", pointerEvents: "none" }} />
                    )}
                  </div>
                );
              })}

              {creatingFolder && (
                <div style={{ width: 148, padding: "0.9rem 0.85rem 0.75rem", background: "#F9FAFB", border: "1.5px dashed #D1D5DB", borderRadius: 10 }}>
                  <div style={{ color: "#9CA3AF", marginBottom: "0.5rem" }}><FolderSvg size={26} /></div>
                  <input ref={newFolderInputRef} value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); confirmCreateFolder(); } if (e.key === "Escape") { newFolderCommittedRef.current = true; setCreatingFolder(false); setNewFolderName(""); } }}
                    onBlur={confirmCreateFolder}
                    style={{ width: "100%", border: "none", borderBottom: "1.5px solid #111111", outline: "none", fontSize: "0.82rem", fontFamily: "'DM Sans'", fontWeight: 600, color: "#111111", background: "transparent", padding: "0 0 1px" }}
                  />
                  <p style={{ fontSize: "0.7rem", color: "#D1D5DB", margin: "0.2rem 0 0" }}>Press Enter to create</p>
                </div>
              )}
            </div>
          )}

          {/* ── Document list ────────────────────────────────────────── */}
          {visibleDocuments.length === 0 && !uploading ? (
            <div style={{ textAlign: "center", padding: "5rem 0", background: "white", borderRadius: 12, border: currentFolder && draggingDocId ? "2px dashed #D1D5DB" : "1px solid rgba(0,0,0,0.07)" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.75rem", display: "block" }}>
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
              </svg>
              <p style={{ fontSize: "0.875rem", color: "#9CA3AF", margin: "0 0 0.4rem" }}>
                {currentFolder ? "This folder is empty" : "No documents uploaded yet"}
              </p>
              <p style={{ fontSize: "0.78rem", color: "#D1D5DB", margin: 0 }}>
                {currentFolder ? "Drag documents here or upload a file" : "Upload a PDF or TXT file to get started"}
              </p>
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: 12, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 56px", gap: "0.5rem", padding: "0.5rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.07)", background: "#ffffff" }}>
                {["", "Name", "Type", "Pages"].map((h, i) => (
                  <span key={i} style={{ fontSize: "0.67rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{h}</span>
                ))}
              </div>

              {uploading && (
                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 56px", gap: "0.5rem", padding: "0.8rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.05)", alignItems: "center" }}>
                  <div />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                    <DocTypeIcon name={uploadingName} />
                    <span style={{ fontSize: "0.875rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{uploadingName}</span>
                    <span style={{ fontSize: "0.72rem", color: "#9CA3AF", flexShrink: 0 }}>Processing…</span>
                  </div>
                  <span style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>—</span>
                  <span style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>—</span>
                </div>
              )}

              {visibleDocuments.map((doc, idx) => {
                const isDraggingThis = draggingDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    draggable={!currentFolder}
                    onDragStart={e => onDocDragStart(e, doc.id)}
                    onDragEnd={() => { setDraggingDocId(null); setDragOverFolderId(null); }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, doc }); }}
                    style={{
                      display: "grid", gridTemplateColumns: "20px 1fr 120px 56px",
                      gap: "0.5rem", padding: "0.8rem 1rem",
                      borderBottom: idx < visibleDocuments.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      alignItems: "center",
                      opacity: isDraggingThis ? 0.4 : 1,
                      transition: "opacity 0.1s",
                      background: isDraggingThis ? "#F9FAFB" : "transparent",
                      cursor: "default",
                    }}
                    onDoubleClick={() => openPreview(doc)}
                    onMouseEnter={e => {
                      const handle = (e.currentTarget as HTMLDivElement).querySelector(".drag-handle") as HTMLElement | null;
                      if (handle && !currentFolder) handle.style.opacity = "1";
                    }}
                    onMouseLeave={e => {
                      const handle = (e.currentTarget as HTMLDivElement).querySelector(".drag-handle") as HTMLElement | null;
                      if (handle) handle.style.opacity = "0";
                    }}
                  >
                    <div className="drag-handle" style={{ opacity: 0, transition: "opacity 0.1s", color: "#D1D5DB", cursor: currentFolder ? "default" : "grab", display: "flex", alignItems: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                      </svg>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                      <DocTypeIcon name={doc.name} />
                      {renamingDocId === doc.id ? (
                        <input
                          autoFocus
                          value={renameDocValue}
                          onChange={e => setRenameDocValue(e.target.value)}
                          onBlur={() => renameDocument(doc, renameDocValue)}
                          onKeyDown={e => {
                            if (e.key === "Enter") renameDocument(doc, renameDocValue);
                            if (e.key === "Escape") setRenamingDocId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, fontSize: "0.875rem", color: "#111111", border: "none", borderBottom: "1.5px solid #111111", outline: "none", background: "transparent", fontFamily: "'DM Sans'", padding: "0 0 1px", minWidth: 0 }}
                        />
                      ) : (
                        <span style={{ fontSize: "0.875rem", color: "#111111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{doc.name}</span>
                      )}
                    </div>
                    <span title={doc.doc_type ?? ""} style={{ fontSize: "0.78rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {doc.doc_type ?? "—"}
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "#374151" }}>
                      {doc.page_count != null ? doc.page_count : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!currentFolder && (
            <p style={{ fontSize: "0.72rem", color: "#D1D5DB", textAlign: "center" as const, margin: "1rem 0 0" }}>
              Drag a file anywhere to upload · Drag a document onto a folder to organize
            </p>
          )}
        </div>
      </div>

      {/* ── Floating Trash Button ── */}
      <button
        onClick={() => setTrashOpen(o => !o)}
        title="Trash"
        style={{
          position: "fixed",
          bottom: "2rem",
          right: trashOpen ? `calc(${380}px + 1.5rem)` : "2rem",
          width: 44, height: 44,
          background: trashOpen ? "#111111" : "white",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
          zIndex: 150,
          transition: "right 0.25s ease, background 0.15s",
          color: trashOpen ? "white" : "#374151",
          fontFamily: "'DM Sans'",
        }}
        onMouseEnter={e => { if (!trashOpen) (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; }}
        onMouseLeave={e => { if (!trashOpen) (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
        {trashCount > 0 && !trashOpen && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 16, height: 16,
            background: "#EF4444", borderRadius: 8,
            fontSize: "0.6rem", fontWeight: 700, color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}>
            {trashCount > 99 ? "99+" : trashCount}
          </span>
        )}
      </button>

      {/* ── Trash Panel ── */}
      {trashOpen && (
        <div style={{
          position: "fixed", top: 52, right: 0, bottom: 0,
          width: 380, zIndex: 120,
          background: "white", borderLeft: "1px solid rgba(0,0,0,0.07)",
          display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.07)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {/* Header */}
          <div style={{ padding: "0.9rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#111111" }}>Trash</p>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#9CA3AF" }}>Documents are deleted permanently after 30 days</p>
            </div>
            <button
              onClick={() => setTrashOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", display: "flex" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
            {trashLoading ? (
              <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: "0.82rem", padding: "3rem 0" }}>Loading…</p>
            ) : trashDocs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 0.75rem", display: "block" }}>
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                <p style={{ color: "#9CA3AF", fontSize: "0.82rem", margin: 0 }}>Trash is empty</p>
              </div>
            ) : (
              trashDocs.map(doc => {
                const days = doc.deleted_at ? daysRemaining(doc.deleted_at) : 30;
                const urgent = days <= 3;
                return (
                  <div key={doc.id} style={{
                    display: "flex", alignItems: "center", gap: "0.7rem",
                    padding: "0.65rem 1rem",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ flexShrink: 0, opacity: 0.5 }}>
                      <DocTypeIcon name={doc.name} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.name}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: urgent ? "#EF4444" : "#9CA3AF" }}>
                        {days === 0 ? "Deletes today" : `${days} day${days !== 1 ? "s" : ""} remaining`}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                      <button
                        onClick={() => restoreDocument(doc)}
                        title="Restore"
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.6rem", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, color: "#15803D", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans'" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#DCFCE7"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F0FDF4"; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                        </svg>
                        Restore
                      </button>
                      <button
                        onClick={() => permanentlyDeleteDocument(doc)}
                        title="Delete permanently"
                        style={{ display: "flex", alignItems: "center", padding: "0.3rem 0.5rem", background: "none", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, color: "#9CA3AF", fontSize: "0.72rem", cursor: "pointer", fontFamily: "'DM Sans'" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#FCA5A5"; (e.currentTarget as HTMLButtonElement).style.color = "#EF4444"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: Math.min(contextMenu.y, window.innerHeight - 220),
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            background: "white", border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 300, minWidth: 164, overflow: "hidden",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {[
            contextMenu.doc.status === "ready" && contextMenu.doc.file_path && {
              label: "Open", icon: <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>,
              action: () => { openPreview(contextMenu.doc); setContextMenu(null); },
            },
            contextMenu.doc.file_path && {
              label: "Download", icon: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
              action: () => { downloadDocument(contextMenu.doc); setContextMenu(null); },
            },
            {
              label: "Rename", icon: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
              action: () => { setRenameDocValue(contextMenu.doc.name); setRenamingDocId(contextMenu.doc.id); setContextMenu(null); },
            },
            currentFolderId && {
              label: "Move to Library", icon: <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="9" y1="14" x2="15" y2="14"/></>,
              action: () => { moveDocToFolder(contextMenu.doc.id, null); setContextMenu(null); },
            },
            "divider",
            {
              label: "Move to Trash", danger: true,
              icon: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
              action: () => { softDeleteDocument(contextMenu.doc); setContextMenu(null); },
            },
          ].filter(Boolean).map((item, i) => {
            if (item === "divider") return (
              <div key={i} style={{ height: 1, background: "rgba(0,0,0,0.07)", margin: "3px 0" }} />
            );
            const { label, icon, action, danger } = item as any;
            return (
              <button key={i} onClick={action}
                style={{ display: "flex", alignItems: "center", gap: "0.55rem", width: "100%", padding: "0.55rem 0.85rem", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans'", fontSize: "0.84rem", color: danger ? "#EF4444" : "#111111", textAlign: "left" as const }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = danger ? "#FEF2F2" : "#F9FAFB"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {icon}
                </svg>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Document preview panel ── */}
      {previewDoc && (
        <>
          <div
            onMouseDown={startPreviewDrag}
            style={{ position: "fixed", top: 52, right: previewWidth, bottom: 0, width: 16, cursor: "col-resize", zIndex: 101, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.12)"; }}
            onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}>
            <div style={{ width: 3, height: "100%", borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
          </div>
          <div style={{
            position: "fixed", top: 52, right: 0, bottom: 0,
            width: previewWidth, zIndex: 100,
            background: "white", borderLeft: "1px solid rgba(0,0,0,0.07)",
            display: "flex", flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.07)",
          }}>
            <div style={{ padding: "0.65rem 0.9rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {previewDoc.name}
                </span>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "#9CA3AF", display: "flex", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              <iframe
                src={previewDoc.url}
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                title={previewDoc.name}
              />
              {previewDragging && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10 }} />
              )}
            </div>
          </div>
        </>
      )}
    </FeatureGate>
  );
}
