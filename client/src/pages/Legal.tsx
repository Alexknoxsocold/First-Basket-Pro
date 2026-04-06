import { useState } from "react";
import { useSearch } from "wouter";
import { Shield, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "terms" | "privacy";

export default function Legal() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialTab = params.get("tab") === "privacy" ? "privacy" : "terms";
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-0">
            {[
              { id: "terms" as Tab, label: "Terms of Service", icon: FileText },
              { id: "privacy" as Tab, label: "Privacy Policy", icon: Shield },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                  tab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", tab === id ? "text-primary" : "")} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10">
        {tab === "terms" ? <TermsOfService /> : <PrivacyPolicy />}
      </div>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: April 2026</p>
      </div>

      <Section title="1. Acceptance of Terms">
        By accessing or using PreziBaskets ("the Site"), you agree to be bound by these Terms of
        Service. If you do not agree to these terms, please do not use the Site.
      </Section>

      <Section title="2. For Informational Purposes Only">
        All content provided on PreziBaskets — including first basket predictions, player statistics,
        team analytics, odds displays, and parlay suggestions — is intended for <strong>informational
        and entertainment purposes only</strong>. Nothing on this Site constitutes financial advice,
        sports betting advice, or a guarantee of any outcome. Always gamble responsibly and within
        your means.
      </Section>

      <Section title="3. Age Requirement">
        You must be at least 18 years of age (or the legal gambling age in your jurisdiction,
        whichever is higher) to use this Site. By using PreziBaskets, you represent and warrant that
        you meet this age requirement.
      </Section>

      <Section title="4. No Liability for Losses">
        PreziBaskets is not responsible for any financial losses, betting losses, or other damages
        that arise from the use of information provided on the Site. Sports outcomes are inherently
        unpredictable. Use of any data, predictions, or statistics from this Site is entirely at your
        own risk.
      </Section>

      <Section title="5. Accuracy of Information">
        We strive to provide accurate and up-to-date NBA statistics and odds sourced from public
        data providers. However, we make no warranties regarding the completeness, accuracy, or
        timeliness of any information. Data may be delayed or contain errors.
      </Section>

      <Section title="6. User Accounts">
        If you create an account on PreziBaskets, you are responsible for maintaining the
        confidentiality of your login credentials and for all activity under your account. You agree
        not to share your account with others or attempt to access accounts that are not yours.
      </Section>

      <Section title="7. Prohibited Use">
        You agree not to use the Site to: (a) violate any applicable laws or regulations; (b)
        attempt to reverse-engineer, scrape, or copy the Site's data or features without
        permission; (c) interfere with the Site's operation or security; or (d) impersonate any
        person or entity.
      </Section>

      <Section title="8. Intellectual Property">
        All content, branding, and design on PreziBaskets is the property of PreziBaskets and its
        owners. You may not reproduce, distribute, or create derivative works without explicit
        written permission.
      </Section>

      <Section title="9. Third-Party Data">
        PreziBaskets displays data sourced from third parties including ESPN and DraftKings. We are
        not affiliated with, endorsed by, or sponsored by these organizations. Their trademarks and
        data remain the property of their respective owners.
      </Section>

      <Section title="10. Changes to Terms">
        We reserve the right to update these Terms of Service at any time. Continued use of the Site
        after changes are posted constitutes your acceptance of the updated terms.
      </Section>

      <Section title="11. Contact">
        For questions about these Terms, contact us at{" "}
        <a href="mailto:contact@prezibaskets.com" className="text-primary underline">
          contact@prezibaskets.com
        </a>.
      </Section>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-1">Last updated: April 2026</p>
      </div>

      <Section title="1. Overview">
        PreziBaskets ("we," "our," or "us") is committed to protecting your privacy. This Privacy
        Policy explains what information we collect, how we use it, and your rights regarding
        your data.
      </Section>

      <Section title="2. Information We Collect">
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Account information:</strong> If you sign up, we collect your email address and
            a hashed password. We never store your password in plain text.
          </li>
          <li>
            <strong>Session data:</strong> We use server-side sessions to keep you logged in. No
            sensitive data is stored in cookies beyond a session identifier.
          </li>
          <li>
            <strong>Usage data:</strong> We may log general usage patterns (pages visited, features
            used) to improve the Site. This data is not linked to identifiable individuals.
          </li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Information">
        We use the information we collect to: (a) operate and improve the Site; (b) authenticate
        your account; (c) respond to your inquiries; and (d) ensure the security of the Site. We
        do not sell, rent, or trade your personal information to third parties.
      </Section>

      <Section title="4. Data Sharing">
        We do not share your personal data with any third parties except: (a) as required by law
        or legal process; or (b) to protect the rights and safety of PreziBaskets and its users.
      </Section>

      <Section title="5. Cookies">
        We use a single session cookie to keep you logged in during your visit. We do not use
        advertising cookies or tracking pixels. You can disable cookies in your browser settings,
        but doing so may prevent you from staying logged in.
      </Section>

      <Section title="6. Third-Party Services">
        The Site pulls publicly available data from ESPN and displays odds information sourced from
        DraftKings. These third parties have their own privacy policies and we encourage you to
        review them. We are not responsible for their data practices.
      </Section>

      <Section title="7. Data Retention">
        We retain your account information for as long as your account is active. You may request
        deletion of your account and associated data at any time by contacting us.
      </Section>

      <Section title="8. Security">
        We take reasonable measures to protect your data, including encrypted password storage and
        secure server connections (HTTPS). However, no internet transmission is 100% secure, and
        we cannot guarantee absolute security.
      </Section>

      <Section title="9. Children's Privacy">
        PreziBaskets is not intended for anyone under the age of 18. We do not knowingly collect
        personal information from minors. If you believe a minor has provided us with their
        information, please contact us immediately.
      </Section>

      <Section title="10. Your Rights">
        You have the right to access, correct, or request deletion of your personal data at any
        time. To exercise these rights, contact us at{" "}
        <a href="mailto:contact@prezibaskets.com" className="text-primary underline">
          contact@prezibaskets.com
        </a>.
      </Section>

      <Section title="11. Changes to This Policy">
        We may update this Privacy Policy from time to time. We will notify users of significant
        changes by updating the date at the top of this page. Continued use of the Site after
        changes are posted constitutes acceptance of the updated policy.
      </Section>

      <Section title="12. Contact">
        For any privacy-related questions or requests, reach us at{" "}
        <a href="mailto:contact@prezibaskets.com" className="text-primary underline">
          contact@prezibaskets.com
        </a>.
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-5 space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
