export default function TermsOfService() {
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
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "3rem", letterSpacing: "0.02em", color: "#111111", marginBottom: "0.5rem" }}>Terms of Service</h1>
          <p style={{ color: "#6B7280", fontSize: "0.9rem" }}>Effective date: May 1, 2026 Â· Last updated: May 1, 2026</p>
        </div>

        <div style={{ color: "#374151", fontSize: "0.95rem", lineHeight: 1.8 }}>

          <p style={{ marginBottom: "1.5rem" }}>
            Please read these Terms of Service ("Terms") carefully before using Lawrenn. By accessing or using the Service you agree to be bound by these Terms. If you do not agree, do not use the Service.
          </p>

          {[
            {
              title: "1. The Service",
              content: "Lawrenn provides an AI-powered phone receptionist platform that answers inbound calls, books appointments, sends SMS notifications, and provides business analytics for service businesses. The Service includes our web dashboard at Lawrenn.com, our AI infrastructure, and all related software.",
            },
            {
              title: "2. Eligibility",
              content: "You must be at least 18 years old and have the legal authority to enter into contracts on behalf of your business to use the Service. By using the Service you represent and warrant that you meet these requirements.",
            },
            {
              title: "3. Account Registration",
              content: "You must create an account to use the Service. You agree to:",
              items: [
                "Provide accurate and complete information during registration.",
                "Keep your account credentials secure and not share them with unauthorized parties.",
                "Notify us immediately at security@Lawrenn.com if you suspect unauthorized access.",
                "Be responsible for all activity that occurs under your account.",
              ],
            },
            {
              title: "4. Subscription and Payment",
              subsections: [
                {
                  title: "4.1 Plans and pricing",
                  content: "Lawrenn offers subscription plans as described on our pricing page. Plans are billed monthly in advance. Prices are subject to change with 30 days notice.",
                },
                {
                  title: "4.2 Free trial",
                  content: "New accounts receive a 14-day free trial. No credit card is required to start. At the end of the trial period, you must subscribe to a paid plan to continue using the Service.",
                },
                {
                  title: "4.3 Cancellation and refunds",
                  content: "You may cancel your subscription at any time from the billing settings in your dashboard. Your account remains active through the end of the current billing period. We do not provide refunds for partial billing periods.",
                },
                {
                  title: "4.4 Late payments",
                  content: "If a payment fails, we will notify you and attempt to collect payment for up to 7 days. If payment remains outstanding after 7 days, we may suspend your account until payment is received.",
                },
              ],
            },
            {
              title: "5. Acceptable Use",
              content: "You agree not to use the Service to:",
              items: [
                "Violate any applicable law or regulation, including TCPA, CAN-SPAM, or GDPR.",
                "Send unsolicited marketing messages to contacts who have not provided consent.",
                "Impersonate any person or entity or misrepresent your identity.",
                "Collect or harvest personal data without proper legal basis or consent.",
                "Interfere with or disrupt the Service or its infrastructure.",
                "Attempt to gain unauthorized access to any part of the Service.",
                "Use the Service to handle calls requiring professional licenses you do not hold.",
                "Resell or sublicense the Service without our prior written consent.",
                "Use the Service for any purpose that is harmful, fraudulent, or deceptive.",
              ],
            },
            {
              title: "6. SMS and Telephony Compliance",
              content: "You are solely responsible for compliance with all applicable laws governing telephone and SMS communications, including:",
              items: [
                "The Telephone Consumer Protection Act (TCPA)",
                "The CAN-SPAM Act",
                "State-level telemarketing and robocall laws",
                "10DLC registration requirements",
              ],
              footer: "You represent and warrant that you have obtained all required consents from your customers before using Lawrenn to call or SMS them. Lawrenn provides compliance tools but is not responsible for your compliance failures.",
            },
            {
              title: "7. Call Recording Disclosure",
              content: "Some jurisdictions require you to disclose to callers that a call is being recorded. You are responsible for ensuring your disclosure meets the legal requirements in all jurisdictions where you operate. Lawrenn is not liable for any penalties arising from your failure to provide required disclosures.",
            },
            {
              title: "8. Intellectual Property",
              subsections: [
                {
                  title: "8.1 Our IP",
                  content: "Lawrenn and its licensors own all rights in the Service, including all software, designs, trademarks, and content. These Terms do not grant you any rights to our intellectual property except the limited license to use the Service.",
                },
                {
                  title: "8.2 Your IP",
                  content: "You retain ownership of all data you submit to the Service. You grant Lawrenn a limited license to use this data solely to provide the Service to you.",
                },
                {
                  title: "8.3 Feedback",
                  content: "If you provide feedback or suggestions about the Service, we may use them without restriction or compensation to you.",
                },
              ],
            },
            {
              title: "9. Data and Privacy",
              content: "Our Privacy Policy, available at Lawrenn.com/privacy, describes how we collect, use, and share your information. By using the Service you agree to our Privacy Policy. You are the data controller for your customers' personal data. Lawrenn acts as a data processor on your behalf.",
            },
            {
              title: "10. Disclaimers",
              content: "THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR UNINTERRUPTED OPERATION. Lawrenn DOES NOT WARRANT THAT THE AI AGENT WILL ACCURATELY HANDLE ALL CALLS OR BOOK ALL APPOINTMENTS CORRECTLY. YOU ARE RESPONSIBLE FOR MONITORING YOUR AI AGENT'S PERFORMANCE AND VERIFYING BOOKINGS.",
              bold: true,
            },
            {
              title: "11. Limitation of Liability",
              content: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, Lawrenn AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS. Lawrenn'S TOTAL LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE AMOUNT YOU PAID TO Lawrenn IN THE 12 MONTHS PRECEDING THE CLAIM.",
              bold: true,
            },
            {
              title: "12. Indemnification",
              content: "You agree to defend, indemnify, and hold harmless Lawrenn and its officers, directors, employees, and agents from any claims, liabilities, damages, losses, and expenses arising out of or relating to: (a) your use of the Service; (b) your violation of these Terms; (c) your violation of any applicable law or third-party rights; or (d) your failure to obtain required consents for SMS or telephone communications.",
            },
            {
              title: "13. Term and Termination",
              content: "These Terms remain in effect while you use the Service.",
              items: [
                "You may terminate by cancelling your subscription and deleting your account.",
                "We may suspend or terminate your account immediately if you breach these Terms, fail to pay, or use the Service in a way that creates legal or reputational risk for Lawrenn.",
              ],
              footer: "Upon termination, your right to use the Service ends immediately. We will delete your data within 30 days of account closure.",
            },
            {
              title: "14. Governing Law and Disputes",
              content: "These Terms are governed by the laws of the State of New York, without regard to conflict of law principles. Any dispute arising out of or relating to these Terms shall be resolved by binding arbitration administered by the American Arbitration Association, except that either party may seek injunctive relief in any court of competent jurisdiction. You waive any right to participate in a class action lawsuit or class-wide arbitration.",
            },
            {
              title: "15. Modifications",
              content: "We reserve the right to modify these Terms at any time. We will notify you of material changes by email or by posting a notice in the dashboard at least 14 days before the changes take effect. Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.",
            },
            {
              title: "16. General",
              items: [
                "Entire agreement: these Terms, together with the Privacy Policy, constitute the entire agreement between you and Lawrenn regarding the Service.",
                "Severability: if any provision of these Terms is found unenforceable, the remaining provisions remain in full force.",
                "Waiver: our failure to enforce any provision does not constitute a waiver of our right to enforce it in the future.",
                "Assignment: you may not assign these Terms without our prior written consent.",
                "Notices: legal notices to Lawrenn should be sent to hello@Lawrenn.com.",
              ],
            },
            {
              title: "17. Contact",
              content: "For questions about these Terms:",
              items: [
                "Email: hello@Lawrenn.com",
                "Website: Lawrenn.com",
              ],
            },
          ].map(({ title, content, items, subsections, footer, bold }: any) => (
            <div key={title} style={{ marginBottom: "2.5rem" }}>
              <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: "1.4rem", letterSpacing: "0.03em", color: "#111111", marginBottom: "0.75rem", paddingBottom: "0.5rem", borderBottom: "2px solid rgba(12,192,223,0.2)" }}>
                {title}
              </h2>
              {content && (
                <p style={{ marginBottom: items ? "0.75rem" : 0, fontWeight: bold ? 700 : 400, fontSize: bold ? "0.875rem" : "0.95rem" }}>
                  {content}
                </p>
              )}
              {items && (
                <ul style={{ paddingLeft: "1.5rem", margin: "0 0 0.5rem" }}>
                  {items.map((item: string, i: number) => (
                    <li key={i} style={{ marginBottom: "0.4rem" }}>{item}</li>
                  ))}
                </ul>
              )}
              {subsections && subsections.map((sub: any) => (
                <div key={sub.title} style={{ marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#111111", marginBottom: "0.4rem" }}>{sub.title}</h3>
                  <p style={{ marginBottom: sub.items ? "0.5rem" : 0 }}>{sub.content}</p>
                  {sub.items && (
                    <ul style={{ paddingLeft: "1.5rem", margin: 0 }}>
                      {sub.items.map((item: string, i: number) => (
                        <li key={i} style={{ marginBottom: "0.4rem" }}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {footer && <p style={{ marginTop: "0.75rem", color: "#6B7280", fontSize: "0.9rem" }}>{footer}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "2rem 5%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'Bebas Neue'", fontSize: "1.2rem", letterSpacing: "0.05em", color: "#111111" }}>
          RENN<span style={{ color: "#111111" }}>OPS</span>
        </span>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          <a href="/privacy" style={{ fontSize: "0.82rem", color: "#6B7280", textDecoration: "none" }}>Privacy Policy</a>
          <a href="/terms" style={{ fontSize: "0.82rem", color: "#111111", textDecoration: "none" }}>Terms of Service</a>
        </div>
        <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>Â© 2026 Lawrenn. All rights reserved.</span>
      </div>
    </div>
  );
}
