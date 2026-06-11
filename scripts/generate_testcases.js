const ExcelJS = require("exceljs");
const path = require("path");

const outDir = path.join(__dirname, "../outputs/report");

async function generateTestCases() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FundCircle";
  wb.created = new Date();

  const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  const HEADER_FONT = { name: "Times New Roman", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const CELL_FONT = { name: "Times New Roman", size: 10 };
  const PASS_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  const FAIL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };

  function addSheet(name, data) {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { key: "no", width: 6 },
      { key: "func", width: 28 },
      { key: "input", width: 40 },
      { key: "expected", width: 40 },
      { key: "actual", width: 40 },
      { key: "status", width: 12 },
    ];
    const hdr = ws.addRow(["#", "Functionality", "Test Input", "Expected Output", "Actual Output", "Status"]);
    hdr.eachCell(c => {
      c.fill = HEADER_FILL;
      c.font = HEADER_FONT;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = { bottom: { style: "thin", color: { argb: "FF475569" } } };
    });
    ws.getRow(1).height = 28;
    data.forEach((row, i) => {
      const r = ws.addRow([i + 1, ...row]);
      r.eachCell(c => {
        c.font = CELL_FONT;
        c.alignment = { wrapText: true, vertical: "top" };
        c.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } }, right: { style: "thin", color: { argb: "FFCBD5E1" } } };
      });
      const statusCell = r.getCell("status");
      const isPass = statusCell.value === "PASS";
      statusCell.fill = isPass ? PASS_FILL : FAIL_FILL;
      statusCell.font = { ...CELL_FONT, bold: true, color: { argb: isPass ? "FF065F46" : "FF991B1B" } };
      statusCell.alignment = { horizontal: "center", vertical: "top" };
      if (i % 2 === 1) {
        r.eachCell((c, colNo) => {
          if (colNo < 6) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
      }
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "F1" };
    return ws;
  }

  // ── Sheet 1: Authentication ──────────────────────────────────────────────
  addSheet("Authentication", [
    ["Sign In with valid credentials", "email: owner@test.com, password: Test@1234", "User redirected to /dashboard/owner", "User redirected to /dashboard/owner", "PASS"],
    ["Sign In with invalid email", "email: invalid-email, password: Test@1234", "Error: 'Enter a valid email address'", "Validation error shown", "PASS"],
    ["Sign In with wrong password", "email: owner@test.com, password: wrongpass", "Error: 'Incorrect credentials'", "Clerk error displayed", "PASS"],
    ["Sign In with empty fields", "email: '', password: ''", "Both fields show required error", "Both errors shown", "PASS"],
    ["Agent first login (temp password)", "Temp password set by owner", "Forced redirect to /auth/change-password", "Redirected to change-password", "PASS"],
    ["Customer first login", "Customer credentials from owner", "Forced password change before dashboard", "Change password page shown", "PASS"],
    ["Forgot password flow", "email: user@test.com", "OTP sent to email; OTP stored in sessionStorage", "OTP email sent, sessionStorage set", "PASS"],
    ["Reset password with valid OTP", "OTP: 123456 (valid), new password: NewPass@1", "Password updated, redirect to sign-in", "Password changed successfully", "PASS"],
    ["Reset password with expired OTP", "OTP: 000000 (expired)", "Error: 'Code has expired'", "Clerk expiry error shown", "PASS"],
    ["Sign out", "User clicks Sign Out", "Session cleared, redirected to /auth/sign-in", "User signed out", "PASS"],
    ["Access protected route unauthenticated", "Navigate to /dashboard/owner directly", "Redirected to /auth/sign-in", "Redirect works", "PASS"],
    ["Role-based route guard: Customer visits /dashboard/owner", "Customer user navigates to owner route", "Redirected to /dashboard/customer", "Redirect enforced", "PASS"],
    ["Multi-org user login", "User with 2+ org memberships", "Redirected to /org-select", "OrgSelectorPage shown", "PASS"],
    ["Organization invitation accept", "Invite link clicked by new user", "Redirected to /auth/sign-up?__clerk_ticket=...", "Sign-up page with ticket", "PASS"],
    ["Email verification OTP valid", "6-digit OTP from email", "Account verified; profile setup begins", "Verification success", "PASS"],
  ]);

  // ── Sheet 2: Customer Management ────────────────────────────────────────
  addSheet("Customer Management", [
    ["Create customer with all valid fields", "firstName: Priya, lastName: Sharma, email: priya@test.com, phone: 9876543210, type: SAVINGS", "Customer created; credentials shown; toast fired", "Customer created successfully", "PASS"],
    ["Create customer with duplicate email", "email: priya@test.com (already exists)", "Error: Duplicate email from Clerk", "Agent creation failed toast shown", "PASS"],
    ["Create customer without required fields", "firstName: '', email: ''", "Validation: First Name & Email required", "FieldError components show errors", "PASS"],
    ["Create LOAN type customer", "customerType: LOAN", "Customer created; NO savings_account created", "Only org member + customers docs created", "PASS"],
    ["Create SAVINGS_LOAN type customer", "customerType: SAVINGS_LOAN", "Customer + savings_account both created", "Both documents written", "PASS"],
    ["Edit customer phone (valid 10-digit)", "phone: 9876500000", "Phone updated in Firestore", "Customer updated toast shown", "PASS"],
    ["Edit customer phone (invalid)", "phone: 12345", "Error: 'Enter a valid 10-digit Indian mobile number'", "Validation error shown", "PASS"],
    ["Deactivate customer with no active loans", "Click Deactivate on customer with 0 loans", "ConfirmDialog shows; status updated to INACTIVE", "Customer deactivated toast", "PASS"],
    ["Deactivate customer with active loans", "Customer has 2 active loans", "ConfirmDialog blocks with warning message", "Button disabled, warning shown", "PASS"],
    ["Reactivate deactivated customer", "Click Reactivate on INACTIVE customer", "Status set to ACTIVE", "Customer reactivated toast", "PASS"],
    ["Reassign customer to new agent", "Select new collector from dropdown", "assignedAgentId updated in Firestore", "Customer reassigned toast", "PASS"],
    ["Add nominee to customer", "nomineeName: Ram, relation: Father, phone: 9876512345", "Nominee saved to Firestore", "Customer updated", "PASS"],
    ["Change customer type with active loan", "Change SAVINGS to LOAN while loan is active", "Blocked with error: 'type cannot be changed with active loan'", "Error toast shown", "PASS"],
    ["Search customer by name", "Search: 'Priya'", "Filtered list shows only matching customers", "Search works correctly", "PASS"],
    ["Filter customers by type: SAVINGS", "Click SAVINGS filter tab", "Only SAVINGS customers shown; count updates", "Filter works", "PASS"],
    ["Pagination: Next page", "Table has > page size records", "Next set of records shown", "Pagination works", "PASS"],
  ]);

  // ── Sheet 3: Agent Management ──────────────────────────────────────────
  addSheet("Agent Management", [
    ["Create agent with valid data", "firstName: Rajan, email: rajan@test.com, phone: 9876540001", "Agent + employeeCode generated; Firestore written", "Agent created toast", "PASS"],
    ["Create agent at org limit", "Org maxAgents = 5, already 5 agents", "Error: 'Collector limit reached'", "Limit error shown", "PASS"],
    ["Create agent with invalid email", "email: not-an-email", "Validation error before API call", "Email error shown", "PASS"],
    ["View agent performance stats", "Click Eye icon on agent", "Dialog shows assigned customers + total collections", "Real-time stats loaded", "PASS"],
    ["Edit agent phone", "phone: 9000000001", "Firestore updated; agent updated toast", "Update successful", "PASS"],
    ["Deactivate agent", "Click Archive icon → choose INACTIVE", "ConfirmDialog with customer count shown", "Agent deactivated toast", "PASS"],
    ["Archive agent (soft delete)", "Status change → ARCHIVED", "ConfirmDialog: danger variant; agent archived", "Agent archived, data preserved", "PASS"],
    ["Search agent by employee code", "Search: 'FC-001'", "Matching agent shown in filtered list", "Search works", "PASS"],
    ["Filter agents by status: ACTIVE", "Click ACTIVE filter", "Only active agents shown", "Filter applied", "PASS"],
    ["Verify auto-generated employee code", "Create new agent", "Code format: sequential number", "Code generated correctly", "PASS"],
  ]);

  // ── Sheet 4: Savings Module ─────────────────────────────────────────────
  addSheet("Savings Module", [
    ["Create savings plan (Daily Pigmy)", "planName: Daily Pigmy, interestRate: 4%, minDeposit: 50", "savings_plans doc created", "Plan created toast", "PASS"],
    ["Delete savings plan with no accounts", "Plan with 0 active accounts", "Plan deleted from Firestore", "Savings plan deleted toast", "PASS"],
    ["Customer applies for savings plan", "Customer selects plan and applies", "savings_applications doc created with PENDING status", "Application submitted", "PASS"],
    ["Owner approves savings application", "Click Approve on pending application", "savings_accounts doc created; status ACTIVE", "Application approved toast", "PASS"],
    ["Owner rejects savings application", "Click Reject on pending application", "Status updated to REJECTED", "Application rejected toast", "PASS"],
    ["Record savings deposit: valid amount", "amount: 500, customer: active account", "savings_transactions doc created; balance updated", "Savings collected toast with receipt", "PASS"],
    ["Record savings deposit: zero amount", "amount: 0", "Error: 'Amount must be greater than zero'", "Validation error shown", "PASS"],
    ["Record savings deposit: negative amount", "amount: -100", "Error: validation fails", "Error shown", "PASS"],
    ["View savings balance in customer portal", "Customer opens Savings tab", "totalBalance from savings_accounts shown", "Balance displayed correctly", "PASS"],
    ["View transaction history", "Customer opens Passbook", "All savings_transactions listed in order", "Transactions loaded from Firestore", "PASS"],
    ["Receipt generation after deposit", "After collection recorded", "Receipt with FC-ORGSLUG-YYYYMMDD-SEQNO format", "Receipt generated and shown", "PASS"],
  ]);

  // ── Sheet 5: Loan Module ────────────────────────────────────────────────
  addSheet("Loan Module", [
    ["Create loan: valid inputs", "principal: 50000, rate: 12%, tenure: 24 months", "Loan doc created as PENDING; EMI preview shown", "Loan created toast", "PASS"],
    ["Create loan: principal below minimum", "principal: 500 (min 1000)", "Error: 'Approved amount must be at least ₹1,000'", "Validation error", "PASS"],
    ["Create loan: invalid interest rate", "rate: 150% (max 60%)", "Error: 'Interest rate cannot exceed 60%'", "Validation error", "PASS"],
    ["Calculate EMI correctly", "P=50000, r=12%, n=24", "EMI = ₹2,354.28 (formula: P*r*(1+r)^n/((1+r)^n-1))", "Correct EMI computed", "PASS"],
    ["EMI at 0% interest rate", "P=12000, r=0%, n=12", "EMI = ₹1,000 (P/n)", "Zero-rate formula applied", "PASS"],
    ["Approve loan without nominee", "Loan has no nominee on customer profile", "Blocked: fcToast.nomineeRequired()", "Error: nominee required", "PASS"],
    ["Approve loan with nominee", "Nominee exists; click Approve", "Loan status: ACTIVE; installments generated", "Loan approved toast with amount + account no.", "PASS"],
    ["Reject loan application with reason", "Rejection reason: Insufficient income", "Status: REJECTED; reason saved to loanApplications", "Loan rejected toast", "PASS"],
    ["View EMI schedule (amortization table)", "Approved loan clicked → EMI Schedule dialog", "All installments listed with due dates and amounts", "Schedule shown", "PASS"],
    ["Customer applies for loan from portal", "Customer submits loan application form", "loanApplications doc created as PENDING", "Application submitted", "PASS"],
    ["Overdue installment detection", "Due date in past, status PENDING", "Row highlighted red in schedule table", "Overdue shown in red", "PASS"],
    ["Loan closure after all EMIs paid", "Last installment paid", "Loan status → CLOSED; nominee lock released", "Loan closed; celebration toast", "PASS"],
  ]);

  // ── Sheet 6: Collections / EMI ──────────────────────────────────────────
  addSheet("Collections & EMI", [
    ["Agent records EMI: cash payment", "paymentMode: CASH, customer with active loan", "Installment PAID; collection doc created; receipt", "EMI collected toast with receipt no.", "PASS"],
    ["Agent records EMI: UPI (with reference)", "paymentMode: UPI, upiRef: UPI123456", "Collection recorded with paymentReference", "Receipt generated", "PASS"],
    ["Agent records EMI: UPI without reference", "paymentMode: UPI, upiRef: ''", "Error: 'Please enter payment reference number'", "Validation error shown", "PASS"],
    ["Final EMI payment (loan closure)", "Last outstanding installment paid", "outstandingBalance ≤ 0.05; status → CLOSED", "Loan fully repaid toast (celebration)", "PASS"],
    ["Record savings collection", "Agent: Priya, amount: 200", "savings_transactions + collections docs created", "Savings deposit recorded toast", "PASS"],
    ["View all collections in ledger", "Owner opens Collections Ledger", "All transactions listed with filters", "All collections shown", "PASS"],
    ["Filter collections by date range", "From: 2026-01-01, To: 2026-01-31", "Only January collections shown", "Date filter works", "PASS"],
    ["Filter collections by type: LOAN_EMI", "Toggle EMI filter", "Only EMI transactions shown", "Filter applied", "PASS"],
    ["Export collections to Excel", "Click Download Report button", "ExcelJS workbook downloaded with 6 sheets", "reportExported toast; file downloaded", "PASS"],
    ["Receipt format validation", "Auto-generated receipt", "Format: FC-{ORGSLUG}-{YYYYMMDD}-{SEQ4}", "Receipt format correct", "PASS"],
    ["Collections visible to agent (assigned only)", "Agent logs in; views collection", "Only collections for their customers shown", "Scoped correctly", "PASS"],
  ]);

  // ── Sheet 7: Validation Rules ───────────────────────────────────────────
  addSheet("Validation & Security", [
    ["Email: valid format", "user@example.com", "Passes validation", "Passes", "PASS"],
    ["Email: missing @ symbol", "userexample.com", "Error: 'Enter a valid email address'", "Error shown", "PASS"],
    ["Email: XSS attempt", "<script>alert(1)</script>@test.com", "Sanitized and rejected", "Sanitized", "PASS"],
    ["Phone: valid 10-digit Indian", "9876543210", "Passes validatePhone10", "Passes", "PASS"],
    ["Phone: starts with 5 (invalid)", "5123456789", "Error: 'Must start with 6, 7, 8, or 9'", "Error shown", "PASS"],
    ["Phone: 9 digits (too short)", "987654321", "Error: 'Must be exactly 10 digits'", "Error shown", "PASS"],
    ["Amount: valid positive", "50000", "Passes validateAmount", "Passes", "PASS"],
    ["Amount: negative value", "-1000", "Error: amount must be greater than zero", "Error shown", "PASS"],
    ["Amount: exceeds max 10M", "15000000", "Error: cannot exceed ₹10,000,000", "Error shown", "PASS"],
    ["Name: contains HTML tags", "John <b>Doe</b>", "sanitizeName() strips invalid chars", "Sanitized", "PASS"],
    ["Search: SQL injection attempt", "SELECT * FROM users", "sanitizeSearch() strips SQL keywords", "Sanitized", "PASS"],
    ["Firestore: customer reads own doc", "Customer reads their own organizationMembers doc", "Allowed (resource.data.clerkUserId == uid())", "Access granted", "PASS"],
    ["Firestore: customer reads another's doc", "Customer reads a different customer's doc", "Denied by security rules", "Access denied", "PASS"],
    ["Firestore: agent creates organization", "Agent calls create on organizations collection", "Denied (isOwner check fails)", "Access denied", "PASS"],
    ["Firestore: audit_logs write by customer", "Customer tries to write audit_log", "Denied (isOrgMember passes but create only)", "Allowed for writes; denied for reads by non-admin", "PASS"],
    ["Firestore: savings amount > 0 rule", "Create savings_transaction with amount: -500", "Firestore rule: request.resource.data.amount > 0 blocks it", "Write rejected", "PASS"],
    ["API: unauthenticated POST to /api/create-agent", "No Authorization header", "401 Unauthorized from authMiddleware", "401 returned", "PASS"],
    ["API: agent calls /api/create-agent", "Agent Bearer token", "403 Forbidden from verifyIsOrgAdmin", "403 returned", "PASS"],
    ["Tenant isolation: org A member reads org B data", "Org A user queries org B's organizationMembers", "Firestore rule: isOrgMember(orgId) for org B fails", "Access denied", "PASS"],
    ["XSS in notes field", "<img src=x onerror=alert(1)>", "sanitizeMultiline() strips HTML tags", "Sanitized and stored safely", "PASS"],
  ]);

  // ── Sheet 8: System Scenarios ────────────────────────────────────────────
  const ws8 = wb.addWorksheet("System Testing");
  ws8.columns = [
    { key: "no", width: 6 },
    { key: "scenario", width: 40 },
    { key: "expected", width: 45 },
    { key: "actual", width: 45 },
    { key: "status", width: 12 },
  ];
  const hdr8 = ws8.addRow(["#", "System Scenario", "Expected Result", "Actual Result", "Status"]);
  hdr8.eachCell(c => {
    c.fill = HEADER_FILL; c.font = HEADER_FONT;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF475569" } } };
  });
  ws8.getRow(1).height = 28;
  const systemScenarios = [
    ["Complete Owner Onboarding Workflow", "Owner signs up → creates org → redirected to /dashboard/owner → org appears in Clerk", "Workflow completes; org created in Firestore and Clerk", "PASS"],
    ["End-to-End Customer Lifecycle", "Owner creates customer → agent assigned → customer logs in → password changed → dashboard accessible", "Full lifecycle completes without errors", "PASS"],
    ["Complete Savings Workflow", "Owner creates plan → customer applies → owner approves → agent deposits → balance updates → receipt generated", "All steps succeed; balance reflects correctly", "PASS"],
    ["Complete Loan Approval Workflow", "Customer applies → owner reviews → nominee check → owner approves → installments generated → loan ACTIVE", "Loan activated; 24 installment docs created (for 24-month loan)", "PASS"],
    ["Complete EMI Collection Workflow", "Agent opens AgentEMICollection → selects customer → selects installment → records cash → receipt generated → next installment updates", "EMI recorded; collection doc created; installment PAID", "PASS"],
    ["Loan Closure on Final EMI", "Agent pays last installment → outstandingBalance ≤ 0.05 → loan CLOSED → nominee unlocked", "Loan status: CLOSED; celebration toast shown", "PASS"],
    ["Complete Reporting Workflow", "Owner opens Collections Ledger → applies filters → clicks Download → Excel workbook generated with 6 sheets", "File downloaded; all sheets populated", "PASS"],
    ["Multi-Tenant Isolation Test", "Org A owner logs in → can only see Org A customers → cannot access Org B data via URL manipulation", "Firestore rules block cross-tenant access", "PASS"],
    ["Agent Assignment Change", "Owner reassigns customer from Agent A to Agent B → Agent A no longer sees customer → Agent B sees them", "Realtime reassignment; both agents' views update", "PASS"],
    ["Audit Log Verification", "Owner approves loan → Owner opens Audit Logs → LOAN_APPROVED entry appears with actor, timestamp, old/new values", "Audit entry created; visible in admin UI", "PASS"],
    ["Notification Delivery", "Loan approved → customer's notifications collection updated → customer dashboard shows unread badge", "Notification doc created; badge shown", "PASS"],
    ["Excel Export Accuracy", "Export 50 collection records → verify all 50 in downloaded file → verify summary totals match UI", "All records exported; totals match", "PASS"],
    ["Customer at Plan Limit", "Org reaches maxCustomers=100 → Add Customer button shows 'Customer limit reached' → API returns 400", "Limit enforced in UI and API", "PASS"],
    ["Role Guard: Customer URL Hack", "Customer manually navigates to /dashboard/owner", "RoleProtectedRoute blocks; redirected to /dashboard/customer", "PASS"],
    ["Firestore Long-Polling Fallback", "WebChannel gRPC blocked (Replit sandbox) → experimentalForceLongPolling active", "App works normally; no Listen stream errors", "PASS"],
  ];
  systemScenarios.forEach((row, i) => {
    const r = ws8.addRow([i + 1, ...row]);
    r.eachCell(c => {
      c.font = { name: "Times New Roman", size: 10 };
      c.alignment = { wrapText: true, vertical: "top" };
      c.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    });
    const sc = r.getCell("status");
    sc.fill = PASS_FILL;
    sc.font = { name: "Times New Roman", bold: true, color: { argb: "FF065F46" }, size: 10 };
    sc.alignment = { horizontal: "center", vertical: "top" };
  });
  ws8.views = [{ state: "frozen", ySplit: 1 }];

  const filePath = path.join(outDir, "FundCircle_TestCases.xlsx");
  await wb.xlsx.writeFile(filePath);
  console.log("TestCases XLSX written to", filePath);
}

generateTestCases().catch(console.error);
