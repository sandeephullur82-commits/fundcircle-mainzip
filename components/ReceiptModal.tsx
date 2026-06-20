import { useEffect } from "react";
import { format } from "date-fns";
import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ReceiptData {
  receiptNo: string;
  organizationName: string;
  customerName: string;
  accountNumber?: string;
  amount: number;
  savingsAmount?: number;
  loanAmount?: number;
  newBalance?: number;
  collectionType: "SAVINGS" | "LOAN_EMI" | "BOTH";
  agentName: string;
  collectedAt: Date;
  loanId?: string;
  installmentNo?: number;
  loanOutstanding?: number;
}

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  onClose: () => void;
}

function safeN(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function fmtDate(d: Date) {
  return d instanceof Date && d.getTime() > 0
    ? format(d, "dd MMM yyyy, hh:mm a")
    : "—";
}

/*
 * Thermal receipt HTML — 80mm wide, auto height, compact monospace style.
 * Injected into document.body as #fc-print-receipt.
 * @page sets size:80mm auto so no blank pages appear.
 */
function buildPrintHtml(r: ReceiptData): string {
  const typeLabel =
    r.collectionType === "SAVINGS"
      ? "SAVINGS RECEIPT"
      : r.collectionType === "BOTH"
      ? "COMBINED RECEIPT"
      : "EMI PAYMENT RECEIPT";

  const divider = `<div style="border-top:1px dashed #888;margin:8px 0;"></div>`;

  const amountSection = (() => {
    if (r.collectionType === "BOTH") {
      let rows = "";
      if (r.savingsAmount !== undefined)
        rows += `<div style="display:flex;justify-content:space-between;"><span>Savings Deposit</span><span>Rs.${safeN(r.savingsAmount).toLocaleString()}</span></div>`;
      if (r.loanAmount !== undefined)
        rows += `<div style="display:flex;justify-content:space-between;"><span>EMI Payment</span><span>Rs.${safeN(r.loanAmount).toLocaleString()}</span></div>`;
      rows += divider;
      rows += `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;"><span>TOTAL</span><span>Rs.${safeN(r.amount).toLocaleString()}</span></div>`;
      if (r.newBalance !== undefined)
        rows += `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;"><span>Savings Balance</span><span>Rs.${safeN(r.newBalance).toLocaleString()}</span></div>`;
      if (r.loanOutstanding !== undefined)
        rows += `<div style="display:flex;justify-content:space-between;font-size:11px;"><span>Loan Outstanding</span><span>${r.loanOutstanding === 0 ? "CLOSED" : "Rs." + safeN(r.loanOutstanding).toLocaleString()}</span></div>`;
      return rows;
    }
    let rows = `<div style="display:flex;justify-content:space-between;font-weight:700;font-size:16px;"><span>${r.collectionType === "SAVINGS" ? "AMOUNT PAID" : "EMI PAID"}</span><span>Rs.${safeN(r.amount).toLocaleString()}</span></div>`;
    if (r.collectionType === "SAVINGS" && r.newBalance !== undefined)
      rows += `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;"><span>New Balance</span><span>Rs.${safeN(r.newBalance).toLocaleString()}</span></div>`;
    if (r.collectionType === "LOAN_EMI" && r.loanOutstanding !== undefined)
      rows += `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px;"><span>Outstanding</span><span>${r.loanOutstanding === 0 ? "LOAN CLOSED" : "Rs." + safeN(r.loanOutstanding).toLocaleString()}</span></div>`;
    return rows;
  })();

  return `
    <div style="
      font-family:'Courier New',Courier,monospace;
      width:80mm;
      max-width:80mm;
      margin:0;
      padding:6mm 5mm;
      font-size:12px;
      color:#000;
      background:#fff;
      line-height:1.5;
    ">
      <!-- Header -->
      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:18px;font-weight:900;letter-spacing:1px;">FundCircle</div>
        <div style="font-size:11px;font-weight:600;">${r.organizationName}</div>
        <div style="font-size:10px;margin-top:4px;font-weight:700;letter-spacing:1px;">${typeLabel}</div>
      </div>

      ${divider}

      <!-- Receipt Number -->
      <div style="text-align:center;margin:6px 0;">
        <div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;">Receipt No.</div>
        <div style="font-size:14px;font-weight:900;letter-spacing:2px;">${r.receiptNo || "—"}</div>
      </div>

      ${divider}

      <!-- Customer Details -->
      <div style="font-size:11px;margin-bottom:2px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#555;">Customer</span>
          <span style="font-weight:700;text-align:right;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.customerName || "—"}</span>
        </div>
        ${r.accountNumber ? `<div style="display:flex;justify-content:space-between;"><span style="color:#555;">Account</span><span style="font-weight:600;">${r.accountNumber}</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#555;">Collector</span>
          <span style="font-weight:600;text-align:right;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.agentName || "—"}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#555;">Date</span>
          <span style="font-weight:600;font-size:10px;">${fmtDate(r.collectedAt)}</span>
        </div>
        ${r.collectionType === "LOAN_EMI" && r.installmentNo ? `<div style="display:flex;justify-content:space-between;"><span style="color:#555;">EMI #</span><span style="font-weight:600;">${r.installmentNo}</span></div>` : ""}
      </div>

      ${divider}

      <!-- Amount Section -->
      <div style="font-size:12px;">
        ${amountSection}
      </div>

      ${divider}

      <!-- Footer -->
      <div style="text-align:center;font-size:10px;color:#555;line-height:1.7;margin-top:4px;">
        <div>Thank You</div>
        <div>Generated by FundCircle</div>
        <div style="font-size:9px;margin-top:2px;">This is a digitally generated receipt.</div>
      </div>
    </div>
  `;
}

export default function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  /*
   * Inject a body-level print template so ONLY the receipt renders during print.
   * Uses 80mm auto page size — thermal receipt format with no blank page.
   */
  useEffect(() => {
    if (!receipt) return;

    const tpl = document.createElement("div");
    tpl.id = "fc-print-receipt";
    tpl.innerHTML = buildPrintHtml(receipt);
    document.body.appendChild(tpl);

    const style = document.createElement("style");
    style.id = "fc-print-receipt-style";
    style.textContent = `
      #fc-print-receipt { display: none; }
      @media print {
        body > *:not(#fc-print-receipt) { display: none !important; }
        #fc-print-receipt {
          display: block !important;
          position: static !important;
          width: 80mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @page {
          size: 80mm auto;
          margin: 0;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.getElementById("fc-print-receipt")?.remove();
      document.getElementById("fc-print-receipt-style")?.remove();
    };
  }, [receipt]);

  if (!receipt) return null;

  const handlePrint = () => window.print();
  const displayBalance = safeN(receipt.newBalance);
  const displayOutstanding = safeN(receipt.loanOutstanding);

  const typeLabel =
    receipt.collectionType === "SAVINGS"
      ? "✓ Savings Receipt"
      : receipt.collectionType === "BOTH"
      ? "✓ Combined Receipt"
      : "✓ EMI Payment Receipt";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Thermal-style modal — narrow, compact */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[320px]">
        {/* Close ✕ */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Thermal Receipt Content ───────────────────────────────────── */}
        <div className="px-5 pt-5 pb-3 font-mono">
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">FundCircle</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">{receipt.organizationName}</p>
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mt-1">{typeLabel}</p>
          </div>

          {/* Receipt Number */}
          <div className="text-center mb-3 border-b border-dashed border-slate-300 pb-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Receipt No.</p>
            <p className="text-sm font-black text-slate-900 tracking-widest mt-0.5">
              {receipt.receiptNo || "—"}
            </p>
          </div>

          {/* Details table */}
          <div className="space-y-1.5 text-xs mb-3">
            <ThermalRow label="Customer" value={receipt.customerName || "—"} />
            {receipt.accountNumber && <ThermalRow label="Account" value={receipt.accountNumber} />}
            <ThermalRow label="Collector" value={receipt.agentName || "—"} />
            <ThermalRow label="Date" value={fmtDate(receipt.collectedAt)} />
            {receipt.collectionType === "LOAN_EMI" && receipt.installmentNo && (
              <ThermalRow label="EMI #" value={`${receipt.installmentNo}`} />
            )}
          </div>

          {/* Amounts */}
          <div className="border-t border-dashed border-slate-300 pt-3 mb-3 space-y-1.5 text-xs">
            {receipt.collectionType === "BOTH" ? (
              <>
                {receipt.savingsAmount !== undefined && (
                  <ThermalRow label="Savings" value={`₹${safeN(receipt.savingsAmount).toLocaleString()}`} />
                )}
                {receipt.loanAmount !== undefined && (
                  <ThermalRow label="EMI" value={`₹${safeN(receipt.loanAmount).toLocaleString()}`} />
                )}
                <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-1.5 mt-1">
                  <span>TOTAL</span>
                  <span className="text-emerald-600">₹{safeN(receipt.amount).toLocaleString()}</span>
                </div>
                {receipt.newBalance !== undefined && (
                  <ThermalRow label="Sav. Balance" value={`₹${displayBalance.toLocaleString()}`} />
                )}
                {receipt.loanOutstanding !== undefined && (
                  <ThermalRow
                    label="Outstanding"
                    value={receipt.loanOutstanding === 0 ? "LOAN CLOSED ✓" : `₹${displayOutstanding.toLocaleString()}`}
                  />
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between font-black text-sm">
                  <span>{receipt.collectionType === "SAVINGS" ? "PAID" : "EMI PAID"}</span>
                  <span className="text-emerald-600">₹{safeN(receipt.amount).toLocaleString()}</span>
                </div>
                {receipt.collectionType === "SAVINGS" && receipt.newBalance !== undefined && (
                  <ThermalRow label="New Balance" value={`₹${displayBalance.toLocaleString()}`} />
                )}
                {receipt.collectionType === "LOAN_EMI" && receipt.loanOutstanding !== undefined && (
                  <ThermalRow
                    label="Outstanding"
                    value={receipt.loanOutstanding === 0 ? "LOAN CLOSED ✓" : `₹${displayOutstanding.toLocaleString()}`}
                  />
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-dashed border-slate-300 pt-3 text-center">
            <p className="text-[11px] font-bold text-slate-700">Thank You</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Generated by FundCircle</p>
          </div>
        </div>

        {/* ── Action Buttons ───────────────────────────────────────────── */}
        <div className="px-5 pb-5 pt-2 flex gap-2">
          <Button onClick={handlePrint} variant="outline" className="flex-1 gap-2 h-10 text-sm">
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button onClick={onClose} className="flex-1 h-10 text-sm bg-slate-900 hover:bg-slate-800 text-white">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThermalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-right truncate">{value || "—"}</span>
    </div>
  );
}
