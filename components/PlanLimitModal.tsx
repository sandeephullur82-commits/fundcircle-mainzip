import { AlertTriangle, ArrowUpCircle, CheckCircle2, X } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onRequestUpgrade: () => void;
  isRequesting: boolean;
  requestSent: boolean;
  currentPlan?: string;
  maxCustomers?: number;
};

export default function PlanLimitModal({
  isOpen,
  onClose,
  onRequestUpgrade,
  isRequesting,
  requestSent,
  currentPlan = "free",
  maxCustomers = 25,
}: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-b border-amber-100 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full hover:bg-white/70 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Subscription Limit</p>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">Customer Limit Reached</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Your organization has reached the maximum number of customers allowed on the{" "}
            <span className="font-bold text-slate-900 capitalize">{currentPlan}</span> plan
            {" "}({maxCustomers} customers). To add more customers, the plan needs to be upgraded.
          </p>

          {requestSent ? (
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Upgrade request sent</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Your organization owner has been notified and can upgrade the plan.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What happens next?</p>
              <ul className="space-y-1.5 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  Your upgrade request is sent to the organization owner
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  Owner upgrades the plan from the Billing section
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  Your dashboard updates instantly — no refresh needed
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all"
          >
            Close
          </button>
          {!requestSent && (
            <button
              onClick={onRequestUpgrade}
              disabled={isRequesting}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-sky-500 hover:bg-sky-600 py-3 text-sm font-bold text-white shadow-sm shadow-sky-200 transition-all disabled:opacity-60"
            >
              {isRequesting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Sending…
                </span>
              ) : (
                <>
                  <ArrowUpCircle className="w-4 h-4" />
                  Request Upgrade
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
