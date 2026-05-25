"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern Time (ET)" },
  { value: "America/Chicago",     label: "Central Time (CT)" },
  { value: "America/Denver",      label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix",     label: "Arizona (MST)" },
  { value: "America/Anchorage",   label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii Time (HT)" },
];

export default function OnboardingStep1() {
  const router = useRouter();

  const [form, setForm] = useState({
    businessName: "",
    phone:        "",
    timezone:     "America/New_York",
    zipCodes:     "",
  });

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.businessName.trim())  e.businessName = "Business name is required";
    if (!form.phone.trim())         e.phone        = "Phone number is required";
    if (!/^\+?[\d\s\-().]{10,}$/.test(form.phone.replace(/\s/g, "")))
                                    e.phone        = "Enter a valid phone number";
    if (!form.timezone)             e.timezone     = "Please select a timezone";
    return e;
  }

  async function handleNext() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }

    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Format phone to E.164
      const phone = form.phone.replace(/\D/g, "");
      const e164  = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;

      // Parse zip codes
      const zips = form.zipCodes
        .split(/[\s,]+/)
        .map(z => z.trim())
        .filter(z => /^\d{5}$/.test(z));

      // Check if business already exists for this user
      const { data: existing } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        await supabase
          .from("businesses")
          .update({
            name:     form.businessName.trim(),
            phone:    e164,
            timezone: form.timezone,
            settings: { service_area_zips: zips },
          })
          .eq("id", existing.id);
      } else {
        // Create new
        await supabase
          .from("businesses")
          .insert({
            owner_id:            user.id,
            name:                form.businessName.trim(),
            phone:               e164,
            timezone:            form.timezone,
            subscription_status: "trialing",
            subscription_tier:   "pro",
            settings: {
              service_area_zips: zips,
              services:          [],
              operating_hours:   {},
              ai_persona:        { name: "Alex", greeting: `Thanks for calling ${form.businessName.trim()}` },
              review_delay_hrs:  2,
              travel_buffer_mins: 30,
            },
          });
      }

      // Move to step 2
      router.push("/onboarding/services");

    } catch (err) {
      console.error(err);
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #f0fafe 0%, #ffffff 60%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* Logo */}
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "var(--navy)", textDecoration: "none", marginBottom: "2.5rem" }}>
        RENN<span style={{ color: "var(--cyan)" }}>OPS</span>
      </a>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 520, marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
{["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: i === 0 ? "var(--cyan)" : "rgba(0,0,0,0.08)",
                color: i === 0 ? "white" : "var(--grey)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.8rem", fontWeight: 700,
                border: i === 0 ? "none" : "1.5px solid rgba(0,0,0,0.1)",
              }}>{i + 1}</div>
              <span style={{ fontSize: "0.72rem", color: i === 0 ? "var(--cyan)" : "var(--grey)", fontWeight: i === 0 ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: "20%", background: "var(--cyan)", borderRadius: 2, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 520,
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 16,
        padding: "2.5rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "var(--navy)", marginBottom: "0.4rem" }}>
          Tell us about your business
        </h1>
        <p style={{ color: "var(--grey)", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
          This info is used to personalise your AI agent and set up your account.
        </p>

        {errors.form && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
            {errors.form}
          </div>
        )}

        {/* Business name */}
        <Field label="Business name" error={errors.businessName}>
          <input
            type="text"
            placeholder="e.g. Mike's HVAC"
            value={form.businessName}
            onChange={e => set("businessName", e.target.value)}
            style={inputStyle(!!errors.businessName)}
          />
        </Field>

        {/* Phone */}
        <Field label="Your phone number" error={errors.phone} hint="This is where urgent calls and booking alerts will be sent">
          <input
            type="tel"
            placeholder="(716) 555-0100"
            value={form.phone}
            onChange={e => set("phone", e.target.value)}
            style={inputStyle(!!errors.phone)}
          />
        </Field>

        {/* Timezone */}
        <Field label="Timezone" error={errors.timezone}>
          <select
            value={form.timezone}
            onChange={e => set("timezone", e.target.value)}
            style={inputStyle(!!errors.timezone)}
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>

        {/* Zip codes */}
        <Field label="Service area zip codes" error={errors.zipCodes} hint="Optional — separate multiple zip codes with commas">
          <input
            type="text"
            placeholder="14201, 14202, 14203"
            value={form.zipCodes}
            onChange={e => set("zipCodes", e.target.value)}
            style={inputStyle(false)}
          />
        </Field>

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.9rem",
            background: loading ? "rgba(12,192,223,0.6)" : "var(--cyan)",
            border: "none",
            borderRadius: 8,
            color: "white",
            fontFamily: "'DM Sans'",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: "0.5rem",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "var(--cyan-dark)"; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "var(--cyan)"; }}
        >
          {loading ? "Saving..." : "Next — Add your services →"}
        </button>

        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--grey)", marginTop: "1rem" }}>
          Step 1 of 4 · Your progress is saved automatically
        </p>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function Field({ label, error, hint, children }: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p style={{ fontSize: "0.78rem", color: "var(--grey)", marginTop: "0.35rem" }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: "0.78rem", color: "#DC2626", marginTop: "0.35rem" }}>{error}</p>
      )}
    </div>
  );
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#F9FAFB",
    border: `1.5px solid ${hasError ? "#FCA5A5" : "rgba(0,0,0,0.1)"}`,
    borderRadius: 8,
    color: "#0D1B2A",
    fontFamily: "'DM Sans'",
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };
}