import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RennOps — AI  Operating System for Service Businesses",
  description: "RennOps answers every call, books every job, and follows up on every quote — automatically. Never miss a customer again.",
  keywords: "AI receptionist, service business, missed calls, automated booking, phone answering",
  openGraph: {
    title: "RennOps — AI Phone Receptionist for Service Businesses",
    description: "Stop losing jobs to voicemail. RennOps answers every call automatically.",
    url: "https://rennops.com",
    siteName: "RennOps",
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