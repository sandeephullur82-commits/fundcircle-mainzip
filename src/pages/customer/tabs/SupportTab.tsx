import React, { useState } from "react";
import {
  Phone, MessageCircle, Mail, MapPin, ChevronDown, ChevronUp,
  HelpCircle, Building2, User, Info, FileText, Shield, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Membership } from "@/types";

interface Props {
  org: any | null;
  orgName: string;
  collectorDoc: Membership | null;
  membershipDoc: Membership | null;
  user: any;
}

const FAQS = [
  {
    q: "How do I check my savings balance?",
    a: "Go to the Savings tab from the bottom navigation or sidebar. Your current balance, transaction history, and plan details are displayed there.",
  },
  {
    q: "How do I see my loan details?",
    a: "Tap the Loans tab to view your active loans, outstanding balance, EMI schedule, and loan terms.",
  },
  {
    q: "How do I download receipts?",
    a: "Open the Receipts tab to view and download all your collection receipts and savings transactions.",
  },
  {
    q: "How do I contact my collector?",
    a: "Use the 'Contact Your Collector' section on this page to call or send a WhatsApp message to your assigned collector directly.",
  },
  {
    q: "How do I reset my password?",
    a: "Go to the Security tab and tap 'Reset Password'. A reset link will be sent to your registered email address.",
  },
];

export default function SupportTab({ org, orgName, collectorDoc, membershipDoc, user }: Props) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const collectorName = collectorDoc?.fullName
    || collectorDoc?.firstName && `${collectorDoc.firstName} ${collectorDoc.lastName || ""}`.trim()
    || (membershipDoc as any)?.assignedAgentName
    || "Your Collector";
  const collectorPhone = collectorDoc?.phone || null;
  const collectorStatus = collectorDoc?.status === "ACTIVE" ? "Active" : collectorDoc ? "Inactive" : null;

  const orgPhone   = org?.phone      || null;
  const orgEmail   = org?.ownerEmail || null;
  const orgAddress = org?.address    || null;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-lg">
          <HelpCircle className="w-5 h-5 text-blue-600" />
          Help & Contact
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Get assistance from your collector or organization.
        </p>
      </div>

      {/* ── Contact Your Collector ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600" />
            Contact Your Collector
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Collector info row */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{collectorName}</p>
              {collectorPhone ? (
                <p className="text-xs text-slate-500 mt-0.5">{collectorPhone}</p>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5 italic">Phone not available</p>
              )}
            </div>
            {collectorStatus && (
              <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${
                collectorStatus === "Active"
                  ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-500"
              }`}>
                {collectorStatus}
              </span>
            )}
          </div>

          {/* Action buttons */}
          {collectorPhone ? (
            <div className="grid grid-cols-2 gap-3">
              <a
                href={`tel:${collectorPhone}`}
                className="flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold transition-all"
                aria-label={`Call ${collectorName}`}
              >
                <Phone className="w-4 h-4" />
                Call Collector
              </a>
              <a
                href={`https://wa.me/${collectorPhone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-11 rounded-xl bg-[#25D366] hover:bg-[#20b857] active:scale-[0.98] text-white text-sm font-semibold transition-all"
                aria-label={`WhatsApp ${collectorName}`}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400">
                Collector contact details will appear once assigned by your organization.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Organization Contact ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            Organization Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Org info */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Organization</p>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{orgName}</p>
              </div>
            </div>

            {orgPhone && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{orgPhone}</p>
                </div>
              </div>
            )}

            {orgEmail && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{orgEmail}</p>
                </div>
              </div>
            )}

            {orgAddress && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Office Address</p>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm leading-relaxed">{orgAddress}</p>
                </div>
              </div>
            )}

            {!orgPhone && !orgEmail && !orgAddress && (
              <p className="text-xs text-slate-400 text-center py-2 italic">
                Organization contact details not configured yet.
              </p>
            )}
          </div>

          {/* Action buttons */}
          {(orgPhone || orgEmail) && (
            <div className="grid grid-cols-2 gap-3">
              {orgPhone && (
                <a
                  href={`tel:${orgPhone}`}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-semibold transition-all"
                  aria-label="Call office"
                >
                  <Phone className="w-4 h-4" />
                  Call Office
                </a>
              )}
              {orgEmail && (
                <a
                  href={`mailto:${orgEmail}`}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl bg-slate-700 hover:bg-slate-800 active:scale-[0.98] text-white text-sm font-semibold transition-all ${!orgPhone ? "col-span-2" : ""}`}
                  aria-label="Email support"
                >
                  <Mail className="w-4 h-4" />
                  Email Support
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── FAQ ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-violet-600" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-3 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
                aria-expanded={openFaq === i}
              >
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 pr-2">
                  {faq.q}
                </span>
                {openFaq === i
                  ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>
              {openFaq === i && (
                <p className="text-sm text-slate-500 dark:text-slate-400 pb-3.5 leading-relaxed">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── App Information ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            App Information
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2.5">
            <InfoRow label="App Name" value="FundCircle" />
            <InfoRow label="Version" value="1.0.0" />
            <InfoRow label="Build" value="stable" />
            <InfoRow label="Last Updated" value="June 2025" />
            <InfoRow label="Platform" value={
              typeof navigator !== "undefined" && navigator.userAgent.includes("Mobile")
                ? "Mobile Web"
                : "Web"
            } />
          </div>
        </CardContent>
      </Card>

      {/* ── Legal ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            Legal
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {[
            { label: "Privacy Policy", icon: Shield },
            { label: "Terms & Conditions", icon: FileText },
            { label: "Data Usage Policy", icon: FileText },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              className="w-full flex items-center justify-between py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
              aria-label={label}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            </button>
          ))}
        </CardContent>
      </Card>

    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-200">{value}</span>
    </div>
  );
}
