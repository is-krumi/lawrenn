export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", background: "white", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Nav */}
      <nav style={{ padding: "0 5%", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.06)", position: "sticky", top: 0, background: "white", zIndex: 100 }}>
        <a href="/" style={{ fontFamily: "'Bebas Neue'", fontSize: "1.6rem", letterSpacing: "0.05em", color: "#111111", textDecoration: "none" }}>
          RENN<span style={{ color: "#111111" }}>OPS</span>
        </a>
        <a href="/" style={{ fontSize: "0.875rem", color: "#6B7280", textDecoration: "none" }}>â† Back to home</a>
      </nav>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "4rem 2rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "3rem" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "#111111", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>Legal</p>
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "3rem", letterSpacing: "0.02em", color: "#111111", marginBottom: "0.5rem" }}>Privacy Policy</h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>Effective date: May 1, 2026 Â· Last updated: May 1, 2026</p>
        </div>

        <div style={{ color: "#374151", fontSize: "0.95rem", lineHeight: 1.8 }}>

          <p style={{ marginBottom: "1.5rem" }}>
            This Privacy Policy describes how Lawrenn ("we," "us," or "our") collects, uses, and shares information when you use our website, web dashboard, and AI-powered phone receptionist service (collectively, the "Service"). By using the Service you agree to the collection and use of information in accordance with this policy.
          </p>

          {[
            {
              title: "1. Information We Collect",
              content: null,
              subsections: [
                {
                  title: "1.1 Information you provide",
                  items: [
                    "Account information: name, email address, business name, phone number, and password.",
                    "Business configuration: services offered, operating hours, team member names and schedules, AI agent preferences.",
                    "Payment information: billing details processed by Stripe. Lawrenn never stores credit card numbers or CVVs.",
                    "Communications: emails, support tickets, or other messages you send to us.",
                  ],
                },
                {
                  title: "1.2 Information collected automatically",
                  items: [
                    "Call transcripts and recordings: when your AI agent handles a call, the conversation is transcribed and stored.",
                    "Customer data: names, phone numbers, addresses, and job details collected by the AI during calls on your behalf.",
                    "Usage data: pages visited, features used, session duration, IP address, and device information.",
                    "SMS messages: inbound and outbound text messages handled through your Lawrenn number.",
                  ],
                },
                {
                  title: "1.3 Information from third parties",
                  items: [
                    "Google: if you connect Google Calendar, we receive calendar event data.",
                    "Twilio: call metadata including duration, caller ID, and message delivery status.",
                    "Retell AI: call transcripts and AI interaction logs.",
                  ],
                },
              ],
            },
            {
              title: "2. How We Use Your Information",
              content: "We use the information we collect to:",
              items: [
                "Provide, operate, and improve the Service.",
                "Answer inbound calls and book jobs on your behalf using AI.",
                "Send SMS notifications, booking confirmations, review requests, and follow-up sequences to your customers.",
                "Generate call transcripts, AI summaries, and business intelligence insights.",
                "Process payments and send invoices.",
                "Send you product updates, support responses, and administrative messages.",
                "Detect fraud, abuse, or security incidents.",
                "Comply with legal obligations.",
              ],
            },
            {
              title: "3. How We Share Your Information",
              content: "We do not sell your personal data or your customers' personal data. We share information only in these circumstances:",
              items: [
                "Service providers: we share data with vendors who help us operate the Service, including Twilio, Retell AI, Anthropic, OpenAI, ElevenLabs, Supabase, Vercel, Resend, and Stripe.",
                "Legal requirements: we may disclose information if required by law or court order.",
                "Business transfers: if Lawrenn is acquired, your information may be transferred as part of that transaction.",
                "With your consent: we may share information for any other purpose with your explicit consent.",
              ],
            },
            {
              title: "4. Data Retention",
              content: "We retain your account information for as long as your account is active. Call recordings and transcripts are retained indefinitely unless you delete them. You can delete individual call recordings from the Calls page. If you close your account, all personal data is deleted within 30 days.",
            },
            {
              title: "5. Your Rights",
              content: "Depending on your location, you may have the right to:",
              items: [
                "Access the personal data we hold about you.",
                "Correct inaccurate data.",
                "Delete your data (\"right to be forgotten\").",
                "Export your data in a portable format.",
                "Object to or restrict certain processing.",
                "Withdraw consent at any time where processing is based on consent.",
              ],
              footer: "To exercise these rights, email us at privacy@Lawrenn.com. We will respond within 30 days.",
            },
            {
              title: "6. Your Customers' Data",
              content: "When you use Lawrenn to interact with your customers, you are the data controller and Lawrenn is the data processor. You are responsible for ensuring you have the legal basis to collect and process your customers' personal data, including obtaining any required consent for SMS communications under TCPA and other applicable laws.",
            },
            {
              title: "7. Security",
              content: "We implement industry-standard security measures including:",
              items: [
                "TLS 1.3 encryption for all data in transit.",
                "AES-256 encryption for sensitive fields at rest.",
                "Row-level security in our database ensuring tenant data isolation.",
                "Access controls limiting employee access to customer data.",
                "Sentry error monitoring for security incident detection.",
              ],
              footer: "No system is perfectly secure. If you believe your account has been compromised, contact us at security@Lawrenn.com.",
            },
            {
              title: "8. SMS Communications",
              content: "Lawrenn operates as a registered 10DLC message originator. STOP and HELP keywords are handled automatically. Customers who reply STOP are immediately opted out of all SMS communications from your account. You are responsible for obtaining valid TCPA consent from your customers before using Lawrenn to send them marketing messages.",
            },
            {
              title: "9. Children's Privacy",
              content: "The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If we learn we have collected such information, we will delete it promptly.",
            },
            {
              title: "10. Changes to This Policy",
              content: "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice in the dashboard. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.",
            },
            {
              title: "11. Contact Us",
              content: "For privacy-related questions or requests:",
              items: [
                "Privacy: privacy@Lawrenn.com",
                "Security: security@Lawrenn.com",
                "General: hello@Lawrenn.com",
              ],
            },
          ].map(({ title, content, items, subsections, footer }: any) => (
            <div key={title} style={{ marginBottom: "2.5rem" }}>
              <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.75rem", paddingBottom: "0.5rem", borderBottom: "2px solid rgba(12,192,223,0.2)" }}>
                {title}
              </h2>
              {content && <p style={{ marginBottom: items ? "0.75rem" : 0 }}>{content}</p>}
              {items && (
                <ul style={{ paddingLeft: "1.5rem", margin: "0 0 0.5rem" }}>
                  {items.map((item: string, i: number) => (
                    <li key={i} style={{ marginBottom: "0.4rem" }}>{item}</li>
                  ))}
                </ul>
              )}
              {subsections && subsections.map((sub: any) => (
                <div key={sub.title} style={{ marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111111", marginBottom: "0.5rem" }}>{sub.title}</h3>
                  <ul style={{ paddingLeft: "1.5rem", margin: 0 }}>
                    {sub.items.map((item: string, i: number) => (
                      <li key={i} style={{ marginBottom: "0.4rem" }}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {footer && <p style={{ marginTop: "0.75rem", color: "#6B7280", fontSize: "0.9rem" }}>{footer}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "2rem 5%", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.2rem", letterSpacing: "0.05em", color: "#111111" }}>
          RENN<span style={{ color: "#111111" }}>OPS</span>
        </span>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <a href="/privacy" style={{ fontSize: "0.82rem", color: "#111111", textDecoration: "none" }}>Privacy Policy</a>
          <a href="/terms" style={{ fontSize: "0.82rem", color: "#6B7280", textDecoration: "none" }}>Terms of Service</a>
        </div>
        <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Â© 2026 Lawrenn. All rights reserved.</span>
      </div>
    </div>
  );
}
