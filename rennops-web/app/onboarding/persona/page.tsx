"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VOICE_OPTIONS = [
  { elevenLabsId: "EST9Ui6982FZPSi7gCHi", retellId: "custom_voice_b315a4ce2cf96a8aa40254b66e", name: "Elise",  desc: "Warm & professional",  gender: "Female" },
  { elevenLabsId: "7EzWGsX10sAS4c9m9cPf", retellId: "custom_voice_d7e2825972e0d4be3afb8d0496", name: "Jack",   desc: "Confident & direct",   gender: "Male"   },
  { elevenLabsId: "DXFkLCBUTmvXpp2QwZjA", retellId: "custom_voice_e4392e8220a2950e47b7a445e0", name: "Eryn",   desc: "Friendly & clear",     gender: "Female" },
  { elevenLabsId: "SSfU0eLfP3qeuR4j2bwD", retellId: "custom_voice_b8c57bccee79e33aefdf5957f8", name: "Chris",  desc: "Calm & reassuring",    gender: "Male"   },
  { elevenLabsId: "P7x743VjyZEOihNNygQ9", retellId: "custom_voice_ca067a4626b11f2ae8081159e5", name: "Dakota", desc: "Neutral & modern",     gender: "Neutral"},
  { elevenLabsId: "auq43ws1oslv0tO4BDa7", retellId: "custom_voice_2c9b0e5a1f6c9a4fa965cde94e", name: "Adam",   desc: "Deep & authoritative", gender: "Male"   },
];

export default function OnboardingPersona() {
  const router = useRouter();

  const [businessId, setBusinessId]   = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [agentName, setAgentName]     = useState("Alex");
  const [greeting, setGreeting]       = useState("");
const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [audioUrl, setAudioUrl]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: biz } = await supabase
        .from("businesses")
        .select("id, name, settings")
        .eq("owner_id", user.id)
        .single();

      if (!biz) { router.push("/onboarding"); return; }

      setBusinessId(biz.id);
      setBusinessName(biz.name);

      // Pre-fill if already saved
      if (biz.settings?.ai_persona?.name) {
        setAgentName(biz.settings.ai_persona.name);
      }
      if (biz.settings?.ai_persona?.greeting) {
        setGreeting(biz.settings.ai_persona.greeting);
      } else {
        setGreeting(`Thanks for calling ${biz.name}, this is Alex — how can I help you today?`);
      }
      if (biz.settings?.ai_persona?.voice_id) {
        const match = VOICE_OPTIONS.find(v => v.retellId === biz.settings.ai_persona.voice_id);
        if (match) setSelectedVoice(match);
      }
    }
    load();
  }, [router]);

  // Update greeting when agent name changes
  function handleAgentNameChange(name: string) {
    setAgentName(name);
    setGreeting(prev => prev.replace(/this is \w+/i, `this is ${name}`));
    setAudioUrl(null);
  }

async function handlePreview() {
  if (!greeting.trim()) return;
  setPreviewLoading(true);
  setAudioUrl(null);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice.elevenLabsId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key":   process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY!,
          "Content-Type": "application/json",
          "Accept":       "audio/mpeg",
        },
        body: JSON.stringify({
          text:           greeting,
          model_id:       "eleven_turbo_v2",
          voice_settings: {
            stability:        0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    setAudioUrl(url);
    setTimeout(() => audioRef.current?.play(), 100);

  } catch (err) {
    console.error("Preview error:", err);
    // Fallback to browser TTS
    const utterance = new SpeechSynthesisUtterance(greeting);
    utterance.rate  = 0.95;
    window.speechSynthesis.speak(utterance);
  } finally {
    setPreviewLoading(false);
  }
}

  async function handleNext() {
    if (!agentName.trim()) { setError("Agent name is required"); return; }
    if (!greeting.trim())  { setError("Greeting is required"); return; }

    setLoading(true);
    setError("");

    try {
      const { data: biz } = await supabase
        .from("businesses")
        .select("settings")
        .eq("id", businessId)
        .single();

      await supabase
        .from("businesses")
        .update({
          settings: {
            ...biz?.settings,
            ai_persona: {
              name:     agentName.trim(),
              greeting: greeting.trim(),
              voice_id: selectedVoice.retellId,
            },
          },
        })
        .eq("id", businessId);

      router.push("/onboarding/phone");

    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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

      {/* Logo */}
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#0D1B2A", textDecoration: "none", marginBottom: "2.5rem" }}>
        RENN<span style={{ color: "#0cc0df" }}>OPS</span>
      </a>

      {/* Progress — 5 steps now */}
      <div style={{ width: "100%", maxWidth: 560, marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          {["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: i < 4 ? "#0cc0df" : "rgba(0,0,0,0.08)",
                color: i < 4 ? "white" : "#6B7280",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.8rem", fontWeight: 700,
                border: i < 4 ? "none" : "1.5px solid rgba(0,0,0,0.1)",
              }}>{i < 3 ? "✓" : i + 1}</div>
              <span style={{ fontSize: "0.72rem", color: i === 3 ? "#0cc0df" : "#6B7280", fontWeight: i === 3 ? 600 : 400 }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: "80%", background: "#0cc0df", borderRadius: 2 }} />
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
        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.4rem" }}>
          Set up your AI agent
        </h1>
        <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
          Customize how your AI receptionist sounds and what it says when it answers.
        </p>

        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {/* Agent name */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
            Agent name
          </label>
          <p style={{ fontSize: "0.78rem", color: "#6B7280", marginBottom: "0.5rem" }}>
            The name your AI will use when answering calls
          </p>
          <input
            type="text"
            placeholder="Alex"
            value={agentName}
            onChange={e => handleAgentNameChange(e.target.value)}
            style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.95rem", outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
          />
        </div>

        {/* Greeting */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
            Opening greeting
          </label>
          <p style={{ fontSize: "0.78rem", color: "#6B7280", marginBottom: "0.5rem" }}>
            What your agent says when it picks up the phone
          </p>
          <textarea
            value={greeting}
            onChange={e => { setGreeting(e.target.value); setAudioUrl(null); }}
            rows={3}
            style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
          />
          <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "0.35rem" }}>
            Keep it under 20 words. Clear and friendly.
          </p>
        </div>

        {/* Voice selection */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>
            Voice
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
            {VOICE_OPTIONS.map(voice => (
              <button key={voice.elevenLabsId} onClick={() => { setSelectedVoice(voice); setAudioUrl(null); }}
                style={{
                  padding: "0.75rem 1rem",
                  background: selectedVoice.elevenLabsId === voice.elevenLabsId ? "rgba(12,192,223,0.08)" : "#F9FAFB",
                  border: `1.5px solid ${selectedVoice.elevenLabsId === voice.elevenLabsId ? "#0cc0df" : "rgba(0,0,0,0.1)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: selectedVoice.elevenLabsId === voice.elevenLabsId ? "#0cc0df" : "#0D1B2A", marginBottom: "0.15rem" }}>
                  {voice.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>{voice.desc} · {voice.gender}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Audio preview */}
        <div style={{ background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "1.25rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: audioUrl ? "0.75rem" : 0 }}>
            <div>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.15rem" }}>Preview your greeting</p>
              <p style={{ fontSize: "0.78rem", color: "#6B7280" }}>Hear exactly how your agent will sound</p>
            </div>
            <button onClick={handlePreview} disabled={previewLoading}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.6rem 1.1rem",
                background: previewLoading ? "rgba(12,192,223,0.6)" : "#0cc0df",
                border: "none", borderRadius: 8,
                color: "white", fontFamily: "'DM Sans'",
                fontSize: "0.875rem", fontWeight: 600,
                cursor: previewLoading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}>
              {previewLoading ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Generating...
                </>
              ) : (
                <>▶ Play preview</>
              )}
            </button>
          </div>

          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} controls
              style={{ width: "100%", height: 36, accentColor: "#0cc0df" }} />
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {/* Preview of what caller hears */}
        <div style={{ background: "rgba(12,192,223,0.04)", border: "1px solid rgba(12,192,223,0.15)", borderRadius: 10, padding: "1rem", marginBottom: "2rem" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#0cc0df", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
            What your caller will hear
          </p>
          <p style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.6, fontStyle: "italic" }}>
            &ldquo;{greeting || `Thanks for calling ${businessName}, this is ${agentName} — how can I help you today?`}&rdquo;
          </p>
        </div>

        {/* Back + Next */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={() => router.push("/onboarding/team")}
            style={{ flex: 1, padding: "0.9rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>
            ← Back
          </button>
          <button onClick={handleNext} disabled={loading}
            style={{ flex: 2, padding: "0.9rem", background: loading ? "rgba(12,192,223,0.6)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
            {loading ? "Saving..." : "Next — Set up your phone →"}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6B7280", marginTop: "1rem" }}>
          Step 4 of 5 · Your progress is saved automatically
        </p>
      </div>
    </div>
  );
}