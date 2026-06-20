import React from "react";
import LegalPageShell, { type LegalSection } from "./LegalPageShell";

const SECTIONS: LegalSection[] = [
  {
    heading: "1. Acceptance of Terms",
    content:
      "By creating an account and using FundCircle ('the Platform'), you agree to be bound by these Terms and Conditions. If you do not agree, please discontinue use immediately. These terms apply to all users including organization owners, agents, and customers.",
  },
  {
    heading: "2. Platform Description",
    content:
      "FundCircle is a digital pigmy collection management platform that enables organizations to manage daily savings collection, loan accounts, and member records. FundCircle is a software platform and does not act as a bank, financial institution, or regulated lender.",
  },
  {
    heading: "3. Account Registration",
    content:
      "You agree to:\n\n• Provide accurate, current, and complete information during registration.\n• Keep your login credentials confidential and not share them with others.\n• Notify us immediately of any unauthorized access to your account.\n• Be at least 18 years old to use this Platform.\n\nYou are responsible for all activity that occurs under your account.",
  },
  {
    heading: "4. User Responsibilities",
    content:
      "You agree not to:\n\n• Use the Platform for unlawful purposes or fraudulent transactions.\n• Attempt to access accounts or data of other users without authorization.\n• Reverse-engineer, copy, or reproduce any part of the Platform.\n• Upload malicious code or interfere with the Platform's operation.\n• Provide false financial information or manipulate records.",
  },
  {
    heading: "5. Financial Transactions",
    content:
      "FundCircle records and tracks financial transactions on behalf of organizations. The accuracy of transaction data entered is the responsibility of the organization and its agents. FundCircle is not liable for financial losses arising from incorrect data entry, system misuse, or external fraud.",
  },
  {
    heading: "6. Service Availability",
    content:
      "We strive to maintain 99% uptime but do not guarantee uninterrupted access. Scheduled maintenance, technical issues, or force majeure events may cause temporary unavailability. We are not liable for losses resulting from service downtime.",
  },
  {
    heading: "7. Intellectual Property",
    content:
      "All content, design, code, and features of FundCircle are the exclusive intellectual property of FundCircle and its licensors. You may not copy, distribute, modify, or create derivative works without prior written permission.",
  },
  {
    heading: "8. Termination",
    content:
      "We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or fail to comply with legal obligations. Organizations may terminate their account by contacting support. Data retention after termination is subject to our Privacy Policy.",
  },
  {
    heading: "9. Limitation of Liability",
    content:
      "To the maximum extent permitted by law, FundCircle shall not be liable for indirect, incidental, special, or consequential damages arising from use of the Platform. Our total liability shall not exceed the fees paid (if any) in the 3 months prior to the claim.",
  },
  {
    heading: "10. Governing Law",
    content:
      "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in India.",
  },
  {
    heading: "11. Changes to Terms",
    content:
      "We may update these Terms from time to time. Continued use after changes constitutes your acceptance of the revised Terms. We will provide notice of material changes via email or in-app notification.",
  },
  {
    heading: "12. Contact",
    content:
      "For questions about these Terms:\n\nFundCircle Support\nEmail: support@fundcircle.app",
  },
];

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms & Conditions"
      subtitle="Please read carefully before using FundCircle"
      lastUpdated="June 1, 2025"
      sections={SECTIONS}
    />
  );
}
