"use client";

import { useBusiness } from "@/context/BusinessContext";
import { getPlanFeatures } from "@/lib/plans";

interface Props {
  feature: keyof ReturnType<typeof getPlanFeatures>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function FeatureGate({ feature, children, fallback }: Props) {
  const { subscriptionTier } = useBusiness();
  const features = getPlanFeatures(subscriptionTier);

  if (features[feature] === true) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : <UpgradePrompt feature={String(feature)} />;
}

function UpgradePrompt({ feature }: { feature: string }) {
  const labels: Record<string, string> = {
    intelligence:      "Call Intelligence",
    outboundSequences: "Outbound Sequences",
  };

  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        maxWidth: 480,
        textAlign: "center",
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 16,
        padding: "3rem 2.5rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
        <h2 style={{
          fontFamily: "'Bebas Neue'",
          fontSize: "1.8rem",
          letterSpacing: "0.03em",
          color: "#0D1B2A",
          marginBottom: "0.75rem",
        }}>
          {labels[feature] ?? feature} is a Pro feature
        </h2>
        <p style={{
          color: "#6B7280",
          fontSize: "0.95rem",
          lineHeight: 1.7,
          marginBottom: "2rem",
        }}>
          Upgrade to Firm or Enterprise to unlock {labels[feature] ?? feature} and get full access to all Lawrenn features.
        </p>
        <a
          href="mailto:hello@lawrenn.com?subject=Upgrade my plan"
          style={{
            display: "inline-block",
            padding: "0.85rem 2rem",
            background: "#111111",
            borderRadius: 8,
            color: "white",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "0.95rem",
            marginBottom: "0.75rem",
          }}
        >
          Upgrade to Pro →
        </a>
        <p style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>
          Email us or call (866) 658-1538
        </p>
      </div>
    </div>
  );
}
