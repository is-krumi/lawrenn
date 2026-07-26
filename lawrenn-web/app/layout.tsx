import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = "https://lawrenn.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Lawrenn — The AI Platform That Powers Your Firm's Growth",
    template: "%s — Lawrenn",
  },
  description: "Lawrenn captures every lead, manages every client conversation, and handles the busywork between — so your practice grows like it has a full support staff behind it.",
  keywords: [
    "law firm AI", "legal intake software", "AI call answering for lawyers",
    "client intake automation", "legal practice management", "law firm growth",
    "AI for attorneys", "missed call law firm", "legal client communication",
    "practice intelligence", "legal research AI",
  ],
  authors: [{ name: "Lawrenn", url: BASE_URL }],
  creator: "Lawrenn",
  publisher: "Lawrenn",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: { canonical: BASE_URL },
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Lawrenn",
    title: "Lawrenn — The AI Platform That Powers Your Firm's Growth",
    description: "Capture every lead. Manage every client conversation. Grow your practice without adding overhead. Lawrenn is purpose-built AI for law firms.",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lawrenn — AI for Law Firms",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lawrenn — The AI Platform That Powers Your Firm's Growth",
    description: "Capture every lead. Manage every client conversation. Grow your practice without adding overhead.",
    images: ["/og-image.png"],
    creator: "@lawrenn",
    site: "@lawrenn",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  category: "technology",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Lawrenn",
  url: BASE_URL,
  description: "AI-powered intake, client communication, and practice intelligence for law firms.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    offerCount: 3,
  },
  publisher: {
    "@type": "Organization",
    name: "Lawrenn",
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${BASE_URL}/og-image.png`,
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@lawrenn.com",
      contactType: "customer support",
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
