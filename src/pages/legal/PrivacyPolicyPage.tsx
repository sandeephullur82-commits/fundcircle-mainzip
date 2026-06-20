import React from "react";
import LegalPageShell, { type LegalSection } from "./LegalPageShell";

const SECTIONS: LegalSection[] = [
  {
    heading: "1. Introduction",
    content:
      "FundCircle ('we', 'our', or 'the Platform') is committed to protecting your personal information. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information when you use our digital pigmy collection management platform.",
  },
  {
    heading: "2. Information We Collect",
    content:
      "We collect the following types of information:\n\n• Personal details: name, email address, phone number, date of birth, gender, and address.\n• Financial data: savings account balances, transaction history, loan details, and collection records.\n• Device and usage data: device type, browser, IP address, and app usage patterns.\n• Authentication data: login credentials and session information managed securely via Clerk.",
  },
  {
    heading: "3. How We Use Your Information",
    content:
      "We use your data to:\n\n• Operate and maintain your account and savings/loan records.\n• Process and record daily pigmy collections and transactions.\n• Send notifications about collections, receipts, and account activity.\n• Provide customer support and resolve disputes.\n• Improve the Platform's features and security.\n• Comply with applicable laws and regulations.",
  },
  {
    heading: "4. Data Sharing",
    content:
      "We do not sell your personal information. We may share data with:\n\n• Your assigned organization (the pigmy collector organization you are enrolled with).\n• Third-party service providers (authentication, cloud storage, analytics) under strict data processing agreements.\n• Law enforcement or regulatory authorities if required by law.",
  },
  {
    heading: "5. Data Retention",
    content:
      "We retain your personal and financial data for as long as your account is active or as required by applicable financial regulations. Upon account closure, data may be retained for up to 7 years for audit and compliance purposes.",
  },
  {
    heading: "6. Data Security",
    content:
      "We implement industry-standard security measures including encrypted data transmission (TLS), secure authentication, role-based access controls, and regular security reviews. While we strive to protect your data, no system is 100% secure.",
  },
  {
    heading: "7. Your Rights",
    content:
      "You have the right to:\n\n• Access the personal data we hold about you.\n• Request correction of inaccurate data.\n• Request deletion of your account and associated data (subject to legal retention requirements).\n• Object to or restrict processing in certain circumstances.\n\nTo exercise these rights, contact your organization administrator or reach us at support@fundcircle.app.",
  },
  {
    heading: "8. Cookies and Tracking",
    content:
      "FundCircle uses essential cookies to maintain your session and preferences. We do not use advertising or cross-site tracking cookies. You can control cookie settings through your browser.",
  },
  {
    heading: "9. Changes to This Policy",
    content:
      "We may update this Privacy Policy from time to time. We will notify you of significant changes via email or in-app notification. Continued use of the Platform after changes constitutes acceptance.",
  },
  {
    heading: "10. Contact",
    content:
      "For privacy-related inquiries, contact:\n\nFundCircle Support\nEmail: support@fundcircle.app",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="How FundCircle handles your data"
      lastUpdated="June 1, 2025"
      sections={SECTIONS}
    />
  );
}
