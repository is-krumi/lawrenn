import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lawrenn — The AI Platform Built for Law",
  description: "Lawrenn brings enterprise AI to every stage of legal practice — from client intake to final invoice. Draft faster, research deeper, and deliver more for every client.",
  keywords: "legal AI, law firm software, AI document drafting, contract analysis, legal research, matter management",
  openGraph: {
    title: "Lawrenn — The AI Platform Built for Law",
    description: "Draft faster. Research deeper. Win more. Lawrenn is purpose-built AI for legal professionals.",
    url: "https://lawrenn.com",
    siteName: "Lawrenn",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}