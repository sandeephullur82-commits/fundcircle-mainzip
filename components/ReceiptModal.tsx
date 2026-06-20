import { format } from "date-fns";
import { X, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";

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

function fmt(n: any): string {
  return `Rs. ${safeN(n).toLocaleString("en-IN")}`;
}

function generateReceiptPDF(receipt: ReceiptData) {
  const W = 80;
  const doc = new jsPDF({ unit: "mm", format: [W, 220] });

  let y = 8;

  const center = (text: string, size = 9, bold = false) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(text, W / 2, y, { align: "center" });
    y += size * 0.45 + 1.5;
  };

  const dashed = () => {
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setDrawColor(180, 180, 180);
    doc.line(4, y, W - 4, y);
    y += 3;
  };

  const row = (label: string, value: string, bold = false) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(label, 4, y);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(value, W - 4, y, { align: "right" });
    y += 5;
  };

  const spacer = (h = 2) => { y += h; };

  // ── Header ──
  center("FundCircle", 13, true);
  center(receipt.organizationName, 9);
  spacer(1);
  dashed();

  const typeLabel =
    receipt.collectionType === "SAVINGS"
      ? "SAVINGS DEPOSIT RECEIPT"
      : receipt.collectionType === "LOAN_EMI"
      ? "EMI PAYMENT RECEIPT"
      : "COMBINED COLLECTION RECEIPT";
  center(typeLabel, 8, true);
  spacer(1);
  dashed();

  // ── Info ──
  row("Receipt No.", receipt.receiptNo, true);
  row("Customer", receipt.customerName);
  row("Collector", receipt.agentName);
  row("Date", format(receipt.collectedAt, "dd MMM yyyy"));
  row("Time", format(receipt.collectedAt, "hh:mm a"));
  if (receipt.collectionType === "LOAN_EMI" && receipt.installmentNo) {
    row("EMI Installment", `#${receipt.installmentNo}`);
  }

  dashed();

  // ── Amounts ──
  if (receipt.collectionType === "SAVINGS") {
    row("Deposit Amount", fmt(receipt.amount), true);
    row(
      "Savings Balance",
      `Rs. ${safeN(receipt.newBalance).toLocaleString("en-IN")}`,
      true
    );
  } else if (receipt.collectionType === "LOAN_EMI") {
    row("EMI Amount Paid", fmt(receipt.amount), true);
    if (receipt.loanOutstanding !== undefined) {
      row(
        "Loan Outstanding",
        receipt.loanOutstanding === 0
          ? "LOAN CLOSED"
          : fmt(receipt.loanOutstanding),
        true
      );
    }
  } else {
    if (receipt.savingsAmount !== undefined) row("Savings Deposit", fmt(receipt.savingsAmount));
    if (receipt.loanAmount !== undefined) row("EMI Payment", fmt(receipt.loanAmount));
    row("Total Collected", fmt(receipt.amount), true);
    if (receipt.newBalance !== undefined) {
      row("Savings Balance", `Rs. ${safeN(receipt.newBalance).toLocaleString("en-IN")}`);
    }
    if (receipt.loanOutstanding !== undefined) {
      row(
        "Loan Outstanding",
        receipt.loanOutstanding === 0 ? "LOAN CLOSED" : fmt(receipt.loanOutstanding)
      );
    }
  }

  dashed();

  // ── Footer ──
  center("Thank you for your payment!", 8, true);
  spacer(1);
  center("Powered by FundCircle", 7);
  spacer(2);

  // Trim page to content
  (doc.internal.pageSize as any).height = y + 4;

  doc.save(`Receipt-${receipt.receiptNo}.pdf`);
}

export default function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  if (!receipt) return null;

  const handlePrint = () => window.print();
  const handleDownloadPDF = () => generateReceiptPDF(receipt);

  const displayBalance = safeN(receipt.newBalance);
  const displayOutstanding = safeN(receipt.loanOutstanding);

  return (
    <>
      {/* Thermal print styles */}
      <style>{`
        @media print {
          body > *:not(.fc-receipt-print) { display: none !important; }
          .fc-receipt-print {
            position: fixed !important;
            inset: 0 !important;
            z-index: 9999 !important;
            background: white !important;
            display: flex !important;
            align-items: flex-start !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .fc-receipt-print .print\\:hidden { display: none !important; }
          .fc-receipt-modal {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            font-size: 10pt !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>

      <div className="fc-receipt-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:bg-white print:p-0">
        <div className="fc-receipt-modal relative bg-white rounded-2xl shadow-2xl w-full max-w-sm print:shadow-none print:rounded-none print:max-w-full">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition-colors print:hidden"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Receipt Content */}
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-300 pb-4">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">FundCircle</h2>
              <p className="text-sm font-semibold text-slate-600 mt-0.5">{receipt.organizationName}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                {receipt.collectionType === "SAVINGS"
                  ? "✓ Savings Receipt"
                  : receipt.collectionType === "BOTH"
                  ? "✓ Combined Collection Receipt"
                  : "✓ EMI Payment Receipt"}
              </div>
            </div>

            {/* Receipt No */}
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receipt Number</p>
              <p className="text-base font-black text-slate-900 mt-0.5 font-mono tracking-wide">
                {receipt.receiptNo}
              </p>
            </div>

            {/* Details */}
            <div className="space-y-2.5 text-sm">
              <ReceiptRow label="Customer" value={receipt.customerName} />
              {receipt.accountNumber && (
                <ReceiptRow label="Account No." value={receipt.accountNumber} />
              )}
              <ReceiptRow
                label="Date & Time"
                value={format(receipt.collectedAt, "dd MMM yyyy, hh:mm a")}
              />
              <ReceiptRow label="Collected By" value={receipt.agentName} />
              {receipt.collectionType === "LOAN_EMI" && receipt.installmentNo && (
                <ReceiptRow label="EMI Installment" value={`#${receipt.installmentNo}`} />
              )}
            </div>

            {/* Amount */}
            <div className="border-t border-dashed border-slate-300 pt-4 space-y-2">
              {receipt.collectionType === "BOTH" ? (
                <>
                  {receipt.savingsAmount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Savings Deposit</span>
                      <span className="font-bold text-emerald-600">₹{safeN(receipt.savingsAmount).toLocaleString()}</span>
                    </div>
                  )}
                  {receipt.loanAmount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">EMI Payment</span>
                      <span className="font-bold text-indigo-600">₹{safeN(receipt.loanAmount).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
                    <span className="font-bold text-slate-700">Total Collected</span>
                    <span className="text-xl font-black text-emerald-600">₹{safeN(receipt.amount).toLocaleString()}</span>
                  </div>
                  {receipt.newBalance !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">New Savings Balance</span>
                      <span className="font-bold text-slate-900">₹{displayBalance.toLocaleString()}</span>
                    </div>
                  )}
                  {receipt.loanOutstanding !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Loan Outstanding</span>
                      <span className="font-bold text-slate-900">
                        {receipt.loanOutstanding === 0
                          ? <span className="text-emerald-600">LOAN CLOSED ✓</span>
                          : `₹${displayOutstanding.toLocaleString()}`}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600">
                      {receipt.collectionType === "SAVINGS" ? "Amount Deposited" : "EMI Amount Paid"}
                    </span>
                    <span className="text-xl font-black text-emerald-600">₹{safeN(receipt.amount).toLocaleString()}</span>
                  </div>
                  {receipt.collectionType === "SAVINGS" && receipt.newBalance !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">New Savings Balance</span>
                      <span className="font-bold text-slate-900">₹{displayBalance.toLocaleString()}</span>
                    </div>
                  )}
                  {receipt.collectionType === "LOAN_EMI" && receipt.loanOutstanding !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-600">Outstanding Balance</span>
                      <span className="font-bold text-slate-900">
                        {receipt.loanOutstanding === 0 ? (
                          <span className="text-emerald-600">LOAN CLOSED ✓</span>
                        ) : (
                          `₹${displayOutstanding.toLocaleString()}`
                        )}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-dashed border-slate-300 pt-3 text-center">
              <p className="text-[10px] text-slate-400 leading-relaxed">
                This is a digitally generated receipt.<br />
                No signature required. Powered by FundCircle.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-2 print:hidden">
            <Button onClick={handlePrint} variant="outline" className="flex-1 gap-2">
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button
              onClick={handleDownloadPDF}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              <Download className="w-4 h-4" /> PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-right">{value}</span>
    </div>
  );
}
