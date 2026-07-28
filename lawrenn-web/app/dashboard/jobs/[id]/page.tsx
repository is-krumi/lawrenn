"use client";

import { useBusiness } from "@/context/BusinessContext";
import { createClient } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Job {
  id: string;
  name: string | null;
  type: string;
  status: string;
  slot_start: string;
  slot_end: string;
  amount: number;
  source: string;
  notes: string | null;
  ai_notes: string | null;
  created_at: string;
  updated_at: string | null;
  customers: { id: string; name: string; phone: string; address: string | null; email: string | null; contact_type: string | null } | null;
  technicians: { name: string; color: string } | null;
  technician_id: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MatterChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  savedAt: number;
}

interface MatterContact {
  id: string;
  contact_type: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

interface ContactDraft {
  contactType: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

interface MatterDoc {
  id: string;
  name: string;
  status: string;
  file_type?: string;
  file_size?: number;
  file_path?: string;
  doc_type?: string | null;
  page_count?: number | null;
  created_at?: string;
  folder_id?: string | null;
  deleted_at?: string | null;
}

function DocTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return <img src="/icons/adobeLogo.png" alt="PDF" width={16} height={16} style={{ flexShrink: 0, objectFit: "contain" }} />;
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
  return (
    <DocShape color="#6B7280" foldColor="#4B5563">
      <text x="8" y="15" textAnchor="middle" fill="white" fontSize="4" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="0.3">
        {ext.toUpperCase().slice(0, 3) || "DOC"}
      </text>
    </DocShape>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUSES = ["booked", "in_progress", "complete", "invoiced", "canceled"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked:      { label: "Scheduled", color: "#374151", bg: "rgba(0,0,0,0.05)"      },
  in_progress: { label: "Active",    color: "#92400E", bg: "rgba(146,64,14,0.07)"  },
  complete:    { label: "Closed",    color: "#166534", bg: "rgba(22,101,52,0.07)"  },
  invoiced:    { label: "Billed",    color: "#5B21B6", bg: "rgba(91,33,182,0.07)"  },
  canceled:    { label: "Dismissed", color: "#991B1B", bg: "rgba(153,27,27,0.07)"  },
};

type Tab = "chat" | "files" | "notes" | "contacts" | "research";

interface ResearchCase {
  id:          number;
  caseName:    string;
  citation:    string | null;
  court:       string | null;
  dateFiled:   string | null;
  absoluteUrl: string;
  snippet:     string | null;
}

interface ResearchIssue {
  title:       string;
  relevance:   string;
  statute: {
    name:         string;
    citation:     string;
    text:         string;
    plainEnglish: string;
  } | null;
  searchQuery: string;
  opinions:    ResearchCase[];
}

interface ResearchChunk {
  text:       string;
  sourceType: string;
  docName:    string;
}

interface ResearchAnalysis {
  jurisdiction: string;
  synopsis:     string | null;
  issues:       ResearchIssue[];
  chunks:       ResearchChunk[];
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{ fontWeight: 700, color: "#111111" }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*"))
      return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.82em", background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "0.1em 0.35em", color: "#111111" }}>{p.slice(1, -1)}</code>;
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
    if (line.match(/^---+$/)) {
      nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.08)", margin: "0.75rem 0" }} />);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<p key={i} style={{ fontWeight: 700, fontSize: "1rem", color: "#111111", margin: nodes.length > 0 ? "1rem 0 0.4rem" : "0 0 0.4rem", lineHeight: 1.3 }}>{renderInline(line.slice(2))}</p>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<p key={i} style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111111", margin: nodes.length > 0 ? "1rem 0 0.35rem" : "0 0 0.35rem", lineHeight: 1.3 }}>{renderInline(line.slice(3))}</p>);
      i++; continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(<p key={i} style={{ fontWeight: 600, fontSize: "0.875rem", color: "#374151", margin: nodes.length > 0 ? "0.75rem 0 0.25rem" : "0 0 0.25rem" }}>{renderInline(line.slice(4))}</p>);
      i++; continue;
    }
    if (line.startsWith("> ")) {
      nodes.push(<div key={i} style={{ borderLeft: "3px solid rgba(0,0,0,0.15)", paddingLeft: "0.75rem", margin: "0.5rem 0", color: "#6B7280", fontSize: "0.875rem", fontStyle: "italic" }}>{renderInline(line.slice(2))}</div>);
      i++; continue;
    }
    if (line.match(/^[-*•] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*•] /)) {
        items.push(<li key={i} style={{ marginBottom: "0.3rem", lineHeight: 1.65 }}>{renderInline(lines[i].replace(/^[-*•] /, ""))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} style={{ margin: "0.4rem 0 0.5rem", paddingLeft: "1.25rem", listStyleType: "disc" }}>{items}</ul>);
      continue;
    }
    if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i} style={{ marginBottom: "0.3rem", lineHeight: 1.65 }}>{renderInline(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} style={{ margin: "0.4rem 0 0.5rem", paddingLeft: "1.35rem" }}>{items}</ol>);
      continue;
    }
    nodes.push(<p key={i} style={{ margin: "0 0 0.5rem 0", lineHeight: 1.75 }}>{renderInline(line)}</p>);
    i++;
  }
  return <div style={{ fontSize: "0.875rem", color: "#374151" }}>{nodes}</div>;
}

export default function MatterDetailPage() {
  const router  = useRouter();
  const params  = useParams();
  const jobId   = params.id as string;
  const { businessId, loading: bizLoading } = useBusiness();

  const [job,             setJob]             = useState<Job | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [technicians,     setTechnicians]     = useState<{ id: string; name: string; color: string }[]>([]);
  const [updating,        setUpdating]        = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<string | null>(null);
  const [notesValue,      setNotesValue]      = useState("");
  const [notesSaving,     setNotesSaving]     = useState(false);
  const [editingTitle,    setEditingTitle]    = useState(false);
  const [titleValue,      setTitleValue]      = useState("");
  const [activeTab,       setActiveTab]       = useState<Tab>("chat");

  // Chat state
  const [messages,      setMessages]      = useState<ChatMessage[]>([]);
  const [chatInput,     setChatInput]     = useState("");
  const [chatLoading,   setChatLoading]   = useState(false);
  const [chatSessions,      setChatSessions]      = useState<MatterChatSession[]>([]);
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef   = useRef<HTMLTextAreaElement>(null);

  // Files state
  const [matterDocs,       setMatterDocs]       = useState<MatterDoc[]>([]);
  const [fileUploading,    setFileUploading]    = useState(false);
  const [fileUploadName,   setFileUploadName]   = useState("");
  const [isDraggingFile,   setIsDraggingFile]   = useState(false);
  const [attachedDoc,      setAttachedDoc]      = useState<{ id: string; name: string } | null>(null);
  const [isDraggingToChat, setIsDraggingToChat] = useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const [previewDoc,      setPreviewDoc]      = useState<{ url: string; name: string } | null>(null);
  const [previewWidth,    setPreviewWidth]    = useState(480);
  const [previewDragging, setPreviewDragging] = useState(false);
  const previewDragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Research state
  const [researchAnalysis,    setResearchAnalysis]    = useState<ResearchAnalysis | null>(null);
  const [researchLoading,     setResearchLoading]     = useState(false);
  const [researchSearched,    setResearchSearched]    = useState(false);
  const [researchChatInput,   setResearchChatInput]   = useState("");
  const [researchChatMsgs,    setResearchChatMsgs]    = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [researchChatLoading, setResearchChatLoading] = useState(false);
  const researchChatEndRef = useRef<HTMLDivElement>(null);
  const researchChatInputRef = useRef<HTMLTextAreaElement>(null);

  // Contacts state
  const [editingContact,        setEditingContact]        = useState(false);
  const [contactEdit,           setContactEdit]           = useState<ContactDraft>({ contactType: "", firstName: "", lastName: "", phone: "", email: "", address: "" });
  const [matterContacts,        setMatterContacts]        = useState<MatterContact[]>([]);
  const [editingMatterContactId, setEditingMatterContactId] = useState<string | null>(null);
  const [matterContactEdit,     setMatterContactEdit]     = useState<ContactDraft>({ contactType: "", firstName: "", lastName: "", phone: "", email: "", address: "" });
  const [addingContact,         setAddingContact]         = useState(false);
  const [newContact,            setNewContact]            = useState<ContactDraft>({ contactType: "Client", firstName: "", lastName: "", phone: "", email: "", address: "" });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (activeTab === "research" && job && !researchSearched && !researchLoading) {
      const cached = (job as any).research_cache;
      if (cached) {
        setResearchAnalysis(cached);
        setResearchSearched(true);
        return;
      }
      runResearch();
    }
  }, [activeTab, job]);

  useEffect(() => {
    if (!jobId) return;
    const stored = localStorage.getItem(`matter-chats-${jobId}`);
    if (stored) {
      try { setChatSessions(JSON.parse(stored)); } catch {}
    }
  }, [jobId]);

  useEffect(() => {
    if (bizLoading || !businessId) return;

    async function load() {
      const { data } = await supabase
        .from("jobs")
        .select(`
          id, name, type, status, slot_start, slot_end, amount, source,
          notes, ai_notes, research_cache, created_at, updated_at, technician_id,
          customers (id, name, phone, address, email, contact_type),
          technicians (name, color)
        `)
        .eq("id", jobId)
        .single();

      if (data) {
        setJob(data as any);
        setNotesValue((data as any).notes ?? "");

        // Track recent visit
        if (businessId) {
          const d = data as any;
          const matterName = d.name || `${d.customers?.name ?? "Unknown"} — ${d.type}`;
          const key = `lawrenn-recent-${businessId}`;
          const existing = JSON.parse(localStorage.getItem(key) ?? "[]");
          const deduped = existing.filter((i: any) => !(i.type === "matter" && i.id === d.id));
          localStorage.setItem(key, JSON.stringify([{ type: "matter", id: d.id, name: matterName, subtitle: d.type, status: d.status, visitedAt: Date.now() }, ...deduped].slice(0, 12)));
        }

        // Auto-generate IQ Summary if none exists
        if (!(data as any).ai_notes) {
          setSummaryGenerating(true);
          supabase.auth.getSession().then(async ({ data: sessionData }) => {
            const token = sessionData.session?.access_token ? `Bearer ${sessionData.session.access_token}` : "";
            try {
              const res = await fetch("/api/generate-iq-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: token },
                body: JSON.stringify({ job_id: (data as any).id, business_id: businessId }),
              });
              const result = await res.json();
              if (result.summary) {
                setJob(prev => prev ? { ...prev, ai_notes: result.summary } : null);
              }
            } catch {}
            setSummaryGenerating(false);
          });
        }
      }

      const { data: techsData } = await supabase
        .from("technicians")
        .select("id, name, color")
        .eq("business_id", businessId)
        .eq("active", true);

      setTechnicians((techsData as any) ?? []);

      const { data: contactsData } = await supabase
        .from("matter_contacts")
        .select("id, contact_type, first_name, last_name, phone, email")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      setMatterContacts((contactsData as MatterContact[]) ?? []);

      setLoading(false);
    }

    load();

    // Load matter-linked documents
    supabase
      .from("documents")
      .select("id, name, status, file_type, file_size, file_path, doc_type, page_count, created_at, folder_id, deleted_at")
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setMatterDocs((data as MatterDoc[]) ?? []));

    const jobCh = supabase
      .channel(`matter-detail-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (payload) => {
        setJob(prev => prev ? { ...prev, ...payload.new as Job } : null);
      })
      .subscribe();

    // Keep Files tab in sync with library changes (rename, soft-delete, restore)
    const docsCh = supabase
      .channel(`matter-docs-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "documents", filter: `job_id=eq.${jobId}` }, (payload) => {
        const doc = payload.new as MatterDoc;
        if (!doc.deleted_at) setMatterDocs(prev => prev.some(d => d.id === doc.id) ? prev : [doc, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "documents", filter: `job_id=eq.${jobId}` }, (payload) => {
        const doc = payload.new as MatterDoc;
        if (doc.deleted_at) {
          // Soft-deleted from library — remove from list
          setMatterDocs(prev => prev.filter(d => d.id !== doc.id));
        } else {
          // Renamed, restored, or otherwise updated
          setMatterDocs(prev =>
            prev.some(d => d.id === doc.id)
              ? prev.map(d => d.id === doc.id ? { ...d, ...doc } : d)
              : [doc, ...prev]
          );
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "documents", filter: `job_id=eq.${jobId}` }, (payload) => {
        setMatterDocs(prev => prev.filter(d => d.id !== (payload.old as MatterDoc).id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(jobCh);
      supabase.removeChannel(docsCh);
    };
  }, [businessId, bizLoading, jobId]);

  async function getOrCreateMatterFolder(folderName: string): Promise<string | null> {
    if (!businessId) return null;
    const { data: existing } = await supabase
      .from("library_folders")
      .select("id")
      .eq("business_id", businessId)
      .eq("name", folderName)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created } = await supabase
      .from("library_folders")
      .insert({ business_id: businessId, name: folderName })
      .select("id")
      .single();
    return created?.id ?? null;
  }

  async function handleFileDrop(file: File) {
    if (!businessId || !job) return;
    setFileUploading(true);
    setFileUploadName(file.name);

    const folderName = job.name || `${job.customers?.name ?? "Unknown"} — ${job.type}`;
    const folderId   = await getOrCreateMatterFolder(folderName);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("business_id", businessId);
    formData.append("job_id", jobId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ? `Bearer ${session.access_token}` : "";
      const res  = await fetch("/api/process-document", { method: "POST", body: formData, headers: { Authorization: token } });
      const data = await res.json();
      if (res.ok) {
        if (folderId) {
          await supabase.from("documents").update({ folder_id: folderId }).eq("id", data.document_id);
        }
        setMatterDocs(prev => [{
          id: data.document_id, name: file.name, status: "ready",
          file_type: file.type, file_size: file.size,
          doc_type: data.doc_type ?? null, page_count: data.page_count ?? null,
          folder_id: folderId,
        }, ...prev]);
      } else {
        alert(data.error ?? "Failed to process document");
      }
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setFileUploading(false);
    }
  }

  async function softDeleteDoc(doc: MatterDoc) {
    const now = new Date().toISOString();
    setMatterDocs(prev => prev.filter(d => d.id !== doc.id));
    await supabase.from("documents").update({ deleted_at: now }).eq("id", doc.id);
  }

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

  async function openPreview(doc: MatterDoc) {
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

  async function updateStatus(status: string) {
    if (!job) return;
    setUpdating(true);
    const updates: any = { status };
    if (status === "complete") updates.completed_at = new Date().toISOString();
    try {
      await supabase.from("jobs").update(updates).eq("id", job.id);
      setJob(prev => prev ? { ...prev, ...updates } : null);
      if (status === "complete") {
        fetch("/api/trigger-review-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: job.id }),
        }).catch(() => {});
      }
    } finally {
      setUpdating(false);
    }
  }

  function handleStatusClick(status: string) {
    if (job?.status === "complete" && status !== "complete") {
      setConfirmOverride(status);
    } else if (status === "complete") {
      setConfirmComplete(true);
    } else {
      updateStatus(status);
    }
  }

  function startEditContact() {
    if (!job?.customers) return;
    const parts = (job.customers.name ?? "").split(" ");
    setContactEdit({
      contactType: job.customers.contact_type ?? "Client",
      firstName:   parts[0] ?? "",
      lastName:    parts.slice(1).join(" "),
      phone:       job.customers.phone ?? "",
      email:       job.customers.email ?? "",
      address:     job.customers.address ?? "",
    });
    setEditingContact(true);
  }

  async function saveContact() {
    if (!job?.customers?.id) return;
    const fullName = [contactEdit.firstName.trim(), contactEdit.lastName.trim()].filter(Boolean).join(" ");
    const updates = {
      contact_type: contactEdit.contactType || "Client",
      name:         fullName || job.customers.name,
      phone:        contactEdit.phone.trim(),
      email:        contactEdit.email.trim() || null,
      address:      contactEdit.address.trim() || null,
    };
    await supabase.from("customers").update(updates).eq("id", job.customers.id);
    setJob(prev => prev ? { ...prev, customers: { ...prev.customers!, ...updates } } : null);
    setEditingContact(false);
  }

  function startEditMatterContact(c: MatterContact) {
    setMatterContactEdit({ contactType: c.contact_type, firstName: c.first_name ?? "", lastName: c.last_name ?? "", phone: c.phone ?? "", email: c.email ?? "", address: "" });
    setEditingMatterContactId(c.id);
  }

  async function saveMatterContact() {
    if (!editingMatterContactId || !businessId) return;
    const updates = { contact_type: matterContactEdit.contactType, first_name: matterContactEdit.firstName.trim() || null, last_name: matterContactEdit.lastName.trim() || null, phone: matterContactEdit.phone.trim() || null, email: matterContactEdit.email.trim() || null };
    await supabase.from("matter_contacts").update(updates).eq("id", editingMatterContactId);
    setMatterContacts(prev => prev.map(c => c.id === editingMatterContactId ? { ...c, ...updates } : c));
    setEditingMatterContactId(null);
  }

  async function deleteMatterContact(id: string) {
    await supabase.from("matter_contacts").delete().eq("id", id);
    setMatterContacts(prev => prev.filter(c => c.id !== id));
  }

  async function addMatterContact() {
    if (!businessId || !jobId) return;
    const row = { job_id: jobId, business_id: businessId, contact_type: newContact.contactType, first_name: newContact.firstName.trim() || null, last_name: newContact.lastName.trim() || null, phone: newContact.phone.trim() || null, email: newContact.email.trim() || null };
    const { data } = await supabase.from("matter_contacts").insert(row).select("id, contact_type, first_name, last_name, phone, email").single();
    if (data) setMatterContacts(prev => [...prev, data as MatterContact]);
    setAddingContact(false);
    setNewContact({ contactType: "Client", firstName: "", lastName: "", phone: "", email: "", address: "" });
  }

  async function saveNotes() {
    if (!job || notesValue === job.notes) return;
    setNotesSaving(true);
    await supabase.from("jobs").update({ notes: notesValue }).eq("id", job.id);
    setJob(prev => prev ? { ...prev, notes: notesValue } : null);
    setNotesSaving(false);
  }

  async function saveTitle() {
    if (!job) return;
    const val = titleValue.trim() || null;
    await supabase.from("jobs").update({ name: val }).eq("id", job.id);
    setJob(prev => prev ? { ...prev, name: val } : null);
    setEditingTitle(false);
  }

  const [researchError, setResearchError] = useState<string | null>(null);

  async function runResearch() {
    if (!job || !businessId) return;
    setResearchLoading(true);
    setResearchSearched(true);
    setResearchError(null);
    setResearchAnalysis(null);
    setResearchChatMsgs([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ? `Bearer ${session.access_token}` : "";
      const res  = await fetch("/api/research", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body:    JSON.stringify({ matter_id: job.id, business_id: businessId }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); }
      catch {
        console.error("[research] non-JSON:", text.slice(0, 300));
        setResearchError(`Server error (${res.status}) — check Next.js logs`);
        return;
      }
      if (!res.ok || data.error) {
        setResearchError(data.error ?? `Error ${res.status}`);
        return;
      }
      setResearchAnalysis(data);
      supabase.from("jobs").update({ research_cache: data }).eq("id", job.id).then(() => {});
    } catch (err: any) {
      setResearchError(err.message ?? "Network error");
    } finally {
      setResearchLoading(false);
    }
  }

  async function sendResearchChat() {
    const q = researchChatInput.trim();
    if (!q || !job || !businessId || researchChatLoading) return;
    setResearchChatInput("");
    setResearchChatMsgs(prev => [...prev, { role: "user", content: q }]);
    setResearchChatLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ? `Bearer ${session.access_token}` : "";

      // Build a synthetic context message from the research analysis so the AI
      // answers with awareness of the identified issues and statutes.
      const researchContext: { role: "user" | "assistant"; content: string }[] = [];
      if (researchAnalysis) {
        const issueLines = researchAnalysis.issues.map((iss, i) => {
          const statuteBlock = iss.statute
            ? `\n   Statute: ${iss.statute.name} (${iss.statute.citation})\n   Text: ${iss.statute.text}\n   Application: ${iss.statute.plainEnglish}`
            : "";
          return `${i + 1}. ${iss.title} — ${iss.relevance}${statuteBlock}`;
        }).join("\n\n");

        researchContext.push(
          { role: "user", content: "Please review the legal research analysis for this matter." },
          { role: "assistant", content: `I have reviewed the research analysis for this matter.\n\nJurisdiction: ${researchAnalysis.jurisdiction}\n\n${researchAnalysis.synopsis ? `Summary: ${researchAnalysis.synopsis}\n\n` : ""}Legal Issues Identified:\n\n${issueLines}\n\nI'm ready to answer questions about this matter with the above legal context in mind.` },
        );
      }

      const history = [...researchContext, ...researchChatMsgs.slice(-6)];

      const res = await fetch("/api/intelligence/matter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          query: q,
          business_id: businessId,
          job_id: job.id,
          history,
          doc_id: null,
        }),
      });
      const data = await res.json();
      setResearchChatMsgs(prev => [...prev, { role: "assistant", content: data.answer ?? "No answer returned." }]);
    } catch {
      setResearchChatMsgs(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setResearchChatLoading(false);
      setTimeout(() => researchChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function sendMessage(text?: string) {
    const query = text ?? chatInput.trim();
    if (!query || chatLoading || !businessId || !job) return;
    setChatInput("");
    setChatLoading(true);
    setRestoredSessionId(null);
    const docForQuery = attachedDoc;
    setAttachedDoc(null);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = "auto";
    }
    setMessages(prev => [...prev, { role: "user", content: query }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ? `Bearer ${session.access_token}` : "";
      const res = await fetch("/api/intelligence/matter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          query,
          business_id: businessId,
          job_id: job.id,
          history: messages.slice(-6),
          doc_id: docForQuery?.id ?? null,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer ?? "No answer returned." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }

  function saveCurrentChat(currentMessages: ChatMessage[]) {
    if (currentMessages.length === 0) return;
    const firstUser = currentMessages.find(m => m.role === "user");
    const title = firstUser
      ? firstUser.content.slice(0, 70) + (firstUser.content.length > 70 ? "…" : "")
      : "Chat";
    const session: MatterChatSession = { id: Date.now().toString(), title, messages: currentMessages, savedAt: Date.now() };
    setChatSessions(prev => {
      const updated = [session, ...prev];
      localStorage.setItem(`matter-chats-${jobId}`, JSON.stringify(updated));
      return updated;
    });
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  if (loading || bizLoading) return (
    <div style={{ height: "calc(100vh - 52px)", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading matter…</p>
    </div>
  );

  if (!job) return (
    <div style={{ height: "calc(100vh - 52px)", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Matter not found.</p>
    </div>
  );

  const cfg         = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.booked;
  const matterTitle = job.name || `${job.customers?.name ?? "Unknown"} — ${job.type}`;

  const TABS: { key: Tab; label: string }[] = [
    { key: "chat",     label: "New Chat"  },
    { key: "files",    label: "Files"     },
    { key: "notes",    label: "Notes"     },
    { key: "contacts", label: "Contacts"  },
    { key: "research", label: "Research"  },
  ];

  const MATTER_SUGGESTED = [
    { label: "Summarize this matter",             color: "#4F46E5", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { label: "What has the client called about?", color: "#0891B2", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
    { label: "What documents are on file?",       color: "#D97706", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
    { label: "Key dates and deadlines?",          color: "#DC2626", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { label: "Draft a client status update",      color: "#059669", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { label: "What is the current status?",       color: "#7C3AED", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ];

  return (
    <div style={{ height: "calc(100vh - 52px)", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", background: "#ffffff", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "1.5rem 2rem 0 1.5rem", flexShrink: 0, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          {editingTitle ? (
            <div style={{ position: "relative", display: "inline-block" }}>
              <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.02em", whiteSpace: "pre", visibility: "hidden", display: "block", minWidth: 40 }}>
                {titleValue || " "}
              </span>
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.02em", color: "#111111", border: "none", borderBottom: "2px solid #111111", background: "transparent", outline: "none", padding: 0, margin: 0 }}
              />
            </div>
          ) : (
            <h1
              onClick={() => { setTitleValue(job.name ?? matterTitle); setEditingTitle(true); }}
              title="Click to edit"
              style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.02em", color: "#111111", margin: 0, cursor: "text" }}
            >
              {matterTitle.toUpperCase()}
            </h1>
          )}
          <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.22rem 0.55rem", borderRadius: 5, background: cfg.bg, color: cfg.color, letterSpacing: "0.04em", flexShrink: 0 }}>
            {cfg.label}
          </span>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
          {TABS.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => {
                  if (key === "chat" && activeTab === "chat") {
                    // Already on chat — user explicitly wants a new conversation
                    if (messages.length > 0 && restoredSessionId === null) saveCurrentChat(messages);
                    setMessages([]);
                    setRestoredSessionId(null);
                  }
                  setActiveTab(key);
                }}
                style={{
                  padding: "0.55rem 1rem",
                  background: "none", border: "none",
                  borderBottom: `2px solid ${isActive ? "#111111" : "transparent"}`,
                  marginBottom: -1,
                  color: isActive ? "#111111" : "#9CA3AF",
                  fontFamily: "'DM Sans'", fontSize: "0.82rem",
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer", transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: activeTab === "files" ? "220px 1fr 300px" : activeTab === "research" ? "1fr" : "1fr 300px", gap: "1.25rem", padding: "1.25rem 2rem 1.25rem 1.5rem", overflow: "hidden" }}>

        {/* ── Files panel (visible only when Files tab is active) ── */}
        {activeTab === "files" && <div
          style={{
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: "white",
            border: isDraggingFile ? "2px dashed rgba(0,0,0,0.2)" : "1px solid rgba(0,0,0,0.07)",
            borderRadius: 10, transition: "border 0.12s", position: "relative",
          }}
          onDragOver={e => { e.preventDefault(); if (Array.from(e.dataTransfer.types).includes("Files")) setIsDraggingFile(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false); }}
          onDrop={e => { e.preventDefault(); setIsDraggingFile(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.doc,.docx" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); e.target.value = ""; }} />

          {/* Header */}
          <div style={{ padding: "0.75rem 0.9rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
              Files{matterDocs.length > 0 ? ` · ${matterDocs.length}` : ""}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              style={{ width: 22, height: 22, borderRadius: 5, background: "#111111", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: fileUploading ? "not-allowed" : "pointer", opacity: fileUploading ? 0.6 : 1, flexShrink: 0 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>

          {/* File list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {matterDocs.length === 0 && !fileUploading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.4rem", padding: "2.5rem 1rem", textAlign: "center" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
                <p style={{ fontSize: "0.75rem", color: "#9CA3AF", margin: 0, lineHeight: 1.5 }}>Drop files here to upload</p>
              </div>
            ) : (
              <>
                {fileUploading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 0.9rem", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                    <DocTypeIcon name={fileUploadName} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.78rem", color: "#374151", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileUploadName}</p>
                      <p style={{ fontSize: "0.7rem", color: "#9CA3AF", margin: 0 }}>Processing…</p>
                    </div>
                  </div>
                )}
                {matterDocs.map((doc, idx) => (
                  <div
                    key={doc.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData("lawrenn/doc-id", doc.id);
                      e.dataTransfer.setData("lawrenn/doc-name", doc.name);
                      e.dataTransfer.effectAllowed = "link";
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.5rem",
                      padding: "0.65rem 0.9rem",
                      borderBottom: idx < matterDocs.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onClick={() => openPreview(doc)}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "#ffffff";
                      const btn = e.currentTarget.querySelector(".file-del-btn") as HTMLElement | null;
                      if (btn) btn.style.opacity = "1";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "transparent";
                      const btn = e.currentTarget.querySelector(".file-del-btn") as HTMLElement | null;
                      if (btn) btn.style.opacity = "0";
                    }}
                  >
                    <div style={{ flexShrink: 0 }}><DocTypeIcon name={doc.name} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "0.78rem", color: "#111111", margin: 0, lineHeight: 1.4, wordBreak: "break-word" }}>{doc.name}</p>
                    </div>
                    <button
                      className="file-del-btn"
                      onClick={e => { e.stopPropagation(); softDeleteDoc(doc); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "#9CA3AF", display: "flex", alignItems: "center", opacity: 0, transition: "opacity 0.1s, color 0.1s", flexShrink: 0, borderRadius: 4 }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#9CA3AF"; }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {matterDocs.length > 0 && (
            <div style={{ padding: "0.45rem 0.9rem", borderTop: "1px solid rgba(0,0,0,0.05)", flexShrink: 0 }}>
              <p style={{ fontSize: "0.67rem", color: "#C4C9D4", margin: 0, textAlign: "center" }}>Click to preview · Drag to chat</p>
            </div>
          )}

          {isDraggingFile && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", borderRadius: 10 }}>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>Drop to upload</p>
            </div>
          )}
        </div>}

        {/* ── Center: tab content ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

          {/* CHAT TAB (also shown when Files tab is active so you can drag-to-chat) */}
          {(activeTab === "chat" || activeTab === "files") && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden" }}>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}>
                {messages.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5rem", minHeight: "60%", padding: "2rem 0" }}>
                    <p style={{ fontSize: "0.8rem", color: "#9CA3AF", lineHeight: 1.6, margin: 0, textAlign: "center" }}>
                      Questions are answered using this matter's info and your firm's knowledge base.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", width: "100%", maxWidth: 520 }}>
                      {MATTER_SUGGESTED.map((q, i) => (
                        <button key={i} onClick={() => sendMessage(q.label)}
                          style={{ padding: "0.85rem 0.75rem", background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.82rem", textAlign: "left", cursor: "pointer", lineHeight: 1.45, transition: "all 0.12s", display: "flex", flexDirection: "column", gap: "0.6rem", aspectRatio: "1.2" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.18)"; e.currentTarget.style.background = "white"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; e.currentTarget.style.background = "#ffffff"; }}>
                          <span style={{ color: q.color }}>{q.icon}</span>
                          <span style={{ fontWeight: 800, color: "#111111" }}>{q.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", paddingBottom: "0.5rem" }}>
                    {messages.map((msg, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                        {msg.role === "user" ? (
                          <div style={{ maxWidth: "72%", padding: "0.6rem 1rem", background: "#EDE8DF", borderRadius: "14px 14px 4px 14px", color: "#111111", fontSize: "0.875rem", lineHeight: 1.6 }}>
                            {msg.content}
                          </div>
                        ) : (
                          <div style={{ width: "100%" }}>
                            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
                              Lawrenn IQ
                            </div>
                            {renderContent(msg.content)}
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Lawrenn IQ</div>
                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", padding: "0.4rem 0" }}>
                          {[0, 1, 2].map(j => (
                            <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div
                style={{ flexShrink: 0, borderTop: "1px solid rgba(0,0,0,0.07)", padding: "0.75rem 1.25rem" }}
                onDragOver={e => { if (Array.from(e.dataTransfer.types).includes("lawrenn/doc-id")) { e.preventDefault(); setIsDraggingToChat(true); } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingToChat(false); }}
                onDrop={e => {
                  const docId = e.dataTransfer.getData("lawrenn/doc-id");
                  const docName = e.dataTransfer.getData("lawrenn/doc-name");
                  if (docId) { e.preventDefault(); setAttachedDoc({ id: docId, name: docName }); chatInputRef.current?.focus(); }
                  setIsDraggingToChat(false);
                }}
              >
                {attachedDoc && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.2rem 0.45rem 0.2rem 0.4rem", background: "#ffffff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 5 }}>
                      <DocTypeIcon name={attachedDoc.name} />
                      <span style={{ fontSize: "0.75rem", color: "#374151", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedDoc.name}</span>
                      <button
                        onClick={() => setAttachedDoc(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 0.15rem", color: "#9CA3AF", display: "flex", alignItems: "center" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#374151"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#9CA3AF"; }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", background: isDraggingToChat ? "rgba(0,0,0,0.025)" : "#ffffff", border: isDraggingToChat ? "1.5px dashed rgba(0,0,0,0.18)" : "1px solid rgba(0,0,0,0.09)", borderRadius: 12, padding: "0.65rem 0.6rem 0.65rem 1rem", transition: "all 0.12s" }}>
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={e => {
                      setChatInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                    }}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={attachedDoc ? `Ask about ${attachedDoc.name}…` : "Ask anything about this matter…"}
                    rows={1}
                    style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem", color: "#111111", lineHeight: 1.6, padding: "0.15rem 0", overflowY: "hidden" }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                    style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: chatInput.trim() && !chatLoading ? "#111111" : "rgba(0,0,0,0.06)", border: "none", cursor: chatInput.trim() && !chatLoading ? "pointer" : "not-allowed", transition: "all 0.15s" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim() && !chatLoading ? "white" : "#9CA3AF"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Previous Chats */}
              {chatSessions.length > 0 && (
                <div style={{ flexShrink: 0, borderTop: "1px solid rgba(0,0,0,0.07)", maxHeight: 200, overflowY: "auto" }}>
                  <div style={{ padding: "0.5rem 1.25rem 0.3rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>Previous Chats</span>
                    <button
                      onClick={() => { setChatSessions([]); localStorage.removeItem(`matter-chats-${jobId}`); }}
                      style={{ fontSize: "0.7rem", color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: "0.3rem 0.3rem" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#374151"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#9CA3AF"; }}>
                      Clear all
                    </button>
                  </div>
                  {chatSessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => { setMessages(session.messages); setRestoredSessionId(session.id); setActiveTab("chat"); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0.5rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderTop: "1px solid rgba(0,0,0,0.04)", transition: "background 0.1s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.025)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                        <span style={{ fontSize: "0.8rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.title}</span>
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "#9CA3AF", flexShrink: 0, marginLeft: "0.75rem" }}>{timeAgo(session.savedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === "notes" && (
            <div style={{ flex: 1, background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.5rem", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.6rem" }}>Notes</p>
              <textarea
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onBlur={saveNotes}
                placeholder="Add notes about this matter…"
                style={{
                  flex: 1, resize: "none",
                  padding: "0.75rem", background: "#ffffff",
                  border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 8,
                  color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.875rem",
                  lineHeight: 1.6, outline: "none", boxSizing: "border-box",
                  minHeight: 200,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.22)"; }}
                onBlurCapture={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
              />
              {notesSaving && <p style={{ fontSize: "0.72rem", color: "#9CA3AF", margin: "0.25rem 0 0" }}>Saving…</p>}
            </div>
          )}

          {/* RESEARCH TAB */}
          {activeTab === "research" && (
            <div style={{ flex: 1, background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>


              {/* Empty / loading / error — full width */}
              {(!researchSearched && !researchLoading) && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "#9CA3AF", textAlign: "center", padding: "2rem" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                  <p style={{ fontSize: "0.82rem", margin: 0, lineHeight: 1.6 }}>
                    Analyze applicable law based on this matter's files and context.
                  </p>
                  <button onClick={runResearch} style={{ background: "#111111", color: "white", border: "none", borderRadius: 7, padding: "0.5rem 1.25rem", fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}>
                    Analyze Matter
                  </button>
                </div>
              )}

              {researchLoading && (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, overflow: "hidden" }}>
                  {[0, 1].map(col => (
                    <div key={col} style={{ padding: "1.25rem 1.5rem", borderRight: col === 0 ? "1px solid rgba(0,0,0,0.07)" : "none", display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto" }}>
                      <div style={{ height: 11, width: "45%", background: "rgba(0,0,0,0.06)", borderRadius: 5, animation: "pulse 1.5s infinite" }} />
                      {[95, 80, 88, 70, 83].map((w, j) => (
                        <div key={j} style={{ height: 9, width: w + "%", background: "rgba(0,0,0,0.04)", borderRadius: 5, animation: "pulse 1.5s infinite" }} />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {!researchLoading && researchError && (
                <div style={{ padding: "1.5rem" }}>
                  <div style={{ background: "rgba(153,27,27,0.05)", border: "1px solid rgba(153,27,27,0.15)", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.82rem", color: "#991B1B" }}>
                    {researchError}
                  </div>
                </div>
              )}

              {/* Two-column results */}
              {!researchLoading && !researchError && researchAnalysis && (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden" }}>

                  {/* LEFT — synopsis + chat */}
                  <div style={{ borderRight: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

                    {/* Chat messages (synopsis scrolls inline at top) */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

                      {/* Synopsis at top, scrolls with chat */}
                      {researchAnalysis.synopsis && (
                        <div style={{ marginBottom: "0.5rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                          <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 0.5rem" }}>Matter Synopsis</p>
                          <p style={{ fontSize: "0.82rem", color: "#374151", margin: 0, lineHeight: 1.75 }}>{researchAnalysis.synopsis}</p>
                        </div>
                      )}

                      {researchChatMsgs.length === 0 && (
                        <p style={{ fontSize: "0.78rem", color: "#9CA3AF", margin: 0, lineHeight: 1.6, textAlign: "center", paddingTop: "0.5rem" }}>
                          Ask a question to research further.
                        </p>
                      )}
                      {researchChatMsgs.map((m, i) => (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                          <div style={{
                            maxWidth: "88%", padding: "0.55rem 0.8rem", borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                            background: m.role === "user" ? "#EDE8DF" : "transparent",
                            color: "#111111",
                            fontSize: "0.8rem", lineHeight: 1.65,
                          }}>
                            {m.role === "assistant" ? renderContent(m.content) : m.content}
                          </div>
                        </div>
                      ))}
                      {researchChatLoading && (
                        <div style={{ display: "flex", alignItems: "flex-start" }}>
                          <div style={{ borderRadius: "10px 10px 10px 2px", padding: "0.55rem 0.9rem", display: "flex", gap: "4px", alignItems: "center" }}>
                            {[0, 1, 2].map(d => (
                              <div key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "#9CA3AF", animation: `bounce 1s ${d * 0.15}s infinite` }} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div ref={researchChatEndRef} />
                    </div>

                    {/* Chat input */}
                    <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid rgba(0,0,0,0.07)", flexShrink: 0, display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                      <textarea
                        ref={researchChatInputRef}
                        value={researchChatInput}
                        onChange={e => setResearchChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendResearchChat(); } }}
                        placeholder="Ask a research question&#8230;"
                        rows={1}
                        style={{ flex: 1, resize: "none", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: "0.5rem 0.75rem", fontFamily: "'DM Sans'", fontSize: "0.82rem", color: "#111111", outline: "none", lineHeight: 1.5, background: "#ffffff", maxHeight: 100, overflowY: "auto" }}
                        onFocus={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.25)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"; }}
                      />
                      <button
                        onClick={sendResearchChat}
                        disabled={!researchChatInput.trim() || researchChatLoading}
                        style={{ width: 32, height: 32, borderRadius: 8, background: researchChatInput.trim() ? "#111111" : "rgba(0,0,0,0.06)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: researchChatInput.trim() ? "pointer" : "default", flexShrink: 0, transition: "background 0.15s" }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={researchChatInput.trim() ? "white" : "#9CA3AF"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* RIGHT — applicable laws (prose) */}
                  <div style={{ overflowY: "auto", padding: "1.75rem 2rem" }}>

                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.75rem" }}>
                      <div>
                        <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 0.2rem" }}>Applicable Law</p>
                        {researchAnalysis.jurisdiction && (
                          <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: 0 }}>{researchAnalysis.jurisdiction}</p>
                        )}
                      </div>
                      <button onClick={runResearch} style={{ background: "none", border: "none", padding: 0, fontFamily: "'DM Sans'", fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>
                        Re-analyze
                      </button>
                    </div>

                    {researchAnalysis.issues.map((issue, issueIdx) => (
                      <div key={issueIdx} style={{ marginBottom: issueIdx < researchAnalysis.issues.length - 1 ? "2.5rem" : 0 }}>

                        {/* Issue heading */}
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111111", margin: "0 0 0.4rem", fontFamily: "'DM Sans'", lineHeight: 1.3 }}>{issueIdx + 1}. {issue.title}</h3>
                        <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 1.25rem", lineHeight: 1.7 }}>{issue.relevance}</p>

                        {issue.statute && (
                          <>
                            {/* Statute name + citation */}
                            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111111", margin: "0 0 0.1rem", display: "flex", flexWrap: "wrap" as const, alignItems: "baseline", gap: "0.4rem" }}>
                              {issue.statute.name}{" "}
                              <span style={{ fontWeight: 400, color: "#6B7280", fontSize: "0.78rem" }}>{issue.statute.citation}</span>
                            </p>

                            {/* Verbatim statutory text as a blockquote */}
                            <blockquote style={{ margin: "0.75rem 0 1rem", borderLeft: "3px solid #E5E7EB", paddingLeft: "1rem" }}>
                              <p style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.85, margin: 0, fontFamily: "Georgia, serif" }}>
                                {issue.statute.text}
                              </p>
                            </blockquote>

                            {/* Plain-English application */}
                            <p style={{ fontSize: "0.82rem", color: "#374151", margin: 0, lineHeight: 1.75 }}>
                              {issue.statute.plainEnglish}
                            </p>
                          </>
                        )}

                        {/* Related opinions */}
                        {issue.opinions && issue.opinions.length > 0 && (
                          <div style={{ marginTop: "1.5rem" }}>
                            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.75rem" }}>Related Opinions</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                              {issue.opinions.map((op, opIdx) => (
                                <a
                                  key={opIdx}
                                  href={`https://www.courtlistener.com${op.absoluteUrl}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: "block", background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "0.7rem 0.85rem", textDecoration: "none", color: "inherit" }}
                                >
                                  <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111111", margin: "0 0 0.2rem", lineHeight: 1.4 }}>{op.caseName}</p>
                                  <p style={{ fontSize: "0.72rem", color: "#6B7280", margin: "0 0 0.35rem" }}>
                                    {[op.citation, op.court, op.dateFiled ? new Date(op.dateFiled).getFullYear() : null].filter(Boolean).join(" · ")}
                                  </p>
                                  {op.snippet && (
                                    <p style={{ fontSize: "0.75rem", color: "#4B5563", margin: 0, lineHeight: 1.65 }}>{op.snippet.slice(0, 220)}{op.snippet.length > 220 ? "…" : ""}</p>
                                  )}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {issueIdx < researchAnalysis.issues.length - 1 && (
                          <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.07)", margin: "2.5rem 0 0" }} />
                        )}
                      </div>
                    ))}

                    {/* Disclaimer */}
                    <p style={{ fontSize: "0.7rem", color: "#9CA3AF", marginTop: "2rem", lineHeight: 1.6 }}>
                      Legal research is AI-generated and may not be complete or current. Statute text and case law are provided for reference only — always verify citations against official sources before use.
                    </p>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* CONTACTS TAB */}
          {activeTab === "contacts" && (
            <div style={{ flex: 1, background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.5rem", overflowY: "auto" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 1.25rem" }}>Contacts</p>
              {job.customers ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        {["Contact Type", "First Name", "Last Name", "Phone", "Email", ""].map((h, i) => (
                          <th key={h} style={{ textAlign: "left", fontSize: "0.65rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", padding: `0 ${i === 1 ? "0.1rem" : "1rem"} 0.65rem 0`, borderBottom: "1px solid rgba(0,0,0,0.07)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {/* Contact Type */}
                        <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                          {editingContact ? (
                            <select
                              value={contactEdit.contactType}
                              onChange={e => setContactEdit(p => ({ ...p, contactType: e.target.value }))}
                              style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white", cursor: "pointer" }}
                            >
                              {["Client", "Opposing Counsel", "Co-Counsel", "Expert Witness", "Fact Witness", "Mediator", "Judge", "Other"].map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", background: "rgba(0,0,0,0.04)", borderRadius: 5, padding: "0.2rem 0.55rem" }}>
                              {job.customers.contact_type ?? "Client"}
                            </span>
                          )}
                        </td>
                        {/* First Name */}
                        <td style={{ padding: "0.85rem 0.1rem 0.85rem 0", verticalAlign: "middle" }}>
                          {editingContact ? (
                            <input
                              value={contactEdit.firstName}
                              onChange={e => setContactEdit(p => ({ ...p, firstName: e.target.value }))}
                              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }}
                            />
                          ) : (
                            <span style={{ color: "#111111" }}>{job.customers.name?.split(" ")[0] ?? "—"}</span>
                          )}
                        </td>
                        {/* Last Name */}
                        <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                          {editingContact ? (
                            <input
                              value={contactEdit.lastName}
                              onChange={e => setContactEdit(p => ({ ...p, lastName: e.target.value }))}
                              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }}
                            />
                          ) : (
                            <span style={{ color: "#111111" }}>{job.customers.name?.split(" ").slice(1).join(" ") || "—"}</span>
                          )}
                        </td>
                        {/* Phone */}
                        <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                          {editingContact ? (
                            <input
                              value={contactEdit.phone}
                              onChange={e => setContactEdit(p => ({ ...p, phone: e.target.value }))}
                              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }}
                            />
                          ) : (
                            <span style={{ color: "#111111" }}>{job.customers.phone || "—"}</span>
                          )}
                        </td>
                        {/* Email */}
                        <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                          {editingContact ? (
                            <input
                              value={contactEdit.email}
                              onChange={e => setContactEdit(p => ({ ...p, email: e.target.value }))}
                              style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }}
                            />
                          ) : (
                            <span style={{ color: "#111111" }}>{job.customers.email || "—"}</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td style={{ padding: "0.85rem 0", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                          {editingContact ? (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button onClick={saveContact} style={{ background: "#111111", color: "white", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                              <button onClick={() => setEditingContact(false)} style={{ background: "rgba(0,0,0,0.06)", color: "#374151", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={startEditContact} style={{ background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", color: "#6B7280" }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                              <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>Edit</span>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Additional contacts rows */}
                      {matterContacts.map(c => {
                        const editing = editingMatterContactId === c.id;
                        const cs = { padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" as const };
                        return (
                          <tr key={c.id}>
                            <td style={cs}>
                              {editing ? (
                                <select value={matterContactEdit.contactType} onChange={e => setMatterContactEdit(p => ({ ...p, contactType: e.target.value }))} style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white", cursor: "pointer" }}>
                                  {["Client","Opposing Counsel","Co-Counsel","Expert Witness","Fact Witness","Mediator","Judge","Other"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              ) : (
                                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", background: "rgba(0,0,0,0.04)", borderRadius: 5, padding: "0.2rem 0.55rem" }}>{c.contact_type}</span>
                              )}
                            </td>
                            <td style={{ padding: "0.85rem 0.1rem 0.85rem 0", verticalAlign: "middle" }}>
                              {editing ? <input value={matterContactEdit.firstName} onChange={e => setMatterContactEdit(p => ({ ...p, firstName: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                                : <span style={{ color: "#111111" }}>{c.first_name || "—"}</span>}
                            </td>
                            <td style={cs}>
                              {editing ? <input value={matterContactEdit.lastName} onChange={e => setMatterContactEdit(p => ({ ...p, lastName: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                                : <span style={{ color: "#111111" }}>{c.last_name || "—"}</span>}
                            </td>
                            <td style={cs}>
                              {editing ? <input value={matterContactEdit.phone} onChange={e => setMatterContactEdit(p => ({ ...p, phone: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                                : <span style={{ color: "#111111" }}>{c.phone || "—"}</span>}
                            </td>
                            <td style={cs}>
                              {editing ? <input value={matterContactEdit.email} onChange={e => setMatterContactEdit(p => ({ ...p, email: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                                : <span style={{ color: "#111111" }}>{c.email || "—"}</span>}
                            </td>
                            <td style={{ padding: "0.85rem 0", verticalAlign: "middle", whiteSpace: "nowrap" as const }}>
                              {editing ? (
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  <button onClick={saveMatterContact} style={{ background: "#111111", color: "white", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                                  <button onClick={() => setEditingMatterContactId(null)} style={{ background: "rgba(0,0,0,0.06)", color: "#374151", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: "0.4rem" }}>
                                  <button onClick={() => startEditMatterContact(c)} style={{ background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "0.3rem 0.6rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", color: "#6B7280" }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>Edit</span>
                                  </button>
                                  <button onClick={() => deleteMatterContact(c.id)} style={{ background: "none", border: "1px solid rgba(153,27,27,0.2)", borderRadius: 6, padding: "0.3rem 0.5rem", cursor: "pointer", color: "#991B1B", display: "flex", alignItems: "center" }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* New contact row */}
                      {addingContact && (
                        <tr>
                          <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                            <select value={newContact.contactType} onChange={e => setNewContact(p => ({ ...p, contactType: e.target.value }))} style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white", cursor: "pointer" }}>
                              {["Client","Opposing Counsel","Co-Counsel","Expert Witness","Fact Witness","Mediator","Judge","Other"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "0.85rem 0.1rem 0.85rem 0", verticalAlign: "middle" }}>
                            <input placeholder="First" value={newContact.firstName} onChange={e => setNewContact(p => ({ ...p, firstName: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                          </td>
                          <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                            <input placeholder="Last" value={newContact.lastName} onChange={e => setNewContact(p => ({ ...p, lastName: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                          </td>
                          <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                            <input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                          </td>
                          <td style={{ padding: "0.85rem 1rem 0.85rem 0", verticalAlign: "middle" }}>
                            <input placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} style={{ width: "100%", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.8rem", fontFamily: "inherit", outline: "none", background: "white" }} />
                          </td>
                          <td style={{ padding: "0.85rem 0", verticalAlign: "middle", whiteSpace: "nowrap" as const }}>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button onClick={addMatterContact} style={{ background: "#111111", color: "white", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                              <button onClick={() => { setAddingContact(false); setNewContact({ contactType: "Client", firstName: "", lastName: "", phone: "", email: "", address: "" }); }} style={{ background: "rgba(0,0,0,0.06)", color: "#374151", border: "none", borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {!addingContact && (
                    <button onClick={() => setAddingContact(true)} style={{ marginTop: "1rem", background: "none", border: "1px dashed rgba(0,0,0,0.18)", borderRadius: 7, padding: "0.45rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "#6B7280", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Contact
                    </button>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>No client linked to this matter.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: sidebar ── */}
        {activeTab !== "research" && <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Client */}
          {job.customers && (
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Client</p>
                {!editingContact ? (
                  <button onClick={startEditContact} style={{ background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "0.25rem", cursor: "pointer", display: "flex", alignItems: "center", color: "#6B7280" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button onClick={saveContact} style={{ background: "#111111", color: "white", border: "none", borderRadius: 6, padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                    <button onClick={() => setEditingContact(false)} style={{ background: "rgba(0,0,0,0.06)", color: "#374151", border: "none", borderRadius: 6, padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                )}
              </div>
              {editingContact ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      placeholder="First name"
                      value={contactEdit.firstName}
                      onChange={e => setContactEdit(p => ({ ...p, firstName: e.target.value }))}
                      style={{ flex: 1, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" }}
                    />
                    <input
                      placeholder="Last name"
                      value={contactEdit.lastName}
                      onChange={e => setContactEdit(p => ({ ...p, lastName: e.target.value }))}
                      style={{ flex: 1, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" }}
                    />
                  </div>
                  <input
                    placeholder="Phone"
                    value={contactEdit.phone}
                    onChange={e => setContactEdit(p => ({ ...p, phone: e.target.value }))}
                    style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" }}
                  />
                  <input
                    placeholder="Email"
                    value={contactEdit.email}
                    onChange={e => setContactEdit(p => ({ ...p, email: e.target.value }))}
                    style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" }}
                  />
                  <input
                    placeholder="Address"
                    value={contactEdit.address}
                    onChange={e => setContactEdit(p => ({ ...p, address: e.target.value }))}
                    style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "0.4rem 0.6rem", fontSize: "0.82rem", fontFamily: "inherit", outline: "none" }}
                  />
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111111", margin: "0 0 0.2rem" }}>{job.customers.name}</p>
                  <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 0.15rem" }}>{job.customers.phone}</p>
                  {job.customers.email && <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 0.15rem" }}>{job.customers.email}</p>}
                  {job.customers.address && <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: 0 }}>{job.customers.address}</p>}
                </>
              )}
            </div>
          )}

          {/* Status */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.25rem" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.75rem" }}>Status</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                {STATUSES.filter(s => s !== "complete").map(s => {
                  const c = STATUS_CONFIG[s];
                  const isActive = job.status === s;
                  return (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {s === "canceled" && <div style={{ width: 1, height: 28, background: "rgba(0,0,0,0.1)" }} />}
                      <button
                        onClick={() => handleStatusClick(s)}
                        disabled={updating || isActive}
                        style={{
                          padding: "0.3rem 0.7rem",
                          background: isActive ? c.bg : "transparent",
                          border: `1.5px solid ${isActive ? c.color : "rgba(0,0,0,0.1)"}`,
                          borderRadius: 100, color: isActive ? c.color : "#6B7280",
                          fontFamily: "'DM Sans'", fontSize: "0.75rem", fontWeight: 600,
                          cursor: updating || isActive ? "not-allowed" : "pointer",
                          opacity: updating ? 0.6 : 1, transition: "all 0.15s",
                        }}>
                        {c.label}
                      </button>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const c = STATUS_CONFIG["complete"];
                const isActive = job.status === "complete";
                return (
                  <button
                    onClick={() => handleStatusClick("complete")}
                    disabled={updating || isActive}
                    style={{
                      alignSelf: "flex-start", padding: "0.3rem 1.25rem",
                      background: isActive ? c.bg : "transparent",
                      border: `1.5px solid ${isActive ? c.color : "rgba(0,0,0,0.1)"}`,
                      borderRadius: 100, color: isActive ? c.color : "#6B7280",
                      fontFamily: "'DM Sans'", fontSize: "0.75rem", fontWeight: 600,
                      cursor: updating || isActive ? "not-allowed" : "pointer",
                      opacity: updating ? 0.6 : 1, transition: "all 0.15s",
                    }}>
                    {c.label}
                  </button>
                );
              })()}

              {confirmComplete && (
                <div style={{ marginTop: "0.25rem", background: "rgba(22,101,52,0.05)", border: "1.5px solid rgba(22,101,52,0.2)", borderRadius: 8, padding: "0.85rem 1rem" }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#166534", margin: "0 0 0.6rem" }}>Close this matter?</p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => { updateStatus("complete"); setConfirmComplete(false); }}
                      style={{ padding: "0.4rem 1rem", background: "#166534", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                      Yes, close it
                    </button>
                    <button onClick={() => setConfirmComplete(false)}
                      style={{ padding: "0.4rem 1rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 6, color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 500, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {confirmOverride && (
                <div style={{ marginTop: "0.25rem", background: "rgba(146,64,14,0.05)", border: "1.5px solid rgba(146,64,14,0.2)", borderRadius: 8, padding: "0.85rem 1rem" }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#92400E", margin: "0 0 0.2rem" }}>Matter is already closed.</p>
                  <p style={{ fontSize: "0.8rem", color: "#78350F", margin: "0 0 0.6rem" }}>Override the status?</p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => { updateStatus(confirmOverride); setConfirmOverride(null); }}
                      style={{ padding: "0.4rem 1rem", background: "#92400E", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                      Yes, override
                    </button>
                    <button onClick={() => setConfirmOverride(null)}
                      style={{ padding: "0.4rem 1rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 6, color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 500, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* IQ Summary */}
          {(job.ai_notes || summaryGenerating) && (
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.25rem" }}>
              <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.6rem" }}>IQ Summary</p>
              {summaryGenerating ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[100, 85, 70].map((w, i) => (
                    <div key={i} style={{ height: 12, width: `${w}%`, background: "rgba(0,0,0,0.06)", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite" }} />
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.7, margin: 0 }}>{job.ai_notes}</p>
              )}
            </div>
          )}

          {/* Attorney */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.25rem" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.75rem" }}>Assigned Attorney</p>
            <select
              value={job.technician_id ?? ""}
              onChange={async e => {
                const techId = e.target.value || null;
                await supabase.from("jobs").update({ technician_id: techId }).eq("id", job.id);
                const tech = technicians.find(t => t.id === techId);
                setJob(prev => prev ? { ...prev, technician_id: techId, technicians: tech ? { name: tech.name, color: tech.color } : null } : null);
              }}
              style={{ width: "100%", padding: "0.6rem 0.75rem", background: "#ffffff", border: "1.5px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.875rem", outline: "none" }}>
              <option value="">Unassigned</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Details */}
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, padding: "1.25rem" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.75rem" }}>Details</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>Source</span>
                <span style={{ fontSize: "0.78rem", color: "#374151", fontWeight: 500 }}>
                  {job.source === "voice_agent" ? "AI scheduled" : "Manual"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>Created</span>
                <span style={{ fontSize: "0.78rem", color: "#374151", fontWeight: 500 }}>
                  {new Date(job.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {job.updated_at && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>Modified</span>
                  <span style={{ fontSize: "0.78rem", color: "#374151", fontWeight: 500 }}>
                    {new Date(job.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>}
      </div>

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
          <div style={{ position: "fixed", top: 52, right: 0, bottom: 0, width: previewWidth, zIndex: 100, background: "white", borderLeft: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.07)" }}>
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

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}