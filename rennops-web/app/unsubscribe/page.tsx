"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function UnsubscribeContent() {
  const params  = useSearchParams();
  const success = params.get("success") === "true";
  const email   = params.get("email") ?? "";
  const error   = params.get("error");

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <nav style={{ padding: "0 5%", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.06)", background: "white" }}>
        <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#0D1B2A", textDecoration: "none" }}>
          RENN<span style={{ color: "#0cc0df" }}>OPS</span>
        </a>
      </nav>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "white", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 16, padding: "3rem 2.5rem", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

          {error === "missing" ? (
            <>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.75rem" }}>
                INVALID LINK
              </h1>
              <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.7 }}>
                This unsubscribe link is missing an email address. Please use the link from your email.
              </p>
            </>
          ) : error ? (
            <>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div>
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.75rem" }}>
                SOMETHING WENT WRONG
              </h1>
              <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
                We couldn't process your unsubscribe request. Please email us directly and we'll remove you immediately.
              </p>
              <a href="mailto:hello@rennops.com?subject=Unsubscribe request" style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "#0cc0df", borderRadius: 8, color: "white", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
                Email us to unsubscribe
              </a>
            </>
          ) : success ? (
            <>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.75rem" }}>
                YOU'RE UNSUBSCRIBED
              </h1>
              <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "0.5rem" }}>
                {email && <><strong style={{ color: "#0D1B2A" }}>{email}</strong> has been removed from our outreach list.</>}
              </p>
              <p style={{ color: "#9CA3AF", fontSize: "0.875rem", lineHeight: 1.7, marginBottom: "2rem" }}>
                You won't receive any further emails from RennOps. If this was a mistake, email us at{" "}
                <a href="mailto:hello@rennops.com" style={{ color: "#0cc0df", textDecoration: "none" }}>hello@rennops.com</a>.
              </p>
              <a href="/" style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "transparent", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 8, color: "#6B7280", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
                Back to rennops.com
              </a>
            </>
          ) : (
            <>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>�</div>
              <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "2rem", letterSpacing: "0.02em", color: "#0D1B2A", marginBottom: "0.75rem" }}>
                BEFORE YOU GO
              </h1>
              <p style={{ color: "#6B7280", fontSize: "0.95rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
                We were emailing to let you know how to increase your business revenue. Sorry if it bothered you.
              </p>
              {email ? (
                <a href={`/api/unsubscribe?email=${encodeURIComponent(email)}`} style={{ display: "inline-block", padding: "0.75rem 1.5rem", background: "#0D1B2A", borderRadius: 8, color: "white", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem" }}>
                  Click to unsubscribe :/
                </a>
              ) : (
                <p style={{ color: "#EF4444", fontSize: "0.875rem" }}>
                  Invalid unsubscribe link — please use the link from your email.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "1.5rem 5%", textAlign: "center" }}>
        <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>
          © 2026 RennOps · <a href="/privacy" style={{ color: "#9CA3AF", textDecoration: "none" }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#6B7280" }}>Loading...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}