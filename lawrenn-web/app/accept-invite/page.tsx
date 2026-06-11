"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Invite = {
  id: string;
  invited_email: string;
  role: string;
  business_name: string;
};

type Step = "loading" | "auth" | "profile" | "accepting" | "success" | "error" | "invalid";

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  fontSize: "0.95rem",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 8,
  outline: "none",
  fontFamily: "'DM Sans', sans-serif",
  color: "#111111",
  background: "white",
  boxSizing: "border-box",
};

const BTN: React.CSSProperties = {
  width: "100%",
  padding: "0.85rem",
  background: "#111111",
  color: "white",
  border: "none",
  borderRadius: 8,
  fontFamily: "'DM Sans', sans-serif",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer",
  marginTop: "0.5rem",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "rgba(17,17,17,0.5)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.4rem" }}>
      {children}
    </label>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{ padding: "0.75rem 1rem", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#991B1B", fontSize: "0.875rem", lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

function AcceptInviteInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const inviteId     = searchParams.get("id");

  const [step, setStep]     = useState<Step>("loading");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [errMsg, setErrMsg] = useState("");

  // auth step
  const [authMode, setAuthMode]           = useState<"create" | "signin">("create");
  const [password, setPassword]           = useState("");
  const [confirmPw, setConfirmPw]         = useState("");
  const [authErr, setAuthErr]             = useState("");
  const [authLoading, setAuthLoading]     = useState(false);
  const [showPw, setShowPw]               = useState(false);

  // profile step
  const [firstName, setFirstName]         = useState("");
  const [lastName, setLastName]           = useState("");
  const [profileErr, setProfileErr]       = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!inviteId) { setStep("invalid"); return; }
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteId]);

  async function loadInvite() {
    const res  = await fetch(`/api/invite-details?id=${inviteId}`);
    const data = await res.json();
    if (!res.ok) { setErrMsg(data.error ?? "Invite not found."); setStep("error"); return; }

    const inv: Invite = data.invite;
    setInvite(inv);

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (session.user.email?.toLowerCase() === inv.invited_email.toLowerCase()) {
        // Pre-fill name from existing metadata
        const meta = session.user.user_metadata;
        if (meta?.first_name) setFirstName(meta.first_name);
        if (meta?.last_name)  setLastName(meta.last_name);
        setStep("profile");
      } else {
        setErrMsg(`This invite was sent to ${inv.invited_email}. You're signed in as ${session.user.email}. Sign out first, then click the invite link again.`);
        setStep("error");
      }
    } else {
      setStep("auth");
    }
  }

  async function handleCreateAccount() {
    if (!invite) return;
    setAuthErr("");
    if (password.length < 8) { setAuthErr("Password must be at least 8 characters."); return; }
    if (password !== confirmPw) { setAuthErr("Passwords don't match."); return; }

    setAuthLoading(true);
    try {
      const res  = await fetch("/api/accept-invite/create-account", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ invite_id: invite.id, password }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthErr(data.error ?? "Failed to create account."); return; }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.invited_email, password,
      });
      if (signInErr) { setAuthErr(signInErr.message); return; }

      setStep("profile");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignIn() {
    if (!invite) return;
    setAuthErr("");
    setAuthLoading(true);
    try {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite.invited_email, password,
      });
      if (signInErr) { setAuthErr(signInErr.message); return; }

      const meta = signInData.session?.user.user_metadata;
      if (meta?.first_name) setFirstName(meta.first_name);
      if (meta?.last_name)  setLastName(meta.last_name);
      setStep("profile");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleProfileSubmit() {
    if (!firstName.trim()) { setProfileErr("First name is required."); return; }
    if (!lastName.trim())  { setProfileErr("Last name is required."); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setProfileErr("Session expired. Please refresh the page."); return; }

    setProfileLoading(true);
    setStep("accepting");

    try {
      const res  = await fetch("/api/accept-invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ invite_id: inviteId, first_name: firstName.trim(), last_name: lastName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error ?? "Failed to accept invite.");
        setStep("error");
        return;
      }
      setStep("success");
      setTimeout(() => router.push("/dashboard"), 2500);
    } catch (e: any) {
      setErrMsg(e.message ?? "Something went wrong.");
      setStep("error");
    } finally {
      setProfileLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    width: "100%", maxWidth: 440,
    background: "white",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 16,
    padding: "2.5rem",
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F5F5F0",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem", fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #111111 !important; box-shadow: 0 0 0 3px rgba(17,17,17,0.08); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#111111", textDecoration: "none", marginBottom: "2rem" }}>
        LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
      </a>

      {/* ── LOADING ── */}
      {step === "loading" && (
        <div style={cardStyle}>
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(0,0,0,0.08)", borderTopColor: "#111111", animation: "spin 0.8s linear infinite", margin: "0 auto 1.25rem" }} />
            <p style={{ color: "#6B7280", fontSize: "0.95rem" }}>Loading invitation...</p>
          </div>
        </div>
      )}

      {/* ── AUTH ── */}
      {step === "auth" && invite && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "1.75rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.35rem" }}>
              Invitation to join
            </p>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", margin: "0 0 0.25rem" }}>
              {invite.business_name}
            </h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>
              Invited as <strong style={{ color: "#111111", textTransform: "capitalize" }}>{invite.role}</strong> · {invite.invited_email}
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: "flex", background: "#F5F5F0", borderRadius: 8, padding: 3, marginBottom: "1.5rem" }}>
            {(["create", "signin"] as const).map(m => (
              <button key={m} onClick={() => { setAuthMode(m); setAuthErr(""); setPassword(""); setConfirmPw(""); }}
                style={{ flex: 1, padding: "0.5rem", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "0.875rem",
                  background: authMode === m ? "white" : "transparent",
                  color: authMode === m ? "#111111" : "#6B7280",
                  boxShadow: authMode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s",
                }}>
                {m === "create" ? "Create account" : "Sign in"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <Label>Email</Label>
              <input value={invite.invited_email} readOnly style={{ ...INPUT, background: "#F5F5F0", color: "#6B7280" }} />
            </div>

            <div>
              <Label>Password</Label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={authMode === "create" ? "At least 8 characters" : "Enter your password"}
                  style={{ ...INPUT, paddingRight: "3rem" }}
                  onKeyDown={e => { if (e.key === "Enter") authMode === "create" ? handleCreateAccount() : handleSignIn(); }}
                />
                <button onClick={() => setShowPw(p => !p)} type="button"
                  style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
                  {showPw
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {authMode === "create" && (
              <div>
                <Label>Confirm password</Label>
                <input type={showPw ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter your password"
                  style={INPUT}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateAccount(); }}
                />
              </div>
            )}

            <ErrorBox msg={authErr} />

            <button style={BTN} disabled={authLoading}
              onClick={authMode === "create" ? handleCreateAccount : handleSignIn}>
              {authLoading
                ? "Please wait..."
                : authMode === "create" ? "Create account & continue" : "Sign in & continue"}
            </button>
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {step === "profile" && invite && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "1.75rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.35rem" }}>
              Almost there
            </p>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", margin: "0 0 0.25rem" }}>
              Set up your profile
            </h1>
            <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>
              This is how you'll appear to your team at {invite.business_name}.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div style={{ flex: 1 }}>
                <Label>First name</Label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Jane" autoFocus style={INPUT}
                  onKeyDown={e => { if (e.key === "Enter") handleProfileSubmit(); }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Label>Last name</Label>
                <input value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Smith" style={INPUT}
                  onKeyDown={e => { if (e.key === "Enter") handleProfileSubmit(); }}
                />
              </div>
            </div>

            <ErrorBox msg={profileErr} />

            <button style={BTN} disabled={profileLoading} onClick={handleProfileSubmit}>
              {profileLoading ? "Joining..." : `Join ${invite.business_name} →`}
            </button>
          </div>
        </div>
      )}

      {/* ── ACCEPTING ── */}
      {step === "accepting" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "3rem 2.5rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(0,0,0,0.08)", borderTopColor: "#111111", animation: "spin 0.8s linear infinite", margin: "0 auto 1.25rem" }} />
          <p style={{ color: "#6B7280", fontSize: "0.95rem" }}>Accepting your invitation...</p>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {step === "success" && invite && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "3rem 2.5rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#D1FAE5", border: "1px solid #6EE7B7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", margin: "0 0 0.5rem" }}>
            YOU'RE IN!
          </h1>
          <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.6 }}>
            You've joined <strong style={{ color: "#111111" }}>{invite.business_name}</strong> on Lawrenn.<br />
            Taking you to your dashboard...
          </p>
        </div>
      )}

      {/* ── ERROR ── */}
      {(step === "error" || step === "invalid") && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "3rem 2.5rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEE2E2", border: "1px solid #FCA5A5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#991B1B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {step === "invalid"
                ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
              }
            </svg>
          </div>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", margin: "0 0 0.75rem" }}>
            {step === "invalid" ? "INVALID LINK" : "SOMETHING WENT WRONG"}
          </h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
            {step === "invalid"
              ? "This invitation link is missing. Ask your firm admin to resend the invite."
              : errMsg}
          </p>
          <a href="/" style={{ display: "inline-block", padding: "0.75rem 1.75rem", background: "#111111", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 700, textDecoration: "none" }}>
            Back to home
          </a>
        </div>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6B7280" }}>Loading...</p>
      </div>
    }>
      <AcceptInviteInner />
    </Suspense>
  );
}
