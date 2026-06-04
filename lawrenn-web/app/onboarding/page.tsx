"use client";

import { useState, useRef, useEffect } from "react";
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

const JURISDICTIONS = [
  "Federal",
  "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
  "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "Washington D.C.", "West Virginia", "Wisconsin",
  "Wyoming", "Puerto Rico", "U.S. Virgin Islands", "Guam",
];

export default function OnboardingStep1() {
  const router = useRouter();

  const [form, setForm] = useState({
    businessName: "",
    phone:        "",
    timezone:     "America/New_York",
  });
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [jurisOpen, setJurisOpen]         = useState(false);
  const [jurisSearch, setJurisSearch]     = useState("");
  const jurisRef = useRef<HTMLDivElement>(null);

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (jurisRef.current && !jurisRef.current.contains(e.target as Node)) {
        setJurisOpen(false);
        setJurisSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: "" }));
  }

  function toggleJurisdiction(j: string) {
    setJurisdictions(prev =>
      prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]
    );
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.businessName.trim())  e.businessName = "Firm name is required";
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const phone = form.phone.replace(/\D/g, "");
      const e164  = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;

      const { data: existing } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from("businesses")
          .update({
            name:     form.businessName.trim(),
            phone:    e164,
            timezone: form.timezone,
            settings: { jurisdictions },
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("businesses")
          .insert({
            owner_id:            user.id,
            name:                form.businessName.trim(),
            phone:               e164,
            timezone:            form.timezone,
            subscription_status: "trialing",
            subscription_tier:   "pro",
            settings: {
              jurisdictions,
              services:          [],
              operating_hours:   {},
              ai_persona:        { name: "Alex", greeting: `Thanks for calling ${form.businessName.trim()}` },
              review_delay_hrs:  2,
            },
          });
        if (insertError) throw insertError;
      }

      router.push("/onboarding/services");

    } catch (err: any) {
      console.error(err);
      setErrors({ form: err?.message ?? JSON.stringify(err) ?? "Something went wrong." });
    } finally {
      setLoading(false);
    }
  }

  const filtered = JURISDICTIONS.filter(j =>
    j.toLowerCase().includes(jurisSearch.toLowerCase())
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F5F5F0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* Logo */}
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#111111", textDecoration: "none", marginBottom: "2.5rem" }}>
        LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
      </a>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 520, marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          {["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: i === 0 ? "#111111" : "rgba(0,0,0,0.08)",
                color: i === 0 ? "white" : "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.8rem", fontWeight: 700,
                border: i === 0 ? "none" : "1.5px solid rgba(0,0,0,0.1)",
              }}>{i + 1}</div>
              <span style={{ fontSize: "0.72rem", color: i === 0 ? "#111111" : "#6B7280", fontWeight: i === 0 ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: "20%", background: "#111111", borderRadius: 2, transition: "width 0.3s" }} />
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
        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.4rem" }}>
          Tell us about your firm
        </h1>
        <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
          This info is used to personalise your AI assistant and set up your account.
        </p>

        {errors.form && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
            {errors.form}
          </div>
        )}

        {/* Firm name */}
        <Field label="Firm name" error={errors.businessName}>
          <input
            type="text"
            placeholder="e.g. Smith & Associates LLP"
            value={form.businessName}
            onChange={e => set("businessName", e.target.value)}
            style={inputStyle(!!errors.businessName)}
          />
        </Field>

        {/* Phone */}
        <Field label="Your phone number" error={errors.phone} hint="Urgent alerts will be sent here">
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
          <div style={{ position: "relative" }}>
            <select
              value={form.timezone}
              onChange={e => set("timezone", e.target.value)}
              style={{ ...inputStyle(!!errors.timezone), appearance: "none", paddingRight: "2.5rem" }}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <span style={{
              position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)",
              color: "#9CA3AF", fontSize: "0.75rem", pointerEvents: "none",
            }}>▼</span>
          </div>
        </Field>

        {/* Jurisdictions multi-select */}
        <div style={{ marginBottom: "1.25rem" }} ref={jurisRef}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
            Primary jurisdictions <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(optional)</span>
          </label>

          {/* Selected pills */}
          {jurisdictions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
              {jurisdictions.map(j => (
                <span key={j} style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem",
                  background: "#111111", color: "white",
                  borderRadius: 20, fontSize: "0.8rem", fontWeight: 500,
                }}>
                  {j}
                  <button
                    onClick={() => toggleJurisdiction(j)}
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: "1rem" }}
                  >&times;</button>
                </span>
              ))}
            </div>
          )}

          {/* Dropdown trigger */}
          <button
            type="button"
            onClick={() => { setJurisOpen(o => !o); setJurisSearch(""); }}
            style={{
              width: "100%", padding: "0.75rem 1rem",
              background: "#F5F5F0",
              border: "1.5px solid rgba(0,0,0,0.1)",
              borderRadius: 8, color: jurisdictions.length ? "#111111" : "#9CA3AF",
              fontFamily: "'DM Sans'", fontSize: "0.95rem",
              cursor: "pointer", textAlign: "left",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <span>{jurisdictions.length ? `${jurisdictions.length} selected` : "Select jurisdictions..."}</span>
            <span style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>{jurisOpen ? "▲" : "▼"}</span>
          </button>

          {/* Dropdown panel */}
          {jurisOpen && (
            <div style={{
              position: "absolute", zIndex: 50,
              width: "100%", maxWidth: 456,
              background: "white",
              border: "1.5px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
              marginTop: 4,
              overflow: "hidden",
            }}>
              {/* Search */}
              <div style={{ padding: "0.5rem" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search..."
                  value={jurisSearch}
                  onChange={e => setJurisSearch(e.target.value)}
                  style={{
                    width: "100%", padding: "0.5rem 0.75rem",
                    background: "#F5F5F0", border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.875rem",
                    color: "#111111", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Options list */}
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#9CA3AF" }}>No results</p>
                ) : filtered.map(j => {
                  const selected = jurisdictions.includes(j);
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggleJurisdiction(j)}
                      style={{
                        width: "100%", padding: "0.6rem 1rem",
                        background: selected ? "rgba(17,17,17,0.05)" : "transparent",
                        border: "none", cursor: "pointer",
                        textAlign: "left", fontFamily: "'DM Sans'",
                        fontSize: "0.875rem",
                        color: "#111111",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#F5F5F0"; }}
                      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
                    >
                      {j}
                      {selected && <span style={{ color: "#111111", fontWeight: 700 }}>✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>{jurisdictions.length} selected</span>
                <button
                  type="button"
                  onClick={() => { setJurisOpen(false); setJurisSearch(""); }}
                  style={{ background: "#111111", border: "none", borderRadius: 6, color: "white", fontFamily: "'DM Sans'", fontSize: "0.8rem", fontWeight: 600, padding: "0.35rem 0.85rem", cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.9rem",
            background: loading ? "rgba(17,17,17,0.45)" : "#111111",
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
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#000000"; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#111111"; }}
        >
          {loading ? "Saving..." : "Next — Add your services →"}
        </button>

        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6B7280", marginTop: "1rem" }}>
          Step 1 of 5 · Your progress is saved automatically
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
        <p style={{ fontSize: "0.78rem", color: "#6B7280", marginTop: "0.35rem" }}>{hint}</p>
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
    background: "#F5F5F0",
    border: `1.5px solid ${hasError ? "#FCA5A5" : "rgba(0,0,0,0.1)"}`,
    borderRadius: 8,
    color: "#111111",
    fontFamily: "'DM Sans'",
    fontSize: "0.95rem",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };
}
