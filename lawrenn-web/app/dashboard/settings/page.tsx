"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useBusiness } from "@/context/BusinessContext";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
}

export default function SettingsPage() {
    const router = useRouter();
    const { businessId, loading: bizLoading } = useBusiness();

    const [business, setBusiness] = useState<Business | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState("");

    // Form state
    const [agentName, setAgentName] = useState("");
    const [greeting, setGreeting] = useState("");
    const [aiSmsReplies, setAiSmsReplies] = useState(true);
    const [reviewDelay, setReviewDelay] = useState(2);
    const [travelBuffer, setTravelBuffer] = useState(30);
    const [reviewUrl, setReviewUrl] = useState("");

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
            setLoading(false);
        }
        load();
    }, [businessId, bizLoading, router]);

    async function handleSave() {
        if (!business) return;
        setSaving(true);
        setSaveError("");

        const { error } = await supabase
            .from("businesses")
            .update({
                ai_sms_replies: aiSmsReplies,
                google_review_url: reviewUrl.trim() || null,
                settings: {
                    ...business.settings,
                    ai_persona: {
                        ...business.settings?.ai_persona,
                        name: agentName.trim(),
                        greeting: greeting.trim(),
                    },
                    review_delay_hrs: reviewDelay,
                    travel_buffer_mins: travelBuffer,
                },
            })
            .eq("id", business.id);

        if (error) {
            setSaveError(error.message ?? "Failed to save settings");
            setSaving(false);
            return;
        }

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    }

    function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
        return (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <div>
                    <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0D1B2A", marginBottom: sub ? "0.2rem" : 0 }}>{label}</p>
                    {sub && <p style={{ fontSize: "0.78rem", color: "#6B7280" }}>{sub}</p>}
                </div>
                <button onClick={() => onChange(!value)}
                    style={{ width: 44, height: 24, borderRadius: 12, background: value ? "#0cc0df" : "rgba(0,0,0,0.15)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.2s" }} />
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
                <p style={{ color: "#6B7280" }}>Loading settings...</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem" }}>
                <div style={{ marginBottom: "2rem" }}>
                    <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.25rem" }}>Settings</h1>
                    <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>Manage your AI agent and business configuration</p>
                </div>

                {/* Account info */}
                <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "1rem" }}>Account</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        {[
                            { label: "Business name", value: business?.name ?? "—" },
                            { label: "Phone number", value: business?.phone ?? "—" },
                            { label: "RennOps number", value: business?.twilio_number ?? "Being provisioned" },
                            { label: "Timezone", value: business?.timezone ?? "—" },
                            { label: "Plan", value: business?.subscription_tier ?? "—" },
                            { label: "Status", value: business?.subscription_status ?? "—" },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ background: "#F9FAFB", borderRadius: 8, padding: "0.75rem 1rem" }}>
                                <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.25rem" }}>{label}</p>
                                <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0D1B2A" }}>{value}</p>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: "1rem" }}>
                        To update business name, phone, or timezone — <a href="/onboarding" style={{ color: "#0cc0df" }}>re-run onboarding</a>
                    </p>
                </div>

                {/* AI Agent */}
                <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "1rem" }}>AI Agent</h2>

                    <div style={{ marginBottom: "1rem" }}>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Agent name</label>
                        <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)}
                            style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>

                    <div style={{ marginBottom: "1rem" }}>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>Opening greeting</label>
                        <textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={2}
                            style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"} />
                    </div>

                    <div style={{ marginBottom: "0.5rem" }}>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                            Review request delay: <span style={{ color: "#0cc0df" }}>{reviewDelay} hours after job completion</span>
                        </label>
                        <input type="range" min={1} max={24} value={reviewDelay} onChange={e => setReviewDelay(Number(e.target.value))}
                            style={{ width: "100%", accentColor: "#0cc0df" }} />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                            Travel buffer between jobs: <span style={{ color: "#0cc0df" }}>{travelBuffer} minutes</span>
                        </label>
                        <input type="range" min={0} max={60} step={5} value={travelBuffer} onChange={e => setTravelBuffer(Number(e.target.value))}
                            style={{ width: "100%", accentColor: "#0cc0df" }} />
                    </div>

                    <div style={{ marginTop: "1rem" }}>
                        <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#374151", marginBottom: "0.4rem" }}>
                            Google Review URL
                        </label>
                        <p style={{ fontSize: "0.78rem", color: "#6B7280", marginBottom: "0.5rem" }}>
                            Paste your Google Business review link — sent to customers after job completion
                        </p>
                        <input
                            type="url"
                            placeholder="https://g.page/r/your-business/review"
                            value={reviewUrl}
                            onChange={e => setReviewUrl(e.target.value)}
                            style={{ width: "100%", padding: "0.75rem 1rem", background: "#F9FAFB", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#0D1B2A", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none", boxSizing: "border-box" }}
                            onFocus={e => e.currentTarget.style.borderColor = "#0cc0df"}
                            onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
                        />
                        <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: "0.35rem" }}>
                            Find this at: Google Maps → your business → Share → Copy link
                        </p>
                    </div>
                </div>

                {/* Messaging */}
                <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0D1B2A", marginBottom: "0.5rem" }}>Messaging</h2>
                    <Toggle
                        value={aiSmsReplies}
                        onChange={setAiSmsReplies}
                        label="AI SMS replies"
                        sub="When enabled, your AI automatically replies to customer text messages. Complaints and disputes are always escalated to you."
                    />
                    {!aiSmsReplies && (
                        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "0.75rem 1rem", marginTop: "0.75rem" }}>
                            <p style={{ fontSize: "0.82rem", color: "#92400E" }}>
                                AI replies are off — you will receive an SMS alert for every customer reply and must respond manually from the Messages page.
                            </p>
                        </div>
                    )}
                </div>

                {/* Save button */}
                <button onClick={handleSave} disabled={saving}
                    style={{ width: "100%", padding: "0.9rem", background: saving ? "rgba(12,192,223,0.6)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                    {saving ? "Saving..." : saved ? "✓ Saved!" : "Save settings"}
                </button>

                {saveError && (
                    <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#EF4444", marginTop: "0.6rem" }}>
                        {saveError}
                    </p>
                )}

                <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#9CA3AF", marginTop: "0.75rem" }}>
                    Changes take effect immediately on the next call or message
                </p>
            </div>
        </div>
    );
}