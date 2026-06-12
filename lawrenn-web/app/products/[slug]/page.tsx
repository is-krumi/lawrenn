"use client";

import { useEffect, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import MainNav from "@/components/MainNav";

// ── Reveal hook ────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.08 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)", transition: `opacity 0.7s ${delay}s ease, transform 0.7s ${delay}s ease`, ...style }}>
      {children}
    </div>
  );
}

// ── Product data ───────────────────────────────────────────────────────────
const PRODUCTS: Record<string, {
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  label: string;
  stats: { value: string; label: string }[];
  intro: string;
  features: { icon: React.ReactNode; title: string; body: string }[];
  deep: { eyebrow: string; heading: string; body: string; bullets: string[] }[];
  useCases: { title: string; desc: string }[];
}> = {
  "ai-call-answering": {
    slug: "ai-call-answering",
    name: "AI Call Answering",
    label: "CALL HANDLING",
    headline: "NEVER MISS A CLIENT AGAIN",
    subheadline: "Your firm's 24/7 AI receptionist answers every call, qualifies every caller, and delivers a structured intake the moment you need it.",
    intro: "42% of inbound legal calls go unanswered. Each missed call is a missed matter. Lawrenn puts an always-on AI front desk on your phone line so no potential client ever reaches voicemail.",
    stats: [
      { value: "24/7", label: "Availability" },
      { value: "<30s", label: "Answer time" },
      { value: "100%", label: "Call capture rate" },
      { value: "42%", label: "Of calls go unanswered industry-wide" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
        title: "Answers instantly, every time",
        body: "No hold music. No voicemail. Every call is answered within seconds, day or night, weekends and holidays. Your firm never goes dark.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
        title: "Natural conversation, not a phone tree",
        body: "The AI speaks naturally, listens carefully, and adapts to what the caller says. Callers won't know they're talking to an AI unless you want them to.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
        title: "Urgent matter flagging",
        body: "When a caller describes an emergency — an arrest, an imminent deadline, a domestic situation — Lawrenn flags it as urgent and sends you an immediate notification.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>,
        title: "Tuned for your practice area",
        body: "Configure the questions asked based on practice area — personal injury, family law, estate planning, criminal defense, and more. Every intake is relevant.",
      },
    ],
    deep: [
      {
        eyebrow: "HOW IT WORKS",
        heading: "From ring to intake in under three minutes",
        body: "The moment a call comes in, Lawrenn answers with your firm's greeting, qualifies the caller, and captures the information your attorneys need — without any manual effort.",
        bullets: [
          "Call connects to your Lawrenn number instantly",
          "AI greets the caller with your firm name and tone",
          "Questions adapt in real time based on practice area",
          "Intake memo lands in your dashboard within seconds of call end",
        ],
      },
      {
        eyebrow: "INTELLIGENCE LAYER",
        heading: "Every call is a data point",
        body: "Beyond answering calls, Lawrenn turns your call history into business intelligence — which hours are busiest, which practice areas drive the most volume, which callers converted to matters.",
        bullets: [
          "Full call transcripts stored and searchable",
          "Caller intent and sentiment classification",
          "Outcome tracking across every inbound call",
          "Weekly volume and conversion summaries",
        ],
      },
    ],
    useCases: [
      { title: "After-hours coverage", desc: "A potential client calls at 11pm after a car accident. Lawrenn answers, captures the details, and queues an urgent intake for the morning." },
      { title: "High-volume firms", desc: "During a busy period, multiple calls arrive simultaneously. Every caller is answered and qualified — no busy signals, no lost business." },
      { title: "Solo practitioners", desc: "You're in court all day. Lawrenn answers every call, handles intake, and you review the day's leads when you're back in the office." },
    ],
  },

  "client-intake": {
    slug: "client-intake",
    name: "Client Intake",
    label: "INTAKE",
    headline: "INTAKE IN 3 MINUTES, NOT 30",
    subheadline: "Every call automatically becomes a structured intake memo with the case details, client information, and next steps your attorneys need.",
    intro: "Manual intake wastes attorney time and lets critical details slip through the cracks. Lawrenn's AI generates a complete, structured intake from every call — no forms, no follow-up calls, no gaps.",
    stats: [
      { value: "3 min", label: "Average intake time" },
      { value: "100%", label: "Capture rate" },
      { value: "0", label: "Forms to fill" },
      { value: "8+", label: "Practice area templates" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
        title: "Structured memos, automatically",
        body: "Lawrenn converts every call into a formatted intake memo with client name, contact details, matter type, key facts, and recommended next steps.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
        title: "Practice area customisation",
        body: "Define the questions asked for each matter type. Personal injury captures accident details. Family law captures the parties and current status. You control the template.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        title: "Instant dashboard delivery",
        body: "The moment a call ends, the intake appears in your dashboard. No waiting, no batch processing. Your team can follow up within minutes of the first contact.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
        title: "Searchable intake history",
        body: "Every intake is indexed and searchable. Find any past inquiry by name, date, matter type, or any keyword from the conversation.",
      },
    ],
    deep: [
      {
        eyebrow: "INTAKE QUALITY",
        heading: "The details attorneys actually need",
        body: "Lawrenn doesn't just transcribe — it structures. The AI identifies the legally relevant facts from a conversation and organises them into a usable memo, not a wall of text.",
        bullets: [
          "Client contact details auto-populated",
          "Matter type classified automatically",
          "Key facts and dates extracted from the conversation",
          "Conflict of interest fields populated from caller information",
        ],
      },
      {
        eyebrow: "WORKFLOW",
        heading: "Intake to matter in one click",
        body: "Once you review an intake memo, you can open a new matter directly from it. Client details pre-fill. The call transcript links automatically. Your workflow starts where the intake ends.",
        bullets: [
          "One-click matter creation from any intake",
          "Client record created automatically",
          "Intake memo linked to the matter file",
          "Attorney assignment from intake review",
        ],
      },
    ],
    useCases: [
      { title: "High-volume intake", desc: "A personal injury firm receiving 40+ calls per week gets every inquiry captured and structured without a single receptionist." },
      { title: "After-hours intake", desc: "Callers who reach out at midnight get a complete intake — their matter is queued for the morning team before the attorney even wakes up." },
      { title: "Remote teams", desc: "A distributed firm needs intake information in a consistent format across multiple attorneys. Lawrenn ensures every intake looks the same." },
    ],
  },

  "client-communication": {
    slug: "client-communication",
    name: "Client Communication",
    label: "COMMUNICATION",
    headline: "RESPOND FASTER THAN ANY COMPETITOR",
    subheadline: "AI-drafted SMS messages that sound like you — sent within minutes of every intake, follow-up, or client update.",
    intro: "Clients expect fast responses. The firm that responds first wins the matter. Lawrenn drafts personalised follow-up messages and manages two-way SMS so you can respond instantly without writing every message yourself.",
    stats: [
      { value: "< 5 min", label: "First response time" },
      { value: "2×", label: "Response rate vs. voicemail" },
      { value: "SMS + email", label: "Channels supported" },
      { value: "100%", label: "Thread history retained" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
        title: "AI-drafted follow-ups",
        body: "After every intake, Lawrenn drafts a personalised follow-up SMS for your review. Approve it in one tap or edit before sending — never start from a blank message.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>,
        title: "Two-way SMS threads",
        body: "Clients reply to your messages and you see the full thread in your dashboard. Every message, inbound and outbound, in a single conversation view.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
        title: "Scheduled messaging",
        body: "Send appointment reminders, follow-up nudges, and status updates automatically at the right time. Configure rules once and let the system handle the timing.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
        title: "Opt-out management",
        body: "TCPA-compliant opt-out handling built in. Clients who reply STOP are flagged immediately and removed from automated sends. Your compliance is protected automatically.",
      },
    ],
    deep: [
      {
        eyebrow: "DRAFTING INTELLIGENCE",
        heading: "Messages written for the matter, not a template",
        body: "Lawrenn doesn't send generic texts. Each draft references the caller's name, their matter type, and the specific details from their intake call — so every message feels personal.",
        bullets: [
          "Caller name and matter type personalised in every draft",
          "Tone matches your firm's communication style",
          "Attorney can review and edit before any send",
          "Message history linked to the client record",
        ],
      },
      {
        eyebrow: "COMPLIANCE",
        heading: "Built for legal communication requirements",
        body: "Attorney-client communications require care. Lawrenn's messaging layer is designed with privilege and compliance in mind from the ground up.",
        bullets: [
          "TCPA-compliant opt-out handling",
          "All messages logged and retained in the matter file",
          "No automated sends without attorney review (configurable)",
          "Clear sender identification on every message",
        ],
      },
    ],
    useCases: [
      { title: "New matter follow-up", desc: "A potential client calls about a personal injury matter. Within 5 minutes they receive a personalised text confirming the firm received their inquiry and next steps." },
      { title: "Appointment reminders", desc: "Consultation reminders are sent automatically 24 hours and 1 hour before the scheduled time. No-shows drop significantly." },
      { title: "Status updates", desc: "When a matter status changes, the client gets a brief, professional update via SMS. No calls needed for routine updates." },
    ],
  },

  "matter-management": {
    slug: "matter-management",
    name: "Matter Management",
    label: "MATTERS",
    headline: "EVERY MATTER, PERFECTLY ORGANISED",
    subheadline: "One place for every client, call, document, contact, and note — with AI context always one click away.",
    intro: "Scattered spreadsheets, shared inboxes, and paper files slow firms down. Lawrenn gives every matter its own structured workspace, linking every interaction, document, and contact into a single source of truth.",
    stats: [
      { value: "360°", label: "Client view" },
      { value: "∞", label: "Matters per firm" },
      { value: "Real-time", label: "Sync across devices" },
      { value: "1 click", label: "To AI analysis" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
        title: "Unified matter workspace",
        body: "Each matter has its own page with the client file, linked documents, all call transcripts, SMS history, contacts, attorney notes, and IQ summary — in one organised view.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
        title: "Document management",
        body: "Upload and organise case documents directly in the matter. PDFs, Word files, and transcripts are indexed automatically so Lawrenn IQ can answer questions about them.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
        title: "Contact management",
        body: "Add opposing counsel, expert witnesses, co-counsel, and other contacts to each matter. Lawrenn IQ can reference all contacts when answering matter questions.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: "Matter status tracking",
        body: "Track every matter through Scheduled, Active, Closed, Billed, and Dismissed statuses. See your entire caseload at a glance from the matters dashboard.",
      },
    ],
    deep: [
      {
        eyebrow: "IQ INTEGRATION",
        heading: "Ask questions about any matter",
        body: "Every matter has a built-in AI chat powered by Lawrenn IQ. Ask about the client history, document contents, case status, or anything else — and get answers grounded in the actual matter data.",
        bullets: [
          "Ask 'what documents does this matter have?' and get an instant list",
          "Drag a document to the chat to ask specific questions about it",
          "AI context includes client info, call history, notes, and all contacts",
          "Chat sessions are saved and retrievable",
        ],
      },
      {
        eyebrow: "ORGANISATION",
        heading: "A structured approach to every caseload",
        body: "Lawrenn enforces a consistent structure across every matter so nothing gets lost and every attorney on the team has the same view.",
        bullets: [
          "Standardised matter fields across all practice areas",
          "Attorney assignment with colour coding",
          "Notes and AI-generated summaries side by side",
          "Archived matters retained and searchable",
        ],
      },
    ],
    useCases: [
      { title: "Case handoffs", desc: "An associate takes over a matter mid-case. The full history — every call, document, and note — is in the matter workspace, ready immediately." },
      { title: "Client calls during litigation", desc: "A client calls with a question. The attorney opens the matter on their phone, reviews the IQ summary, and answers confidently without digging through files." },
      { title: "Document review", desc: "An attorney needs to find a specific clause in a contract uploaded to a matter. They drag it into the IQ chat and ask — the answer comes back in seconds." },
    ],
  },

  "practice-intelligence": {
    slug: "practice-intelligence",
    name: "Practice Intelligence",
    label: "AI INTELLIGENCE",
    headline: "ASK YOUR FIRM'S DATA IN PLAIN ENGLISH",
    subheadline: "Lawrenn IQ answers questions about your cases, documents, calls, and clients — instantly, accurately, and with full citation.",
    intro: "Law firms generate enormous amounts of data — calls, documents, intake memos, client records. Most of it sits unread. Lawrenn IQ makes every piece of it instantly queryable so attorneys can get answers instead of digging.",
    stats: [
      { value: "Natural", label: "Language queries" },
      { value: "< 5s", label: "Average response time" },
      { value: "All", label: "Data sources unified" },
      { value: "Cited", label: "Sources on every answer" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
        title: "Ask anything about your practice",
        body: "\"How many personal injury calls came in this month?\" \"What are the key terms in this NDA?\" \"Summarise the Smith matter.\" Lawrenn IQ answers from your actual data.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
        title: "Document question answering",
        body: "Upload any document — contract, deposition, brief, correspondence — and ask questions about it. Lawrenn IQ reads the content and answers with specific citations from the document.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        title: "Cross-matter insights",
        body: "Ask questions that span multiple matters and clients. Identify patterns in your caseload, compare outcomes across practice areas, or find all matters involving a specific party.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
        title: "Saved chat sessions",
        body: "Intelligence sessions are saved automatically. Return to any prior conversation, pick up where you left off, or share insights with colleagues without re-running queries.",
      },
    ],
    deep: [
      {
        eyebrow: "DATA SOURCES",
        heading: "One query across everything",
        body: "Lawrenn IQ searches across your entire firm's data simultaneously — not just one file, one client, or one date range. The answer draws from wherever the relevant information lives.",
        bullets: [
          "All uploaded documents (PDFs, Word files, transcripts)",
          "Full call history and transcripts",
          "SMS message threads",
          "Matter notes, AI summaries, and client records",
        ],
      },
      {
        eyebrow: "SECURITY",
        heading: "Privilege-aware by design",
        body: "Every query is scoped to your firm. No other firm's data ever appears in your answers. Document content is encrypted at rest. AI processing runs under a formal Data Processing Agreement with Anthropic.",
        bullets: [
          "Queries scoped to your firm only — complete data isolation",
          "Document content encrypted with AES-256-GCM",
          "AI processing under a formal DPA — your data is never used for training",
          "Full audit trail of all intelligence queries",
        ],
      },
    ],
    useCases: [
      { title: "Pre-call preparation", desc: "Before calling a client, an attorney asks IQ to summarise the matter and the last three interactions. They're prepared in 20 seconds." },
      { title: "Contract review", desc: "A paralegal uploads a 40-page contract and asks 'what are the termination clauses?' IQ cites the exact sections in under 5 seconds." },
      { title: "Business development", desc: "A managing partner asks 'what practice areas drove the most new matters last quarter?' IQ answers from call and intake data." },
    ],
  },

  "call-analytics": {
    slug: "call-analytics",
    name: "Call Analytics",
    label: "ANALYTICS",
    headline: "SEE YOUR PRACTICE CLEARLY",
    subheadline: "Real-time call volume, outcomes, busiest hours, and conversion trends — all surfaced automatically so you can make decisions with data.",
    intro: "Most law firms have no visibility into their call patterns. Lawrenn changes that. Every call is tracked, classified, and rolled up into analytics that tell you exactly how your practice is performing — and where to improve.",
    stats: [
      { value: "90 days", label: "Rolling analytics window" },
      { value: "7", label: "Outcome categories tracked" },
      { value: "Hourly", label: "Call volume breakdown" },
      { value: "Live", label: "Dashboard updates" },
    ],
    features: [
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
        title: "Volume trends",
        body: "See daily, weekly, and monthly call volume at a glance. Identify growth trends, seasonal patterns, and the impact of marketing campaigns on inbound volume.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,
        title: "Outcome tracking",
        body: "Every call is classified — new matter inquiry, existing client, wrong number, hang-up, and more. Track what percentage of calls are converting to actual matters.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: "Busiest hours & days",
        body: "Know exactly when your phones are busiest. Optimise staffing, configure AI routing, and ensure you're resourced for your peak call windows.",
      },
      {
        icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
        title: "ROI calculation",
        body: "See your estimated billable recovery from captured calls that would otherwise have gone to voicemail. Track the direct revenue impact of Lawrenn on your practice.",
      },
    ],
    deep: [
      {
        eyebrow: "INTELLIGENCE INTEGRATION",
        heading: "Ask Lawrenn IQ about your analytics",
        body: "Analytics aren't just charts — they're data you can query. Ask Lawrenn IQ 'what was my busiest day last month?' or 'how many personal injury calls did we get this week?' and get instant answers.",
        bullets: [
          "Natural language queries over call data",
          "Trend comparisons across time periods",
          "Practice area breakdown automatically classified",
          "Outcome analysis with conversion rates",
        ],
      },
      {
        eyebrow: "DATA MODEL",
        heading: "Built on every call, not samples",
        body: "Lawrenn analytics are computed from 100% of your call data — not sampled, not estimated. Every number is precise and current.",
        bullets: [
          "Every call classified and counted",
          "Rolling 90-day window, updated live",
          "Day-of-week and hour-of-day breakdowns",
          "Caller outcome logged automatically by AI",
        ],
      },
    ],
    useCases: [
      { title: "Staffing decisions", desc: "Analytics show calls peak 9–11am and 3–5pm on Tuesdays and Thursdays. The firm adjusts its coverage schedule accordingly." },
      { title: "Marketing attribution", desc: "After launching a billboard campaign, a firm tracks week-over-week call volume to measure the campaign's direct impact." },
      { title: "Partner reporting", desc: "A managing partner uses the analytics dashboard to present monthly call volume, conversion rate, and ROI to the firm's partners." },
    ],
  },
};

// ── Product page ───────────────────────────────────────────────────────────
export default function ProductPage() {
  const params = useParams();
  const slug = params.slug as string;
  const product = PRODUCTS[slug];

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (!product) { notFound(); return null; }

  const { name, headline, subheadline, label, stats, intro, features, deep, useCases } = product;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #F5F5F0; overflow-x: hidden; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .cta-btn { transition: all 0.2s; }
        .cta-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .feature-card { transition: all 0.2s; }
        .feature-card:hover { border-color: rgba(0,0,0,0.2) !important; background: white !important; transform: translateY(-2px); }
        .use-case-card { transition: all 0.2s; }
        .use-case-card:hover { border-color: rgba(0,0,0,0.2) !important; transform: translateY(-2px); }
      `}</style>

      <MainNav />

      {/* ── Hero ── */}
      <section style={{ position: "relative", minHeight: "100vh", background: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 8%", paddingTop: 64, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />

        <div key={slug} style={{ position: "relative", maxWidth: 900, animation: "fadeIn 0.6s ease both" }}>
          <p style={{ fontFamily: "'DM Mono'", fontSize: "0.7rem", fontWeight: 500, color: "rgba(0,0,0,0.38)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "1.5rem", border: "1px solid rgba(0,0,0,0.1)", display: "inline-block", padding: "0.3rem 0.8rem", borderRadius: 4 }}>
            {label}
          </p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: "clamp(3rem, 7.5vw, 6.5rem)", lineHeight: 1.0, color: "#0D1117", letterSpacing: "0.04em", marginBottom: "1.75rem" }}>
            {headline}
          </h1>
          <p style={{ fontSize: "clamp(1rem, 2vw, 1.15rem)", color: "#6B7280", maxWidth: 580, lineHeight: 1.7, marginBottom: "2.75rem", fontWeight: 400 }}>
            {subheadline}
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a href="/demo" className="cta-btn" style={{ padding: "0.85rem 2rem", background: "#111", color: "white", borderRadius: 7, fontWeight: 700, fontSize: "0.9rem", fontFamily: "'DM Sans'", textDecoration: "none", display: "inline-block" }}>
              Book a demo
            </a>
            <a href="/#pricing" className="cta-btn" style={{ padding: "0.85rem 2rem", background: "transparent", border: "1px solid rgba(0,0,0,0.13)", color: "rgba(0,0,0,0.6)", borderRadius: 7, fontWeight: 600, fontSize: "0.9rem", fontFamily: "'DM Sans'", textDecoration: "none", display: "inline-block" }}>
              See pricing
            </a>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, borderTop: "1px solid rgba(0,0,0,0.08)", display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map((s, i) => (
            <div key={i} style={{ padding: "2rem 5%", borderRight: i < stats.length - 1 ? "1px solid rgba(0,0,0,0.08)" : "none" }}>
              <p style={{ fontFamily: "'Bebas Neue'", fontSize: "2.2rem", color: "#0D1117", letterSpacing: "0.03em", lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: "0.75rem", color: "rgba(0,0,0,0.38)", marginTop: "0.3rem", fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Intro ── */}
      <section style={{ background: "#F5F5F0", padding: "6rem 8%" }}>
        <Reveal>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <p style={{ fontFamily: "'DM Mono'", fontSize: "0.65rem", color: "rgba(0,0,0,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.25rem" }}>{name}</p>
            <p style={{ fontSize: "clamp(1.05rem, 2vw, 1.3rem)", color: "#374151", lineHeight: 1.8, fontWeight: 400 }}>{intro}</p>
          </div>
        </Reveal>
      </section>

      {/* ── Features grid ── */}
      <section style={{ background: "white", padding: "6rem 8%" }}>
        <Reveal>
          <p style={{ fontFamily: "'DM Mono'", fontSize: "0.65rem", color: "rgba(0,0,0,0.3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.75rem" }}>CAPABILITIES</p>
          <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3rem)", color: "#0D1117", letterSpacing: "0.03em", marginBottom: "3rem" }}>What it does</h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
          {features.map((f, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div className="feature-card" style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "1.75rem", background: "#FAFAF8" }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#EDEBE5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem", color: "#111111" }}>
                  {f.icon}
                </div>
                <h3 style={{ fontFamily: "'DM Sans'", fontSize: "0.975rem", fontWeight: 700, color: "#111", marginBottom: "0.6rem" }}>{f.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#6B7280", lineHeight: 1.65 }}>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Deep sections ── */}
      {deep.map((d, i) => (
        <section key={i} style={{ background: i % 2 === 0 ? "#0D1117" : "#F5F5F0", padding: "6rem 8%" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5rem", alignItems: "center" }}>
            <Reveal delay={0}>
              <p style={{ fontFamily: "'DM Mono'", fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1rem", color: i % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)" }}>{d.eyebrow}</p>
              <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 3.5vw, 2.8rem)", color: i % 2 === 0 ? "white" : "#0D1117", letterSpacing: "0.03em", lineHeight: 1.05, marginBottom: "1.5rem" }}>{d.heading}</h2>
              <p style={{ fontSize: "0.975rem", color: i % 2 === 0 ? "rgba(255,255,255,0.5)" : "#6B7280", lineHeight: 1.75 }}>{d.body}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {d.bullets.map((b, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem", padding: "1rem 1.25rem", background: i % 2 === 0 ? "rgba(255,255,255,0.04)" : "white", border: `1px solid ${i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`, borderRadius: 9 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: i % 2 === 0 ? "rgba(255,255,255,0.5)" : "#111111", flexShrink: 0, marginTop: "0.45rem" }} />
                    <p style={{ fontSize: "0.875rem", color: i % 2 === 0 ? "rgba(255,255,255,0.65)" : "#374151", lineHeight: 1.55, fontWeight: 500 }}>{b}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      {/* ── Use cases ── */}
      <section style={{ background: "white", padding: "6rem 8%" }}>
        <Reveal>
          <p style={{ fontFamily: "'DM Mono'", fontSize: "0.65rem", color: "rgba(0,0,0,0.3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.75rem" }}>USE CASES</p>
          <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3rem)", color: "#0D1117", letterSpacing: "0.03em", marginBottom: "3rem" }}>Real scenarios</h2>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {useCases.map((u, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div className="use-case-card" style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "1.75rem 2rem" }}>
                <div style={{ width: 28, height: 3, background: "#111111", borderRadius: 2, marginBottom: "1.25rem" }} />
                <h3 style={{ fontSize: "0.975rem", fontWeight: 700, color: "#111", marginBottom: "0.6rem" }}>{u.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "#6B7280", lineHeight: 1.65 }}>{u.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA banner ── */}
      <section style={{ background: "#0D1117", padding: "6rem 8%", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)", backgroundSize: "60px 60px", pointerEvents: "none" }} />
        <Reveal style={{ position: "relative" }}>
          <p style={{ fontFamily: "'DM Mono'", fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1.5rem" }}>GET STARTED</p>
          <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2.5rem, 5vw, 4rem)", color: "white", letterSpacing: "0.03em", marginBottom: "1.5rem" }}>
            Ready to see {name} in action?
          </h2>
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.45)", marginBottom: "2.5rem", maxWidth: 480, margin: "0 auto 2.5rem" }}>
            Book a live demo with the Lawrenn team. We'll walk you through the product and answer every question.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/demo" className="cta-btn" style={{ padding: "0.9rem 2.25rem", background: "white", color: "#111", borderRadius: 7, fontWeight: 700, fontSize: "0.9rem", fontFamily: "'DM Sans'", textDecoration: "none", display: "inline-block" }}>
              Book a demo
            </a>
            <a href="/#pricing" className="cta-btn" style={{ padding: "0.9rem 2.25rem", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderRadius: 7, fontWeight: 600, fontSize: "0.9rem", fontFamily: "'DM Sans'", textDecoration: "none", display: "inline-block" }}>
              View pricing
            </a>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "#0D1117", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "2rem 8%", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.05em", color: "white", textDecoration: "none" }}>
          LAW<span style={{ color: "rgba(255,255,255,0.25)" }}>RENN</span>
        </a>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[["/#how","How it works"],["/#pricing","Pricing"],["/#faq","FAQ"],["/demo","Book a demo"]].map(([href, label]) => (
            <a key={href} href={href} style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem", fontFamily: "'DM Sans'", textDecoration: "none" }}>{label}</a>
          ))}
        </div>
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)", fontFamily: "'DM Sans'" }}>© 2026 Lawrenn. All rights reserved.</p>
      </footer>
    </>
  );
}
