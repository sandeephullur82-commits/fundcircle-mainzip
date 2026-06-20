import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

export interface LegalSection {
  heading: string;
  content: string;
}

interface Props {
  title: string;
  subtitle?: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export default function LegalPageShell({ title, subtitle, lastUpdated, sections }: Props) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
        <div className="min-w-0">
          <h1 className="font-bold text-slate-900 dark:text-white leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        <div className="ml-auto shrink-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
            <Shield className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-6">
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50">
          <Shield className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <span className="font-semibold">FundCircle</span> · Last updated: {lastUpdated}
          </p>
        </div>

        {sections.map((section, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 space-y-2">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm">{section.heading}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {section.content}
            </p>
          </div>
        ))}

        <div className="text-center">
          <p className="text-xs text-slate-400">
            Questions? Contact us at{" "}
            <a href="mailto:support@fundcircle.app" className="text-emerald-600 underline">
              support@fundcircle.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
