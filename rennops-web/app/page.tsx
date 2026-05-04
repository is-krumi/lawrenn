"use client";

import { useState, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface FaqItem {
  q: string;
  a: string;
}

// ── Data ───────────────────────────────────────────────────────────────────
const faqs: FaqItem[] = [
  {
    q: "Do I have to change my phone number?",
    a: "No. You keep your existing phone number and carrier. You simply set up call forwarding from your number to your RennOps number — a 5-minute process we walk you through step by step.",
  },
  {
    q: "What happens if the AI can't handle the call?",
    a: "If a caller says 'talk to a person' at any point, the AI transfers the call to your phone immediately. For urgent situations the AI automatically escalates and dials your phone while keeping the customer on the line.",
  },
  {
    q: "Will the AI sound robotic to my customers?",
    a: "No. RennOps uses enterprise-grade conversational AI trained specifically for natural phone conversations. It handles interruptions, background noise, and natural pauses the way a real receptionist would.",
  },
  {
    q: "How does the quote follow-up work?",
    a: "When you send a quote, RennOps automatically sends a 4-touch follow-up sequence: SMS at 24hrs, email at 72hrs, SMS at 7 days, and an owner alert at 14 days. The moment the customer responds the sequence stops immediately.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No contracts, no cancellation fees. Cancel anytime from your billing settings. Your account stays active through the end of your current billing period.",
  },
];

// ── Components ─────────────────────────────────────────────────────────────
const NAV_PRODUCTS = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    ),
    name: "AI Receptionist", desc: "Answer every call, book every job", href: "#how",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    name: "Live Dispatch", desc: "Real-time scheduling and job management", href: "#features",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    name: "Outbound Sequences", desc: "Automated quote follow-up that closes", href: "#features",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    name: "Review Engine", desc: "Turn completed jobs into 5-star reviews", href: "#features",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
    name: "Smart Messaging", desc: "AI-powered two-way SMS", href: "#features",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    name: "Call Intelligence", desc: "Transcripts, insights, and AI summaries", href: "#features",
  },
];

function Nav({ onTrial }: { onDemo?: () => void; onTrial: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const productsRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setProductsOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 5%", height: 64,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(248,250,251,0.95)" : "rgba(248,250,251,0.82)",
      backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${scrolled ? "rgba(13,27,42,0.1)" : "var(--border)"}`,
      transition: "all 0.3s",
    }}>
      <a href="#" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.05em", color: "var(--navy)", textDecoration: "none" }}>
        RENN<span style={{ color: "var(--cyan)" }}>OPS</span>
      </a>

      <ul style={{ display: "flex", alignItems: "center", gap: "2rem", listStyle: "none" }}>
        {/* Products dropdown */}
        <li ref={productsRef} style={{ position: "relative" }}>
          <button
            onClick={() => setProductsOpen(o => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", color: "rgba(13,27,42,0.65)", fontSize: "0.9rem", fontWeight: 500, fontFamily: "'DM Sans'", padding: 0, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--navy)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(13,27,42,0.65)")}
          >
            Products
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5, transform: productsOpen ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>

          {productsOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)",
              background: "#F9FAFB", border: "1px solid rgba(13,27,42,0.09)", borderRadius: 12,
              boxShadow: "0 8px 32px rgba(13,27,42,0.12)", padding: "0.4rem",
              minWidth: 560, zIndex: 200,
              display: "grid", gridTemplateColumns: "1fr 1fr",
            }}>
              {NAV_PRODUCTS.map(({ icon, name, desc, href }) => (
                <a key={name} href={href} onClick={() => setProductsOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.75rem", borderRadius: 8, textDecoration: "none", transition: "background 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; (e.currentTarget.firstElementChild as HTMLElement).style.background = "rgba(12,192,223,0.45)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; (e.currentTarget.firstElementChild as HTMLElement).style.background = "#E5E7EB"; }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                    {icon}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.1rem" }}>{name}</p>
                    <p style={{ fontSize: "0.75rem", color: "#6B7280" }}>{desc}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </li>

        {[["#how", "How it works"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label]) => (
          <li key={href}>
            <a href={href} style={{ color: "rgba(13,27,42,0.65)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--navy)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(13,27,42,0.65)")}>
              {label}
            </a>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <a href="/demo" style={{ padding: "0.55rem 1.2rem", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, color: "rgba(13,27,42,0.75)", fontSize: "0.875rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none", display: "inline-block" }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(13,27,42,0.06)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--navy)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(13,27,42,0.75)"; }}>
          Book a demo
        </a>
        <a href="/login" style={{ padding: "0.55rem 1.2rem", background: "var(--cyan)", border: "none", borderRadius: 6, color: "var(--navy)", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}>
          Log in
        </a>
      </div>
    </nav>
  );
}

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
  const [missed, setMissed] = useState(3);
  const [value, setValue] = useState(800);
  const [rate, setRate] = useState(55);
  const annual = Math.round(missed * value * (rate / 100) * 365);

  return (
    <div style={{ background: "rgba(13,27,42,0.04)", border: "1px solid var(--border)", borderRadius: 16, padding: "2rem" }}>
      <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "rgba(13,27,42,0.6)", marginBottom: "1.5rem" }}>Calculate your revenue opportunity</p>

      {[
        { label: "Missed calls per day", min: 1, max: 10, step: 1, val: missed, set: setMissed, display: `${missed} calls/day` },
        { label: "Average job value", min: 200, max: 3000, step: 100, val: value, set: setValue, display: `$${value.toLocaleString()}` },
        { label: "Call-to-booking rate", min: 20, max: 80, step: 5, val: rate, set: setRate, display: `${rate}%` },
      ].map(({ label, min, max, step, val, set, display }) => (
        <div key={label} style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.8rem", color: "rgba(13,27,42,0.5)", fontWeight: 500 }}>{label}</span>
            <strong style={{ fontSize: "0.95rem", color: "var(--navy)", fontFamily: "'Bebas Neue'", letterSpacing: "0.05em" }}>{display}</strong>
          </div>
          <input type="range" min={min} max={max} step={step} value={val}
            onChange={e => set(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--cyan)", height: 4 }} />
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3.5rem", color: "var(--cyan)", letterSpacing: "0.02em", lineHeight: 1 }}>
          ${annual.toLocaleString()}
        </div>
        <p style={{ fontSize: "0.82rem", color: "rgba(13,27,42,0.4)", marginTop: "0.5rem" }}>estimated annual revenue you could be capturing</p>
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
            style={{ width: "100%", background: "none", border: "none", color: open === i ? "var(--cyan)" : "var(--navy)", textAlign: "left", padding: "1.4rem 0", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", transition: "color 0.2s" }}>
            {f.q}
            <span style={{ width: 24, height: 24, border: `1px solid ${open === i ? "var(--cyan)" : "var(--border)"}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0, background: open === i ? "var(--cyan)" : "transparent", color: open === i ? "var(--navy)" : "var(--navy)", transform: open === i ? "rotate(45deg)" : "none", transition: "all 0.3s" }}>+</span>
          </button>
          <div style={{ maxHeight: open === i ? 300 : 0, overflow: "hidden", transition: "max-height 0.4s ease" }}>
            <p style={{ paddingBottom: "1.4rem", fontSize: "0.9rem", color: "rgba(13,27,42,0.55)", lineHeight: 1.7 }}>{f.a}</p>
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
        <button onClick={onClose} style={{ position: "absolute", top: "1.25rem", right: "1.25rem", background: "none", border: "none", color: "rgba(13,27,42,0.4)", cursor: "pointer", fontSize: "1.25rem" }}>✕</button>
        <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.03em", marginBottom: "0.5rem" }}>{title}</h3>
        <p style={{ color: "rgba(13,27,42,0.5)", fontSize: "0.9rem", marginBottom: "1.75rem", lineHeight: 1.6 }}>{sub}</p>
        {children}
      </div>
    </div>
  );
}

function FormInput({ label, type = "text", placeholder }: { label: string; type?: string; placeholder: string }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(13,27,42,0.6)", marginBottom: "0.4rem" }}>{label}</label>
      <input type={type} placeholder={placeholder} style={{ width: "100%", background: "rgba(13,27,42,0.05)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem 1rem", color: "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none" }}
        onFocus={e => e.currentTarget.style.borderColor = "var(--cyan)"}
        onBlur={e => e.currentTarget.style.borderColor = "var(--border)"} />
    </div>
  );
}

function FormSelect({ label, options }: { label: string; options: string[] }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "rgba(13,27,42,0.6)", marginBottom: "0.4rem" }}>{label}</label>
      <select style={{ width: "100%", background: "var(--off-white)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.75rem 1rem", color: "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none" }}>
        <option value="">Select...</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SubmitBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", marginTop: "0.5rem", padding: "0.9rem", background: "var(--cyan)", border: "none", borderRadius: 8, color: "var(--navy)", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--cyan-dark)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--cyan)"; e.currentTarget.style.transform = ""; }}>
      {label}
    </button>
  );
}

function SuccessMsg({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>{icon}</div>
      <h4 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", marginBottom: "0.5rem" }}>{title}</h4>
      <p style={{ color: "rgba(13,27,42,0.5)", fontSize: "0.9rem" }}>{body}</p>
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
            "linear-gradient(rgba(13,27,42,0.085) 1px, transparent 1px), linear-gradient(90deg, rgba(13,27,42,0.085) 1px, transparent 1px)",
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
              background: "rgba(12,192,223,0.24)",
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
                background: "rgba(12,192,223,0.22)",
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

// ── Page ───────────────────────────────────────────────────────────────────
export default function Home() {
  const [showTrial, setShowTrial] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [trialDone, setTrialDone] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const HERO_GRID_SIZE = 112;

  const SL = ({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) => (
    <RevealSection style={{ transitionDelay: `${delay}s`, ...style }}>{children}</RevealSection>
  );

  const sectionLabel = (text: string, center = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: center ? "center" : "flex-start", marginBottom: "1rem" }}>
      {!center && <div style={{ width: 24, height: 1, background: "var(--cyan)" }} />}
      <span style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--cyan)" }}>{text}</span>
    </div>
  );

  const sectionTitle = (lines: string[], accent?: number) => (
    <div style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2.5rem, 5vw, 4rem)", letterSpacing: "0.02em", lineHeight: 1, marginBottom: "1.25rem" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: i === accent ? "var(--cyan)" : "var(--navy)" }}>{l}</div>
      ))}
    </div>
  );

  return (
    <>
      <Nav onTrial={() => setShowTrial(true)} />

      {/* ── HERO ── */}
      <section
        ref={heroRef}
        style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "120px 5% 80px", overflow: "hidden" }}
      >

        {/* Grid background */}
        <InteractiveHeroGrid containerRef={heroRef} gridSize={HERO_GRID_SIZE} />

        {/* Glow */}
        <div style={{ position: "absolute", width: 600, height: 600, background: "radial-gradient(circle, rgba(12,192,223,0.08) 0%, transparent 70%)", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }} />

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(12,192,223,0.1)", border: "1px solid rgba(12,192,223,0.25)", borderRadius: 100, padding: "0.4rem 1rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--cyan)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.5rem", width: "fit-content" }}>
          <span style={{ width: 6, height: 6, background: "var(--cyan)", borderRadius: "50%", animation: "pulse 2s infinite" }} />
          The AI that runs the business side so you can focus on the work.
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }`}</style>

        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(3.5rem, 9vw, 7.5rem)", lineHeight: 0.95, letterSpacing: "0.02em", marginBottom: "1.5rem", maxWidth: 900 }}>
          STOP LOSING<br />
          CUSTOMERS TO<br />
          <span style={{ color: "var(--cyan)" }}>VOICEMAIL.</span>
        </h1>

        <p style={{ fontSize: "1.15rem", color: "rgba(13,27,42,0.6)", maxWidth: 540, lineHeight: 1.7, marginBottom: "2.5rem", fontWeight: 400 }}>
          RennOps answers every call, books every job, and follows up on every quote — automatically. Your business keeps running even when you can&apos;t pick up the phone.
        </p>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "3.5rem" }}>
          <button onClick={() => setShowTrial(true)} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "var(--cyan)", border: "none", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--cyan-dark)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(12,192,223,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--cyan)"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            Start 14-day free trial →
          </button>
          <a href="/demo" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "transparent", border: "1.5px solid rgba(13,27,42,0.2)", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13,27,42,0.5)"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(13,27,42,0.04)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13,27,42,0.2)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}>
            Watch a live demo
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", color: "rgba(13,27,42,0.35)", fontSize: "0.85rem", flexWrap: "wrap" }}>
          {["No credit card required", "Setup in under 20 minutes", "Keep your existing number"].map(t => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ color: "var(--cyan)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span> {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "2.5rem 5%", background: "rgba(13,27,42,0.02)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "2rem" }}>
        {[
          { num: "30%", label: "of calls missed by the average service business" },
          { num: "$800", label: "average value of each missed job or appointment" },
          { num: "2s", label: "for RennOps to answer every inbound call" },
          { num: "16x", label: "average ROI on RennOps Pro plan in month one" },
        ].map(({ num, label }, i) => (
          <SL key={i} delay={i * 0.1} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3rem", letterSpacing: "0.02em", color: "var(--navy)", lineHeight: 1, marginBottom: "0.4rem" }}>
              <span style={{ color: "var(--cyan)" }}>{num}</span>
            </div>
            <div style={{ fontSize: "0.82rem", color: "rgba(13,27,42,0.45)", fontWeight: 500, lineHeight: 1.4 }}>{label}</div>
          </SL>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ padding: "6rem 5%", background: "rgba(13,27,42,0.015)" }}>
        <SL>{sectionLabel("How it works")}</SL>
        <SL>{sectionTitle(["SET IT UP ONCE.", "IT WORKS FOREVER."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(13,27,42,0.55)", maxWidth: 520, lineHeight: 1.7, marginBottom: "4rem" }}>Forward your calls to RennOps. The AI does the rest — 24 hours a day, 7 days a week.</p></SL>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4rem", alignItems: "center" }}>
          <div>
            {[
              { n: "01", t: "Customer calls your number", d: "You keep your existing phone number and carrier. Calls forward to RennOps in seconds — setup takes 5 minutes." },
              { n: "02", t: "AI answers and books the job", d: "Your AI receptionist collects details, checks technician availability, and confirms a specific time slot." },
              { n: "03", t: "Customer gets an SMS confirmation", d: "Within 30 seconds of hang-up, the customer receives a personalized booking confirmation." },
              { n: "04", t: "You see everything in your dashboard", d: "Every call, booking, quote, and customer record syncs to your dashboard in real time." },
            ].map(({ n, t, d }, i) => (
              <SL key={i} delay={i * 0.1}>
                <div style={{ display: "flex", gap: "1.5rem", padding: "1.75rem 0", borderBottom: "1px solid var(--border)", ...(i === 0 ? { borderTop: "1px solid var(--border)" } : {}) }}>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: "2.5rem", color: "rgba(13,27,42,0.08)", lineHeight: 1, minWidth: 48 }}>{n}</div>
                  <div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.4rem" }}>{t}</h3>
                    <p style={{ fontSize: "0.875rem", color: "rgba(13,27,42,0.5)", lineHeight: 1.6 }}>{d}</p>
                  </div>
                </div>
              </SL>
            ))}
          </div>

          <SL>
            <div style={{ background: "rgba(13,27,42,0.03)", border: "1px solid var(--border)", borderRadius: 16, padding: "2rem", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "-50%", right: "-20%", width: 280, height: 280, background: "radial-gradient(circle, rgba(12,192,223,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
              <p style={{ fontFamily: "'DM Mono'", fontSize: "0.7rem", color: "rgba(13,27,42,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "1.25rem" }}>Live activity feed</p>

              {[
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
                  color: "rgba(16,185,129,0.12)", title: "AC Repair — Mike Johnson", sub: "123 Oak St · Friday May 2 at 10 AM", badge: "Booked", bc: "#10b981", bbg: "rgba(16,185,129,0.12)"
                },
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
                  color: "rgba(12,192,223,0.12)", title: "Electrical Panel — Sara Chen", sub: "Quote sent · Follow-up scheduled", badge: "Quote out", bc: "var(--cyan)", bbg: "rgba(12,192,223,0.12)"
                },
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
                  color: "rgba(245,158,11,0.12)", title: "Review request sent", sub: "Tom Breslin · Service complete", badge: "Sent", bc: "#f59e0b", bbg: "rgba(245,158,11,0.12)"
                },
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>,
                  color: "rgba(99,102,241,0.12)", title: "Drain Repair — Maria Lopez", sub: "James en route · ETA 25 min", badge: "In progress", bc: "#818cf8", bbg: "rgba(99,102,241,0.12)"
                },
              ].map(({ icon, color, title, sub, badge, bc, bbg }, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1rem", background: "rgba(13,27,42,0.03)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "0.75rem" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "0.875rem", display: "block", marginBottom: "0.1rem" }}>{title}</strong>
                    <span style={{ fontSize: "0.75rem", color: "rgba(13,27,42,0.4)" }}>{sub}</span>
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.25rem 0.6rem", borderRadius: 100, background: bbg, color: bc, whiteSpace: "nowrap" }}>{badge}</span>
                </div>
              ))}

              <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", color: "rgba(13,27,42,0.3)" }}>Revenue captured by AI this week</span>
                <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", color: "var(--cyan)", letterSpacing: "0.05em" }}>$4,200</span>
              </div>
            </div>
          </SL>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "6rem 5%" }}>
        <SL>{sectionLabel("Features")}</SL>
        <SL>{sectionTitle(["EVERYTHING YOUR", "BUSINESS NEEDS."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(13,27,42,0.55)", maxWidth: 520, lineHeight: 1.7, marginBottom: "4rem" }}>Built specifically for service businesses. Not a generic CRM with AI bolted on.</p></SL>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
          {[
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .82h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
              title: "AI Voice Receptionist", body: "Answers every inbound call in under 2 seconds. Conducts a natural intake conversation, checks real-time availability, and confirms the booking.", tag: "24/7 · No missed calls"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
              title: "Smart Job Booking", body: "Reads your team's real schedule and books jobs without conflicts. Prevents double-booking automatically.", tag: "Real-time availability"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
              title: "Quote Follow-Up Automation", body: "Sends a 4-touch follow-up sequence after every quote. SMS at 24hrs, email at 72hrs. Stops the moment the customer responds.", tag: "+35% close rate"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
              title: "Review Request Engine", body: "Automatically sends a review request after every completed job — personalized with the technician's name.", tag: "Compound growth"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
              title: "Owner Dashboard", body: "Real-time view of every job, call, quote, and customer. See exactly how much revenue RennOps captured for you.", tag: "Mobile + web"
            },
            {
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
              title: "Customer Notifications", body: "Automated reminders, en-route alerts, and completion notifications. Reduces no-shows by 60%.", tag: "SMS + email"
            },
          ].map(({ icon, title, body, tag }, i) => (
            <SL key={i} delay={(i % 3) * 0.1}>
              <div style={{ background: "rgba(13,27,42,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem", height: "100%", transition: "all 0.3s", cursor: "default" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(12,192,223,0.3)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = ""; }}>
                <div style={{ width: 44, height: 44, background: "rgba(12,192,223,0.1)", border: "1px solid rgba(12,192,223,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>{icon}</div>
                <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>{title}</h3>
                <p style={{ fontSize: "0.875rem", color: "rgba(13,27,42,0.5)", lineHeight: 1.65, marginBottom: "1rem" }}>{body}</p>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--cyan)", fontFamily: "'DM Mono'", letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag}</span>
              </div>
            </SL>
          ))}
        </div>
      </section>

      {/* ── ROI ── */}
      <section id="roi" style={{ padding: "6rem 5%", background: "rgba(13,27,42,0.015)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4rem", alignItems: "center" }}>
          <SL>
            {sectionLabel("ROI Calculator")}
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3.2rem)", letterSpacing: "0.02em", lineHeight: 1.05, marginBottom: "1.25rem" }}>
              HOW MUCH ARE YOU<br /><span style={{ color: "var(--cyan)" }}>LOSING</span> TO<br />VOICEMAIL?
            </div>
            <p style={{ color: "rgba(13,27,42,0.55)", lineHeight: 1.7, marginBottom: "1.5rem", fontSize: "0.95rem" }}>
              The average service business misses 3 calls a day. At $800 per job, that&apos;s hundreds of thousands of dollars going to a competitor who picked up the phone.
            </p>
            {["RennOps answers every call — you stop losing customers", "Most businesses see 16x ROI in month one", "Capturing one extra job per week pays for the year"].map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.9rem", color: "rgba(13,27,42,0.7)", marginBottom: "0.75rem" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg> {b}
              </div>
            ))}
          </SL>
          <SL delay={0.2}><RoiCalc /></SL>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "6rem 5%", textAlign: "center" }}>
        <SL>{sectionLabel("Pricing", true)}</SL>
        <SL>{sectionTitle(["SIMPLE PRICING.", "SERIOUS ROI."])}</SL>
        <SL><p style={{ fontSize: "1.05rem", color: "rgba(13,27,42,0.55)", maxWidth: 480, margin: "0 auto 4rem" }}>No setup fees. No contracts. Cancel anytime. 14-day free trial on all plans.</p></SL>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", textAlign: "left" }}>
          {[
            { tier: "Starter", price: 199, desc: "AI phone receptionist for solo operators. Answer every call, book every job.", features: ["AI voice receptionist — 500 min/mo", "Smart job booking engine", "Booking confirmation SMS", "Up to 2 team members", "Owner dashboard (mobile + web)", "24/7 call answering"], featured: false },
            { tier: "Pro", price: 299, desc: "Everything in Starter plus the automation stack that closes quotes and grows reviews.", features: ["AI voice receptionist — 1,500 min/mo", "Quote follow-up automation (4-touch)", "Review request engine", "Customer notification system", "Up to 5 team members", "AI-generated call notes", "Revenue analytics"], featured: true },
            { tier: "Growth", price: 449, desc: "The full RennOps suite for growing operations with multiple team members.", features: ["AI voice receptionist — unlimited", "Everything in Pro", "Up to 10 team members", "Technician mobile app", "Advanced reporting", "Priority support", "Early feature access"], featured: false },
          ].map(({ tier, price, desc, features, featured }, i) => (
            <SL key={i} delay={i * 0.1}>
              <div style={{ background: featured ? "rgba(12,192,223,0.06)" : "rgba(13,27,42,0.03)", border: `1px solid ${featured ? "rgba(12,192,223,0.35)" : "var(--border)"}`, borderRadius: 16, padding: "2rem", position: "relative", transform: featured ? "scale(1.03)" : "none", height: "100%" }}>
                {featured && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--cyan)", color: "var(--navy)", fontSize: "0.72rem", fontWeight: 700, padding: "0.25rem 0.9rem", borderRadius: 100, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Most popular</div>}
                <div style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--cyan)", marginBottom: "0.75rem" }}>{tier}</div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: "3.5rem", letterSpacing: "0.02em", lineHeight: 1, marginBottom: "0.25rem" }}>
                  <sup style={{ fontSize: "1.5rem", fontFamily: "'DM Sans'", fontWeight: 600, verticalAlign: "top", marginTop: "0.5rem", display: "inline-block" }}>$</sup>{price}
                </div>
                <div style={{ fontSize: "0.85rem", color: "rgba(13,27,42,0.4)", marginBottom: "1.5rem" }}>per month</div>
                <p style={{ fontSize: "0.875rem", color: "rgba(13,27,42,0.5)", lineHeight: 1.6, marginBottom: "1.75rem", paddingBottom: "1.75rem", borderBottom: "1px solid var(--border)" }}>{desc}</p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.7rem", marginBottom: "2rem" }}>
                  {features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", fontSize: "0.875rem", color: "rgba(13,27,42,0.7)" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><polyline points="20 6 9 17 4 12" /></svg> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => setShowTrial(true)} style={{ width: "100%", padding: "0.85rem", background: featured ? "var(--cyan)" : "transparent", border: `1.5px solid ${featured ? "var(--cyan)" : "rgba(13,27,42,0.2)"}`, borderRadius: 8, color: featured ? "var(--navy)" : "var(--navy)", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = ""; }}>
                  Start free trial
                </button>
              </div>
            </SL>
          ))}
        </div>
        <SL><p style={{ textAlign: "center", marginTop: "2rem", fontSize: "0.85rem", color: "rgba(13,27,42,0.3)" }}>All plans include a 14-day free trial. No credit card required to start.</p></SL>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: "6rem 5%", background: "rgba(13,27,42,0.015)" }}>
        <SL>{sectionLabel("Social proof")}</SL>
        <SL>{sectionTitle(["BUSINESSES THAT", "SWITCHED."])}</SL>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", marginTop: "4rem" }}>
          {[
            { text: "I was missing 4-5 calls a day when I was on jobs. First month with RennOps I captured 11 jobs I would've lost. Paid for itself in week one.", name: "Mike D.", role: "Owner, D&R Services · Buffalo, NY" },
            { text: "The quote follow-up alone is worth the price. I used to send a quote and forget about it. Now they close automatically. My close rate went from 40% to 67%.", name: "Carlos M.", role: "Owner, Apex Services · Houston, TX" },
            { text: "I went from 12 Google reviews to 89 in 3 months without doing anything. The requests go out automatically. My inbound call volume literally doubled.", name: "Sarah K.", role: "Owner, Bright Co · Phoenix, AZ" },
          ].map(({ text, name, role }, i) => (
            <SL key={i} delay={i * 0.1}>
              <div style={{ background: "rgba(13,27,42,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.75rem" }}>
                <div style={{ display: "flex", gap: "0.2rem", marginBottom: "1rem" }}>
                  {Array.from({ length: 5 }).map((_, s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  ))}
                </div>
                <p style={{ fontSize: "0.95rem", color: "rgba(13,27,42,0.75)", lineHeight: 1.7, marginBottom: "1.25rem", fontStyle: "italic" }}>&ldquo;{text}&rdquo;</p>
                <strong style={{ fontSize: "0.9rem", display: "block" }}>{name}</strong>
                <span style={{ fontSize: "0.8rem", color: "rgba(13,27,42,0.4)" }}>{role}</span>
              </div>
            </SL>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "6rem 5%" }}>
        <div style={{ textAlign: "center" }}>
          <SL>{sectionLabel("FAQ", true)}</SL>
          <SL>{sectionTitle(["COMMON QUESTIONS."])}</SL>
        </div>
        <FaqAccordion />
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "6rem 5%", textAlign: "center" }}>
        <SL>
          <div style={{ maxWidth: 640, margin: "0 auto", background: "rgba(13,27,42,0.03)", border: "1px solid rgba(12,192,223,0.2)", borderRadius: 20, padding: "3.5rem", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: "-80px", left: "50%", transform: "translateX(-50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(12,192,223,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
            <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "0.02em", marginBottom: "1rem" }}>
              READY TO STOP<br />LOSING CUSTOMERS?
            </h2>
            <p style={{ color: "rgba(13,27,42,0.55)", fontSize: "1rem", lineHeight: 1.7, marginBottom: "2rem", maxWidth: 440, margin: "0 auto 2rem" }}>
              Start your 14-day free trial today. No credit card required. Setup takes less than 20 minutes.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setShowTrial(true)} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "var(--cyan)", border: "none", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--cyan-dark)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--cyan)"; e.currentTarget.style.transform = ""; }}>
                Start free trial — 14 days free
              </button>
              <a href="/demo" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.9rem 2rem", background: "transparent", border: "1.5px solid rgba(13,27,42,0.2)", borderRadius: 8, color: "var(--navy)", fontSize: "1rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13,27,42,0.5)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(13,27,42,0.2)"; }}>
                Book a live demo
              </a>
            </div>
            <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "rgba(13,27,42,0.3)" }}>Questions? Email us at hello@rennops.com</p>
          </div>
        </SL>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "3rem 5%", display: "grid", gridTemplateColumns: "1fr auto", gap: "2rem", alignItems: "start" }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            RENN<span style={{ color: "var(--cyan)" }}>OPS</span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "rgba(13,27,42,0.35)", maxWidth: 260, lineHeight: 1.6 }}>The AI operating system for service businesses.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3rem" }}>
          {[
            { title: "Product", links: [["#how", "How it works"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]] },
            { title: "Company", links: [["#", "About"], ["#", "Blog"], ["mailto:hello@rennops.com", "Contact"]] },
            { title: "Legal", links: [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"]] },].map(({ title, links }) => (
              <div key={title}>
                <h4 style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(13,27,42,0.35)", marginBottom: "1rem" }}>{title}</h4>
                {links.map(([href, label]) => (
                  <a key={label} href={href} style={{ display: "block", color: "rgba(13,27,42,0.55)", textDecoration: "none", fontSize: "0.875rem", marginBottom: "0.6rem", transition: "color 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--navy)"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(13,27,42,0.55)"}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
        </div>
      </footer>

      <div style={{ borderTop: "1px solid var(--border)", padding: "1.25rem 5%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "rgba(13,27,42,0.25)" }}>
        <span>© 2026 RennOps. All rights reserved.</span>
        <span>Built for service businesses.</span>
      </div>

      {/* ── TRIAL MODAL ── */}
      {showTrial && (
        <Modal title="START YOUR FREE TRIAL" sub="14 days free. No credit card required. Up and running in 20 minutes." onClose={() => { setShowTrial(false); setTrialDone(false); }}>
          {!trialDone ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <FormInput label="First name" placeholder="Mike" />
                <FormInput label="Last name" placeholder="Johnson" />
              </div>
              <FormInput label="Business email" type="email" placeholder="mike@yourbusiness.com" />
              <FormInput label="Business phone" type="tel" placeholder="+1 (716) 555-0100" />
              <FormSelect label="Business type" options={["HVAC", "Plumbing", "Electrical", "Roofing", "Pest Control", "Pool Service", "Landscaping", "Cleaning", "Other"]} />
              <SubmitBtn label="Start free trial →" onClick={() => setTrialDone(true)} />
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: "rgba(13,27,42,0.3)", marginTop: "0.75rem" }}>No credit card required · Cancel anytime</p>
            </>
          ) : (
            <SuccessMsg icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} title="YOU'RE IN!" body="We'll reach out within 24 hours to get you set up. Check your email for next steps." />
          )}
        </Modal>
      )}

      {/* ── DEMO MODAL ── */}
      {showDemo && (
        <Modal title="BOOK A LIVE DEMO" sub="We'll walk you through a live call with the AI and answer every question. 30 minutes." onClose={() => { setShowDemo(false); setDemoDone(false); }}>
          {!demoDone ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <FormInput label="First name" placeholder="Mike" />
                <FormInput label="Last name" placeholder="Johnson" />
              </div>
              <FormInput label="Business email" type="email" placeholder="mike@yourbusiness.com" />
              <FormInput label="Business phone" type="tel" placeholder="+1 (716) 555-0100" />
              <FormSelect label="Preferred time" options={["This week — morning (9am–12pm)", "This week — afternoon (1pm–5pm)", "Next week — morning (9am–12pm)", "Next week — afternoon (1pm–5pm)"]} />
              <SubmitBtn label="Book my demo →" onClick={() => setDemoDone(true)} />
              <p style={{ textAlign: "center", fontSize: "0.78rem", color: "rgba(13,27,42,0.3)", marginTop: "0.75rem" }}>We&apos;ll confirm within 2 hours</p>
            </>
          ) : (
            <SuccessMsg icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>} title="DEMO BOOKED!" body="We'll confirm your time within 2 hours. Check your email for the calendar invite." />
          )}
        </Modal>
      )}
    </>
  );
}
