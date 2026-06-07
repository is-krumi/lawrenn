"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useBusiness } from "@/context/BusinessContext";
import { getPlanFeatures } from "@/lib/plans";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_LINKS_CONFIG = [
  {
    label: "Overview", href: "/dashboard",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    label: "Matters", href: "/dashboard/jobs",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      </svg>
    ),
  },
  {
    label: "Calls", href: "/dashboard/calls",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
  },
  {
    label: "Clients", href: "/dashboard/customers",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    label: "Messages", href: "/dashboard/messages",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    label: "Intelligence", href: "/dashboard/intelligence", requiresFeature: "intelligence" as const,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    label: "Library", href: "/dashboard/library", requiresFeature: "intelligence" as const,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
      </svg>
    ),
  },
  {
    label: "Documents", href: "/dashboard/documents", requiresFeature: "intelligence" as const,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    label: "Team", href: "/dashboard/team",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    label: "Settings", href: "/dashboard/settings",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
];

const SECTION_LABELS: Record<string, string> = {
  "/dashboard":              "Overview",
  "/dashboard/jobs":         "Matters",
  "/dashboard/calls":        "Calls",
  "/dashboard/customers":    "Clients",
  "/dashboard/messages":     "Messages",
  "/dashboard/intelligence": "Intelligence",
  "/dashboard/library":      "Library",
  "/dashboard/documents":    "Documents",
  "/dashboard/team":         "Team",
  "/dashboard/settings":     "Settings",
};

function currentLabel(pathname: string): string {
  for (const [href, label] of Object.entries(SECTION_LABELS)) {
    if (href !== "/dashboard" && pathname.startsWith(href)) return label;
  }
  return "Overview";
}

function todayString(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function DashboardNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const { businessId, businessName, subscriptionTier } = useBusiness();
  const features = getPlanFeatures(subscriptionTier);
  const NAV_LINKS = NAV_LINKS_CONFIG.filter(l =>
    !l.requiresFeature || features[l.requiresFeature] === true
  );
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!businessId) return;
    let isMounted = true;

    async function fetchCount() {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("direction", "inbound")
        .eq("read", false);
      if (isMounted) setUnread(count ?? 0);
    }

    fetchCount();
    const ch = supabase
      .channel(`nav-unread-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` }, fetchCount)
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(ch); };
  }, [businessId]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      {/* ── Sidebar ── */}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: 220,
        background: "white",
        display: "flex", flexDirection: "column",
        zIndex: 200,
        borderRight: "1px solid rgba(0,0,0,0.07)",
      }}>
        {/* Logo + firm */}
        <div style={{ padding: "1.5rem 1.25rem 1.25rem" }}>
          <Link href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.08em", color: "#111111", textDecoration: "none", display: "block" }}>
            LAW<span style={{ color: "rgba(17,17,17,0.3)" }}>RENN</span>
          </Link>
          {businessName && (
            <p style={{ fontSize: "0.7rem", color: "#9CA3AF", marginTop: "0.3rem", fontWeight: 500, letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase" }}>
              {businessName}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(0,0,0,0.06)", marginBottom: "0.5rem" }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0.5rem 0", display: "flex", flexDirection: "column" }}>
          {NAV_LINKS.map(({ label, href, icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} prefetch={true}
                style={{
                  display: "flex", alignItems: "center", gap: "0.6rem",
                  padding: "0.5rem 1rem",
                  margin: "0.05rem 0.5rem",
                  borderRadius: 7,
                  color: "#111111",
                  textDecoration: "none",
                  fontSize: "0.82rem",
                  fontWeight: active ? 600 : 400,
                  letterSpacing: "0.01em",
                  transition: "background 0.12s, color 0.12s",
                  background: active ? "#F5F5F0" : "transparent",
                  position: "relative",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(0,0,0,0.04)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
              >
                {icon}
                <span>{label}</span>
                {label === "Messages" && unread > 0 && (
                  <span style={{
                    marginLeft: "auto",
                    minWidth: 16, height: 16,
                    background: "#EF4444", borderRadius: 8,
                    fontSize: "0.6rem", fontWeight: 700, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 4px",
                  }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div style={{ padding: "1rem 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <button onClick={signOut}
            style={{
              display: "flex", alignItems: "center", gap: "0.6rem",
              width: "100%", padding: "0.5rem 1.25rem",
              background: "transparent", border: "none",
              color: "#9CA3AF", fontFamily: "'DM Sans'",
              fontSize: "0.82rem", cursor: "pointer", transition: "color 0.12s",
              textAlign: "left", letterSpacing: "0.01em",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#374151"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Top bar ── */}
      <header style={{
        position: "fixed", top: 0, left: 220, right: 0,
        height: 52,
        background: "white",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 2rem",
        zIndex: 100,
      }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "#111111", margin: 0, letterSpacing: "0.01em" }}>
          {currentLabel(pathname)}
        </p>
        <p style={{ fontSize: "0.75rem", color: "#9CA3AF", margin: 0 }}>
          {todayString()}
        </p>
      </header>
    </>
  );
}
