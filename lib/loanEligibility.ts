import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "./firebase";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskFactor {
  label: string;
  value: string;
  impact: "positive" | "neutral" | "negative";
  detail: string;
}

export interface RiskResult {
  level: RiskLevel;
  score: number;
  factors: RiskFactor[];
  summary: string;
}

export interface LoanCustomerData {
  customerId: string;
  organizationId: string;
  monthlyIncome?: number;
  loanAmount: number;
  emiAmount: number;
  activeLoansCount?: number;
  overdueCount?: number;
}

/**
 * Pure risk calculator — runs synchronously on already-fetched data.
 * No savings data used.
 */
export function calculateRiskLevel(data: LoanCustomerData): RiskResult {
  const {
    monthlyIncome = 0,
    loanAmount,
    emiAmount,
    activeLoansCount = 0,
    overdueCount = 0,
  } = data;

  let score = 0;
  const factors: RiskFactor[] = [];

  // ── 1. Debt-to-Income ratio ──────────────────────────────────────────────────
  if (monthlyIncome > 0) {
    const dti = (emiAmount / monthlyIncome) * 100;
    if (dti < 30) {
      score += 0;
      factors.push({
        label: "Debt-to-Income Ratio",
        value: `${Math.round(dti)}%`,
        impact: "positive",
        detail: "EMI is less than 30% of monthly income — healthy repayment capacity.",
      });
    } else if (dti < 50) {
      score += 2;
      factors.push({
        label: "Debt-to-Income Ratio",
        value: `${Math.round(dti)}%`,
        impact: "neutral",
        detail: "EMI is 30–50% of monthly income — moderate repayment burden.",
      });
    } else {
      score += 4;
      factors.push({
        label: "Debt-to-Income Ratio",
        value: `${Math.round(dti)}%`,
        impact: "negative",
        detail: "EMI exceeds 50% of monthly income — high repayment stress.",
      });
    }
  } else {
    score += 1;
    factors.push({
      label: "Monthly Income",
      value: "Not declared",
      impact: "neutral",
      detail: "No income data on record. Manual verification recommended.",
    });
  }

  // ── 2. Existing active loans ─────────────────────────────────────────────────
  if (activeLoansCount === 0) {
    score += 0;
    factors.push({
      label: "Existing Loans",
      value: "None",
      impact: "positive",
      detail: "No active loans. Clean loan history.",
    });
  } else if (activeLoansCount === 1) {
    score += 2;
    factors.push({
      label: "Existing Loans",
      value: `${activeLoansCount} active`,
      impact: "neutral",
      detail: "Customer has one existing active loan.",
    });
  } else {
    score += 5;
    factors.push({
      label: "Existing Loans",
      value: `${activeLoansCount} active`,
      impact: "negative",
      detail: "Multiple active loans significantly increase default risk.",
    });
  }

  // ── 3. Overdue EMIs ──────────────────────────────────────────────────────────
  if (overdueCount === 0) {
    score += 0;
    factors.push({
      label: "Payment History",
      value: "No overdues",
      impact: "positive",
      detail: "All previous installments paid on time.",
    });
  } else if (overdueCount <= 2) {
    score += 3;
    factors.push({
      label: "Payment History",
      value: `${overdueCount} overdue EMI(s)`,
      impact: "neutral",
      detail: "A few overdue installments. Verify reason before approving.",
    });
  } else {
    score += 6;
    factors.push({
      label: "Payment History",
      value: `${overdueCount} overdue EMI(s)`,
      impact: "negative",
      detail: "Significant overdue history — high likelihood of default.",
    });
  }

  // ── 4. Loan amount vs income ─────────────────────────────────────────────────
  if (monthlyIncome > 0) {
    const loanToAnnualIncome = loanAmount / (monthlyIncome * 12);
    if (loanToAnnualIncome < 2) {
      score += 0;
      factors.push({
        label: "Loan Affordability",
        value: `${Math.round(loanToAnnualIncome * 100) / 100}× annual income`,
        impact: "positive",
        detail: "Loan amount is well within annual income range.",
      });
    } else if (loanToAnnualIncome < 4) {
      score += 1;
      factors.push({
        label: "Loan Affordability",
        value: `${Math.round(loanToAnnualIncome * 100) / 100}× annual income`,
        impact: "neutral",
        detail: "Loan is moderate relative to annual income.",
      });
    } else {
      score += 3;
      factors.push({
        label: "Loan Affordability",
        value: `${Math.round(loanToAnnualIncome * 100) / 100}× annual income`,
        impact: "negative",
        detail: "Loan amount is significantly higher than annual income.",
      });
    }
  }

  // ── Determine risk level ─────────────────────────────────────────────────────
  let level: RiskLevel;
  let summary: string;

  if (score <= 2) {
    level = "LOW";
    summary = "Customer shows strong repayment capacity with clean credit history.";
  } else if (score <= 6) {
    level = "MEDIUM";
    summary = "Moderate risk. Verify income and existing obligations before approving.";
  } else {
    level = "HIGH";
    summary = "High risk detected. Careful review required before approval.";
  }

  return { level, score, factors, summary };
}

/**
 * Async helper — fetches active loan count and overdue EMI count for a customer.
 * No savings data touched.
 */
export async function fetchCustomerLoanData(
  customerId: string,
  organizationId: string
): Promise<{ activeLoansCount: number; overdueCount: number }> {
  const ACTIVE_STATUSES = ["ACTIVE", "OVERDUE", "PARTIALLY_PAID"];

  const [loanSnap, overdueSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "loans"),
        where("customerId", "==", customerId),
        where("organizationId", "==", organizationId),
        limit(20)
      )
    ),
    getDocs(
      query(
        collection(db, "loan_installments"),
        where("customerId", "==", customerId),
        where("organizationId", "==", organizationId),
        where("status", "==", "OVERDUE"),
        limit(20)
      )
    ),
  ]);

  const activeLoansCount = loanSnap.docs.filter((d) =>
    ACTIVE_STATUSES.includes((d.data().status || "").toUpperCase())
  ).length;

  return { activeLoansCount, overdueCount: overdueSnap.size };
}
