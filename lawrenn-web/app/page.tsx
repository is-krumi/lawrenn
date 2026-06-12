"use client";

import { PLAN_FEATURES } from "@/lib/plans";
import MainNav from "@/components/MainNav";

import { useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface FaqItem {
  q: string;
  a: string;
}

// ── Data ───────────────────────────────────────────────────────────────────
const faqs: FaqItem[] = [
  {
    q: "Is my client data secure and protected by privilege?",
    a: "Absolutely. All data is encrypted at rest and in transit using AES-256. We enter into standard Data Processing Agreements and are SOC 2 Type II certified. Lawrenn is designed with attorney-client privilege in mind — your data is never used to train our models.",
  },
  {
    q: "How does AI call answering work?",
    a: "Lawrenn connects to your firm's phone number and answers every incoming call 24/7 with a professional greeting. The AI engages the caller, captures key information about their matter, and generates a structured intake memo that's immediately available in your dashboard.",
  },
  {
    q: "What types of calls does Lawrenn handle?",
    a: "Lawrenn handles new matter inquiries, existing client check-ins, appointment requests, and general questions. For calls that require immediate attorney attention, the AI can flag them as urgent and send you an instant notification.",
  },
  {
    q: "Can I customize the intake questions?",
    a: "Yes. You can configure the questions Lawrenn asks based on practice area — personal injury, family law, estate planning, employment, and more. Firm and Enterprise plans include full custom question sets and intake flows.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Cancel from your billing settings at any time. Your account and all exported data remain accessible through the end of your billing period.",
  },
];

// ── Components ─────────────────────────────────────────────────────────────

function RevealSection({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(28px)", transition: "opacity 0.6s ease, transform 0.6s ease", ...style }}>
      {children}
    </div>
  );
}

function RoiCalc() {
  const [hours, setHours] = useState(8);
  const [rate, setRate] = useState(350);
  const [recovery, setRecovery] = useState(60);
  const annual = Math.round(hours * rate * (recovery / 100) * 52);

  return (
    <div style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--border)", borderRadius: 16, padding: "2rem" }}>
      <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "rgba(17,17,17,0.5)", marginBottom: "1.5rem" }}>Calculate your billable recovery</p>

      {[
        { label: "Unbilled hours per week", min: 1, max: 40, step: 1, val: hours, set: setHours, display: `${hours} hrs/week` },
        { label: "Average hourly rate", min: 150, max: 1500, step: 50, val: rate, set: setRate, display: `$${rate.toLocaleString()}/hr` },
        { label: "AI recovery rate", min: 20, max: 80, step: 5, val: recovery, set: setRecovery, display: `${recovery}%` },
      ].map(({ label, min, max, step, val, set, display }) => (
        <div key={label} style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.8rem", color: "rgba(17,17,17,0.45)", fontWeight: 500 }}>{label}</span>
            <strong style={{ fontSize: "0.95rem", color: "var(--navy)", fontFamily: "'Bebas Neue'", letterSpacing: "0.05em" }}>{display}</strong>
          </div>
          <input type="range" min={min} max={max} step={step} value={val}
            onChange={e => set(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#111111", height: 4 }} />
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3.5rem", color: "var(--navy)", letterSpacing: "0.02em", lineHeight: 1 }}>
          ${annual.toLocaleString()}
        </div>
        <p style={{ fontSize: "0.82rem", color: "rgba(17,17,17,0.35)", marginTop: "0.5rem" }}>estimated annual billable recovery</p>
      </div>
    </div>
  );
}

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ maxWidth: 720, margin: "3rem auto 0" }}>
      {faqs.map((f, i) => (
        <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setOpen(open === i ? null : i)}
            style={{ width: "100%", background: "none", border: "none", color: "var(--navy)", textAlign: "left", padding: "1.4rem 0", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", transition: "color 0.2s" }}>
            {f.q}
            <span style={{ width: 24, height: 24, border: `1px solid ${open === i ? "#111111" : "var(--border)"}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0, background: open === i ? "#111111" : "transparent", color: open === i ? "white" : "var(--navy)", transform: open === i ? "rotate(45deg)" : "none", transition: "all 0.3s" }}>+</span>
          </button>
          <div style={{ maxHeight: open === i ? 300 : 0, overflow: "hidden", transition: "max-height 0.4s ease" }}>
            <p style={{ paddingBottom: "1.4rem", fontSize: "0.9rem", color: "rgba(17,17,17,0.55)", lineHeight: 1.7 }}>{f.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--off-white)", border: "1px solid var(--border)", borderRadius: 16, padding: "2.5rem", maxWidth: 520, width: "90%", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: "none", color: "rgba(17,17,17,0.4)", cursor: "pointer", fontSize: "1.25rem" }}>✕</button>
        <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.03em", marginBottom: "0.5rem" }}>{title}</h3>
        <p style={{ color: "rgba(17,17,17,0.5)", fontSize: "0.9rem", marginBottom: "1.75rem", lineHeight: 1.6 }}>{sub}</p>
        {children}
      </div>
    </div>
  );
}

function FormInput({ label, type = "text", placeholder, onChange, error }: { label: string; type?: string; placeholder: string; onChange?: (v: string) => void; error?: string }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(17,17,17,0.55)", marginBottom: "0.4rem" }}>{label}</label>
      <input type={type} placeholder={placeholder}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        style={{ width: "100%", background: "rgba(0,0,0,0.04)", border: `1px solid ${error ? "#EF4444" : "var(--border)"}`, borderRadius: 8, padding: "0.75rem 1rem", color: "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none" }}
        onFocus={e => e.currentTarget.style.borderColor = error ? "#EF4444" : "rgba(0,0,0,0.3)"}
        onBlur={e => e.currentTarget.style.borderColor = error ? "#EF4444" : "var(--border)"} />
      {error && <p style={{ fontSize: "0.75rem", color: "#EF4444", margin: "0.25rem 0 0" }}>{error}</p>}
    </div>
  );
}

function FormSelect({ label, options, onChange }: { label: string; options: string[]; onChange?: (v: string) => void }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(17,17,17,0.55)", marginBottom: "0.4rem" }}>{label}</label>
      <select onChange={onChange ? e => onChange(e.target.value) : undefined} style={{ width: "100%", background: "var(--off-white)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem 1rem", color: "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none" }}>
        <option value="">Select...</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SubmitBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", marginTop: "0.5rem", padding: "0.9rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "#000000"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#111111"; e.currentTarget.style.transform = ""; }}>
      {label}
    </button>
  );
}

function SuccessMsg({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>{icon}</div>
      <h4 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", marginBottom: "0.5rem" }}>{title}</h4>
      <p style={{ color: "rgba(17,17,17,0.5)", fontSize: "0.9rem" }}>{body}</p>
    </div>
  );
}

function InteractiveHeroGrid({ containerRef, gridSize }: { containerRef: React.RefObject<HTMLElement | null>; gridSize: number }) {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [activeNeighbors, setActiveNeighbors] = useState<Set<number>>(new Set());
  const NEIGHBOR_OFFSETS = [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  ];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        setHoveredCell(null);
        return;
      }

      const nextCell = {
        x: Math.floor(x / gridSize) * gridSize,
        y: Math.floor(y / gridSize) * gridSize,
      };

      setHoveredCell((prev) => {
        if (prev && prev.x === nextCell.x && prev.y === nextCell.y) return prev;
        return nextCell;
      });
    };

    const handleMouseLeave = () => setHoveredCell(null);

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [containerRef, gridSize]);

  useEffect(() => {
    if (!hoveredCell) {
      setActiveNeighbors(new Set());
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleFlicker = (idx: number) => {
      const onDelay = 600 + Math.random() * 2000;
      const offDelay = onDelay + 800 + Math.random() * 1200;

      timers.push(setTimeout(() => {
        setActiveNeighbors((prev) => {
          const s = new Set(prev);
          s.add(idx);
          return s;
        });
      }, onDelay));

      timers.push(setTimeout(() => {
        setActiveNeighbors((prev) => {
          const s = new Set(prev);
          s.delete(idx);
          return s;
        });
        scheduleFlicker(idx);
      }, offDelay));
    };

    NEIGHBOR_OFFSETS.forEach((_, i) => scheduleFlicker(i));

    return () => timers.forEach(clearTimeout);
  }, [hoveredCell]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 45%, transparent 100%)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: `${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`,
          backgroundPosition: "-1px -1px, -1px -1px",
        }}
      />

      {hoveredCell && (
        <div
          style={{
            position: "absolute",
            left: hoveredCell.x,
            top: hoveredCell.y,
            width: gridSize,
            height: gridSize,
            transition: "left 90ms linear, top 90ms linear",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.07)",
            }}
          />

          {NEIGHBOR_OFFSETS.map((cell, i) => (
            <div
              key={`${cell.x}-${cell.y}`}
              style={{
                position: "absolute",
                left: cell.x * gridSize,
                top: cell.y * gridSize,
                width: gridSize,
                height: gridSize,
                background: "rgba(0,0,0,0.04)",
                opacity: activeNeighbors.has(i) ? 1 : 0,
                transition: "opacity 0.7s ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── LiveFeed ───────────────────────────────────────────────────────────────
const FEED_ITEMS = [
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
    color: "rgba(16,185,129,0.1)", title: "New intake — Marcus J. Chen (Personal Injury)", sub: "Call answered · Intake memo generated · Matter opened",
    badge: "Intake", bc: "#10b981", bbg: "rgba(16,185,129,0.1)",
    detail: "Lawrenn answered the call at 11:42 PM, captured the key facts of the accident, ran a conflict check, and opened a new matter — all before the attorney woke up.",
    ago: "2 min ago",
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    color: "rgba(0,0,0,0.05)", title: "Follow-up sent — Rebecca Johnson (Employment)", sub: "AI-drafted SMS · Approved in one click · Delivered",
    badge: "Sent", bc: "#374151", bbg: "rgba(0,0,0,0.06)",
    detail: "After the intake call, Lawrenn drafted a personalized follow-up SMS referencing the caller's situation. The attorney approved it in under 10 seconds.",
    ago: "9 min ago",
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>,
    color: "rgba(245,158,11,0.1)", title: "Matter opened — Estate of P. Williams", sub: "Intake complete · Conflicts cleared · Engagement letter ready",
    badge: "Active", bc: "#f59e0b", bbg: "rgba(245,158,11,0.1)",
    detail: "New client intake completed, conflict check passed, and engagement letter drafted — all automatically. Attorney just needs to review and send.",
    ago: "31 min ago",
  },
  {
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
    color: "rgba(99,102,241,0.1)", title: "Call summary ready — Smith Holdings LLC", sub: "3:42 call · AI summary + intake memo generated",
    badge: "Summary", bc: "#818cf8", bbg: "rgba(99,102,241,0.1)",
    detail: "Full call transcript, AI-generated summary, key facts, and recommended next steps delivered to the attorney's dashboard within 60 seconds of the call ending.",
    ago: "44 min ago",
  },
];

function LiveFeed() {
  const [active, setActive] = useState(0);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive(prev => (prev + 1) % FEED_ITEMS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let start = 0;
    const target = 4200;
    const step = Math.ceil(target / 60);
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setRevenue(start);
      if (start >= target) clearInterval(timer);
    }, 24);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: "1.75rem", position: "relative", overflow: "hidden", boxShadow: "0 4px 32px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 0 3px rgba(16,185,129,0.2)", display: "inline-block", animation: "pulse 2s infinite" }} />
        <p style={{ fontFamily: "'DM Mono'", fontSize: "0.7rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Live activity feed</p>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {FEED_ITEMS.map(({ icon, color, title, sub, badge, bc, bbg, detail, ago }, i) => {
          const isActive = active === i;
          return (
            <div
              key={i}
              onClick={() => setActive(i)}
              style={{
                padding: "0.85rem 1rem",
                background: isActive ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.015)",
                border: `1px solid ${isActive ? "rgba(0,0,0,0.18)" : "var(--border)"}`,
                borderRadius: 10,
                cursor: "pointer",
                transition: "all 0.25s",
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(0,0,0,0.025)"; e.currentTarget.style.borderColor = "rgba(0,0,0,0.12)"; } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "rgba(0,0,0,0.015)"; e.currentTarget.style.borderColor = "var(--border)"; } }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.845rem", display: "block", marginBottom: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
                  <span style={{ fontSize: "0.73rem", color: "rgba(17,17,17,0.4)" }}>{sub}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 600, padding: "0.2rem 0.55rem", borderRadius: 100, background: bbg, color: bc, whiteSpace: "nowrap" }}>{badge}</span>
                  <span style={{ fontSize: "0.65rem", color: "rgba(17,17,17,0.3)" }}>{ago}</span>
                </div>
              </div>
              {isActive && (
                <div style={{ marginTop: "0.7rem", paddingTop: "0.7rem", borderTop: "1px solid rgba(0,0,0,0.08)", fontSize: "0.78rem", color: "rgba(17,17,17,0.55)", lineHeight: 1.6 }}>
                  {detail}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.78rem", color: "rgba(17,17,17,0.35)" }}>Potential new matters captured this week</span>
        <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", color: "var(--navy)", letterSpacing: "0.05em" }}>{revenue.toLocaleString()}</span>
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: "0.45rem", marginTop: "1rem" }}>
        {FEED_ITEMS.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ width: active === i ? 20 : 6, height: 6, borderRadius: 3, background: active === i ? "#111111" : "rgba(17,17,17,0.12)", border: "none", cursor: "pointer", transition: "all 0.25s", padding: 0 }} />
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  const [showTrial, setShowTrial] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [trialDone, setTrialDone]             = useState(false);
  const [trialFirstName, setTrialFirstName]   = useState("");
  const [trialLastName,  setTrialLastName]    = useState("");
  const [trialEmail,     setTrialEmail]       = useState("");
  const [trialBiz,       setTrialBiz]         = useState("");
  const [trialPhone,     setTrialPhone]       = useState("");
  const [trialBizType,   setTrialBizType]     = useState("");
  const [trialErrors,    setTrialErrors]      = useState<Record<string, string>>({});

  function validateTrial() {
    const errs: Record<string, string> = {};
    if (!trialFirstName.trim()) errs.firstName = "Required";
    if (!trialEmail.trim())     errs.email     = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trialEmail.trim())) errs.email = "Enter a valid email";
    if (!trialBiz.trim())       errs.biz       = "Required";
    if (!trialPhone.trim())     errs.phone     = "Required";
    else if (!/^[\d\s\+\-\(\)]{7,}$/.test(trialPhone.trim())) errs.phone = "Enter a valid phone number";
    setTrialErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitTrial() {
    if (!validateTrial()) return;
    setTrialDone(true);
    const name = [trialFirstName, trialLastName].filter(Boolean).join(" ") || undefined;
    fetch("/api/capture-trial-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email:         trialEmail || undefined,
        phone:         trialPhone || undefined,
        business_name: trialBiz   || undefined,
        business_type: trialBizType || undefined,
        source:        "marketing_site",
      }),
    })
      .then(async r => {
        const text = await r.text();
        if (!r.ok) console.error(`capture-trial-signup HTTP ${r.status}:`, text);
        else { try { const d = JSON.parse(text); if (d.error) console.error("capture-trial-signup error:", d.error); } catch {} }
      })
      .catch(err => console.error("capture-trial-signup fetch failed:", err));
    fetch("/api/notify-new-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: trialBiz   || "(not provided)",
        owner_email:   trialEmail || "(not provided)",
        plan: "Pro",
      }),
    }).catch(() => {});
  }
  const [demoDone, setDemoDone] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const HERO_GRID_SIZE = 112;

  const SL = ({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) => (
    <RevealSection style={{ transitionDelay: `${delay}s`, ...style }}>{children}</RevealSection>
  );

  const sectionLabel = (text: string, center = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: center ? "center" : "flex-start", marginBottom: "1rem" }}>
      {!center && <div style={{ width: 24, height: 1, background: "#111111" }} />}
      <span style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(17,17,17,0.5)" }}>{text}</span>
    </div>
  );

  const sectionTitle = (lines: string[]) => (
    <div style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2.5rem, 5vw, 4rem)", letterSpacing: "0.02em", lineHeight: 1, marginBottom: "1.25rem" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: "var(--navy)" }}>{l}</div>
      ))}
    </div>
  );

  return (
    <>
      <MainNav />

      {/* ── HERO ── */}
      <section
        ref={heroRef}
        className="lp-hero"
        style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", background: "var(--off-white)" }}
      >
        {/* Grid background */}
        <InteractiveHeroGrid containerRef={heroRef} gridSize={HERO_GRID_SIZE} />

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 100, padding: "0.4rem 1rem", fontSize: "0.78rem", fontWeight: 600, color: "rgba(17,17,17,0.65)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.5rem", width: "fit-content" }}>
          <span style={{ width: 6, height: 6, background: "#111111", borderRadius: "50%" }} />
          The AI platform built for law.
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }`}</style>

        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(3.5rem, 9vw, 7.5rem)", lineHeight: 0.95, letterSpacing: "0.02em", marginBottom: "1.5rem", maxWidth: 900, color: "#0A0A0A" }}>
          THE AI PLATFORM<br />
          BUILT FOR<br />
          LAW.
        </h1>

        <p style={{ fontSize: "1.15rem", color: "rgba(17,17,17,0.55)", maxWidth: 540, lineHeight: 1.7, marginBottom: "2.5rem", fontWeight: 400 }}>
          Lawrenn answers your calls 24/7, captures every client intake, and keeps your communications organized — so you never miss a potential client and can focus on practicing law.
        </p>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "3.5rem" }}>
          <button onClick={() => setShowTrial(true)} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#000000"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#111111"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            Request early access →
          </button>
          <a href="/demo" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "transparent", border: "1.5px solid rgba(17,17,17,0.2)", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(17,17,17,0.5)"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(17,17,17,0.04)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(17,17,17,0.2)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}>
            See how it works
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", color: "rgba(17,17,17,0.35)", fontSize: "0.85rem", flexWrap: "wrap" }}>
          {["SOC 2 Type II compliant", "Attorney-client privilege protected", "No credit card required"].map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: "#374151" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <div className="lp-stats" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "2.5rem 5%", background: "white", gap: "2rem" }}>
        {[
          { num: "42%", label: "of inbound calls to law firms go unanswered — every one is a potential lost matter" },
          { num: "24/7", label: "availability for every call — Lawrenn answers nights, weekends, and holidays" },
          { num: "3 min", label: "average time for Lawrenn to complete a full structured client intake" },
          { num: "8x", label: "average ROI in the first 30 days — one new matter covers months of cost" },
        ].map(({ num, label }, i) => (
          <SL key={i} delay={i * 0.1} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3rem", letterSpacing: "0.02em", color: "var(--navy)", lineHeight: 1, marginBottom: "0.4rem" }}>
              {num}
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(17,17,17,0.45)", fontWeight: 500, lineHeight: 1.4 }}>{label}</div>
          </SL>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: "6rem 5%", background: "var(--off-white)" }}>
        <SL>{sectionLabel("How it works")}</SL>
        <SL>{sectionTitle(["SET UP IN MINUTES.", "NEVER MISS A CLIENT AGAIN."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(17,17,17,0.5)", maxWidth: 520, lineHeight: 1.7, marginBottom: "4rem" }}>Route your calls through Lawrenn and every inquiry is captured, qualified, and ready for your review — around the clock.</p></SL>

        <div className="lp-how">
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[
              { n: "01", t: "Connect your phone number", d: "Route your firm's calls through Lawrenn in under 5 minutes. No hardware, no IT team required." },
              { n: "02", t: "AI answers, qualifies, and captures", d: "Every caller gets a professional response. Lawrenn gathers the key facts and creates a structured intake memo." },
              { n: "03", t: "Review intakes and reply to clients", d: "See new intake memos instantly. Respond to clients by SMS with AI-drafted messages — approved in one click." },
              { n: "04", t: "Track every client interaction", d: "Every call, message, and follow-up is logged automatically so nothing falls through the cracks." },
            ].map(({ n, t, d }, i) => (
              <SL key={i} delay={i * 0.1}>
                <div style={{
                  display: "flex", gap: "1.25rem", alignItems: "flex-start",
                  padding: "1.25rem 1.5rem",
                  background: "white",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{
                    minWidth: 40, height: 40,
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'Bebas Neue'", fontSize: "1rem", color: "var(--navy)", letterSpacing: "0.05em",
                  }}>{n}</div>
                  <div>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.3rem", color: "var(--navy)" }}>{t}</h3>
                    <p style={{ fontSize: "0.85rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.65, margin: 0 }}>{d}</p>
                  </div>
                </div>
              </SL>
            ))}
          </div>

          <SL>
            <LiveFeed />
          </SL>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "6rem 5%", background: "white" }}>
        <SL>{sectionLabel("Features")}</SL>
        <SL>{sectionTitle(["EVERYTHING YOUR", "PRACTICE NEEDS."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(17,17,17,0.5)", maxWidth: 520, lineHeight: 1.7, marginBottom: "4rem" }}>Built for law firms, not generic businesses. Every feature is designed around how attorneys actually work.</p></SL>

        <div className="lp-features">
          {[
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
              title: "AI Call Answering", body: "Never miss a potential client. Lawrenn answers every call 24/7 with a professional greeting, handles common questions, and captures caller information.", tag: "24/7 availability"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>,
              title: "Automated Client Intake", body: "Every call describing a legal matter generates a structured intake memo — issue summary, key facts, urgency level, and recommended next steps.", tag: "Intake in 3 minutes"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
              title: "Client Communication", body: "Reply to clients by SMS from your dashboard. Lawrenn drafts follow-up messages based on call context so you can respond thoughtfully in seconds.", tag: "Smart messaging"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
              title: "Matter Management", body: "Every intake, call, and message is organized by client. Track the full history of every matter from first contact so nothing ever falls through the cracks.", tag: "Full client history"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
              title: "Practice Intelligence", body: "Ask questions about your practice in plain English — how many calls this week, which clients haven't heard back, most common matter types, and more.", tag: "Ask your data"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
              title: "AI-Drafted Follow-Ups", body: "After every intake call, Lawrenn drafts a professional client follow-up email — personalized, on-point, and ready to send with one click.", tag: "Follow-up in one click"
            },
          ].map(({ icon, title, body, tag }, i) => (
            <SL key={i} delay={(i % 3) * 0.1}>
              <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem", height: "100%", transition: "all 0.3s", cursor: "default" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.07)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                <div style={{ width: 44, height: 44, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>{icon}</div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>{title}</h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.65, marginBottom: "1rem" }}>{body}</p>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "rgba(17,17,17,0.6)", fontFamily: "'DM Mono'", letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag}</span>
              </div>
            </SL>
          ))}
        </div>
      </section>

      {/* ── ROI ── */}
      <section id="roi" style={{ padding: "6rem 5%", background: "var(--off-white)" }}>
        <div className="lp-roi">
          <SL>
            {sectionLabel("ROI Calculator")}
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3.2rem)", letterSpacing: "0.02em", lineHeight: 1.05, marginBottom: "1.25rem" }}>
              HOW MANY CLIENTS<br />ARE YOU MISSING<br />RIGHT NOW?
            </div>
            <p style={{ color: "rgba(17,17,17,0.5)", lineHeight: 1.7, marginBottom: "1.5rem", fontSize: "0.95rem" }}>
              The average law firm misses 42% of inbound calls. Each missed call is a potential matter worth thousands. Lawrenn answers every call, captures every intake, and converts inquiries into clients.
            </p>
            {["Lawrenn answers every call 24/7 — even nights and weekends", "Most firms see new matter volume increase 20–30% within 30 days", "One new matter per month more than covers the annual cost"].map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.9rem", color: "rgba(17,17,17,0.65)", marginBottom: "0.75rem" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg> {b}
              </div>
            ))}
          </SL>
          <SL delay={0.2}><RoiCalc /></SL>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "6rem 5%", textAlign: "center", background: "white" }}>
        <SL>{sectionLabel("Pricing", true)}</SL>
        <SL>{sectionTitle(["SIMPLE PRICING.", "SERIOUS RESULTS."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(17,17,17,0.5)", maxWidth: 480, margin: "0 auto 4rem" }}>No setup fees. No contracts. Cancel anytime. 14-day free trial on all plans.</p></SL>

        <div className="lp-pricing">
          {[
            { tier: "Solo", price: PLAN_FEATURES.starter.price, desc: "AI call answering and client intake for solo practitioners. Never miss a potential client again.", features: [`Up to ${PLAN_FEATURES.starter.monthlyCallCap} AI-answered calls/mo`, "Full client intake automation", "Intake memo generation", "SMS client messaging", "Basic matter management", `${PLAN_FEATURES.starter.maxTeamMembers} team member`, "Call recordings & transcripts", "24/7 availability"], featured: false },
            { tier: "Firm", price: PLAN_FEATURES.pro.price, desc: "The full Lawrenn suite for growing practices. Automate intake, manage communications, and grow without adding overhead.", features: [`Up to ${PLAN_FEATURES.pro.monthlyCallCap} AI-answered calls/mo`, "Everything in Solo", "AI-drafted client follow-ups", "Practice Intelligence (ask your data)", "Advanced call analytics", `Up to ${PLAN_FEATURES.pro.maxTeamMembers} team members`, "Custom intake questions", "Priority SMS response drafting"], featured: true },
            { tier: "Enterprise", price: PLAN_FEATURES.growth.price, desc: "Firm-wide AI client management for practices that need maximum capacity, deep insights, and scalable deployment.", features: [`Up to ${PLAN_FEATURES.growth.monthlyCallCap} AI-answered calls/mo`, "Everything in Firm", "Unlimited team members", "Multi-location support", "Advanced reporting & analytics", "Custom AI voice & persona", "Priority support", "API access", "Early feature access"], featured: false },
          ].map(({ tier, price, desc, features, featured }, i) => (
            <SL key={i} delay={i * 0.1}>
              <div style={{ background: featured ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.02)", border: `1px solid ${featured ? "rgba(0,0,0,0.2)" : "var(--border)"}`, borderRadius: 16, padding: "2rem", position: "relative", transform: featured ? "scale(1.03)" : "none", height: "100%" }}>
                {featured && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#111111", color: "white", fontSize: "0.72rem", fontWeight: 700, padding: "0.25rem 0.9rem", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Most popular</div>}
                <div style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.5)", marginBottom: "0.75rem" }}>{tier}</div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3.5rem", letterSpacing: "0.02em", lineHeight: 1, marginBottom: "0.25rem" }}>
                  <sup style={{ fontSize: "1.5rem", fontFamily: "'DM Sans'", fontWeight: 600, verticalAlign: "top", marginTop: "0.5rem", display: "inline-block" }}>$</sup>{price}
                </div>
                <div style={{ fontSize: "0.85rem", color: "rgba(17,17,17,0.4)", marginBottom: "1.5rem" }}>per month</div>
                <p style={{ fontSize: "0.875rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.6, marginBottom: "1.75rem", paddingBottom: "1.75rem", borderBottom: "1px solid var(--border)" }}>{desc}</p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.7rem", marginBottom: "2rem" }}>
                  {features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", fontSize: "0.875rem", color: "rgba(17,17,17,0.7)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12" /></svg> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setShowTrial(true)} style={{ width: "100%", padding: "0.85rem", background: featured ? "#111111" : "transparent", border: `1.5px solid ${featured ? "#111111" : "rgba(17,17,17,0.2)"}`, borderRadius: 8, color: featured ? "white" : "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = ""; }}>
                  Start free trial
                </button>
              </div>
            </SL>
          ))}
        </div>
        <SL><p style={{ textAlign: "center", marginTop: "2rem", fontSize: "0.85rem", color: "rgba(17,17,17,0.3)" }}>All plans include a 14-day free trial. No credit card required to start.</p></SL>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: "6rem 5%", background: "var(--off-white)" }}>
        <SL>{sectionLabel("Social proof")}</SL>
        <SL>{sectionTitle(["ATTORNEYS WHO", "NEVER MISS A CALL."])}</SL>

        <div className="lp-testimonials">
          {[
            { text: "We used to miss calls constantly — potential clients would call once and never call back. Lawrenn catches every call and sends an intake memo to my phone instantly. We haven't missed a lead in 3 months.", name: "Sarah T.", role: "Solo Practitioner · Personal Injury" },
            { text: "The intake memos Lawrenn generates are genuinely impressive. By the time I call the client back, I already know the key facts of their situation. It saves 20 minutes per intake call.", name: "Marcus W.", role: "Immigration Attorney" },
            { text: "Client follow-ups used to fall through the cracks. Now Lawrenn drafts the follow-up after every call and I approve it with one click. My response time went from days to hours.", name: "Diana C.", role: "Managing Partner · Family Law" },
          ].map(({ text, name, role }, i) => (
            <SL key={i} delay={i * 0.1}>
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
                <div style={{ display: "flex", gap: "0.2rem", marginBottom: "1rem" }}>
                  {Array.from({ length: 5 }).map((_, s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="#111111" stroke="#111111" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  ))}
                </div>
                <p style={{ fontSize: "0.95rem", color: "rgba(17,17,17,0.75)", lineHeight: 1.7, marginBottom: "1.25rem", fontStyle: "italic" }}>&ldquo;{text}&rdquo;</p>
                <strong style={{ fontSize: "0.9rem", display: "block" }}>{name}</strong>
                <span style={{ fontSize: "0.8rem", color: "rgba(17,17,17,0.4)" }}>{role}</span>
              </div>
            </SL>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "6rem 5%", background: "white" }}>
        <div style={{ textAlign: "center" }}>
          <SL>{sectionLabel("FAQ", true)}</SL>
          <SL>{sectionTitle(["COMMON QUESTIONS."])}</SL>
        </div>
        <FaqAccordion />
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "6rem 5%", textAlign: "center", background: "var(--off-white)" }}>
        <SL>
          <div style={{ maxWidth: 640, margin: "0 auto", background: "white", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20, padding: "3.5rem", position: "relative", overflow: "hidden" }}>
            <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "0.02em", marginBottom: "1rem" }}>
              STOP MISSING<br />POTENTIAL CLIENTS.
            </h2>
            <p style={{ color: "rgba(17,17,17,0.5)", fontSize: "1rem", lineHeight: 1.7, marginBottom: "2rem", maxWidth: 440, margin: "0 auto 2rem" }}>
              Get set up in under 15 minutes. Lawrenn starts answering calls and capturing intakes the same day. No credit card required.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setShowTrial(true)} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#000000"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#111111"; e.currentTarget.style.transform = ""; }}>
                Start free trial — 14 days free
              </button>
              <a href="/demo" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "transparent", border: "1.5px solid rgba(17,17,17,0.2)", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(17,17,17,0.5)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(17,17,17,0.2)"; }}>
                Book a live demo
              </a>
            </div>
            <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "rgba(17,17,17,0.3)" }}>Questions? Email us at hello@lawrenn.com</p>
          </div>
        </SL>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={{ borderTop: "1px solid var(--border)", padding: "3rem 5%", background: "white" }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "rgba(17,17,17,0.35)", maxWidth: 260, lineHeight: 1.6 }}>AI client intake and communication for law firms.</p>
        </div>

        <div className="lp-footer-links">
          {[
            { title: "Product", links: [["#how", "How it works"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]] },
            { title: "Company", links: [["#", "About"], ["#", "Blog"], ["mailto:hello@lawrenn.com", "Contact"]] },
            { title: "Legal", links: [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]] },].map(({ title, links }) => (
              <div key={title}>
                <h4 style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(17,17,17,0.35)", marginBottom: "1rem" }}>{title}</h4>
                {links.map(([href, label]) => (
                  <a key={label} href={href} style={{ display: "block", color: "rgba(17,17,17,0.5)", textDecoration: "none", fontSize: "0.875rem", marginBottom: "0.6rem", transition: "color 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--navy)"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(17,17,17,0.5)"}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
        </div>
      </footer>

      <div className="lp-bottom-bar" style={{ borderTop: "1px solid var(--border)", padding: "1.25rem 5%", fontSize: "0.8rem", color: "rgba(17,17,17,0.25)", background: "white" }}>
        <span>© 2026 Lawrenn. All rights reserved.</span>
        <span>Built for legal professionals.</span>
      </div>

      {/* ── TRIAL MODAL ── */}
      {showTrial && (
        <Modal title="REQUEST EARLY ACCESS" sub="Join leading law firms already using Lawrenn to draft faster and bill more. 14-day free trial — no credit card required." onClose={() => { setShowTrial(false); setTrialDone(false); setTrialFirstName(""); setTrialLastName(""); setTrialEmail(""); setTrialBiz(""); setTrialPhone(""); setTrialBizType(""); setTrialErrors({}); }}>
          {!trialDone ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <FormInput label="First name *" placeholder="Alexandra" onChange={v => { setTrialFirstName(v); setTrialErrors(e => ({ ...e, firstName: "" })); }} error={trialErrors.firstName} />
                <FormInput label="Last name" placeholder="Rivera" onChange={setTrialLastName} />
              </div>
              <FormInput label="Work email *" type="email" placeholder="partner@yourfirm.com" onChange={v => { setTrialEmail(v); setTrialErrors(e => ({ ...e, email: "" })); }} error={trialErrors.email} />
              <FormInput label="Firm name *" placeholder="Smith & Associates LLP" onChange={v => { setTrialBiz(v); setTrialErrors(e => ({ ...e, biz: "" })); }} error={trialErrors.biz} />
              <FormInput label="Work phone *" type="tel" placeholder="+1 (212) 555-0100" onChange={v => { setTrialPhone(v); setTrialErrors(e => ({ ...e, phone: "" })); }} error={trialErrors.phone} />
              <FormSelect label="Practice area" options={["Corporate / M&A", "Litigation", "Real Estate", "Employment", "Criminal Defense", "Family Law", "IP / Patent", "Bankruptcy", "In-House Legal", "Other"]} onChange={setTrialBizType} />
              <SubmitBtn label="Request access →" onClick={submitTrial} />
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: "rgba(17,17,17,0.3)", marginTop: "0.75rem" }}>No credit card required · Cancel anytime</p>
            </>
          ) : (
            <SuccessMsg icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} title="YOU'RE IN!" body="We'll reach out within 24 hours to get you set up. Check your email for next steps." />
          )}
        </Modal>
      )}

      {/* ── DEMO MODAL ── */}
      {showDemo && (
        <Modal title="BOOK A LIVE DEMO" sub="We'll walk you through a live Lawrenn session and answer every question. 30 minutes." onClose={() => { setShowDemo(false); setDemoDone(false); }}>
          {!demoDone ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <FormInput label="First name" placeholder="Alexandra" />
                <FormInput label="Last name" placeholder="Rivera" />
              </div>
              <FormInput label="Work email" type="email" placeholder="partner@yourfirm.com" />
              <FormInput label="Work phone" type="tel" placeholder="+1 (212) 555-0100" />
              <FormSelect label="Preferred time" options={["This week — morning (9am–12pm)", "This week — afternoon (1pm–5pm)", "Next week — morning (9am–12pm)", "Next week — afternoon (1pm–5pm)"]} />
              <SubmitBtn label="Book my demo →" onClick={() => setDemoDone(true)} />
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: "rgba(17,17,17,0.3)", marginTop: "0.75rem" }}>We&apos;ll confirm within 2 hours</p>
            </>
          ) : (
            <SuccessMsg icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>} title="DEMO BOOKED!" body="We'll confirm your time within 2 hours. Check your email for the calendar invite." />
          )}
        </Modal>
      )}
    </>
  );
}
