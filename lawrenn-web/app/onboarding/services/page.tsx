"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PRESET_SERVICES = [
    { name: "Contract Drafting", duration_mins: 120 },
    { name: "Contract Review", duration_mins: 60 },
    { name: "Legal Research", duration_mins: 90 },
    { name: "Client Intake", duration_mins: 60 },
    { name: "Litigation Support", duration_mins: 180 },
    { name: "Document Review", duration_mins: 120 },
    { name: "Corporate Transactions", duration_mins: 240 },
    { name: "Real Estate Closing", duration_mins: 180 },
    { name: "Estate Planning", duration_mins: 120 },
    { name: "IP Filing", duration_mins: 90 },
    { name: "Regulatory Compliance", duration_mins: 120 },
    { name: "Employment Matters", duration_mins: 90 },
    { name: "General Counsel", duration_mins: 60 },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
    fri: "Fri", sat: "Sat", sun: "Sun",
};

interface Service { name: string; duration_mins: number; }
interface DayHours { start: string; end: string; }

export default function OnboardingStep2() {
    const router = useRouter();

    const [businessId, setBusinessId] = useState<string | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [customSvc, setCustomSvc] = useState("");
    const [hours, setHours] = useState<Record<string, DayHours | null>>({
        mon: { start: "08:00", end: "17:00" },
        tue: { start: "08:00", end: "17:00" },
        wed: { start: "08:00", end: "17:00" },
        thu: { start: "08:00", end: "17:00" },
        fri: { start: "08:00", end: "17:00" },
        sat: null,
        sun: null,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    //   useEffect(() => {
    //     async function load() {
    //       const { data: { user } } = await supabase.auth.getUser();
    //       if (!user) { router.push("/login"); return; }

    //       const { data: biz } = await supabase
    //         .from("businesses")
    //         .select("id, settings")
    //         .eq("owner_id", user.id)
    //         .single();

    //       if (!biz) { router.push("/onboarding"); return; }

    //       setBusinessId(biz.id);

    //       // Pre-fill if already saved
    //       if (biz.settings?.services?.length > 0) {
    //         setServices(biz.settings.services);
    //       }
    //       if (biz.settings?.operating_hours && Object.keys(biz.settings.operating_hours).length > 0) {
    //         setHours(biz.settings.operating_hours);
    //       }
    //     }
    //     load();
    //   }, [router]);

    function toggleService(svc: Service) {
        setServices(prev => {
            const exists = prev.find(s => s.name === svc.name);
            return exists ? prev.filter(s => s.name !== svc.name) : [...prev, svc];
        });
    }

    function addCustomService() {
        const name = customSvc.trim();
        if (!name) return;
        if (services.find(s => s.name.toLowerCase() === name.toLowerCase())) return;
        setServices(prev => [...prev, { name, duration_mins: 120 }]);
        setCustomSvc("");
    }

    function toggleDay(day: string) {
        setHours(prev => ({
            ...prev,
            [day]: prev[day] ? null : { start: "08:00", end: "17:00" },
        }));
    }

    function updateHour(day: string, field: "start" | "end", value: string) {
        setHours(prev => ({
            ...prev,
            [day]: { ...(prev[day] ?? { start: "08:00", end: "17:00" }), [field]: value },
        }));
    }

    async function handleNext() {
        if (services.length === 0) { setError("Add at least one practice area"); return; }

        setLoading(true);
        setError("");
        try {
            await supabase
                .from("businesses")
                .update({
                    settings: {
                        services,
                        operating_hours: hours,
                    },
                })
                .eq("id", businessId);

            router.push("/onboarding/team");
        } catch (err) {
            console.error(err);
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    const card: React.CSSProperties = {
        width: "100%", maxWidth: 560,
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 16,
        padding: "2.5rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    };

    return (
        <div style={{
            minHeight: "100vh",
            background: "#ffffff",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "2rem 1rem",
            fontFamily: "'DM Sans', sans-serif",
        }}>

            {/* Logo */}
            <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#111111", textDecoration: "none", marginBottom: "2.5rem" }}>
                LAW<span style={{ color: "rgba(17,17,17,0.35)" }}>RENN</span>
            </a>

            {/* Progress */}
            <div style={{ width: "100%", maxWidth: 560, marginBottom: "2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
{["Business", "Services", "Team", "Voice", "Phone"].map((step, i) => (
                        <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: "50%",
                                background: i < 2 ? "#111111" : "rgba(0,0,0,0.08)",
                                color: i < 2 ? "white" : "#6B7280",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "0.8rem", fontWeight: 700,
                                border: i < 2 ? "none" : "1.5px solid rgba(0,0,0,0.1)",
                            }}>{i === 0 ? "✓" : i + 1}</div>
                            <span style={{ fontSize: "0.72rem", color: i === 1 ? "#111111" : "#6B7280", fontWeight: i === 1 ? 600 : 400 }}>{step}</span>
                        </div>
                    ))}
                </div>
                <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: "40%", background: "#111111", borderRadius: 2 }} />
                </div>
            </div>

            <div style={card}>
                <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.4rem" }}>
                    What practice areas do you cover?
                </h1>
                <p style={{ color: "#6B7280", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
                    Your AI assistant will use these to understand and route client matters correctly.
                </p>

                {error && (
                    <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.875rem", color: "#991B1B" }}>
                        {error}
                    </div>
                )}

                {/* Preset services */}
                <div style={{ marginBottom: "1.5rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>
                        Select your practice areas
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                        {PRESET_SERVICES.map(svc => {
                            const selected = !!services.find(s => s.name === svc.name);
                            return (
                                <button key={svc.name} onClick={() => toggleService(svc)}
                                    style={{
                                        padding: "0.65rem 0.9rem",
                                        background: selected ? "rgba(17,17,17,0.06)" : "#ffffff",
                                        border: `1.5px solid ${selected ? "#111111" : "rgba(0,0,0,0.1)"}`,
                                        borderRadius: 8,
                                        color: selected ? "#111111" : "#374151",
                                        fontFamily: "'DM Sans'",
                                        fontSize: "0.875rem",
                                        fontWeight: selected ? 600 : 400,
                                        cursor: "pointer",
                                        textAlign: "left",
                                        transition: "all 0.15s",
                                    }}>
                                    {selected ? "✓ " : ""}{svc.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Custom service */}
                <div style={{ marginBottom: "1.5rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                        Add a custom practice area
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                            type="text"
                            placeholder="e.g. Trademark Filing"
                            value={customSvc}
                            onChange={e => setCustomSvc(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") addCustomService(); }}
                            style={{ flex: 1, padding: "0.75rem 1rem", background: "#ffffff", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.9rem", outline: "none" }}
                        />
                        <button onClick={addCustomService}
                            style={{ padding: "0.75rem 1.25rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}>
                            Add
                        </button>
                    </div>
                </div>

                {/* Operating hours */}
                <div style={{ marginBottom: "2rem" }}>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#374151", marginBottom: "0.75rem" }}>
                        Office hours
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {DAYS.map(day => (
                            <div key={day} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                <button onClick={() => toggleDay(day)}
                                    style={{
                                        width: 44, height: 28, borderRadius: 14,
                                        background: hours[day] ? "#111111" : "rgba(0,0,0,0.1)",
                                        border: "none", cursor: "pointer",
                                        position: "relative", transition: "background 0.2s",
                                    }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: "50%", background: "white",
                                        position: "absolute", top: 4,
                                        left: hours[day] ? 20 : 4,
                                        transition: "left 0.2s",
                                    }} />
                                </button>
                                <span style={{ width: 36, fontSize: "0.875rem", fontWeight: 500, color: hours[day] ? "#111111" : "#9CA3AF" }}>
                                    {DAY_LABELS[day]}
                                </span>
                                {hours[day] ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
                                        <input type="time" value={hours[day]!.start}
                                            onChange={e => updateHour(day, "start", e.target.value)}
                                            style={{ padding: "0.35rem 0.5rem", background: "#ffffff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.85rem", outline: "none" }} />
                                        <span style={{ color: "#9CA3AF", fontSize: "0.85rem" }}>to</span>
                                        <input type="time" value={hours[day]!.end}
                                            onChange={e => updateHour(day, "end", e.target.value)}
                                            style={{ padding: "0.35rem 0.5rem", background: "#ffffff", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, fontFamily: "'DM Sans'", fontSize: "0.85rem", outline: "none" }} />
                                    </div>
                                ) : (
                                    <span style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>Closed</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Back + Next */}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button onClick={() => router.push("/onboarding")}
                        style={{ flex: 1, padding: "0.9rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#374151", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 600, cursor: "pointer" }}>
                        ← Back
                    </button>
                    <button onClick={handleNext} disabled={loading}
                        style={{ flex: 2, padding: "0.9rem", background: loading ? "rgba(17,17,17,0.45)" : "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "1rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
                        {loading ? "Saving..." : "Next — Add your team →"}
                    </button>
                </div>

                <p style={{ textAlign: "center", fontSize: "0.78rem", color: "#6B7280", marginTop: "1rem" }}>
                    Step 2 of 4 · Your progress is saved automatically
                </p>
            </div>
        </div>
    );
}