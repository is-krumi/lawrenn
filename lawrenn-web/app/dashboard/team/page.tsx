"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";
import { PLAN_FEATURES } from "@/lib/plans";

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
  const { businessId: ctxBusinessId, loading: ctxLoading, userRole, subscriptionTier, memberCount: ctxMemberCount } = useBusiness();

  const planKey = (subscriptionTier ?? "starter") as keyof typeof PLAN_FEATURES;
  const maxSeats = PLAN_FEATURES[planKey]?.maxTeamMembers ?? 1;
  const canInvite = userRole === "owner" || userRole === "admin";

  const [technicians, setTechnicians]     = useState<Technician[]>([]);
  const [memberCount, setMemberCount]     = useState(0);
  const [loading, setLoading]             = useState(true);
  const [showAdd, setShowAdd]             = useState(false);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Invite state
  const [showInvite, setShowInvite]       = useState(false);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [inviteRole, setInviteRole]       = useState("attorney");
  const [inviting, setInviting]           = useState(false);
  const [inviteError, setInviteError]     = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [canResend, setCanResend]         = useState(false);

  // New member form
  const [newMember, setNewMember] = useState({
    name: "", phone: "", color: COLORS[0],
    schedule: { ...defaultSchedule } as Record<string, { start: string; end: string } | null>,
  });

  useEffect(() => {
    if (ctxLoading) return;
    if (!ctxBusinessId) { router.push("/onboarding"); return; }
    setMemberCount(ctxMemberCount);

    async function load() {
      const { data } = await supabase
        .from("technicians")
        .select("id, name, phone, color, active, schedule")
        .eq("business_id", ctxBusinessId)
        .order("created_at", { ascending: true });

      setTechnicians((data as any) ?? []);
      setLoading(false);
    }
    load();
  }, [ctxBusinessId, ctxLoading, ctxMemberCount, router]);

  async function sendInvite(resend = false) {
    if (!inviteEmail.trim()) { setInviteError("Please enter an email address"); return; }
    if (!resend && memberCount >= maxSeats) {
      setInviteError(`You've used all ${maxSeats} seat${maxSeats !== 1 ? "s" : ""} on your plan. Upgrade to add more members.`);
      return;
    }

    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    setCanResend(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setInviteError("Session expired — please refresh."); setInviting(false); return; }

      const res = await fetch("/api/invite-member", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email:       inviteEmail.trim(),
          role:        inviteRole,
          business_id: ctxBusinessId,
          resend,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "already_invited") {
          setInviteError("This email has already been invited.");
          setCanResend(true);
        } else {
          setInviteError(data.error ?? "Failed to send invitation. Please try again.");
        }
      } else {
        setInviteSuccess(resend ? `Invitation resent to ${inviteEmail.trim()}` : `Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
        setInviteRole("attorney");
        setCanResend(false);
        if (!resend) setMemberCount(c => c + 1);
      }
    } catch {
      setInviteError("Something went wrong. Please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function addMember() {
    if (!newMember.name.trim()) return;
    setSaving(true);

    const { data } = await supabase
      .from("technicians")
      .insert({
        business_id: ctxBusinessId,
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading team...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", fontFamily: "'DM Sans', sans-serif" }}>
<div className="team-wrap" style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div className="team-header">
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Team</h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>
              {technicians.filter(t => t.active).length} active team member{technicians.filter(t => t.active).length !== 1 ? "s" : ""}
              {canInvite && (
                <span style={{ marginLeft: "0.75rem", fontSize: "0.8rem", color: memberCount >= maxSeats ? "#EF4444" : "#9CA3AF" }}>
                  · {memberCount} / {maxSeats === 999 ? "∞" : maxSeats} seat{maxSeats !== 1 ? "s" : ""} used
                </span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {canInvite && (
              <button onClick={() => { setShowInvite(true); setInviteError(""); setInviteSuccess(""); setCanResend(false); }}
                disabled={memberCount >= maxSeats}
                style={{ padding: "0.6rem 1.25rem", background: memberCount >= maxSeats ? "rgba(0,0,0,0.08)" : "#111111", border: "none", borderRadius: 8, color: memberCount >= maxSeats ? "#9CA3AF" : "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700, cursor: memberCount >= maxSeats ? "not-allowed" : "pointer" }}>
                + Invite member
              </button>
            )}
            <button onClick={() => setShowAdd(true)}
              style={{ padding: "0.6rem 1.25rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer" }}>
              + Add member
            </button>
          </div>
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

      {/* Invite member modal */}
      {showInvite && (
        <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: "2rem", maxWidth: 440, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.25rem" }}>INVITE TEAM MEMBER</h3>
            <p style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "1.5rem" }}>
              They'll receive an email with a link to join your firm.
              <span style={{ display: "block", marginTop: "0.25rem", color: memberCount >= maxSeats ? "#EF4444" : "#9CA3AF" }}>
                {memberCount} of {maxSeats === 999 ? "unlimited" : maxSeats} seat{maxSeats !== 1 ? "s" : ""} used on your current plan.
              </span>
            </p>

            {inviteError && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991B1B", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <span>{inviteError}</span>
                {canResend && (
                  <button onClick={() => sendInvite(true)} disabled={inviting}
                    style={{ flexShrink: 0, padding: "0.35rem 0.75rem", background: "#111111", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {inviting ? "Sending..." : "Resend invite"}
                  </button>
                )}
              </div>
            )}
            {inviteSuccess && (
              <div style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#065F46" }}>
                {inviteSuccess}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Email address *</label>
              <input
                type="email"
                placeholder="colleague@yourfirm.com"
                value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess(""); setCanResend(false); }}
                onKeyDown={e => { if (e.key === "Enter") sendInvite(); }}
                style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box", cursor: "pointer" }}>
                <option value="attorney">Attorney</option>
                <option value="paralegal">Paralegal</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowInvite(false)}
                style={{ flex: 1, padding: "0.85rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
                style={{ flex: 2, padding: "0.85rem", background: inviting || !inviteEmail.trim() ? "rgba(17,17,17,0.35)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 700, cursor: inviting || !inviteEmail.trim() ? "not-allowed" : "pointer" }}>
                {inviting ? "Sending..." : "Send invitation"}
              </button>
            </div>
          </div>
        </div>
      )}

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