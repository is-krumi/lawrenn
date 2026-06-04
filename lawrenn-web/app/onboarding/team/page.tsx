"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COLORS = [
  "#111111", "#3B82F6", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1",
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

interface TeamMember {
  id:       string;
  name:     string;
  phone:    string;
  color:    string;
  schedule: Record<string, { start: string; end: string } | null>;
}

function newMember(): TeamMember {
  return {
    id:       crypto.randomUUID(),
    name:     "",
    phone:    "",
    color:    COLORS[Math.floor(Math.random() * COLORS.length)],
    schedule: {
      mon: { start: "08:00", end: "17:00" },
      tue: { start: "08:00", end: "17:00" },
      wed: { start: "08:00", end: "17:00" },
      thu: { start: "08:00", end: "17:00" },
      fri: { start: "08:00", end: "17:00" },
      sat: null,
      sun: null,
    },
  };
}

export default function OnboardingStep3() {
  const router = useRouter();

  const [businessId, setBusinessId]         = useState<string | null>(null);
  const [bizHours, setBizHours]             = useState<Record<string, any>>({});
  const [members, setMembers]               = useState<TeamMember[]>([newMember()]);
  const [expanded, setExpanded]             = useState<string | null>(null);
  const [useBusinessHours, setUseBizHours]  = useState(true);
  const [isSolo, setIsSolo]                 = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { router.push("/login"); return; }

      // Use limit(1) + array result so duplicate business rows never cause a redirect
      const { data: rows } = await supabase
        .from("businesses")
        .select("id, settings")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      const biz = rows?.[0] ?? null;
      if (!biz) { router.push("/onboarding"); return; }

      setBusinessId(biz.id);
      if (biz.settings?.operating_hours) {
        setBizHours(biz.settings.operating_hours);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateMember(id: string, field: keyof TeamMember, value: any) {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  }

  function toggleMemberDay(memberId: string, day: string) {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        schedule: {
          ...m.schedule,
          [day]: m.schedule[day] ? null : { start: "08:00", end: "17:00" },
        },
      };
    }));
  }

  function updateMemberHour(memberId: string, day: string, field: "start" | "end", value: string) {
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      return {
        ...m,
        schedule: {
          ...m.schedule,
          [day]: { ...(m.schedule[day] ?? { start: "08:00", end: "17:00" }), [field]: value },
        },
      };
    }));
  }

  function addMember() {
    const m = newMember();
    // Apply business hours to new member if toggle is on
    if (useBusinessHours && Object.keys(bizHours).length > 0) {
      m.schedule = { ...bizHours };
    }
    setMembers(prev => [...prev, m]);
    setExpanded(m.id);
  }

  function removeMember(id: string) {
    if (members.length === 1) return;
    setMembers(prev => prev.filter(m => m.id !== id));
    if (expanded === id) setExpanded(null);
  }

  async function handleNext() {
    if (!isSolo) {
      const invalid = members.filter(m => !m.name.trim());
      if (invalid.length > 0) { setError("All team members need a name"); return; }
    }

    setLoading(true);
    setError("");

    try {
      // Delete existing technicians
      await supabase
        .from("technicians")
        .delete()
        .eq("business_id", businessId);

      if (!isSolo) {
        // Insert team members
        const rows = members.map(m => ({
          business_id: businessId,
          name:        m.name.trim(),
          phone:       m.phone.trim() || null,
          color:       m.color,
          schedule:    useBusinessHours ? bizHours : m.schedule,
          active:      true,
        }));

        const { error: insertError } = await supabase
          .from("technicians")
          .insert(rows);

        if (insertError) throw insertError;
      } else {
        // Solo — insert owner as the only technician using business hours
        const { data: { user } } = await supabase.auth.getUser();
        const { data: biz } = await supabase
          .from("businesses")
          .select("name, settings")
          .eq("id", businessId)
          .single();

        await supabase
          .from("technicians")
          .insert({
            business_id: businessId,
            name:        biz?.name ?? "Owner",
            phone:       null,
            color:       "#111111",
            schedule:    bizHours,
            active:      true,
          });
      }

      router.push("/onboarding/persona");

    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F5F5F0",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* Logo */}
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#111111", textDecoration: "none", marginBottom: "2.5rem" }}>
        LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
      </a>

      {/* Progress */}
      <div style={{ width: "100%", maxWidth: 560, marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
{["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: i < 3 ? "#111111" : "rgba(0,0,0,0.08)",
                color: i < 3 ? "white" : "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.8rem", fontWeight: 700,
                border: i < 3 ? "none" : "1.5px solid rgba(0,0,0,0.1)",
              }}>{i < 2 ? "✓" : i + 1}</div>
              <span style={{ fontSize: "0.72rem", color: i === 2 ? "#111111" : "#6B7280", fontWeight: i === 2 ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: "60%", background: "#111111", borderRadius: 2 }} />
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 560,
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 16,
        padding: "2.5rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.4rem" }}>
          Who's on your team?
        </h1>
        <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
          Add your attorneys and staff so the AI can route inquiries and check availability.
        </p>

        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {/* Solo toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", background: isSolo ? "rgba(17,17,17,0.04)" : "#F5F5F0", border: `1px solid ${isSolo ? "rgba(17,17,17,0.15)" : "rgba(0,0,0,0.08)"}`, borderRadius: 10, marginBottom: "1rem", transition: "all 0.2s" }}>
          <div>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111111", marginBottom: "0.15rem" }}>Solo practitioner</p>
            <p style={{ fontSize: "0.8rem", color: "#6B7280" }}>No team members — just you</p>
          </div>
          <button onClick={() => setIsSolo(!isSolo)}
            style={{
              width: 44, height: 26, borderRadius: 13,
              background: isSolo ? "#111111" : "rgba(0,0,0,0.15)",
              border: "none", cursor: "pointer",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "white",
              position: "absolute", top: 4,
              left: isSolo ? 22 : 4,
              transition: "left 0.2s",
            }} />
          </button>
        </div>

        {!isSolo && (<>
        {/* Use business hours toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", background: "#F5F5F0", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, marginBottom: "1.5rem" }}>
          <div>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111111", marginBottom: "0.15rem" }}>Everyone works the same hours</p>
            <p style={{ fontSize: "0.8rem", color: "#6B7280" }}>Use your office hours for all team members</p>
          </div>
          <button onClick={() => setUseBizHours(!useBusinessHours)}
            style={{
              width: 44, height: 26, borderRadius: 13,
              background: useBusinessHours ? "#111111" : "rgba(0,0,0,0.15)",
              border: "none", cursor: "pointer",
              position: "relative", transition: "background 0.2s", flexShrink: 0,
            }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "white",
              position: "absolute", top: 4,
              left: useBusinessHours ? 22 : 4,
              transition: "left 0.2s",
            }} />
          </button>
        </div>

        {/* Team members */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
          {members.map((member, idx) => (
            <div key={member.id} style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden" }}>

              {/* Member header */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem", background: "#F5F5F0", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === member.id ? null : member.id)}>

                {/* Color dot */}
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: member.color, flexShrink: 0 }} />

                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111111", flex: 1 }}>
                  {member.name.trim() || `Team member ${idx + 1}`}
                </span>

                <span style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                  {expanded === member.id ? "▲" : "▼"}
                </span>

                {members.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); removeMember(member.id); }}
                    style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.1rem", padding: "0 0.25rem" }}>×</button>
                )}
              </div>

              {/* Member details */}
              {expanded === member.id && (
                <div style={{ padding: "1.25rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>

                  {/* Name */}
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Name</label>
                    <input type="text" placeholder="Jane Smith" value={member.name}
                      onChange={e => updateMember(member.id, "name", e.target.value)}
                      style={{ width: "100%", padding: "0.7rem 0.9rem", background: "#F5F5F0", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                      onFocus={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.4)"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                  </div>

                  {/* Phone */}
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
                      Phone <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(optional)</span>
                    </label>
                    <input type="tel" placeholder="(716) 555-0100" value={member.phone}
                      onChange={e => updateMember(member.id, "phone", e.target.value)}
                      style={{ width: "100%", padding: "0.7rem 0.9rem", background: "#F5F5F0", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                      onFocus={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.4)"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                  </div>

                  {/* Color */}
                  <div style={{ marginBottom: useBusinessHours ? 0 : "1rem" }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Color</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {COLORS.map(c => (
                        <button key={c} onClick={() => updateMember(member.id, "color", c)}
                          style={{
                            width: 26, height: 26, borderRadius: "50%", background: c,
                            border: member.color === c ? "3px solid #111111" : "3px solid transparent",
                            cursor: "pointer", padding: 0, transition: "border 0.15s",
                          }} />
                      ))}
                    </div>
                  </div>

                  {/* Individual schedule */}
                  {!useBusinessHours && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Schedule</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {DAYS.map(day => (
                          <div key={day} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                            <button onClick={() => toggleMemberDay(member.id, day)}
                              style={{
                                width: 36, height: 22, borderRadius: 11,
                                background: member.schedule[day] ? "#111111" : "rgba(0,0,0,0.1)",
                                border: "none", cursor: "pointer",
                                position: "relative", transition: "background 0.2s", flexShrink: 0,
                              }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: "50%", background: "white",
                                position: "absolute", top: 4,
                                left: member.schedule[day] ? 18 : 4,
                                transition: "left 0.2s",
                              }} />
                            </button>
                            <span style={{ width: 32, fontSize: "0.8rem", fontWeight: 500, color: member.schedule[day] ? "#111111" : "#9CA3AF" }}>
                              {DAY_LABELS[day]}
                            </span>
                            {member.schedule[day] ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <input type="time" value={member.schedule[day]!.start}
                                  onChange={e => updateMemberHour(member.id, day, "start", e.target.value)}
                                  style={{ padding: "0.25rem 0.4rem", background: "#F5F5F0", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.78rem", outline: "none" }} />
                                <span style={{ color: "#9CA3AF", fontSize: "0.78rem" }}>to</span>
                                <input type="time" value={member.schedule[day]!.end}
                                  onChange={e => updateMemberHour(member.id, day, "end", e.target.value)}
                                  style={{ padding: "0.25rem 0.4rem", background: "#F5F5F0", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.78rem", outline: "none" }} />
                              </div>
                            ) : (
                              <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>Off</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add member */}
        <button type="button" onClick={addMember}
          style={{ width: "100%", padding: "0.75rem", background: "transparent", border: "1.5px dashed rgba(17,17,17,0.25)", borderRadius: 10, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", marginBottom: "2rem", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(17,17,17,0.5)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(17,17,17,0.25)"}>
          + Add another team member
        </button>
        </>)}

        {/* Back + Next */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={() => router.push("/onboarding/services")}
            style={{ flex: 1, padding: "0.9rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>
            ← Back
          </button>
          <button onClick={handleNext} disabled={loading}
            style={{ flex: 2, padding: "0.9rem", background: loading ? "rgba(17,17,17,0.45)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
            {loading ? "Saving..." : "Next — Set up your voice →"}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6B7280", marginTop: "1rem" }}>
          Step 3 of 4 · Your progress is saved automatically
        </p>
      </div>
    </div>
  );
}