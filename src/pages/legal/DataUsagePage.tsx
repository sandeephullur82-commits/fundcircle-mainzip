import React from "react";
import LegalPageShell, { type LegalSection } from "./LegalPageShell";

const SECTIONS: LegalSection[] = [
  {
    heading: "1. Overview",
    content:
      "This Data Usage Policy describes how FundCircle collects, stores, processes, and uses data generated through the use of our platform. By using FundCircle, you consent to the data practices described in this policy.",
  },
  {
    heading: "2. Types of Data Collected",
    content:
      "FundCircle collects and processes the following categories of data:\n\n• Identity data: full name, email, phone number, date of birth, gender.\n• Financial records: savings account balances, deposit amounts, loan amounts, EMI schedules, and collection receipts.\n• Organizational data: organization name, agent assignments, customer memberships.\n• Technical data: login timestamps, device information, session identifiers.",
  },
  {
    heading: "3. Data Storage",
    content:
      "All data is stored securely in Google Cloud Firestore databases with encryption at rest and in transit. Data is stored in compliance with applicable data protection regulations. Backup copies are maintained to ensure data recovery in case of failure.",
  },
  {
    heading: "4. Data Processing Purposes",
    content:
      "Your data is processed for the following purposes:\n\n• Executing and recording financial transactions (savings, loans, EMI payments).\n• Generating collection receipts and financial statements.\n• Providing real-time dashboard analytics to organizations and customers.\n• Sending transactional notifications (collection confirmations, loan approvals).\n• Auditing and compliance reporting.\n• Fraud detection and security monitoring.",
  },
  {
    heading: "5. Data Access Controls",
    content:
      "Access to data is strictly role-based:\n\n• Organization Owners can access all data within their organization.\n• Agents can access only their assigned customers' records.\n• Customers can view only their own account data.\n\nCross-organization data access is not permitted under any circumstances.",
  },
  {
    heading: "6. Third-Party Data Processors",
    content:
      "FundCircle uses the following trusted third-party processors:\n\n• Clerk (Authentication) — manages user identity and login sessions.\n• Google Firebase / Firestore — database and file storage.\n• Vercel / Hosting provider — application delivery.\n\nAll third-party processors are contractually bound to protect your data and process it only as directed.",
  },
  {
    heading: "7. Data Portability",
    content:
      "Customers and organization administrators may request an export of their data in CSV or PDF format. Contact your organization administrator or our support team to request a data export.",
  },
  {
    heading: "8. Data Deletion",
    content:
      "Upon account termination:\n\n• Active account data is archived immediately.\n• Data is permanently deleted after the retention period (7 years for financial records per regulatory requirements).\n• Backup copies are deleted within 90 days of the retention period expiry.\n\nTo request early deletion (where legally permissible), contact support@fundcircle.app.",
  },
  {
    heading: "9. Automated Decision Making",
    content:
      "FundCircle does not make fully automated decisions that significantly affect users. All approvals (loan approvals, membership changes) require human review by organization administrators.",
  },
  {
    heading: "10. Data Breach Notification",
    content:
      "In the event of a data breach that poses a risk to your rights or data security, we will notify affected users within 72 hours of becoming aware of the breach, in accordance with applicable regulations.",
  },
  {
    heading: "11. Contact",
    content:
      "For data-related inquiries or to exercise your data rights:\n\nFundCircle Data Protection\nEmail: support@fundcircle.app",
  },
];

export default function DataUsagePage() {
  return (
    <LegalPageShell
      title="Data Usage Policy"
      subtitle="How your data is collected and processed"
      lastUpdated="June 1, 2025"
      sections={SECTIONS}
    />
  );
}
