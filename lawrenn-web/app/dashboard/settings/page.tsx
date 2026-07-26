"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VOICE_OPTIONS = [
    { elevenLabsId: "EST9Ui6982FZPSi7gCHi", retellId: "custom_voice_b315a4ce2cf96a8aa40254b66e", name: "Elise",  desc: "Warm & professional",  gender: "Female"  },
    { elevenLabsId: "7EzWGsX10sAS4c9m9cPf", retellId: "custom_voice_d7e2825972e0d4be3afb8d0496", name: "Jack",   desc: "Confident & direct",   gender: "Male"    },
    { elevenLabsId: "DXFkLCBUTmvXpp2QwZjA", retellId: "custom_voice_e4392e8220a2950e47b7a445e0", name: "Eryn",   desc: "Friendly & clear",     gender: "Female"  },
    { elevenLabsId: "SSfU0eLfP3qeuR4j2bwD", retellId: "custom_voice_b8c57bccee79e33aefdf5957f8", name: "Chris",  desc: "Calm & reassuring",    gender: "Male"    },
    { elevenLabsId: "P7x743VjyZEOihNNygQ9", retellId: "custom_voice_ca067a4626b11f2ae8081159e5", name: "Dakota", desc: "Neutral & modern",     gender: "Neutral" },
    { elevenLabsId: "auq43ws1oslv0tO4BDa7", retellId: "custom_voice_2c9b0e5a1f6c9a4fa965cde94e", name: "Adam",   desc: "Deep & authoritative", gender: "Male"    },
];

interface Business {
    id: string;
    name: string;
    phone: string;
    twilio_number: string;
    timezone: string;
    subscription_status: string;
    subscription_tier: string;
    ai_sms_replies: boolean;
    settings: any;
    google_review_url: string | null;
    voice_id: string | null;
    retell_agent_id: string | null;
}

const inputSt: React.CSSProperties = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "#ffffff",
    border: "1.5px solid rgba(0,0,0,0.1)",
    borderRadius: 8,
    color: "#111111",
    fontFamily: "'DM Sans'",
    fontSize: "0.9rem",
    outline: "none",
    boxSizing: "border-box",
};

export default function SettingsPage() {
    const router = useRouter();
    const { businessId, loading: bizLoading } = useBusiness();
    const audioRef = useRef<HTMLAudioElement>(null);

    const [business, setBusiness]       = useState<Business | null>(null);
    const [loading, setLoading]         = useState(true);
    const [saving, setSaving]           = useState(false);
    const [saved, setSaved]             = useState(false);
    const [saveError, setSaveError]     = useState("");
    const [retellError, setRetellError] = useState("");

    // Form state
    const [agentName, setAgentName]         = useState("");
    const [greeting, setGreeting]           = useState("");
    const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0]);
    const [aiSmsReplies, setAiSmsReplies]   = useState(true);
    const [reviewDelay, setReviewDelay]     = useState(2);
    const [travelBuffer, setTravelBuffer]   = useState(30);
    const [reviewUrl, setReviewUrl]         = useState("");

    // Practice areas
    const [practiceAreas, setPracticeAreas]   = useState<{ name: string }[]>([]);
    const [addingArea, setAddingArea]         = useState(false);
    const [newAreaName, setNewAreaName]       = useState("");

    // Preview state
    const [previewLoading, setPreviewLoading] = useState(false);
    const [audioUrl, setAudioUrl]             = useState<string | null>(null);

    useEffect(() => {
        if (bizLoading) return;
        if (!businessId) { router.push("/login"); return; }

        async function load() {
            const { data: biz } = await supabase
                .from("businesses")
                .select("*")
                .eq("id", businessId)
                .single();

            if (!biz) { router.push("/onboarding"); return; }

            setBusiness(biz);
            setAgentName(biz.settings?.ai_persona?.name ?? "Alex");
            setGreeting(biz.settings?.ai_persona?.greeting ?? "");
            setAiSmsReplies(biz.ai_sms_replies !== false);
            setReviewDelay(biz.settings?.review_delay_hrs ?? 2);
            setTravelBuffer(biz.settings?.travel_buffer_mins ?? 30);
            setReviewUrl(biz.google_review_url ?? "");
            setPracticeAreas(biz.settings?.services ?? []);

            if (biz.settings?.ai_persona?.voice_id) {
                const match = VOICE_OPTIONS.find(v => v.retellId === biz.settings.ai_persona.voice_id);
                if (match) setSelectedVoice(match);
            }

            setLoading(false);
        }
        load();
    }, [businessId, bizLoading, router]);

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
                        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                    }),
                }
            );

            if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);

            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            setAudioUrl(url);
            setTimeout(() => audioRef.current?.play(), 100);
        } catch {
            const utterance = new SpeechSynthesisUtterance(greeting);
            utterance.rate  = 0.95;
            window.speechSynthesis.speak(utterance);
        } finally {
            setPreviewLoading(false);
        }
    }

    async function handleSave() {
        if (!business) return;
        setSaving(true);
        setSaveError("");

        const { error } = await supabase
            .from("businesses")
            .update({
                ai_sms_replies:    aiSmsReplies,
                google_review_url: reviewUrl.trim() || null,
                settings: {
                    ...business.settings,
                    ai_persona: {
                        ...business.settings?.ai_persona,
                        name:     agentName.trim(),
                        greeting: greeting.trim(),
                        voice_id: selectedVoice.retellId,
                    },
                    review_delay_hrs:   reviewDelay,
                    travel_buffer_mins: travelBuffer,
                    services:           practiceAreas,
                },
            })
            .eq("id", business.id);

        if (error) {
            setSaveError(error.message ?? "Failed to save settings");
            setSaving(false);
            return;
        }

        // Push voice + greeting changes to the live Retell agent
        setRetellError("");
        try {
            const retellRes = await fetch("/api/update-retell-agent", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    agent_id: business.retell_agent_id,
                    voice_id: selectedVoice.retellId,
                    greeting: greeting.trim(),
                }),
            });
            if (!retellRes.ok) {
                const json = await retellRes.json();
                setRetellError(json.error ?? `Retell update failed (HTTP ${retellRes.status})`);
            }
        } catch (retellErr: any) {
            setRetellError(retellErr.message ?? "Could not reach Retell API");
        }

        // Update local business state so subsequent saves merge correctly
        setBusiness(prev => prev ? {
            ...prev,
            settings: {
                ...prev.settings,
                ai_persona: {
                    ...prev.settings?.ai_persona,
                    name:     agentName.trim(),
                    greeting: greeting.trim(),
                    voice_id: selectedVoice.retellId,
                },
                review_delay_hrs:   reviewDelay,
                travel_buffer_mins: travelBuffer,
                services:           practiceAreas,
            },
        } : prev);

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    function commitArea() {
        if (!newAreaName.trim()) return;
        setPracticeAreas(prev => [...prev, { name: newAreaName.trim() }]);
        setNewAreaName("");
        setAddingArea(false);
    }

    function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
        return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", marginBottom: sub ? "0.2rem" : 0 }}>{label}</p>
                    {sub && <p style={{ fontSize: "0.78rem", color: "#6B7280", lineHeight: 1.5 }}>{sub}</p>}
                </div>
                <button type="button" onClick={() => onChange(!value)}
                    style={{ width: 44, height: 24, borderRadius: 12, background: value ? "#111111" : "rgba(0,0,0,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0, marginLeft: "1rem" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.2s" }} />
                </button>
            </div>
        );
    }

    const sectionSt: React.CSSProperties = {
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: "1.25rem",
    };

    const sectionHeader: React.CSSProperties = {
        padding: "0.875rem 1.25rem",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#9CA3AF",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
    };

    const sectionBody: React.CSSProperties = {
        padding: "1.25rem",
    };

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
                <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading settings...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 2rem" }}>

                <div style={{ marginBottom: "2rem" }}>
                    <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#111111", marginBottom: "0.2rem" }}>Settings</h1>
                    <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Manage your AI assistant and firm configuration</p>
                </div>

                {/* Account */}
                <div style={sectionSt}>
                    <p style={sectionHeader}>Account</p>
                    <div style={{ ...sectionBody, paddingBottom: "1rem" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8, overflow: "hidden", marginBottom: "0.875rem" }}>
                            {[
                                { label: "Firm name",        value: business?.name ?? "—"                         },
                                { label: "Phone number",     value: business?.phone ?? "—"                         },
                                { label: "Lawrenn number",   value: business?.twilio_number ?? "Being provisioned"      },
                                { label: "Timezone",         value: business?.timezone ?? "—"                      },
                                { label: "Plan",             value: business?.subscription_tier ?? "—"             },
                                { label: "Status",           value: business?.subscription_status ?? "—"           },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ background: "white", padding: "0.75rem 1rem" }}>
                                    <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>{label}</p>
                                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111" }}>{value}</p>
                                </div>
                            ))}
                        </div>
                        <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>
                            To update firm name, phone, or timezone &mdash; <a href="/onboarding" style={{ color: "#111111", fontWeight: 500 }}>re-run onboarding</a>
                        </p>
                    </div>
                </div>

                {/* Practice Areas */}
                <div style={sectionSt}>
                    <p style={sectionHeader}>Practice Areas</p>
                    <div style={sectionBody}>
                        <p style={{ fontSize: "0.78rem", color: "#9CA3AF", marginBottom: "1rem", lineHeight: 1.5 }}>
                            These appear as quick-select chips when creating a new matter.
                        </p>

                        {practiceAreas.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column" as const, gap: "0.4rem", marginBottom: "0.875rem" }}>
                                {practiceAreas.map((area, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.9rem", background: "#ffffff", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                                        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111" }}>{area.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setPracticeAreas(prev => prev.filter((_, idx) => idx !== i))}
                                            style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: "1.1rem", lineHeight: 1, padding: "0 0.2rem" }}
                                            title="Remove"
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {addingArea ? (
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="e.g. Contract Review"
                                    value={newAreaName}
                                    onChange={e => setNewAreaName(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") commitArea(); if (e.key === "Escape") { setAddingArea(false); setNewAreaName(""); } }}
                                    style={{ ...inputSt, flex: 1 }}
                                    onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)")}
                                    onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                                />
                                <button type="button" onClick={commitArea}
                                    style={{ padding: "0.75rem 1rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                                    Add
                                </button>
                                <button type="button" onClick={() => { setAddingArea(false); setNewAreaName(""); }}
                                    style={{ padding: "0.75rem 0.75rem", background: "none", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.875rem", cursor: "pointer" }}>
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setAddingArea(true)}
                                style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "1.5px dashed rgba(0,0,0,0.15)", borderRadius: 8, padding: "0.6rem 1rem", color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.82rem", cursor: "pointer", width: "100%" }}>
                                <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add practice area
                            </button>
                        )}
                    </div>
                </div>

                {/* AI Assistant — voice & greeting */}
                <div style={sectionSt}>
                    <p style={sectionHeader}>AI Assistant</p>
                    <div style={sectionBody}>

                        {/* Agent name */}
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Assistant name</label>
                            <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>The name your AI uses when answering calls</p>
                            <input
                                type="text"
                                value={agentName}
                                onChange={e => setAgentName(e.target.value)}
                                placeholder="Alex"
                                style={inputSt}
                                onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)")}
                                onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                            />
                        </div>

                        {/* Voice */}
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Voice</label>
                            <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginBottom: "0.6rem" }}>Choose how your assistant sounds on calls</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                                {VOICE_OPTIONS.map(voice => {
                                    const active = selectedVoice.elevenLabsId === voice.elevenLabsId;
                                    return (
                                        <button
                                            key={voice.elevenLabsId}
                                            type="button"
                                            onClick={() => { setSelectedVoice(voice); setAudioUrl(null); }}
                                            style={{
                                                padding: "0.75rem 0.875rem",
                                                background: active ? "rgba(17,17,17,0.06)" : "#ffffff",
                                                border: `1.5px solid ${active ? "#111111" : "rgba(0,0,0,0.1)"}`,
                                                borderRadius: 8,
                                                cursor: "pointer",
                                                textAlign: "left",
                                                transition: "all 0.12s",
                                            }}
                                        >
                                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: active ? "#111111" : "#374151", marginBottom: "0.15rem" }}>
                                                {voice.name}
                                            </div>
                                            <div style={{ fontSize: "0.72rem", color: "#9CA3AF" }}>{voice.desc}</div>
                                            <div style={{ fontSize: "0.68rem", color: "#9CA3AF", marginTop: "0.1rem" }}>{voice.gender}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Greeting */}
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>Opening greeting</label>
                            <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>What your assistant says when it picks up the phone</p>
                            <textarea
                                value={greeting}
                                onChange={e => { setGreeting(e.target.value); setAudioUrl(null); }}
                                rows={3}
                                placeholder={`Thanks for calling ${business?.name ?? "our firm"}, this is ${agentName} — how can I help you today?`}
                                style={{ ...inputSt, resize: "vertical", lineHeight: 1.6 }}
                                onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)")}
                                onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                            />
                            <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "0.35rem" }}>Keep it under 20 words. Clear and professional.</p>
                        </div>

                        {/* Preview */}
                        <div style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: audioUrl ? "0.75rem" : 0 }}>
                                <div>
                                    <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>Preview greeting</p>
                                    <p style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>Hear how your assistant will sound on calls</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handlePreview}
                                    disabled={previewLoading || !greeting.trim()}
                                    style={{
                                        padding: "0.5rem 1rem",
                                        background: previewLoading ? "rgba(17,17,17,0.4)" : "#111111",
                                        border: "none", borderRadius: 7,
                                        color: "white", fontFamily: "'DM Sans'",
                                        fontSize: "0.82rem", fontWeight: 600,
                                        cursor: previewLoading || !greeting.trim() ? "not-allowed" : "pointer",
                                        transition: "all 0.15s",
                                        flexShrink: 0,
                                    }}
                                >
                                    {previewLoading ? "Generating..." : "▶ Play preview"}
                                </button>
                            </div>
                            {audioUrl && (
                                <audio ref={audioRef} src={audioUrl} controls style={{ width: "100%", height: 36 }} />
                            )}
                        </div>
                    </div>
                </div>

                {/* Review & scheduling */}
                <div style={sectionSt}>
                    <p style={sectionHeader}>Review &amp; Scheduling</p>
                    <div style={sectionBody}>
                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>
                                Review request delay &mdash; <span style={{ fontWeight: 400, color: "#6B7280" }}>{reviewDelay} {reviewDelay === 1 ? "hour" : "hours"} after matter closes</span>
                            </label>
                            <input type="range" min={1} max={24} value={reviewDelay} onChange={e => setReviewDelay(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#111111" }} />
                        </div>

                        <div style={{ marginBottom: "1.25rem" }}>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>
                                Buffer between matters &mdash; <span style={{ fontWeight: 400, color: "#6B7280" }}>{travelBuffer} minutes</span>
                            </label>
                            <input type="range" min={0} max={60} step={5} value={travelBuffer} onChange={e => setTravelBuffer(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#111111" }} />
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.35rem" }}>
                                Google Review URL
                            </label>
                            <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>
                                Sent to clients automatically after a matter closes
                            </p>
                            <input
                                type="url"
                                placeholder="https://g.page/r/your-business/review"
                                value={reviewUrl}
                                onChange={e => setReviewUrl(e.target.value)}
                                style={inputSt}
                                onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.35)")}
                                onBlur={e => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                            />
                            <p style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: "0.35rem" }}>
                                Google Maps &rarr; your firm &rarr; Share &rarr; Copy link
                            </p>
                        </div>
                    </div>
                </div>

                {/* Messaging */}
                <div style={sectionSt}>
                    <p style={sectionHeader}>Messaging</p>
                    <div style={{ padding: "0 1.25rem" }}>
                        <Toggle
                            value={aiSmsReplies}
                            onChange={setAiSmsReplies}
                            label="AI SMS replies"
                            sub="When enabled, your AI automatically replies to client text messages. Complaints and disputes are always escalated to you."
                        />
                    </div>
                    {!aiSmsReplies && (
                        <div style={{ margin: "0 1.25rem 1.25rem", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "0.75rem 1rem" }}>
                            <p style={{ fontSize: "0.82rem", color: "#92400E", lineHeight: 1.5 }}>
                                AI replies are off &mdash; you will receive an SMS alert for every client reply and must respond manually from the Messages page.
                            </p>
                        </div>
                    )}
                </div>

                {/* Save */}
                <button onClick={handleSave} disabled={saving}
                    style={{ width: "100%", padding: "0.9rem", background: saving ? "rgba(17,17,17,0.45)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                    {saving ? "Saving..." : saved ? "Saved" : "Save settings"}
                </button>

                {saveError && (
                    <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#991B1B", marginTop: "0.6rem" }}>
                        {saveError}
                    </p>
                )}

                {retellError && (
                    <div style={{ marginTop: "0.75rem", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "0.75rem 1rem" }}>
                        <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "#92400E", marginBottom: "0.15rem" }}>Settings saved, but Retell agent was not updated</p>
                        <p style={{ fontSize: "0.78rem", color: "#78350F", fontFamily: "'DM Mono', monospace" }}>{retellError}</p>
                    </div>
                )}

                <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#9CA3AF", marginTop: "0.75rem" }}>
                    Changes take effect on the next call or message
                </p>
            </div>
        </div>
    );
}
