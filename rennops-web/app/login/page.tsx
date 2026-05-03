"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Login() {
  const router = useRouter();

  const [mode, setMode]       = useState<"login" | "signup" | "magic">("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [otp, setOtp] = useState("");

  async function handleSubmit() {
    if (!email || !password) { setError("Please enter your email and password"); return; }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setSuccess("Check your email to confirm your account, then log in.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        // Check if business exists
        const { data: { user } } = await supabase.auth.getUser();
        const { data: biz } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user?.id ?? "")
          .maybeSingle();

        if (biz) {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) { setError("Please enter your email address"); return; }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: undefined, // explicitly undefined forces OTP code not magic link
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMagicSent(true);
    setLoading(false);
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) { setError("Please enter the code"); return; }
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });

    if (error) {
      setError("Invalid or expired code. Please try again.");
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: biz } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user?.id ?? "")
      .maybeSingle();

    router.push(biz ? "/dashboard" : "/onboarding");
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #f0fafe 0%, #ffffff 60%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#0D1B2A", textDecoration: "none", marginBottom: "2.5rem" }}>
        RENN<span style={{ color: "#0cc0df" }}>OPS</span>
      </a>

      <div style={{
        width: "100%", maxWidth: 440,
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 16,
        padding: "2.5rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.4rem" }}>
          {mode === "login" ? "Welcome back" : mode === "magic" ? "Sign in with email" : "Create your account"}
        </h1>
        <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
          {mode === "login" ? "Sign in to your RennOps dashboard" : mode === "magic" ? "We'll send a login link to your inbox" : "Start your 14-day free trial — no credit card required"}
        </p>

        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#065F46" }}>
            {success}
          </div>
        )}

        {/* Google OAuth */}
        <button onClick={handleGoogle} disabled={loading}
          style={{
            width: "100%", padding: "0.85rem",
            background: "white", border: "1.5px solid rgba(0,0,0,0.12)",
            borderRadius: 8, color: "#374151",
            fontFamily: "'DM Sans'", fontSize: "0.95rem", fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: "0.75rem",
            marginBottom: "1.25rem", transition: "all 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#F9FAFB"}
          onMouseLeave={e => e.currentTarget.style.background = "white"}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
          <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", background: "#F9FAFB", borderRadius: 8, padding: 4, marginBottom: "1.5rem", gap: 4 }}>
          {[
            { key: "login",  label: "Password" },
            { key: "magic",  label: "Email code" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => { setMode(key as any); setError(""); setSuccess(""); setMagicSent(false); }}
              style={{
                flex: 1, padding: "0.5rem", background: mode === key ? "white" : "transparent",
                border: "none", borderRadius: 6, color: mode === key ? "#0D1B2A" : "#6B7280",
                fontFamily: "'DM Sans'", fontSize: "0.85rem", fontWeight: mode === key ? 700 : 500,
                cursor: "pointer", boxShadow: mode === key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s",
              }}>
              {label}
            </button>
          ))}
        </div>

        {magicSent ? (
          <div>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <h4 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", color: "#0D1B2A", marginBottom: "0.4rem" }}>CHECK YOUR EMAIL</h4>
              <p style={{ color: "#6B7280", fontSize: "0.875rem", lineHeight: 1.6 }}>
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below to sign in.
              </p>
            </div>

            {error && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter") handleVerifyOtp(); }}
                style={{
                  width: "100%", padding: "0.9rem 1rem",
                  background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)",
                  borderRadius: 8, color: "#0D1B2A",
                  fontFamily: "'DM Mono'", fontSize: "1.5rem",
                  letterSpacing: "0.3em", textAlign: "center",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
                autoFocus
              />
            </div>

            <button onClick={handleVerifyOtp} disabled={loading || otp.length < 6}
              style={{ width: "100%", padding: "0.9rem", background: loading || otp.length < 6 ? "rgba(12,192,223,0.5)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading || otp.length < 6 ? "not-allowed" : "pointer", transition: "all 0.2s", marginBottom: "1rem" }}>
              {loading ? "Verifying..." : "Sign in"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => { setMagicSent(false); setOtp(""); setError(""); }}
                style={{ background: "none", border: "none", color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", cursor: "pointer" }}>
                Different email
              </button>
              <button onClick={handleMagicLink} disabled={loading}
                style={{ background: "none", border: "none", color: "#0cc0df", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                Resend code
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Email field — shown for all modes */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Email</label>
              <input type="email" placeholder="mike@yourbusiness.com" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") mode === "magic" ? handleMagicLink() : handleSubmit(); }}
                style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
            </div>

            {/* Password field — only for login and signup */}
            {mode !== "magic" && (
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Password</label>
                <input type="password" placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                  style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                  onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
              </div>
            )}

            {mode === "magic" && <div style={{ marginBottom: "1.5rem" }} />}

            <button onClick={mode === "magic" ? handleMagicLink : handleSubmit} disabled={loading}
              style={{ width: "100%", padding: "0.9rem", background: loading ? "rgba(12,192,223,0.6)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s", marginBottom: "1.25rem" }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#0aadc9"; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#0cc0df"; }}>
              {loading ? "Please wait..." : mode === "magic" ? "Send login link" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </>
        )}

        <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B7280" }}>
          {mode === "login" ? "Don't have an account? " : mode === "magic" ? "Have a password? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "signup" ? "login" : mode === "login" ? "signup" : "login"); setError(""); setSuccess(""); setMagicSent(false); }}
            style={{ background: "none", border: "none", color: "#0cc0df", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", padding: 0 }}>
            {mode === "login" ? "Sign up free" : mode === "magic" ? "Sign in" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}