"use client";

import { useBusiness } from "@/context/BusinessContext";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  created_at: string;
  jobs: { id: string; amount: number }[];
}

const divider: CSSProperties = { height: 1, background: "rgba(0,0,0,0.04)" };

export default function CustomersPage() {
  const router = useRouter();
  const { businessId, loading: bizLoading } = useBusiness();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    if (bizLoading) return;
    if (!businessId) { router.push("/login"); return; }

    const channel = supabase
      .channel(`customers-list-${businessId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "customers", filter: `business_id=eq.${businessId}` }, (payload) => {
        setCustomers(prev => [{ ...payload.new as Customer, jobs: [] }, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `business_id=eq.${businessId}` }, (payload) => {
        setCustomers(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new as Customer } : c));
      })
      .subscribe();

    supabase
      .from("customers")
      .select("id, name, phone, email, address, created_at, jobs (id)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setCustomers((data as any) ?? []); setLoading(false); });

    return () => { supabase.removeChannel(channel); };
  }, [businessId, bizLoading, router]);

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name?.toLowerCase().includes(q) || c.phone.includes(q) || c.email?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q);
  });

  function jobCount(c: Customer) { return c.jobs?.length ?? 0; }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>Loading clients...</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ padding: "2rem 2rem 2rem 1.5rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.75rem", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", width: 280 }}>
            <span style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", display: "flex", pointerEvents: "none" }}>
              <svg style={{ width: 14, height: 14 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "0.5rem 1rem 0.5rem 2.25rem", background: "white", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, color: "#111111", fontFamily: "'DM Sans'", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.currentTarget.style.borderColor = "#111111"}
              onBlur={e => e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)"}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "white", overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 72px 96px", gap: "0.5rem", padding: "0.55rem 0.75rem", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
            {["Client", "Phone", "Matters", "Added"].map((h, i) => (
              <span key={i} style={{ fontSize: "0.67rem", fontWeight: 600, color: "#C4C4BD", textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <p style={{ fontSize: "0.95rem", fontWeight: 500, color: "#111111", marginBottom: "0.4rem" }}>
                {search ? "No clients found" : "No clients yet"}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#9CA3AF" }}>
                {search ? "Try a different search" : "Clients will appear here after your first call or matter"}
              </p>
            </div>
          ) : filtered.map((customer, i) => {
            const count   = jobCount(customer);
            const display = customer.name ?? customer.phone;

            return (
              <div key={customer.id}>
                {i > 0 && <div style={divider} />}
                <div
                  onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 140px 72px 96px",
                    gap: "0.5rem", padding: "0.75rem 0.75rem",
                    alignItems: "center", cursor: "pointer",
                    background: "white", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F5F5F5"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "white"; }}
                >
                  {/* Name */}
                  <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#111111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: "0.65rem", flexShrink: 0 }}>
                      {display.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111111", margin: "0 0 0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {display}
                      </p>
                      {customer.address && (
                        <p style={{ fontSize: "0.72rem", color: "#9CA3AF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {customer.address}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  <span style={{ fontSize: "0.78rem", color: "#6B7280" }}>{customer.phone}</span>

                  {/* Matters */}
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: count > 0 ? "#93C5FD" : "#D1D5DB" }}>
                    {count > 0 ? count : "—"}
                  </span>

                  {/* Added */}
                  <span style={{ fontSize: "0.78rem", color: "#6B7280" }}>
                    {formatDate(customer.created_at)}
                  </span>

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
