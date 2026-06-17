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

type MemberStatus = "active" | "pending";

interface TeamMember {
  id:          string;
  user_id:     string | null;
  role:        string;
  email:       string;
  first_name:  string;
  last_name:   string;
  invited_at:  string | null;
  accepted_at: string | null;
  color:       string | null;
  status:      MemberStatus;
  is_owner:    boolean;
}

const MEMBER_COLORS = [
  "#111111", "#3B82F6", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1",
  "#06B6D4", "#84CC16", "#F97316", "#64748B",
];

function initials(member: TeamMember): string {
  if (member.first_name || member.last_name) {
    return `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`.toUpperCase();
  }
  return member.email.charAt(0).toUpperCase();
}

function displayName(member: TeamMember): string {
  const full = `${member.first_name} ${member.last_name}`.trim();
  return full || member.email;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    owner: "Owner", admin: "Admin", attorney: "Attorney",
    paralegal: "Paralegal", staff: "Staff",
  };
  return map[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

const AVATAR_COLORS = [
  "#111111", "#3B82F6", "#8B5CF6", "#EC4899",
  "#F59E0B", "#10B981", "#EF4444", "#6366F1",
];

function avatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function TeamPage() {
  const router = useRouter();
  const {
    businessId: ctxBusinessId,
    loading:    ctxLoading,
    userRole,
    subscriptionTier,
    memberCount: ctxMemberCount,
  } = useBusiness();

  const planKey  = (subscriptionTier ?? "starter") as keyof typeof PLAN_FEATURES;
  const maxSeats = PLAN_FEATURES[planKey]?.maxTeamMembers ?? 1;
  const canInvite = userRole === "owner" || userRole === "admin";

  const [members, setMembers]         = useState<TeamMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading]         = useState(true);

  // Invite modal state
  const [showInvite, setShowInvite]       = useState(false);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [inviteRole, setInviteRole]       = useState("attorney");
  const [inviting, setInviting]           = useState(false);
  const [inviteError, setInviteError]     = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [canResend, setCanResend]         = useState(false);

  useEffect(() => {
    if (ctxLoading) return;
    if (!ctxBusinessId) { router.push("/onboarding"); return; }
    setMemberCount(ctxMemberCount);
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxBusinessId, ctxLoading]);

  async function fetchMembers() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const res = await fetch("/api/team-members", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const { members: data } = await res.json();
      setMembers(data ?? []);
    }
    setLoading(false);
  }

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
      if (!session) { setInviteError("Session expired — please refresh."); return; }

      const res = await fetch("/api/invite-member", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, business_id: ctxBusinessId, resend }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "already_invited") {
          setInviteError("This email has already been invited.");
          setCanResend(true);
        } else {
          setInviteError(data.error ?? "Failed to send invitation.");
        }
      } else {
        setInviteSuccess(resend ? `Invite resent to ${inviteEmail.trim()}` : `Invitation sent to ${inviteEmail.trim()}`);
        setInviteEmail("");
        setInviteRole("attorney");
        setCanResend(false);
        if (!resend) setMemberCount(c => c + 1);
        fetchMembers();
      }
    } catch {
      setInviteError("Something went wrong. Please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function resendFromRow(email: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/invite-member", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify({ email, role: "member", business_id: ctxBusinessId, resend: true }),
    });
    fetchMembers();
  }

  async function deleteMember(memberId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch("/api/team-members", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify({ member_id: memberId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Failed to remove member. Please try again.");
      return;
    }
    setMembers(prev => prev.filter(m => m.id !== memberId));
    setMemberCount(c => Math.max(0, c - 1));
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading team...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", margin: 0 }}>Team</h1>
            <p style={{ color: "#6B7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {members.filter(m => m.status === "active").length} active member{members.filter(m => m.status === "active").length !== 1 ? "s" : ""}
              {canInvite && (
                <span style={{ marginLeft: "0.75rem", color: memberCount >= maxSeats ? "#EF4444" : "#9CA3AF" }}>
                  · {memberCount} / {maxSeats === 999 ? "∞" : maxSeats} seats used
                </span>
              )}
            </p>
          </div>
          {canInvite && (
            <button
              onClick={() => { setShowInvite(true); setInviteError(""); setInviteSuccess(""); setCanResend(false); }}
              disabled={memberCount >= maxSeats}
              style={{
                padding: "0.6rem 1.25rem",
                background: memberCount >= maxSeats ? "rgba(0,0,0,0.06)" : "#111111",
                border: "none", borderRadius: 8,
                color: memberCount >= maxSeats ? "#9CA3AF" : "white",
                fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 700,
                cursor: memberCount >= maxSeats ? "not-allowed" : "pointer",
              }}>
              + Invite member
            </button>
          )}
        </div>

        {/* ── Member list ── */}
        {members.length === 0 ? (
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "4rem 2rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.4rem" }}>No team members yet</p>
            <p style={{ fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "1.5rem" }}>Invite your first team member to get started</p>
            {canInvite && (
              <button onClick={() => setShowInvite(true)}
                style={{ padding: "0.7rem 1.5rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer" }}>
                Invite member
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {members.map(member => (
              <MemberRow
                key={member.id}
                member={member}
                canInvite={canInvite}
                isOwner={userRole === "owner"}
                onResend={() => resendFromRow(member.email)}
                onDelete={() => deleteMember(member.id)}
                onColorChange={async (color) => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session || member.id.startsWith("owner-")) return;
                  await fetch("/api/team-members", {
                    method:  "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                    body:    JSON.stringify({ member_id: member.id, color }),
                  });
                  setMembers(prev => prev.map(m => m.id === member.id ? { ...m, color } : m));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Invite modal ── */}
      {showInvite && (
        <div onClick={() => setShowInvite(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "white", borderRadius: 16, padding: "2rem", maxWidth: 440, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.03em", color: "#0D1B2A", margin: "0 0 0.25rem" }}>INVITE TEAM MEMBER</h3>
            <p style={{ fontSize: "0.85rem", color: "#6B7280", marginBottom: "1.5rem" }}>
              They'll receive an email to create their account and join your firm.
              <span style={{ display: "block", marginTop: "0.25rem", color: memberCount >= maxSeats ? "#EF4444" : "#9CA3AF" }}>
                {memberCount} of {maxSeats === 999 ? "unlimited" : maxSeats} seat{maxSeats !== 1 ? "s" : ""} used.
              </span>
            </p>

            {inviteError && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#991B1B", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <span>{inviteError}</span>
                {canResend && (
                  <button onClick={() => sendInvite(true)} disabled={inviting}
                    style={{ flexShrink: 0, padding: "0.35rem 0.75rem", background: "#111111", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
                    {inviting ? "Sending..." : "Resend"}
                  </button>
                )}
              </div>
            )}
            {inviteSuccess && (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.875rem", color: "#15803D" }}>
                {inviteSuccess}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "rgba(17,17,17,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Email address</label>
              <input type="email" placeholder="colleague@yourfirm.com" value={inviteEmail}
                onChange={e => { setInviteEmail(e.target.value); setInviteError(""); setInviteSuccess(""); setCanResend(false); }}
                onKeyDown={e => { if (e.key === "Enter") sendInvite(false); }}
                style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "rgba(17,17,17,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
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
              <button onClick={() => sendInvite(false)} disabled={inviting || !inviteEmail.trim()}
                style={{ flex: 2, padding: "0.85rem", background: inviting || !inviteEmail.trim() ? "rgba(17,17,17,0.35)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 700, cursor: inviting || !inviteEmail.trim() ? "not-allowed" : "pointer" }}>
                {inviting ? "Sending..." : "Send invitation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member, canInvite, isOwner, onResend, onDelete, onColorChange,
}: {
  member: TeamMember;
  canInvite: boolean;
  isOwner: boolean;
  onResend: () => void;
  onDelete: () => void;
  onColorChange: (color: string) => Promise<void>;
}) {
  const [resending, setResending]       = useState(false);
  const [resent, setResent]             = useState(false);
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [activeColor, setActiveColor]   = useState(member.color ?? avatarColor(member.email));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteInput, setDeleteInput]   = useState("");
  const [deleting, setDeleting]         = useState(false);

  async function handleResend() {
    setResending(true);
    await onResend();
    setResent(true);
    setResending(false);
    setTimeout(() => setResent(false), 3000);
  }

  async function handleColorPick(color: string) {
    setActiveColor(color);
    setPickerOpen(false);
    await onColorChange(color);
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete();
  }

  const name  = displayName(member);
  const inits = initials(member);
  const isPending = member.status === "pending";
  const isOwnerSyntheticRow = member.id.startsWith("owner-");

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "1rem",
      background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12,
      padding: "1rem 1.25rem", position: "relative",
      opacity: isPending ? 0.85 : 1,
    }}>
      {/* Avatar — clickable for color picker if owner/admin and member has accepted */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          onClick={() => canInvite && !isPending && !isOwnerSyntheticRow && setPickerOpen(p => !p)}
          style={{
            width: 42, height: 42, borderRadius: "50%",
            background: isPending ? "#F3F4F6" : activeColor,
            border: isPending ? "2px dashed rgba(0,0,0,0.15)" : canInvite && !isOwnerSyntheticRow ? "2px solid transparent" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: isPending ? "#9CA3AF" : "white",
            fontWeight: 700, fontSize: "0.95rem",
            letterSpacing: "0.02em",
            cursor: canInvite && !isPending && !isOwnerSyntheticRow ? "pointer" : "default",
            transition: "border-color 0.15s",
          }}
          title={canInvite && !isPending && !isOwnerSyntheticRow ? "Change color" : undefined}
        >
          {inits}
        </div>

        {/* Color picker popover */}
        {pickerOpen && (
          <>
            <div onClick={() => setPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0,
              background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
              padding: "0.6rem", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              zIndex: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.35rem",
            }}>
              {MEMBER_COLORS.map(c => (
                <button key={c} onClick={() => handleColorPick(c)}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c,
                    border: activeColor === c ? "3px solid rgba(0,0,0,0.25)" : "2px solid transparent",
                    cursor: "pointer", padding: 0, transition: "border 0.1s",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Name + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.925rem", fontWeight: 600, color: "#111111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        {name !== member.email && (
          <p style={{ fontSize: "0.8rem", color: "#9CA3AF", margin: "0.1rem 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.email}
          </p>
        )}
      </div>

      {/* Role chip */}
      <span style={{
        flexShrink: 0, padding: "0.25rem 0.65rem",
        background: member.is_owner ? "#111111" : "rgba(0,0,0,0.06)",
        color: member.is_owner ? "white" : "#374151",
        borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
      }}>
        {roleLabel(member.role)}
      </span>

      {/* Status chip */}
      <span style={{
        flexShrink: 0, padding: "0.25rem 0.65rem",
        background: isPending ? "#FEF9C3" : "#DCFCE7",
        color: isPending ? "#A16207" : "#15803D",
        borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
      }}>
        {isPending ? "Invite Sent" : "Active"}
      </span>

      {/* Resend button for pending invites */}
      {isPending && canInvite && (
        <button onClick={handleResend} disabled={resending}
          style={{
            flexShrink: 0, padding: "0.3rem 0.75rem",
            background: "transparent", border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6, color: resent ? "#15803D" : "#374151",
            fontFamily: "'DM Sans'", fontSize: "0.8rem", fontWeight: 600,
            cursor: resending ? "not-allowed" : "pointer",
          }}>
          {resending ? "Sending..." : resent ? "Sent ✓" : "Resend"}
        </button>
      )}

      {/* Delete — owners only, can't delete themselves */}
      {isOwner && !member.is_owner && (
        confirmDelete ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
            <input
              autoFocus
              placeholder="Type &quot;delete&quot;"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && deleteInput === "delete") handleDelete();
                if (e.key === "Escape") { setConfirmDelete(false); setDeleteInput(""); }
              }}
              style={{
                width: 110, padding: "0.28rem 0.55rem",
                border: "1.5px solid #FECACA", borderRadius: 6,
                fontFamily: "'DM Sans'", fontSize: "0.78rem", outline: "none",
                color: "#111111", background: "white",
              }}
            />
            <button onClick={() => { setConfirmDelete(false); setDeleteInput(""); }}
              style={{ padding: "0.25rem 0.6rem", background: "transparent", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.78rem", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting || deleteInput !== "delete"}
              style={{ padding: "0.25rem 0.6rem", background: deleteInput === "delete" ? "#EF4444" : "rgba(239,68,68,0.3)", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.78rem", fontWeight: 700, cursor: deleteInput === "delete" && !deleting ? "pointer" : "not-allowed", transition: "background 0.15s" }}>
              {deleting ? "..." : "Delete"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setConfirmDelete(true); setDeleteInput(""); }}
            onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
            onMouseLeave={e => (e.currentTarget.style.color = "#D1D5DB")}
            title={member.status === "active" ? "Delete account" : "Cancel invite"}
            style={{
              flexShrink: 0, padding: "0.3rem 0.5rem",
              background: "transparent", border: "none",
              borderRadius: 6, color: "#D1D5DB",
              cursor: "pointer", lineHeight: 1,
              transition: "color 0.15s",
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )
      )}
    </div>
  );
}
