"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const NAV_PRODUCTS = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.88 9.1 19.79 19.79 0 01.82.47 2 2 0 012.81 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l.97-.97a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
    name: "AI Call Answering", desc: "24/7 call handling — never miss a potential client", href: "/products/ai-call-answering",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    name: "Client Intake", desc: "Structured intake memos generated from every call", href: "/products/client-intake",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
    name: "Client Communication", desc: "AI-drafted SMS follow-ups and client messaging", href: "/products/client-communication",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    name: "Matter Management", desc: "Every client, call, and message in one place", href: "/products/matter-management",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    name: "Practice Intelligence", desc: "Ask your call and client data in plain English", href: "/products/practice-intelligence",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    name: "Call Analytics", desc: "Volume trends, outcomes, and busiest hours at a glance", href: "/products/call-analytics",
  },
];

export default function MainNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const base = isHome ? "" : "/";

  const [scrolled, setScrolled] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const productsRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (productsRef.current && !productsRef.current.contains(e.target as Node)) {
        setProductsOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 5%", height: 64,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "white",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(0,0,0,0.08)",
      boxShadow: scrolled ? "0 1px 12px rgba(0,0,0,0.06)" : "none",
      transition: "all 0.3s",
    }}>
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.8rem", letterSpacing: "0.05em", color: "#111", textDecoration: "none" }}>
        LAW<span style={{ color: "rgba(17,17,17,0.4)" }}>RENN</span>
      </a>

      <ul className="lp-nav-links" style={{ alignItems: "center", gap: "2rem", listStyle: "none" }}>
        {/* Products dropdown */}
        <li ref={productsRef} style={{ position: "relative" }}>
          <button
            onClick={() => setProductsOpen(o => !o)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", color: "rgba(17,17,17,0.55)", fontSize: "0.9rem", fontWeight: 500, fontFamily: "'DM Sans'", padding: 0, transition: "color 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#111")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(17,17,17,0.55)")}
          >
            Products
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5, transform: productsOpen ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>

          {productsOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 12px)", left: "50%", transform: "translateX(-50%)",
              background: "#FAFAF8", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.1)", padding: "0.4rem",
              minWidth: 560, zIndex: 200,
              display: "grid", gridTemplateColumns: "1fr 1fr",
            }}>
              {NAV_PRODUCTS.map(({ icon, name, desc, href }) => (
                <a key={name} href={href}
                  style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.75rem", borderRadius: 8, textDecoration: "none", transition: "background 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F0F0EE"; (e.currentTarget.firstElementChild as HTMLElement).style.background = "rgba(0,0,0,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; (e.currentTarget.firstElementChild as HTMLElement).style.background = "#E8E8E6"; }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: "#E8E8E6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
                    {icon}
                  </div>
                  <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111111", marginBottom: "0.1rem" }}>{name}</p>
                    <p style={{ fontSize: "0.75rem", color: "#6B7280" }}>{desc}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </li>

        {[
          [`${base}#how`, "How it works"],
          [`${base}#pricing`, "Pricing"],
        ].map(([href, label]) => (
          <li key={href}>
            <a href={href} style={{ color: "rgba(17,17,17,0.55)", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#111")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(17,17,17,0.55)")}>
              {label}
            </a>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <a href="/demo"
          style={{ padding: "0.55rem 1.2rem", background: "transparent", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, color: "rgba(17,17,17,0.65)", fontSize: "0.875rem", fontWeight: 600, fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none", display: "inline-block" }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(0,0,0,0.05)"; (e.currentTarget as HTMLAnchorElement).style.color = "#111"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(17,17,17,0.65)"; }}>
          Book a demo
        </a>
        <a href="/login" style={{ padding: "0.55rem 1.2rem", background: "#111111", border: "none", borderRadius: 6, color: "white", fontSize: "0.875rem", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans'", transition: "all 0.2s", textDecoration: "none" }}>
          Log in
        </a>
      </div>
    </nav>
  );
}
