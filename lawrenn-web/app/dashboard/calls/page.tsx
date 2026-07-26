"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Call {
  id: string;
  caller_phone: string;
  outcome: string;
  duration_seconds: number;
  created_at: string;
  transcript: string | null;
  recording_url: string | null;
  escalated: boolean;
  parsed_job: any;
  intake_memo: string | null;
  client_followup: string | null;
  ai_summary: string | null;
  customers: { name: string; phone: string } | null;
}

function renderIntakeMemo(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let listItems: string[] = [];

  function flushList(key: string) {
    if (!listItems.length) return;
    nodes.push(
      <ul key={key} style={{ margin: "0.2rem 0 0.75rem", paddingLeft: "1.1rem" }}>
        {listItems.map((item, j) => (
          <li key={j} style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.7, marginBottom: "0.15rem" }}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (!line) { flushList(`gap-${i}`); continue; }

    if (line === "INTAKE MEMO") {
      flushList(`f-${i}`);
      nodes.push(<p key={i} style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111111", letterSpacing: "0.04em", margin: "0 0 0.2rem" }}>Intake Memo</p>);
      continue;
    }
    if (line === "Potential Client") {
      nodes.push(<p key={i} style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.65rem" }}>Potential Client</p>);
      continue;
    }

    if (/^(Name|Phone|Matter Type|Jurisdiction|Urgency|Date):/.test(line)) {
      flushList(`f-${i}`);
      const colon = line.indexOf(":");
      const label = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      const isUrgency = label === "Urgency";
      const urgencyColor = value.toLowerCase().startsWith("high") ? "#DC2626" : value.toLowerCase().startsWith("medium") ? "#D97706" : "#374151";
      nodes.push(
        <div key={i} style={{ display: "flex", gap: "0.75rem", padding: "0.3rem 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9CA3AF", minWidth: 90, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em", paddingTop: 2 }}>{label}</span>
          <span style={{ fontSize: "0.82rem", color: isUrgency ? urgencyColor : "#111111", fontWeight: isUrgency ? 600 : 400, lineHeight: 1.5 }}>{value}</span>
        </div>
      );
      continue;
    }

    const sectionMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (sectionMatch) {
      // Skip section 7 (Draft Client Follow-Up) — rendered separately below
      if (sectionMatch[1] === "7") { i++; while (i <= lines.length && lines[i - 1]?.trim() && !lines[i - 1]?.match(/^\d+\./)) i++; break; }
      flushList(`f-${i}`);
      nodes.push(
        <p key={i} style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.07em", margin: "1.1rem 0 0.4rem", paddingTop: "0.9rem", borderTop: "1px solid rgba(0,0,0,0.07)" }}>
          {sectionMatch[1]}. {sectionMatch[2]}
        </p>
      );
      continue;
    }

    if (line.startsWith("- ")) { listItems.push(line.slice(2)); continue; }

    flushList(`f-${i}`);
    nodes.push(<p key={i} style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.75, margin: "0 0 0.4rem" }}>{line}</p>);
  }
  flushList("end");
  return <>{nodes}</>;
}

const OUTCOME_CONFIG: Record<string, { label: string; dot: string }> = {
  booked:             { label: "Booked",      dot: "#111111" },
  missed:             { label: "Missed",      dot: "#9CA3AF" },
  escalated:          { label: "Escalated",   dot: "#374151" },
  no_answer:          { label: "No answer",   dot: "#9CA3AF" },
  voicemail:          { label: "Voicemail",   dot: "#9CA3AF" },
  in_progress:        { label: "In progress", dot: "#374151" },
  callback_requested: { label: "Callback",    dot: "#374151" },
};

function CallsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { businessId, loading: bizLoading } = useBusiness();

  const [calls, setCalls]       = useState<Call[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [selected, setSelected] = useState<Call | null>(null);
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 20;

  const [detailTab, setDetailTab] = useState<"summary" | "memo" | "transcript">("summary");
  const [followupCopied, setFollowupCopied] = useState(false);
  const [col1Width, setCol1Width] = useState(360);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    setCol1Width(Math.max(240, Math.min(700, dragRef.current.startW + dx)));
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: col1Width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    async function load() {
      await fetchCalls(businessId!, filter, 0);
      setLoading(false);

      const callId = searchParams.get("call");
      if (callId) {
        const { data } = await supabase.from("calls").select(`
          id, caller_phone, outcome, duration_seconds, created_at,
          transcript, recording_url, escalated, parsed_job, intake_memo, client_followup, ai_summary,
          customers (name, phone)
        `).eq("id", callId).single();
        if (data) setSelected(data as any);
      }
    }
    load();

    const channel = supabase
      .channel(`calls-page-${businessId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "calls",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        setCalls(prev => [payload.new as Call, ...prev]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "calls",
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        setCalls(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Call } : c));
        setSelected(prev => prev?.id === payload.new.id ? { ...prev, ...payload.new as Call } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [businessId, bizLoading, router]);

  async function fetchCalls(bizId: string, outcomeFilter: string, pageNum: number) {
    let query = supabase
      .from("calls")
      .select(`
        id, caller_phone, outcome, duration_seconds, created_at,
        transcript, recording_url, escalated, parsed_job, intake_memo, client_followup, ai_summary,
        customers (name, phone)
      `)
      .eq("business_id", bizId)
      .order("created_at", { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (outcomeFilter !== "all") query = query.eq("outcome", outcomeFilter);

    const { data, error } = await query;
    if (error) console.error("[calls] fetch error:", JSON.stringify(error), "keys:", Object.keys(error));
    if (pageNum === 0) {
      setCalls((data as any) ?? []);
    } else {
      setCalls(prev => [...prev, ...(data as any) ?? []]);
    }
  }

  async function handleFilter(f: string) {
    setFilter(f);
    setPage(0);
    setSelected(null);
    if (businessId) await fetchCalls(businessId, f, 0);
  }

  async function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    if (businessId) await fetchCalls(businessId, filter, nextPage);
  }

  function formatTime(iso: string) {
    const d         = new Date(iso);
    const today     = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString())
      return `Today · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    if (d.toDateString() === yesterday.toDateString())
      return `Yesterday · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function formatDuration(secs: number) {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: selected ? 1400 : 900, margin: "0 auto", padding: "2rem", transition: "max-width 0.2s" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.75rem" }}>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.04em", color: "#111111", marginBottom: "0.2rem" }}>
            Call Log
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: "0.82rem" }}>Every call your AI has handled</p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: "0" }}>
          {[
            { key: "all",       label: "All" },
            { key: "booked",    label: "Booked" },
            { key: "missed",    label: "Missed" },
            { key: "escalated", label: "Escalated" },
            { key: "no_answer", label: "No answer" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => handleFilter(key)}
              style={{
                padding: "0.5rem 0.85rem",
                background: "transparent",
                border: "none",
                borderBottom: filter === key ? "2px solid #111111" : "2px solid transparent",
                marginBottom: "-1px",
                color: filter === key ? "#111111" : "#9CA3AF",
                fontFamily: "'DM Sans'", fontSize: "0.82rem",
                fontWeight: filter === key ? 600 : 400,
                cursor: "pointer", transition: "all 0.12s",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Split view */}
        <div ref={containerRef} style={{ display: selected ? "flex" : "block", gap: 0, alignItems: "flex-start" }}>

          {/* Calls list */}
          <div style={{
            width: selected ? col1Width : "100%",
            flexShrink: 0,
            background: "white",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            {calls.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", marginBottom: "0.3rem" }}>No calls yet</p>
                <p style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>Calls will appear here as your AI handles them</p>
              </div>
            ) : (
              <>
                {calls.map((call, i) => {
                  const cfg      = OUTCOME_CONFIG[call.outcome] ?? OUTCOME_CONFIG.missed;
                  const isActive = selected?.id === call.id;
                  return (
                    <div key={call.id}
                      onClick={() => { setSelected(isActive ? null : call); setDetailTab("summary"); }}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.85rem",
                        padding: "0.85rem 1.25rem",
                        borderBottom: i < calls.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                        cursor: "pointer",
                        background: isActive ? "#ffffff" : "white",
                        transition: "background 0.12s",
                        borderLeft: isActive ? "2px solid #111111" : "2px solid transparent",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#ffffff"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "white"; }}>

                      {/* Status dot */}
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: cfg.dot,
                        flexShrink: 0,
                        opacity: call.outcome === "in_progress" ? 1 : 0.5,
                      }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "#111111", marginBottom: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {call.customers?.name ?? call.caller_phone}
                        </p>
                        <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                          {formatTime(call.created_at)}
                          {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ""}
                        </p>
                      </div>

                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 500,
                        color: call.outcome === "booked" ? "#111111" : "#9CA3AF",
                        letterSpacing: "0.01em",
                        flexShrink: 0,
                      }}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}

                {calls.length >= PAGE_SIZE && (
                  <div style={{ padding: "0.875rem", textAlign: "center", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                    <button onClick={loadMore}
                      style={{
                        padding: "0.5rem 1.25rem",
                        background: "transparent",
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: 6,
                        color: "#9CA3AF",
                        fontFamily: "'DM Sans'", fontSize: "0.8rem",
                        cursor: "pointer",
                      }}>
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drag handle */}
          {selected && (
            <div
              onMouseDown={startDrag}
              style={{ width: 16, flexShrink: 0, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}
              onMouseEnter={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget.querySelector("div") as HTMLElement).style.background = "transparent"; }}>
              <div style={{ width: 3, height: "100%", minHeight: 80, borderRadius: 4, background: "transparent", transition: "background 0.15s" }} />
            </div>
          )}

          {/* Detail panel */}
          {selected && (
            <div style={{
              flex: 1, minWidth: 0,
              background: "white",
              border: "1px solid rgba(0,0,0,0.07)",
              borderRadius: 8,
              overflow: "hidden",
              height: "calc(100vh - 140px)",
              display: "flex", flexDirection: "column",
              position: "sticky", top: 72,
            }}>
              {/* Panel header */}
              <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#111111", marginBottom: "0.2rem" }}>
                    {selected.customers?.name ?? selected.caller_phone}
                  </p>
                  <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{formatTime(selected.created_at)}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: "0.25rem" }}>
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                {([
                  { key: "summary",    label: "Summary" },
                  { key: "memo",       label: "Intake Memo", badge: !!selected.intake_memo },
                  { key: "transcript", label: "Transcript" },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    style={{
                      padding: "0.6rem 1rem",
                      background: "transparent", border: "none",
                      borderBottom: detailTab === tab.key ? "2px solid #111111" : "2px solid transparent",
                      marginBottom: "-1px",
                      fontFamily: "'DM Sans'", fontSize: "0.78rem",
                      fontWeight: detailTab === tab.key ? 600 : 400,
                      color: detailTab === tab.key ? "#111111" : "#9CA3AF",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "0.3rem",
                    }}>
                    {tab.label}
                    {"badge" in tab && tab.badge && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#111111", display: "inline-block" }} />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab: Summary */}
              {detailTab === "summary" && (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {[
                      { label: "Outcome",  value: OUTCOME_CONFIG[selected.outcome]?.label ?? selected.outcome },
                      { label: "Duration", value: formatDuration(selected.duration_seconds) },
                      { label: "Phone",    value: selected.caller_phone },
                      ...(selected.parsed_job?.job_type ? [{ label: "Matter type", value: selected.parsed_job.job_type }] : []),
                      ...(selected.escalated ? [{ label: "Escalated", value: "Yes" }] : []),
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.4rem 0", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                        <span style={{ fontSize: "0.75rem", color: "#9CA3AF", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</span>
                        <span style={{ fontSize: "0.82rem", color: "#111111", fontWeight: 500 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "1rem 1.5rem" }}>
                    <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.65rem" }}>Call Summary</p>
                    {selected.ai_summary ? (
                      <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", borderLeft: "3px solid #111111", borderRadius: "0 6px 6px 0", padding: "0.75rem 1rem" }}>
                        <p style={{ fontSize: "0.84rem", color: "#1F2937", lineHeight: 1.85, margin: 0, fontStyle: "normal" }}>
                          {selected.ai_summary.replace(/^\*\*[^*]+\*\*\s*/g, "").trim()}
                        </p>
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>Summary not yet available.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: Intake Memo */}
              {detailTab === "memo" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}>
                  {selected.intake_memo ? (
                    <>
                      {renderIntakeMemo(selected.intake_memo)}

                      {/* Draft client follow-up */}
                      <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "2px solid rgba(0,0,0,0.08)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
                          <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
                            Draft Client Follow-Up
                          </p>
                          {selected.client_followup && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selected.client_followup!);
                                setFollowupCopied(true);
                                setTimeout(() => setFollowupCopied(false), 2000);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: "0.25rem",
                                padding: "0.25rem 0.6rem",
                                background: followupCopied ? "#059669" : "transparent",
                                border: `1px solid ${followupCopied ? "#059669" : "rgba(0,0,0,0.1)"}`,
                                borderRadius: 5, cursor: "pointer",
                                fontFamily: "'DM Sans'", fontSize: "0.7rem", fontWeight: 500,
                                color: followupCopied ? "white" : "#6B7280",
                                transition: "all 0.15s",
                              }}>
                              {followupCopied ? (
                                <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Copied</>
                              ) : (
                                <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
                              )}
                            </button>
                          )}
                        </div>
                        {selected.client_followup ? (
                          <div style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "0.9rem 1rem" }}>
                            <p style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.8, margin: 0, whiteSpace: "pre-wrap" }}>
                              {selected.client_followup}
                            </p>
                          </div>
                        ) : (
                          <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Not available for this call.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "2.5rem 0" }}>
                      <p style={{ fontSize: "0.82rem", color: "#9CA3AF", lineHeight: 1.6 }}>
                        No intake memo generated for this call.<br />
                        Memos are created when a caller describes a legal issue with enough detail.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Transcript */}
              {detailTab === "transcript" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.5rem" }}>
                  {selected.transcript ? (
                    <p style={{ fontSize: "0.82rem", color: "#374151", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: 0 }}>
                      {selected.transcript}
                    </p>
                  ) : (
                    <p style={{ fontSize: "0.82rem", color: "#9CA3AF" }}>No transcript available</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense>
      <CallsPageInner />
    </Suspense>
  );
}
