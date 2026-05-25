"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COLORS = [
  "#0cc0df", "#3B82F6", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1",
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

interface Technician {
  id: string;
  name: string;
  phone: string | null;
  color: string;
  active: boolean;
  schedule: Record<string, { start: string; end: string } | null>;
}

const defaultSchedule = {
  mon: { start: "08:00", end: "17:00" },
  tue: { start: "08:00", end: "17:00" },
  wed: { start: "08:00", end: "17:00" },
  thu: { start: "08:00", end: "17:00" },
  fri: { start: "08:00", end: "17:00" },
  sat: null,
  sun: null,
};

export default function TeamPage() {
  const router = useRouter();

  const [businessId, setBusinessId]   = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // New member form
  const [newMember, setNewMember] = useState({
    name: "", phone: "", color: COLORS[0],
    schedule: { ...defaultSchedule } as Record<string, { start: string; end: string } | null>,
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (!biz) { router.push("/onboarding"); return; }
      setBusinessId(biz.id);

      const { data } = await supabase
        .from("technicians")
        .select("id, name, phone, color, active, schedule")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: true });

      setTechnicians((data as any) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function addMember() {
    if (!newMember.name.trim()) return;
    setSaving(true);

    const { data } = await supabase
      .from("technicians")
      .insert({
        business_id: businessId,
        name:        newMember.name.trim(),
        phone:       newMember.phone.trim() || null,
        color:       newMember.color,
        schedule:    newMember.schedule,
        active:      true,
      })
      .select("id, name, phone, color, active, schedule")
      .single();

    if (data) setTechnicians(prev => [...prev, data as any]);
    setNewMember({ name: "", phone: "", color: COLORS[0], schedule: { ...defaultSchedule } });
    setShowAdd(false);
    setSaving(false);
  }

  async function updateMember(id: string, updates: Partial<Technician>) {
    await supabase.from("technicians").update(updates).eq("id", id);
    setTechnicians(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  async function toggleActive(id: string, active: boolean) {
    await updateMember(id, { active: !active });
  }

  async function deleteMember(id: string) {
    await supabase.from("technicians").delete().eq("id", id);
    setTechnicians(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null);
    setExpanded(null);
  }

  function updateScheduleDay(
    techId: string,
    day: string,
    value: { start: string; end: string } | null
  ) {
    const tech = technicians.find(t => t.id === techId);
    if (!tech) return;
    const newSchedule = { ...tech.schedule, [day]: value };
    updateMember(techId, { schedule: newSchedule });
  }

  function getScheduleSummary(schedule: Record<string, any>) {
    const activeDays = DAYS.filter(d => schedule?.[d]?.start);
    if (activeDays.length === 0) return "No schedule set";
    if (activeDays.length === 5 && !schedule.sat && !schedule.sun) return "Mon–Fri";
    if (activeDays.length === 7) return "Every day";
    return activeDays.map(d => DAY_LABELS[d]).join(", ");
  }

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "0.7rem 0.9rem",
    background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)",
    borderRadius: 8, color: "#0D1B2A",
    fontFamily: "'DM Sans'", fontSize: "0.9rem",
    outline: "none", boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading team...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
<div className="team-wrap" style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div className="team-header">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Team</h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>{technicians.filter(t => t.active).length} active team members</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: "0.6rem 1.25rem", background: "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer" }}>
            + Add member
          </button>
        </div>

        {/* Team list */}
        {technicians.length === 0 ? (
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "4rem 2rem", textAlign: "center" }}>
            <p style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>👥</p>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.4rem" }}>No team members yet</p>
            <p style={{ fontSize: "0.85rem", color: "#9CA3AF", marginBottom: "1.5rem" }}>Add your first team member to start assigning jobs</p>
            <button onClick={() => setShowAdd(true)}
              style={{ padding: "0.7rem 1.5rem", background: "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>
              Add team member
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {technicians.map(tech => (
              <div key={tech.id} style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, overflow: "hidden" }}>

                {/* Member row */}
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem", cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === tech.id ? null : tech.id)}>

                  {/* Color + avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: tech.color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "1rem", flexShrink: 0 }}>
                    {tech.name.charAt(0).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.95rem", fontWeight: 600, color: tech.active ? "#0D1B2A" : "#9CA3AF", marginBottom: "0.1rem" }}>
                      {tech.name}
                      {!tech.active && <span style={{ marginLeft: "0.5rem", fontSize: "0.72rem", color: "#9CA3AF", fontWeight: 400 }}>Inactive</span>}
                    </p>
                    <p style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                      {tech.phone ?? "No phone"} · {getScheduleSummary(tech.schedule)}
                    </p>
                  </div>

                  {/* Active toggle */}
                  <button onClick={e => { e.stopPropagation(); toggleActive(tech.id, tech.active); }}
                    style={{ width: 40, height: 22, borderRadius: 11, background: tech.active ? "#0cc0df" : "rgba(0,0,0,0.12)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: tech.active ? 21 : 3, transition: "left 0.2s" }} />
                  </button>

                  <span style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>{expanded === tech.id ? "▲" : "▼"}</span>
                </div>

                {/* Expanded details */}
                {expanded === tech.id && (
                  <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "1.25rem" }}>

                    {/* Name + phone */}
                    <div className="team-field-grid">
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Name</label>
                        <input type="text" defaultValue={tech.name}
                          onBlur={e => updateMember(tech.id, { name: e.target.value })}
                          style={inputSt} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Phone</label>
                        <input type="tel" defaultValue={tech.phone ?? ""}
                          placeholder="(716) 555-0100"
                          onBlur={e => updateMember(tech.id, { phone: e.target.value || null })}
                          style={inputSt} />
                      </div>
                    </div>

                    {/* Color */}
                    <div style={{ marginBottom: "1.25rem" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Color</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {COLORS.map(c => (
                          <button key={c} onClick={() => updateMember(tech.id, { color: c })}
                            style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: tech.color === c ? "3px solid #0D1B2A" : "3px solid transparent", cursor: "pointer", padding: 0, transition: "border 0.15s" }} />
                        ))}
                      </div>
                    </div>

                    {/* Schedule */}
                    <div style={{ marginBottom: "1.25rem" }}>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>Schedule</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {DAYS.map(day => (
                          <div key={day} className="team-sched-row">
                            <button onClick={() => updateScheduleDay(tech.id, day, tech.schedule?.[day] ? null : { start: "08:00", end: "17:00" })}
                              style={{ width: 36, height: 22, borderRadius: 11, background: tech.schedule?.[day] ? "#0cc0df" : "rgba(0,0,0,0.1)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                              <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 4, left: tech.schedule?.[day] ? 18 : 4, transition: "left 0.2s" }} />
                            </button>
                            <span style={{ width: 32, fontSize: "0.82rem", fontWeight: 500, color: tech.schedule?.[day] ? "#0D1B2A" : "#9CA3AF" }}>
                              {DAY_LABELS[day]}
                            </span>
                            {tech.schedule?.[day] ? (
                              <div className="team-sched-times">
                                <input type="time" defaultValue={tech.schedule[day]!.start}
                                  onBlur={e => updateScheduleDay(tech.id, day, { start: e.target.value, end: tech.schedule[day]!.end })}
                                  style={{ padding: "0.25rem 0.4rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.8rem", outline: "none" }} />
                                <span style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>to</span>
                                <input type="time" defaultValue={tech.schedule[day]!.end}
                                  onBlur={e => updateScheduleDay(tech.id, day, { start: tech.schedule[day]!.start, end: e.target.value })}
                                  style={{ padding: "0.25rem 0.4rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.8rem", outline: "none" }} />
                              </div>
                            ) : (
                              <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Off</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delete */}
                    {deleteConfirm === tech.id ? (
                      <div className="team-del-confirm">
                        <p style={{ fontSize: "0.875rem", color: "#991B1B", fontWeight: 600 }}>Remove {tech.name} from your team?</p>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={() => setDeleteConfirm(null)}
                            style={{ padding: "0.4rem 0.9rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.82rem", cursor: "pointer" }}>
                            Cancel
                          </button>
                          <button onClick={() => deleteMember(tech.id)}
                            style={{ padding: "0.4rem 0.9rem", background: "#EF4444", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(tech.id)}
                        style={{ fontSize: "0.82rem", color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans'", padding: 0 }}>
                        Remove from team
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add member modal */}
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: "2rem", maxWidth: 480, width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.25rem" }}>ADD TEAM MEMBER</h3>
            <p style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "1.5rem" }}>Add a new member to your team</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }} className="team-field-grid">
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Name *</label>
                <input type="text" placeholder="James" value={newMember.name}
                  onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                  style={inputSt} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Phone</label>
                <input type="tel" placeholder="(716) 555-0100" value={newMember.phone}
                  onChange={e => setNewMember(prev => ({ ...prev, phone: e.target.value }))}
                  style={inputSt} />
              </div>
            </div>

            {/* Color */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Color</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewMember(prev => ({ ...prev, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: newMember.color === c ? "3px solid #0D1B2A" : "3px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>Schedule</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {DAYS.map(day => (
                  <div key={day} className="team-sched-row">
                    <button onClick={() => setNewMember(prev => ({
                      ...prev,
                      schedule: { ...prev.schedule, [day]: prev.schedule[day] ? null : { start: "08:00", end: "17:00" } }
                    }))}
                      style={{ width: 36, height: 22, borderRadius: 11, background: newMember.schedule[day] ? "#0cc0df" : "rgba(0,0,0,0.1)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 4, left: newMember.schedule[day] ? 18 : 4, transition: "left 0.2s" }} />
                    </button>
                    <span style={{ width: 32, fontSize: "0.82rem", fontWeight: 500, color: newMember.schedule[day] ? "#0D1B2A" : "#9CA3AF" }}>{DAY_LABELS[day]}</span>
                    {newMember.schedule[day] ? (
                      <div className="team-sched-times">
                        <input type="time" value={newMember.schedule[day]!.start}
                          onChange={e => setNewMember(prev => ({ ...prev, schedule: { ...prev.schedule, [day]: { start: e.target.value, end: prev.schedule[day]!.end } } }))}
                          style={{ padding: "0.25rem 0.4rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.8rem", outline: "none" }} />
                        <span style={{ color: "#9CA3AF", fontSize: "0.8rem" }}>to</span>
                        <input type="time" value={newMember.schedule[day]!.end}
                          onChange={e => setNewMember(prev => ({ ...prev, schedule: { ...prev.schedule, [day]: { start: prev.schedule[day]!.start, end: e.target.value } } }))}
                          style={{ padding: "0.25rem 0.4rem", background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.8rem", outline: "none" }} />
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Off</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="team-modal-btns">
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: "0.85rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={addMember} disabled={saving || !newMember.name.trim()}
                style={{ flex: 2, padding: "0.85rem", background: saving || !newMember.name.trim() ? "rgba(12,192,223,0.5)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 700, cursor: saving || !newMember.name.trim() ? "not-allowed" : "pointer" }}>
                {saving ? "Adding..." : "Add team member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}