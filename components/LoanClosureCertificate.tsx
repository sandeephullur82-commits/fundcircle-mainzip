import jsPDF from "jspdf";
import { format } from "date-fns";

export interface ClosureCertificateData {
  loanAccountNumber: string;
  customerName: string;
  organizationName: string;
  principalAmount: number;
  approvedAmount?: number;
  totalAmountPaid: number;
  interestRate?: number;
  tenureMonths?: number;
  disbursedAt?: Date;
  closedAt?: Date;
  collectorName?: string;
  nomineeName?: string;
}

function fmt(n: number) {
  return `Rs. ${Number(Math.round(n)).toLocaleString("en-IN")}`;
}

function fmtDate(d?: Date) {
  if (!d || !(d instanceof Date) || d.getTime() === 0) return "—";
  return format(d, "dd MMMM yyyy");
}

export function downloadClosureCertificate(data: ClosureCertificateData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const cx = W / 2;
  let y = 20;

  const ln = (n = 6) => { y += n; };

  doc.setDrawColor(30, 100, 60);
  doc.setLineWidth(1);
  doc.rect(10, 10, W - 20, 277);
  doc.setLineWidth(0.3);
  doc.rect(12, 12, W - 24, 273);

  ln(8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 100, 60);
  doc.text("FundCircle", cx, y, { align: "center" });
  ln(8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text(data.organizationName, cx, y, { align: "center" });
  ln(10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 60, 40);
  doc.text("LOAN CLOSURE CERTIFICATE", cx, y, { align: "center" });
  ln(4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text("This certificate confirms that the following loan has been fully repaid and closed.", cx, y, { align: "center" });
  ln(8);

  doc.setDrawColor(200, 230, 210);
  doc.setLineWidth(0.5);
  doc.line(20, y, W - 20, y);
  ln(10);

  const certNo = `FC-CERT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${data.loanAccountNumber.slice(-6).toUpperCase()}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Certificate No: ${certNo}`, 20, y);
  doc.text(`Date: ${fmtDate(data.closedAt || new Date())}`, W - 20, y, { align: "right" });
  ln(12);

  const fieldRow = (label: string, value: string, highlight = false) => {
    doc.setFillColor(highlight ? 240 : 248, highlight ? 255 : 250, highlight ? 240 : 248);
    doc.roundedRect(20, y - 4, W - 40, 9, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(label, 25, y + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(highlight ? 30 : 20, highlight ? 100 : 30, highlight ? 60 : 20);
    doc.text(value, W - 25, y + 1, { align: "right" });
    ln(12);
  };

  fieldRow("Loan Account Number", data.loanAccountNumber);
  fieldRow("Customer Name", data.customerName);
  fieldRow("Principal / Approved Amount", fmt(data.approvedAmount ?? data.principalAmount));
  fieldRow("Interest Rate (p.a.)", data.interestRate !== undefined ? `${data.interestRate}%` : "—");
  fieldRow("Loan Tenure", data.tenureMonths !== undefined ? `${data.tenureMonths} months` : "—");
  fieldRow("Disbursement Date", fmtDate(data.disbursedAt));
  fieldRow("Closure Date", fmtDate(data.closedAt));
  fieldRow("Total Amount Repaid", fmt(data.totalAmountPaid), true);
  if (data.collectorName) fieldRow("Collected By", data.collectorName);
  if (data.nomineeName) fieldRow("Nominee", data.nomineeName);

  ln(6);

  doc.setFillColor(235, 255, 240);
  doc.roundedRect(20, y - 4, W - 40, 14, 2, 2, "F");
  doc.setDrawColor(100, 200, 130);
  doc.setLineWidth(0.5);
  doc.roundedRect(20, y - 4, W - 40, 14, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 100, 60);
  doc.text("✓  LOAN FULLY REPAID AND CLOSED", cx, y + 3, { align: "center" });
  ln(18);

  doc.setDrawColor(200, 230, 210);
  doc.setLineWidth(0.5);
  doc.line(20, y, W - 20, y);
  ln(10);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const note = [
    "This is a system-generated closure certificate confirming that the above-mentioned loan has been",
    "fully repaid. This document serves as proof of loan closure. Please retain this for your records.",
  ];
  note.forEach((line) => {
    doc.text(line, cx, y, { align: "center" });
    ln(5);
  });

  ln(10);

  const sigY = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  doc.line(25, sigY, 80, sigY);
  doc.text("Authorized Signature", 52, sigY + 5, { align: "center" });
  doc.text(data.organizationName, 52, sigY + 10, { align: "center" });

  doc.line(W - 80, sigY, W - 25, sigY);
  doc.text("Customer Acknowledgement", W - 52, sigY + 5, { align: "center" });
  doc.text(data.customerName, W - 52, sigY + 10, { align: "center" });

  ln(20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`Generated on ${format(new Date(), "dd MMM yyyy, hh:mm a")} · Powered by FundCircle`, cx, y, { align: "center" });

  doc.save(`closure-certificate-${data.loanAccountNumber}.pdf`);
}
