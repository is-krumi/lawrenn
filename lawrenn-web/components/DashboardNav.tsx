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
    label: "Dashboard", href: "/dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    label: "Jobs", href: "/dashboard/jobs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      </svg>
    ),
  },
  {
    label: "Calls", href: "/dashboard/calls",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
  },
  {
    label: "Customers", href: "/dashboard/customers",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    label: "Messages", href: "/dashboard/messages",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    label: "Intelligence", href: "/dashboard/intelligence", requiresFeature: "intelligence" as const,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    label: "Team", href: "/dashboard/team",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    label: "Settings", href: "/dashboard/settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
    ),
  },
];

function buildBreadcrumb(pathname: string): string {
  const segments = pathname.replace(/^\/dashboard/, "").split("/").filter(Boolean);
  if (segments.length === 0) return "Dashboard";
  return ["Dashboard", ...segments.map(s => s.charAt(0).toUpperCase() + s.slice(1))].join("  /  ");
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
    const unreadChannel = supabase
      .channel(`nav-unread-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` }, fetchCount)
      .subscribe();

    return () => { isMounted = false; supabase.removeChannel(unreadChannel); };
  }, [businessId]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      {/* ── Left sidebar ── */}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: 220,
        background: "#0D1B2A",
        display: "flex", flexDirection: "column",
        zIndex: 200,
        overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Link href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.5rem", letterSpacing: "0.06em", color: "white", textDecoration: "none", display: "block" }}>
            RENN<span style={{ color: "#0cc0df" }}>OPS</span>
          </Link>
          {businessName && (
            <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", margin: "0.3rem 0 0", fontWeight: 500, letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {businessName}
            </p>
          )}
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: "0.75rem 0.65rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {NAV_LINKS.map(({ label, href, icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} prefetch={true} style={{
                display: "flex", alignItems: "center", gap: "0.65rem",
                padding: "0.55rem 0.75rem",
                borderRadius: 8,
                background: active ? "rgba(12,192,223,0.12)" : "transparent",
                color: active ? "#0cc0df" : "rgba(255,255,255,0.5)",
                textDecoration: "none",
                fontSize: "0.875rem", fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
                position: "relative",
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.85)"; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.5)"; } }}>
                {icon}
                <span>{label}</span>
                {label === "Messages" && unread > 0 && (
                  <span style={{
                    marginLeft: "auto",
                    minWidth: 18, height: 18,
                    background: "#EF4444", borderRadius: 9,
                    fontSize: "0.65rem", fontWeight: 700, color: "white",
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
        <div style={{ padding: "0.75rem 0.65rem", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={signOut} style={{
            display: "flex", alignItems: "center", gap: "0.65rem",
            width: "100%", padding: "0.55rem 0.75rem",
            background: "transparent", border: "none", borderRadius: 8,
            color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans'",
            fontSize: "0.875rem", cursor: "pointer", transition: "all 0.15s",
            textAlign: "left",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)"; }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Top breadcrumb bar ── */}
      <header style={{
        position: "fixed", top: 0, left: 220, right: 0,
        height: 52,
        background: "white",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center",
        padding: "0 1.75rem",
        zIndex: 100,
      }}>
        <p style={{ fontSize: "0.82rem", color: "#9CA3AF", margin: 0, letterSpacing: "0.01em" }}>
          {buildBreadcrumb(pathname)}
        </p>
      </header>
    </>
  );
}