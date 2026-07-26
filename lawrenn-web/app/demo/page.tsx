"use client";

import { useState, useEffect } from "react";

interface Slot {
  start:   string;
  end:     string;
  display: string;
}

interface GroupedSlots {
  date:  string;
  slots: Slot[];
}

export default function DemoPage() {
  const [slots, setSlots]           = useState<Slot[]>([]);
  const [grouped, setGrouped]       = useState<GroupedSlots[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading]       = useState(true);
  const [booking, setBooking]       = useState(false);
  const [booked, setBooked]         = useState(false);
  const [meetLink, setMeetLink]     = useState("");
  const [error, setError]           = useState("");
  const [form, setForm]             = useState({
    name: "", email: "", business: "", phone: "",
  });

  useEffect(() => {
    async function loadSlots() {
      try {
        const res  = await fetch("/api/demo-slots");
        const data = await res.json();
        setSlots(data.slots ?? []);

        // Group by date
        const groups: Record<string, Slot[]> = {};
        for (const slot of data.slots ?? []) {
          const date = new Date(slot.start).toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            timeZone: "America/New_York",
          });
          if (!groups[date]) groups[date] = [];
          groups[date].push(slot);
        }
        setGrouped(Object.entries(groups).map(([date, slots]) => ({ date, slots })));
      } catch {
        setError("Failed to load available slots. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadSlots();
  }, []);

  async function handleBook() {
    if (!selectedSlot) { setError("Please select a time slot"); return; }
    if (!form.name.trim()) { setError("Please enter your name"); return; }
    if (!form.email.trim()) { setError("Please enter your email"); return; }

    setBooking(true);
    setError("");

    try {
      const res = await fetch("/api/book-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_start: selectedSlot.start,
          slot_end:   selectedSlot.end,
          name:       form.name.trim(),
          email:      form.email.trim(),
          business:   form.business.trim() || null,
          phone:      form.phone.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setSelectedSlot(null);
          const freshRes  = await fetch("/api/demo-slots");
          const freshData = await freshRes.json();
          setSlots(freshData.slots ?? []);
          const groups: Record<string, Slot[]> = {};
          for (const slot of freshData.slots ?? []) {
            const date = new Date(slot.start).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric",
              timeZone: "America/New_York",
            });
            if (!groups[date]) groups[date] = [];
            groups[date].push(slot);
          }
          setGrouped(Object.entries(groups).map(([date, slots]) => ({ date, slots })));
        }
        setError(data.error ?? "Booking failed. Please try another slot.");
        return;
      }

      setMeetLink(data.meetLink);
      setBooked(true);

    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "0.75rem 1rem",
    background: "#FFFFFF", border: "1.5px solid rgba(0,0,0,0.1)",
    borderRadius: 8, color: "#0D1B2A",
    fontFamily: "'DM Sans'", fontSize: "0.95rem",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Nav */}
      <nav style={{ padding: "0 5%", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.08)", background: "rgba(245,245,240,0.97)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#0D1B2A", textDecoration: "none" }}>
          LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
        </a>
        <a href="/" style={{ fontSize: "0.875rem", color: "rgba(17,17,17,0.5)", textDecoration: "none" }}>← Back to home</a>
      </nav>

      <div className="demo-outer">

        {booked ? (
          /* Success state */
          <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2.5rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.5rem" }}>
              YOU'RE BOOKED!
            </h1>
            <p style={{ color: "#6B7280", fontSize: "1rem", lineHeight: 1.7, marginBottom: "2rem" }}>
              Check your email for the confirmation and Google Meet link. We're looking forward to showing you Lawrenn!
            </p>
            {meetLink && (
              <a href={meetLink} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", padding: "0.9rem 2rem", background: "#111111", borderRadius: 8, color: "white", fontWeight: 700, fontSize: "1rem", textDecoration: "none", marginBottom: "1.5rem" }}>
                Join Google Meet
              </a>
            )}
            <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: "1.5rem", textAlign: "left" }}>
              <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "rgba(17,17,17,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>What to expect</p>
              {[
                "We'll walk through a live Lawrenn session tailored to your practice area",
                "You'll see AI call answering, intake automation, and client messaging in real time",
                "We'll walk through the full setup — takes less than 15 minutes",
                "No pressure — just a live demo of the product",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.6rem" }}>
                  <span style={{ color: "#374151", fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <p style={{ fontSize: "0.875rem", color: "#374151", margin: 0 }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="demo-grid">

            {/* Left — info */}
            <div>
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "rgba(17,17,17,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Live demo · 30 minutes</p>
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "0.02em", color: "#111111", lineHeight: 1, marginBottom: "1rem" }}>
                SEE LAWRENN<br />IN ACTION
              </h1>
              <p style={{ color: "#6B7280", fontSize: "1rem", lineHeight: 1.7, marginBottom: "2rem" }}>
                We'll walk through a live Lawrenn session — AI call answering, client intake automation, and client communication — tailored to your practice area.
              </p>

              {[
                { icon: "📞", title: "Live call answering demo",  desc: "See Lawrenn answer a call and generate a full intake memo in real time" },
                { icon: "💬", title: "Client communication",      desc: "Watch AI draft a follow-up SMS ready to approve in one click" },
                { icon: "⚡", title: "15-minute setup",           desc: "If you want to start, you'll be live before we hang up" },
                { icon: "🚫", title: "No pressure",               desc: "Just a demo — no credit card, no commitment" },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.15rem" }}>{title}</p>
                    <p style={{ fontSize: "0.82rem", color: "#6B7280" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — booking */}
            <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 16, padding: "2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

              {error && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
                  {error}
                </div>
              )}

              {!selectedSlot ? (
                /* Slot picker */
                <>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "1.25rem" }}>
                    Pick a time that works for you
                  </h3>

                  {loading ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "#9CA3AF" }}>Loading availability...</div>
                  ) : grouped.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "#9CA3AF" }}>
                      No slots available right now. Email us at hello@lawrenn.com
                    </div>
                  ) : (
                    <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                      {grouped.map(({ date, slots }) => (
                        <div key={date}>
                          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>{date}</p>
                          <div className="demo-slot-grid">
                            {slots.map(slot => (
                              <button key={slot.start} onClick={() => { setSelectedSlot(slot); setError(""); }}
                                style={{
                                  padding: "0.5rem 0.4rem",
                                  background: "#FFFFFF",
                                  border: "1.5px solid rgba(0,0,0,0.08)",
                                  borderRadius: 8,
                                  color: "#374151",
                                  fontFamily: "'DM Sans'",
                                  fontSize: "0.8rem",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                  textAlign: "center",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = "#111111"; e.currentTarget.style.background = "rgba(17,17,17,0.04)"; e.currentTarget.style.color = "#111111"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.color = "#374151"; }}>
                                {new Date(slot.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Details form */
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem", padding: "0.75rem 1rem", background: "#ffffff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "rgba(17,17,17,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.15rem" }}>Selected time</p>
                      <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A" }}>
                        {new Date(selectedSlot.start).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET
                      </p>
                    </div>
                    <button onClick={() => setSelectedSlot(null)}
                      style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.1rem" }}>×</button>
                  </div>

                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "1.25rem" }}>Your details</h3>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginBottom: "1.25rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Full name *</label>
                      <input type="text" placeholder="Mike Johnson" value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        style={inputSt}
                        onFocus={e => e.currentTarget.style.borderColor = "#111111"}
                        onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Business email *</label>
                      <input type="email" placeholder="mike@smithlawfirm.com" value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        style={inputSt}
                        onFocus={e => e.currentTarget.style.borderColor = "#111111"}
                        onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Firm name</label>
                      <input type="text" placeholder="Smith Family Law" value={form.business}
                        onChange={e => setForm(p => ({ ...p, business: e.target.value }))}
                        style={inputSt}
                        onFocus={e => e.currentTarget.style.borderColor = "#111111"}
                        onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Phone</label>
                      <input type="tel" placeholder="(716) 555-0100" value={form.phone}
                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        style={inputSt}
                        onFocus={e => e.currentTarget.style.borderColor = "#111111"}
                        onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>
                  </div>

                  <button onClick={handleBook} disabled={booking}
                    style={{ width: "100%", padding: "0.9rem", background: booking ? "rgba(17,17,17,0.5)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: booking ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                    {booking ? "Booking..." : "Confirm demo"}
                  </button>

                  <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#9CA3AF", marginTop: "0.75rem" }}>
                    You'll receive a Google Meet link immediately
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}