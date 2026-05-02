"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  businessName?: string;
}

export default function DashboardNav({ businessName }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let unreadChannel: ReturnType<typeof supabase.channel> | null = null;

    async function loadUnread() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (!biz || !isMounted) return;

      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", biz.id)
        .eq("direction", "inbound")
        .eq("read", false);

      if (isMounted) setUnread(count ?? 0);

      // Realtime unread count
      unreadChannel = supabase
        .channel(`nav-unread-${biz.id}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "messages",
          filter: `business_id=eq.${biz.id}`,
        }, async () => {
          const { count: newCount } = await supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("business_id", biz.id)
            .eq("direction", "inbound")
            .eq("read", false);
          if (isMounted) setUnread(newCount ?? 0);
        })
        .subscribe();
    }

    loadUnread();

    return () => {
      isMounted = false;
      if (unreadChannel) {
        supabase.removeChannel(unreadChannel);
      }
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const links = [
    { label: "Dashboard",  href: "/dashboard" },
    { label: "Jobs",       href: "/dashboard/jobs" },
    { label: "Calls",      href: "/dashboard/calls" },
    { label: "Customers",  href: "/dashboard/customers" },
    { label: "Messages",   href: "/dashboard/messages" },
    { label: "Settings",   href: "/dashboard/settings" },
  ];

  return (
    <nav style={{
      background: "white",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      padding: "0 2rem",
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.05em", color: "#0D1B2A", textDecoration: "none" }}>
        RENN<span style={{ color: "#0cc0df" }}>OPS</span>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        {links.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <a key={href} href={href}
              style={{ fontSize: "0.875rem", fontWeight: 500, color: active ? "#0cc0df" : "#6B7280", textDecoration: "none", position: "relative", transition: "color 0.2s" }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#0D1B2A"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#6B7280"; }}>
              {label}
              {label === "Messages" && unread > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -10,
                  width: 16, height: 16,
                  background: "#EF4444", borderRadius: "50%",
                  fontSize: "0.6rem", fontWeight: 700, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </a>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {businessName && (
          <span style={{ fontSize: "0.85rem", color: "#6B7280", fontWeight: 500 }}>{businessName}</span>
        )}
        <button onClick={signOut}
          style={{ padding: "0.4rem 0.9rem", background: "transparent", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 6, color: "#6B7280", fontFamily: "'DM Sans'", fontSize: "0.8rem", cursor: "pointer" }}>
          Sign out
        </button>
      </div>
    </nav>
  );
}