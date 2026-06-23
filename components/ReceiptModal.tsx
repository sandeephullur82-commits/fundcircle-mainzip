import { useEffect } from "react";
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
  repaymentType?: "REGULAR" | "PARTIAL" | "ADVANCE" | "FORECLOSURE";
  agentName: string;
  collectedAt: Date;
  loanId?: string;
  installmentNo?: number;
  loanOutstanding?: number;
  emisCleared?: number;
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

function getTypeLabel(r: ReceiptData): string {
  if (r.collectionType === "SAVINGS") return "SAVINGS RECEIPT";
  if (r.collectionType === "BOTH")    return "COMBINED RECEIPT";
  switch (r.repaymentType) {
    case "PARTIAL":     return "PARTIAL PAYMENT RECEIPT";
    case "ADVANCE":     return "ADVANCE PAYMENT RECEIPT";
    case "FORECLOSURE": return "LOAN FORECLOSURE RECEIPT";
    default:            return "EMI PAYMENT RECEIPT";
  }
}

/*
 * Thermal receipt HTML — 80mm wide, auto height, compact monospace style.
 * Injected into document.body as #fc-print-receipt.
 * @page sets size:80mm auto so no blank pages appear.
 */
function buildPrintHtml(r: ReceiptData): string {
  const typeLabel = getTypeLabel(r);

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
      <div style="text-align:center;margin-bottom:6px;">
        <div style="font-size:18px;font-weight:900;letter-spacing:1px;">FundCircle</div>
        <div style="font-size:11px;font-weight:600;">${r.organizationName}</div>
        <div style="font-size:10px;margin-top:4px;font-weight:700;letter-spacing:1px;">${typeLabel}</div>
      </div>
      ${divider}
      <div style="text-align:center;margin:6px 0;">
        <div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;">Receipt No.</div>
        <div style="font-size:14px;font-weight:900;letter-spacing:2px;">${r.receiptNo || "—"}</div>
      </div>
      ${divider}
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
      <div style="font-size:12px;">
        ${amountSection}
      </div>
      ${divider}
      <div style="text-align:center;font-size:10px;color:#555;line-height:1.7;margin-top:4px;">
        <div>Thank You</div>
        <div>Generated by FundCircle</div>
        <div style="font-size:9px;margin-top:2px;">This is a digitally generated receipt.</div>
      </div>
    </div>
  `;
}

function generateReceiptPDF(r: ReceiptData): void {
  const W = 90;
  const doc = new jsPDF({ unit: "mm", format: [W, 230] });

  const cx = W / 2;
  let y = 10;

  const ln = (extra = 5) => { y += extra; };

  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("FundCircle", cx, y, { align: "center" });
  ln(6);

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(r.organizationName, cx, y, { align: "center" });
  ln(5);

  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text(getTypeLabel(r), cx, y, { align: "center" });
  ln(5);

  doc.setDrawColor(150, 150, 150);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(5, y, W - 5, y);
  ln(5);

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.text("Receipt No.", cx, y, { align: "center" });
  ln(4);
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(r.receiptNo || "—", cx, y, { align: "center" });
  ln(6);

  doc.setLineDashPattern([1, 1], 0);
  doc.line(5, y, W - 5, y);
  ln(5);

  const row = (label: string, value: string, bold = false) => {
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(label, 6, y);
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(value, W - 6, y, { align: "right" });
    ln(5);
  };

  row("Customer", r.customerName || "—");
  if (r.accountNumber) row("Account", r.accountNumber);
  row("Collector", r.agentName || "—");
  row("Date", fmtDate(r.collectedAt));
  if (r.collectionType === "LOAN_EMI" && r.installmentNo) row("EMI #", String(r.installmentNo));

  doc.setLineDashPattern([1, 1], 0);
  doc.line(5, y, W - 5, y);
  ln(5);

  if (r.collectionType === "BOTH") {
    if (r.savingsAmount !== undefined) row("Savings Deposit", `Rs.${safeN(r.savingsAmount).toLocaleString()}`);
    if (r.loanAmount !== undefined) row("EMI Payment", `Rs.${safeN(r.loanAmount).toLocaleString()}`);
    doc.setLineDashPattern([], 0);
    doc.line(5, y, W - 5, y);
    ln(3);
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("TOTAL", 6, y);
    doc.text(`Rs.${safeN(r.amount).toLocaleString()}`, W - 6, y, { align: "right" });
    ln(6);
    if (r.newBalance !== undefined) row("Sav. Balance", `Rs.${safeN(r.newBalance).toLocaleString()}`);
    if (r.loanOutstanding !== undefined) row("Outstanding", r.loanOutstanding === 0 ? "LOAN CLOSED" : `Rs.${safeN(r.loanOutstanding).toLocaleString()}`);
  } else {
    const amtLabel = r.collectionType === "SAVINGS" ? "AMOUNT PAID" : "EMI PAID";
    doc.setFont("courier", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(amtLabel, 6, y);
    doc.text(`Rs.${safeN(r.amount).toLocaleString()}`, W - 6, y, { align: "right" });
    ln(6);
    if (r.collectionType === "SAVINGS" && r.newBalance !== undefined) row("New Balance", `Rs.${safeN(r.newBalance).toLocaleString()}`);
    if (r.collectionType === "LOAN_EMI" && r.emisCleared !== undefined) row("EMIs Cleared", String(r.emisCleared));
    if (r.collectionType === "LOAN_EMI" && r.loanOutstanding !== undefined) {
      row("Outstanding", r.loanOutstanding === 0 ? "LOAN CLOSED" : `Rs.${safeN(r.loanOutstanding).toLocaleString()}`, true);
    }
  }

  doc.setLineDashPattern([1, 1], 0);
  doc.line(5, y, W - 5, y);
  ln(5);

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Thank You", cx, y, { align: "center" });
  ln(4);
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Generated by FundCircle", cx, y, { align: "center" });
  ln(4);
  doc.text("This is a digitally generated receipt.", cx, y, { align: "center" });

  doc.save(`receipt-${r.receiptNo || "download"}.pdf`);
}

export default function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
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
  const handleDownloadPDF = () => generateReceiptPDF(receipt);

  const displayBalance = safeN(receipt.newBalance);
  const displayOutstanding = safeN(receipt.loanOutstanding);

  const repayLabel = (() => {
    if (receipt.collectionType === "SAVINGS") return "✓ Savings Receipt";
    if (receipt.collectionType === "BOTH")    return "✓ Combined Receipt";
    switch (receipt.repaymentType) {
      case "PARTIAL":     return "✓ Partial Payment";
      case "ADVANCE":     return "✓ Advance Payment";
      case "FORECLOSURE": return "✓ Foreclosure — Loan Closed";
      default:            return "✓ EMI Payment Receipt";
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[320px]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-5 pt-5 pb-3 font-mono">
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">FundCircle</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">{receipt.organizationName}</p>
            <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mt-1">{repayLabel}</p>
          </div>

          <div className="text-center mb-3 border-b border-dashed border-slate-300 pb-3">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Receipt No.</p>
            <p className="text-sm font-black text-slate-900 tracking-widest mt-0.5">
              {receipt.receiptNo || "—"}
            </p>
          </div>

          <div className="space-y-1.5 text-xs mb-3">
            <ThermalRow label="Customer" value={receipt.customerName || "—"} />
            {receipt.accountNumber && <ThermalRow label="Account" value={receipt.accountNumber} />}
            <ThermalRow label="Collector" value={receipt.agentName || "—"} />
            <ThermalRow label="Date" value={fmtDate(receipt.collectedAt)} />
            {receipt.collectionType === "LOAN_EMI" && receipt.installmentNo && (
              <ThermalRow label="EMI #" value={`${receipt.installmentNo}`} />
            )}
          </div>

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
                {receipt.collectionType === "LOAN_EMI" && receipt.emisCleared !== undefined && (
                  <ThermalRow label="EMIs Cleared" value={`${receipt.emisCleared}`} />
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

          <div className="border-t border-dashed border-slate-300 pt-3 text-center">
            <p className="text-[11px] font-bold text-slate-700">Thank You</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Generated by FundCircle</p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-2 space-y-2">
          <Button
            onClick={handleDownloadPDF}
            className="w-full gap-2 h-10 text-sm bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-4 h-4" /> Download PDF
          </Button>
          <div className="flex gap-2">
            <Button onClick={handlePrint} variant="outline" className="flex-1 gap-2 h-9 text-sm">
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button onClick={onClose} className="flex-1 h-9 text-sm bg-slate-900 hover:bg-slate-800 text-white">
              Done
            </Button>
          </div>
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
