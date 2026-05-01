"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function OnboardingStep4() {
    const router = useRouter();

    const [businessId, setBusinessId] = useState<string | null>(null);
    const [bizPhone, setBizPhone] = useState("");
    const [twilioNumber, setTwilioNumber] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: biz } = await supabase
                .from("businesses")
                .select("id, phone, twilio_number")
                .eq("owner_id", user.id)
                .single();

            if (!biz) { router.push("/onboarding"); return; }

            setBusinessId(biz.id);
            setBizPhone(biz.phone ?? "");
            setTwilioNumber(biz.twilio_number ?? "");
        }
        load();
    }, [router]);

    async function handleFinish() {
        setLoading(true);
        try {
            await supabase
                .from("businesses")
                .update({ twilio_number: twilioNumber.trim() || null })
                .eq("id", businessId);

            // Send call forwarding instructions email via Resend
            await fetch("/api/send-welcome-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ business_id: businessId }),
            });

            setDone(true);
            setTimeout(() => router.push("/dashboard"), 2000);
        } catch (err) {
            console.error(err);
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

            {/* Progress */}
            <div style={{ width: "100%", maxWidth: 560, marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    {["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
                        <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: "50%",
                                background: "#0cc0df",
                                color: "white",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "0.8rem", fontWeight: 700,
                            }}>{i < 3 ? "✓" : "4"}</div>
                            <span style={{ fontSize: "0.72rem", color: i === 3 ? "#0cc0df" : "#6B7280", fontWeight: i === 3 ? 600 : 400 }}>{step}</span>
                        </div>
                    ))}
                </div>
                <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: "100%", background: "#0cc0df", borderRadius: 2 }} />
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

                {done ? (
                    <div style={{ textAlign: "center", padding: "2rem 0" }}>
                        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🎉</div>
                        <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "2.2rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.5rem" }}>
                            YOU'RE ALL SET!
                        </h2>
                        <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.7 }}>
                            Your AI receptionist is ready. Taking you to your dashboard...
                        </p>
                    </div>
                ) : (
                    <>
                        <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#0D1B2A", marginBottom: "0.4rem" }}>
                            Set up call forwarding
                        </h1>
                        <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
                            You keep your existing phone number. Just forward calls to your RennOps number and the AI handles the rest.
                        </p>

                        {/* RennOps number */}
                        <div style={{ background: "rgba(12,192,223,0.06)", border: "1px solid rgba(12,192,223,0.2)", borderRadius: 10, padding: "1.25rem", marginBottom: "2rem" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#0cc0df", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Your RennOps number
                            </p>
                            <p style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.05em", color: "#0D1B2A", marginBottom: "0.25rem" }}>
                                {twilioNumber || "Being provisioned..."}
                            </p>
                            <p style={{ fontSize: "0.8rem", color: "#6B7280" }}>
                                Forward your existing number to this number
                            </p>
                        </div>

                        {/* Step by step instructions */}
                        <div style={{ marginBottom: "2rem" }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "1rem" }}>
                                How to set up call forwarding:
                            </p>

                            {[
                                {
                                    step: "1",
                                    title: "Call your carrier",
                                    body: "Call your phone carrier (AT&T, Verizon, T-Mobile, etc.) or log in to your account online.",
                                },
                                {
                                    step: "2",
                                    title: "Enable call forwarding",
                                    body: `Forward all calls to your RennOps number: ${twilioNumber || "[your RennOps number above]"}`,
                                },
                                {
                                    step: "3",
                                    title: "Test it",
                                    body: "Call your existing business number from another phone. RennOps should answer within 2 rings.",
                                },
                            ].map(({ step, title, body }) => (
                                <div key={step} style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(12,192,223,0.1)", border: "1.5px solid rgba(12,192,223,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "#0cc0df", flexShrink: 0, marginTop: "0.1rem" }}>
                                        {step}
                                    </div>
                                    <div>
                                        <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0D1B2A", marginBottom: "0.2rem" }}>{title}</p>
                                        <p style={{ fontSize: "0.85rem", color: "#6B7280", lineHeight: 1.6 }}>{body}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Carrier shortcuts */}
                        <div style={{ background: "#F9FAFB", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "1rem", marginBottom: "2rem" }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>Quick dial codes (dial from your phone):</p>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                                {[
                                    { carrier: "AT&T", code: "*72" },
                                    { carrier: "Verizon", code: "*72" },
                                    { carrier: "T-Mobile", code: "**21*" },
                                    { carrier: "Sprint", code: "*72" },
                                ].map(({ carrier, code }) => (
                                    <div key={carrier} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 8 }}>
                                        <span style={{ fontSize: "0.82rem", color: "#374151", fontWeight: 500 }}>{carrier}</span>
                                        <span style={{ fontFamily: "'DM Mono'", fontSize: "0.82rem", color: "#0cc0df", fontWeight: 600 }}>{code} + number</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Skip option */}
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "1rem", marginBottom: "2rem" }}>
                            <p style={{ fontSize: "0.85rem", color: "#92400E", lineHeight: 1.6 }}>
                                <strong>Not ready to forward calls yet?</strong> That's fine — you can set this up later from your dashboard. Your AI agent is already configured and ready.
                            </p>
                        </div>

                        {/* Back + Finish */}
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                            <button onClick={() => router.push("/onboarding/team")}
                                style={{ flex: 1, padding: "0.9rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>
                                ← Back
                            </button>
                            <button onClick={handleFinish} disabled={loading}
                                style={{ flex: 2, padding: "0.9rem", background: loading ? "rgba(12,192,223,0.6)" : "#0cc0df", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                                {loading ? "Finishing up..." : "Finish setup →"}
                            </button>
                        </div>

                        <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6B7280", marginTop: "1rem" }}>
                            Step 4 of 4 · You can always update this later
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}