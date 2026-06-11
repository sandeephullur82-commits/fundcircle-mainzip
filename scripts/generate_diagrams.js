const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "../outputs/report");
fs.mkdirSync(outDir, { recursive: true });

// ── Architecture Diagram ──────────────────────────────────────────────────────
const architectureSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680" font-family="Arial, sans-serif">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#334155"/>
    </marker>
  </defs>
  <!-- Background -->
  <rect width="1000" height="680" fill="#F8FAFC" rx="12"/>
  <text x="500" y="38" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — High-Level System Architecture</text>

  <!-- CLIENT LAYER -->
  <rect x="30" y="60" width="940" height="130" fill="#EFF6FF" rx="10" stroke="#93C5FD" stroke-width="1.5"/>
  <text x="50" y="82" font-size="13" font-weight="bold" fill="#1D4ED8">CLIENT LAYER (Browser / Mobile)</text>
  <rect x="60" y="92" width="160" height="72" fill="#DBEAFE" rx="8" stroke="#60A5FA" stroke-width="1"/>
  <text x="140" y="128" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Owner Dashboard</text>
  <text x="140" y="148" text-anchor="middle" font-size="10" fill="#3B82F6">React + Tailwind v4</text>
  <rect x="250" y="92" width="160" height="72" fill="#DBEAFE" rx="8" stroke="#60A5FA" stroke-width="1"/>
  <text x="330" y="128" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Agent Dashboard</text>
  <text x="330" y="148" text-anchor="middle" font-size="10" fill="#3B82F6">EMI Collection UI</text>
  <rect x="440" y="92" width="160" height="72" fill="#DBEAFE" rx="8" stroke="#60A5FA" stroke-width="1"/>
  <text x="520" y="128" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Customer Portal</text>
  <text x="520" y="148" text-anchor="middle" font-size="10" fill="#3B82F6">Savings &amp; Loans View</text>
  <rect x="630" y="92" width="160" height="72" fill="#DBEAFE" rx="8" stroke="#60A5FA" stroke-width="1"/>
  <text x="710" y="128" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Landing Page</text>
  <text x="710" y="148" text-anchor="middle" font-size="10" fill="#3B82F6">Public Marketing Site</text>
  <rect x="820" y="92" width="130" height="72" fill="#DBEAFE" rx="8" stroke="#60A5FA" stroke-width="1"/>
  <text x="885" y="125" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Auth Pages</text>
  <text x="885" y="145" text-anchor="middle" font-size="10" fill="#3B82F6">Sign-In/Sign-Up</text>
  <text x="885" y="158" text-anchor="middle" font-size="10" fill="#3B82F6">Custom Clerk UI</text>

  <!-- AUTH LAYER -->
  <rect x="30" y="210" width="440" height="100" fill="#FEF3C7" rx="10" stroke="#FCD34D" stroke-width="1.5"/>
  <text x="50" y="230" font-size="13" font-weight="bold" fill="#92400E">AUTHENTICATION (Clerk)</text>
  <rect x="50" y="240" width="115" height="55" fill="#FDE68A" rx="8" stroke="#F59E0B" stroke-width="1"/>
  <text x="107" y="268" text-anchor="middle" font-size="11" font-weight="bold" fill="#78350F">JWT / Sessions</text>
  <text x="107" y="285" text-anchor="middle" font-size="9" fill="#92400E">Bearer Tokens</text>
  <rect x="180" y="240" width="115" height="55" fill="#FDE68A" rx="8" stroke="#F59E0B" stroke-width="1"/>
  <text x="237" y="268" text-anchor="middle" font-size="11" font-weight="bold" fill="#78350F">Org Membership</text>
  <text x="237" y="285" text-anchor="middle" font-size="9" fill="#92400E">Roles &amp; Invitations</text>
  <rect x="310" y="240" width="140" height="55" fill="#FDE68A" rx="8" stroke="#F59E0B" stroke-width="1"/>
  <text x="380" y="268" text-anchor="middle" font-size="11" font-weight="bold" fill="#78350F">Password Recovery</text>
  <text x="380" y="285" text-anchor="middle" font-size="9" fill="#92400E">OTP / Email Reset</text>

  <!-- API LAYER -->
  <rect x="490" y="210" width="480" height="100" fill="#F0FDF4" rx="10" stroke="#86EFAC" stroke-width="1.5"/>
  <text x="510" y="230" font-size="13" font-weight="bold" fill="#14532D">API SERVER (Express.js — Port 3001)</text>
  <rect x="510" y="240" width="130" height="55" fill="#BBF7D0" rx="8" stroke="#4ADE80" stroke-width="1"/>
  <text x="575" y="265" text-anchor="middle" font-size="11" font-weight="bold" fill="#166534">authMiddleware</text>
  <text x="575" y="280" text-anchor="middle" font-size="9" fill="#15803D">Clerk Token Verify</text>
  <rect x="655" y="240" width="130" height="55" fill="#BBF7D0" rx="8" stroke="#4ADE80" stroke-width="1"/>
  <text x="720" y="262" text-anchor="middle" font-size="11" font-weight="bold" fill="#166534">POST /api/create</text>
  <text x="720" y="277" text-anchor="middle" font-size="10" fill="#15803D">-agent / -customer</text>
  <rect x="800" y="240" width="145" height="55" fill="#BBF7D0" rx="8" stroke="#4ADE80" stroke-width="1"/>
  <text x="872" y="262" text-anchor="middle" font-size="11" font-weight="bold" fill="#166534">PUT /api/update</text>
  <text x="872" y="277" text-anchor="middle" font-size="10" fill="#15803D">-customer/:id</text>

  <!-- DATABASE LAYER -->
  <rect x="30" y="330" width="940" height="130" fill="#FDF4FF" rx="10" stroke="#E879F9" stroke-width="1.5"/>
  <text x="50" y="350" font-size="13" font-weight="bold" fill="#701A75">DATABASE LAYER (Firebase / Firestore)</text>
  <rect x="50" y="360" width="130" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="115" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">organizations</text>
  <text x="115" y="403" text-anchor="middle" font-size="9" fill="#86198F">orgMembers</text>
  <text x="115" y="418" text-anchor="middle" font-size="9" fill="#86198F">users</text>
  <rect x="200" y="360" width="130" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="265" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">savings_accounts</text>
  <text x="265" y="403" text-anchor="middle" font-size="9" fill="#86198F">savings_plans</text>
  <text x="265" y="418" text-anchor="middle" font-size="9" fill="#86198F">savings_txns</text>
  <rect x="350" y="360" width="130" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="415" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">loans</text>
  <text x="415" y="403" text-anchor="middle" font-size="9" fill="#86198F">loan_installments</text>
  <text x="415" y="418" text-anchor="middle" font-size="9" fill="#86198F">loanApplications</text>
  <rect x="500" y="360" width="130" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="565" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">collections</text>
  <text x="565" y="403" text-anchor="middle" font-size="9" fill="#86198F">receipts</text>
  <text x="565" y="418" text-anchor="middle" font-size="9" fill="#86198F">receiptCounters</text>
  <rect x="650" y="360" width="130" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="715" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">audit_logs</text>
  <text x="715" y="403" text-anchor="middle" font-size="9" fill="#86198F">notifications</text>
  <text x="715" y="418" text-anchor="middle" font-size="9" fill="#86198F">orgCounters</text>
  <rect x="800" y="360" width="150" height="85" fill="#FAE8FF" rx="8" stroke="#D946EF" stroke-width="1"/>
  <text x="875" y="387" text-anchor="middle" font-size="11" font-weight="bold" fill="#701A75">Security Rules</text>
  <text x="875" y="403" text-anchor="middle" font-size="9" fill="#86198F">Role-Based ACL</text>
  <text x="875" y="418" text-anchor="middle" font-size="9" fill="#86198F">Tenant Isolation</text>

  <!-- EXTERNAL SERVICES -->
  <rect x="30" y="480" width="440" height="90" fill="#FFF1F2" rx="10" stroke="#FDA4AF" stroke-width="1.5"/>
  <text x="50" y="500" font-size="13" font-weight="bold" fill="#9F1239">EXTERNAL SERVICES</text>
  <rect x="50" y="510" width="120" height="48" fill="#FFE4E6" rx="8" stroke="#FB7185" stroke-width="1"/>
  <text x="110" y="534" text-anchor="middle" font-size="11" font-weight="bold" fill="#9F1239">Clerk Cloud</text>
  <text x="110" y="549" text-anchor="middle" font-size="9" fill="#BE123C">Identity Provider</text>
  <rect x="190" y="510" width="120" height="48" fill="#FFE4E6" rx="8" stroke="#FB7185" stroke-width="1"/>
  <text x="250" y="534" text-anchor="middle" font-size="11" font-weight="bold" fill="#9F1239">Firebase Cloud</text>
  <text x="250" y="549" text-anchor="middle" font-size="9" fill="#BE123C">Firestore + Storage</text>
  <rect x="330" y="510" width="120" height="48" fill="#FFE4E6" rx="8" stroke="#FB7185" stroke-width="1"/>
  <text x="390" y="534" text-anchor="middle" font-size="11" font-weight="bold" fill="#9F1239">ExcelJS</text>
  <text x="390" y="549" text-anchor="middle" font-size="9" fill="#BE123C">Report Generation</text>

  <!-- TECH STACK -->
  <rect x="490" y="480" width="480" height="90" fill="#F0F9FF" rx="10" stroke="#7DD3FC" stroke-width="1.5"/>
  <text x="510" y="500" font-size="13" font-weight="bold" fill="#0C4A6E">TECH STACK</text>
  <text x="520" y="522" font-size="11" fill="#0369A1">Frontend: React 18 + Vite 6 + TypeScript + Tailwind CSS v4</text>
  <text x="520" y="540" font-size="11" fill="#0369A1">Backend: Node.js + Express.js (port 3001)</text>
  <text x="520" y="558" font-size="11" fill="#0369A1">Auth: Clerk (JWT, Org Memberships, Custom UI)</text>

  <!-- Arrows -->
  <line x1="500" y1="155" x2="500" y2="208" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="250" y1="305" x2="250" y2="328" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="730" y1="305" x2="730" y2="328" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="500" y1="458" x2="500" y2="478" stroke="#334155" stroke-width="1.5" marker-end="url(#arrow)"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_Architecture_Diagram.svg"), architectureSVG);

// ── ER Diagram ────────────────────────────────────────────────────────────────
const erSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="820" font-family="Arial, sans-serif">
  <rect width="1100" height="820" fill="#F8FAFC" rx="12"/>
  <text x="550" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — Entity Relationship Diagram</text>

  <!-- organizations -->
  <rect x="20" y="55" width="190" height="175" fill="#DBEAFE" rx="8" stroke="#3B82F6" stroke-width="2"/>
  <rect x="20" y="55" width="190" height="30" fill="#2563EB" rx="8"/>
  <rect x="20" y="75" width="190" height="10" fill="#2563EB"/>
  <text x="115" y="75" text-anchor="middle" font-size="13" font-weight="bold" fill="white">organizations</text>
  <text x="30" y="102" font-size="10" fill="#1E40AF">PK id (string)</text>
  <text x="30" y="118" font-size="10" fill="#1E293B">name (string)</text>
  <text x="30" y="134" font-size="10" fill="#1E293B">ownerClerkUserId</text>
  <text x="30" y="150" font-size="10" fill="#1E293B">status (ACTIVE/SUSPENDED)</text>
  <text x="30" y="166" font-size="10" fill="#1E293B">limits.maxAgents (int)</text>
  <text x="30" y="182" font-size="10" fill="#1E293B">limits.maxCustomers (int)</text>
  <text x="30" y="198" font-size="10" fill="#1E293B">createdAt (timestamp)</text>
  <text x="30" y="214" font-size="10" fill="#1E293B">orgSlug (string)</text>

  <!-- organizationMembers -->
  <rect x="260" y="55" width="190" height="225" fill="#D1FAE5" rx="8" stroke="#10B981" stroke-width="2"/>
  <rect x="260" y="55" width="190" height="30" fill="#059669" rx="8"/>
  <rect x="260" y="75" width="190" height="10" fill="#059669"/>
  <text x="355" y="75" text-anchor="middle" font-size="13" font-weight="bold" fill="white">organizationMembers</text>
  <text x="270" y="102" font-size="10" fill="#065F46">PK id = orgId_userId</text>
  <text x="270" y="118" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="270" y="134" font-size="10" fill="#1E293B">FK clerkUserId</text>
  <text x="270" y="150" font-size="10" fill="#1E293B">role (OWNER/AGENT/CUSTOMER)</text>
  <text x="270" y="166" font-size="10" fill="#1E293B">email, phone, address</text>
  <text x="270" y="182" font-size="10" fill="#1E293B">fullName, status</text>
  <text x="270" y="198" font-size="10" fill="#1E293B">assignedAgentId (FK)</text>
  <text x="270" y="214" font-size="10" fill="#1E293B">nomineeName, relation</text>
  <text x="270" y="230" font-size="10" fill="#1E293B">customerType (enum)</text>
  <text x="270" y="246" font-size="10" fill="#1E293B">profileCompleted (bool)</text>
  <text x="270" y="262" font-size="10" fill="#1E293B">createdAt (timestamp)</text>

  <!-- users -->
  <rect x="500" y="55" width="180" height="145" fill="#FEF3C7" rx="8" stroke="#F59E0B" stroke-width="2"/>
  <rect x="500" y="55" width="180" height="30" fill="#D97706" rx="8"/>
  <rect x="500" y="75" width="180" height="10" fill="#D97706"/>
  <text x="590" y="75" text-anchor="middle" font-size="13" font-weight="bold" fill="white">users</text>
  <text x="510" y="102" font-size="10" fill="#78350F">PK id (Clerk UID)</text>
  <text x="510" y="118" font-size="10" fill="#1E293B">clerkUserId</text>
  <text x="510" y="134" font-size="10" fill="#1E293B">email, name</text>
  <text x="510" y="150" font-size="10" fill="#1E293B">role, organizationId</text>
  <text x="510" y="166" font-size="10" fill="#1E293B">createdAt (timestamp)</text>
  <text x="510" y="182" font-size="10" fill="#1E293B">updatedAt (timestamp)</text>

  <!-- savings_accounts -->
  <rect x="20" y="310" width="190" height="175" fill="#E0F2FE" rx="8" stroke="#0284C7" stroke-width="2"/>
  <rect x="20" y="310" width="190" height="30" fill="#0369A1" rx="8"/>
  <rect x="20" y="330" width="190" height="10" fill="#0369A1"/>
  <text x="115" y="330" text-anchor="middle" font-size="13" font-weight="bold" fill="white">savings_accounts</text>
  <text x="30" y="357" font-size="10" fill="#0C4A6E">PK id (auto)</text>
  <text x="30" y="373" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="30" y="389" font-size="10" fill="#1E293B">FK customerId (membershipId)</text>
  <text x="30" y="405" font-size="10" fill="#1E293B">FK planId</text>
  <text x="30" y="421" font-size="10" fill="#1E293B">totalBalance (number)</text>
  <text x="30" y="437" font-size="10" fill="#1E293B">status (ACTIVE/CLOSED)</text>
  <text x="30" y="453" font-size="10" fill="#1E293B">accountNumber, createdAt</text>
  <text x="30" y="469" font-size="10" fill="#1E293B">assignedAgentId (FK)</text>

  <!-- savings_plans -->
  <rect x="260" y="310" width="190" height="160" fill="#F0FDF4" rx="8" stroke="#4ADE80" stroke-width="2"/>
  <rect x="260" y="310" width="190" height="30" fill="#16A34A" rx="8"/>
  <rect x="260" y="330" width="190" height="10" fill="#16A34A"/>
  <text x="355" y="330" text-anchor="middle" font-size="13" font-weight="bold" fill="white">savings_plans</text>
  <text x="270" y="357" font-size="10" fill="#14532D">PK id (auto)</text>
  <text x="270" y="373" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="270" y="389" font-size="10" fill="#1E293B">planName, planType</text>
  <text x="270" y="405" font-size="10" fill="#1E293B">interestRate (number)</text>
  <text x="270" y="421" font-size="10" fill="#1E293B">minDeposit (number)</text>
  <text x="270" y="437" font-size="10" fill="#1E293B">status, description</text>
  <text x="270" y="453" font-size="10" fill="#1E293B">createdAt (timestamp)</text>

  <!-- loans -->
  <rect x="500" y="220" width="190" height="220" fill="#FFF7ED" rx="8" stroke="#FB923C" stroke-width="2"/>
  <rect x="500" y="220" width="190" height="30" fill="#EA580C" rx="8"/>
  <rect x="500" y="240" width="190" height="10" fill="#EA580C"/>
  <text x="595" y="240" text-anchor="middle" font-size="13" font-weight="bold" fill="white">loans</text>
  <text x="510" y="267" font-size="10" fill="#7C2D12">PK id (auto)</text>
  <text x="510" y="283" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="510" y="299" font-size="10" fill="#1E293B">FK customerId</text>
  <text x="510" y="315" font-size="10" fill="#1E293B">principalAmount (number)</text>
  <text x="510" y="331" font-size="10" fill="#1E293B">interestRate (number)</text>
  <text x="510" y="347" font-size="10" fill="#1E293B">tenureMonths (int)</text>
  <text x="510" y="363" font-size="10" fill="#1E293B">emiAmount (number)</text>
  <text x="510" y="379" font-size="10" fill="#1E293B">outstandingBalance</text>
  <text x="510" y="395" font-size="10" fill="#1E293B">status (PENDING/ACTIVE/CLOSED)</text>
  <text x="510" y="411" font-size="10" fill="#1E293B">loanAccountNumber</text>
  <text x="510" y="427" font-size="10" fill="#1E293B">loanAssignedCollectorId</text>

  <!-- loan_installments -->
  <rect x="730" y="220" width="195" height="205" fill="#FDF4FF" rx="8" stroke="#A855F7" stroke-width="2"/>
  <rect x="730" y="220" width="195" height="30" fill="#9333EA" rx="8"/>
  <rect x="730" y="240" width="195" height="10" fill="#9333EA"/>
  <text x="827" y="240" text-anchor="middle" font-size="13" font-weight="bold" fill="white">loan_installments</text>
  <text x="740" y="267" font-size="10" fill="#581C87">PK id (auto)</text>
  <text x="740" y="283" font-size="10" fill="#1E293B">FK loanId</text>
  <text x="740" y="299" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="740" y="315" font-size="10" fill="#1E293B">FK customerId</text>
  <text x="740" y="331" font-size="10" fill="#1E293B">installmentNo (int)</text>
  <text x="740" y="347" font-size="10" fill="#1E293B">dueDate (timestamp)</text>
  <text x="740" y="363" font-size="10" fill="#1E293B">emiAmount (number)</text>
  <text x="740" y="379" font-size="10" fill="#1E293B">paidAmount (number)</text>
  <text x="740" y="395" font-size="10" fill="#1E293B">status (PENDING/PAID/OVERDUE)</text>
  <text x="740" y="411" font-size="10" fill="#1E293B">paidAt (timestamp)</text>

  <!-- collections -->
  <rect x="20" y="520" width="200" height="205" fill="#FFF1F2" rx="8" stroke="#F43F5E" stroke-width="2"/>
  <rect x="20" y="520" width="200" height="30" fill="#E11D48" rx="8"/>
  <rect x="20" y="540" width="200" height="10" fill="#E11D48"/>
  <text x="120" y="540" text-anchor="middle" font-size="13" font-weight="bold" fill="white">collections</text>
  <text x="30" y="567" font-size="10" fill="#881337">PK id (auto)</text>
  <text x="30" y="583" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="30" y="599" font-size="10" fill="#1E293B">FK agentId (Clerk UID)</text>
  <text x="30" y="615" font-size="10" fill="#1E293B">FK customerId</text>
  <text x="30" y="631" font-size="10" fill="#1E293B">collectionType (SAVINGS/EMI)</text>
  <text x="30" y="647" font-size="10" fill="#1E293B">amount (number)</text>
  <text x="30" y="663" font-size="10" fill="#1E293B">receiptNo (string)</text>
  <text x="30" y="679" font-size="10" fill="#1E293B">paymentMode (CASH/UPI/etc)</text>
  <text x="30" y="695" font-size="10" fill="#1E293B">collectedAt (timestamp)</text>
  <text x="30" y="711" font-size="10" fill="#1E293B">agentName, customerName</text>

  <!-- audit_logs -->
  <rect x="260" y="520" width="190" height="175" fill="#F0FDF4" rx="8" stroke="#22C55E" stroke-width="2"/>
  <rect x="260" y="520" width="190" height="30" fill="#15803D" rx="8"/>
  <rect x="260" y="540" width="190" height="10" fill="#15803D"/>
  <text x="355" y="540" text-anchor="middle" font-size="13" font-weight="bold" fill="white">audit_logs</text>
  <text x="270" y="567" font-size="10" fill="#14532D">PK id (auto)</text>
  <text x="270" y="583" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="270" y="599" font-size="10" fill="#1E293B">actorId (Clerk UID)</text>
  <text x="270" y="615" font-size="10" fill="#1E293B">action (enum: 50+ types)</text>
  <text x="270" y="631" font-size="10" fill="#1E293B">module, category</text>
  <text x="270" y="647" font-size="10" fill="#1E293B">entityType, entityId</text>
  <text x="270" y="663" font-size="10" fill="#1E293B">oldValues, newValues (map)</text>
  <text x="270" y="679" font-size="10" fill="#1E293B">createdAt (timestamp)</text>

  <!-- notifications -->
  <rect x="500" y="480" width="190" height="160" fill="#FEF2F2" rx="8" stroke="#EF4444" stroke-width="2"/>
  <rect x="500" y="480" width="190" height="30" fill="#DC2626" rx="8"/>
  <rect x="500" y="500" width="190" height="10" fill="#DC2626"/>
  <text x="595" y="500" text-anchor="middle" font-size="13" font-weight="bold" fill="white">notifications</text>
  <text x="510" y="527" font-size="10" fill="#7F1D1D">PK id (auto)</text>
  <text x="510" y="543" font-size="10" fill="#1E293B">userId (Clerk UID)</text>
  <text x="510" y="559" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="510" y="575" font-size="10" fill="#1E293B">title, message (string)</text>
  <text x="510" y="591" font-size="10" fill="#1E293B">type (enum)</text>
  <text x="510" y="607" font-size="10" fill="#1E293B">read (boolean)</text>
  <text x="510" y="623" font-size="10" fill="#1E293B">timestamp (serverTimestamp)</text>

  <!-- savings_transactions -->
  <rect x="730" y="460" width="195" height="175" fill="#F0FDFA" rx="8" stroke="#2DD4BF" stroke-width="2"/>
  <rect x="730" y="460" width="195" height="30" fill="#0F766E" rx="8"/>
  <rect x="730" y="480" width="195" height="10" fill="#0F766E"/>
  <text x="827" y="480" text-anchor="middle" font-size="13" font-weight="bold" fill="white">savings_transactions</text>
  <text x="740" y="507" font-size="10" fill="#134E4A">PK id (auto)</text>
  <text x="740" y="523" font-size="10" fill="#1E293B">FK savingsAccountId</text>
  <text x="740" y="539" font-size="10" fill="#1E293B">FK organizationId</text>
  <text x="740" y="555" font-size="10" fill="#1E293B">FK customerId</text>
  <text x="740" y="571" font-size="10" fill="#1E293B">FK agentId (Clerk UID)</text>
  <text x="740" y="587" font-size="10" fill="#1E293B">amount (number)</text>
  <text x="740" y="603" font-size="10" fill="#1E293B">balanceAfter (number)</text>
  <text x="740" y="619" font-size="10" fill="#1E293B">receiptNo (string)</text>
  <text x="740" y="635" font-size="10" fill="#1E293B">collectedAt (timestamp)</text>

  <!-- Relationship lines -->
  <!-- org → orgMembers -->
  <line x1="210" y1="145" x2="260" y2="145" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- orgMembers → savings_accounts -->
  <line x1="355" y1="280" x2="355" y2="310" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- orgMembers → loans -->
  <line x1="450" y1="160" x2="500" y2="290" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- loans → installments -->
  <line x1="690" y1="330" x2="730" y2="330" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- orgMembers → collections -->
  <line x1="260" y1="620" x2="220" y2="620" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <!-- savings_accounts → savings_transactions -->
  <line x1="730" y1="550" x2="210" y2="420" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>

  <!-- Legend -->
  <rect x="730" y="655" width="340" height="60" fill="#F1F5F9" rx="8" stroke="#CBD5E1" stroke-width="1"/>
  <text x="745" y="675" font-size="11" font-weight="bold" fill="#1E293B">Legend:</text>
  <line x1="745" y1="692" x2="785" y2="692" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="792" y="697" font-size="10" fill="#475569">Foreign Key Relationship</text>
  <text x="745" y="710" font-size="10" fill="#475569">PK = Primary Key   FK = Foreign Key</text>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_ER_Diagram.svg"), erSVG);

// ── Use Case Diagram ──────────────────────────────────────────────────────────
const useCaseSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750" font-family="Arial, sans-serif">
  <rect width="1000" height="750" fill="#F8FAFC" rx="12"/>
  <text x="500" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — Use Case Diagram</text>

  <!-- System Boundary -->
  <rect x="180" y="50" width="640" height="680" fill="none" stroke="#94A3B8" stroke-width="2" stroke-dasharray="8,4" rx="12"/>
  <text x="500" y="72" text-anchor="middle" font-size="14" font-weight="bold" fill="#64748B">FundCircle System</text>

  <!-- Actor: Owner -->
  <ellipse cx="80" cy="190" rx="20" ry="28" fill="none" stroke="#1D4ED8" stroke-width="2"/>
  <line x1="80" y1="218" x2="80" y2="280" stroke="#1D4ED8" stroke-width="2"/>
  <line x1="80" y1="240" x2="50" y2="260" stroke="#1D4ED8" stroke-width="2"/>
  <line x1="80" y1="240" x2="110" y2="260" stroke="#1D4ED8" stroke-width="2"/>
  <line x1="80" y1="280" x2="55" y2="310" stroke="#1D4ED8" stroke-width="2"/>
  <line x1="80" y1="280" x2="105" y2="310" stroke="#1D4ED8" stroke-width="2"/>
  <text x="80" y="330" text-anchor="middle" font-size="12" font-weight="bold" fill="#1D4ED8">Owner/Admin</text>

  <!-- Actor: Agent -->
  <ellipse cx="80" cy="470" rx="20" ry="28" fill="none" stroke="#059669" stroke-width="2"/>
  <line x1="80" y1="498" x2="80" y2="560" stroke="#059669" stroke-width="2"/>
  <line x1="80" y1="520" x2="50" y2="540" stroke="#059669" stroke-width="2"/>
  <line x1="80" y1="520" x2="110" y2="540" stroke="#059669" stroke-width="2"/>
  <line x1="80" y1="560" x2="55" y2="590" stroke="#059669" stroke-width="2"/>
  <line x1="80" y1="560" x2="105" y2="590" stroke="#059669" stroke-width="2"/>
  <text x="80" y="610" text-anchor="middle" font-size="12" font-weight="bold" fill="#059669">Agent/Collector</text>

  <!-- Actor: Customer -->
  <ellipse cx="940" cy="340" rx="20" ry="28" fill="none" stroke="#7C3AED" stroke-width="2"/>
  <line x1="940" y1="368" x2="940" y2="430" stroke="#7C3AED" stroke-width="2"/>
  <line x1="940" y1="390" x2="910" y2="410" stroke="#7C3AED" stroke-width="2"/>
  <line x1="940" y1="390" x2="970" y2="410" stroke="#7C3AED" stroke-width="2"/>
  <line x1="940" y1="430" x2="915" y2="460" stroke="#7C3AED" stroke-width="2"/>
  <line x1="940" y1="430" x2="965" y2="460" stroke="#7C3AED" stroke-width="2"/>
  <text x="940" y="480" text-anchor="middle" font-size="12" font-weight="bold" fill="#7C3AED">Customer</text>

  <!-- Owner Use Cases -->
  <ellipse cx="420" cy="120" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="124" text-anchor="middle" font-size="11" fill="#1E40AF">Create Organization</text>

  <ellipse cx="420" cy="175" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="179" text-anchor="middle" font-size="11" fill="#1E40AF">Create Customer Account</text>

  <ellipse cx="420" cy="230" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="234" text-anchor="middle" font-size="11" fill="#1E40AF">Create Agent Account</text>

  <ellipse cx="420" cy="285" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="289" text-anchor="middle" font-size="11" fill="#1E40AF">Approve / Reject Loan</text>

  <ellipse cx="420" cy="340" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="344" text-anchor="middle" font-size="11" fill="#1E40AF">Manage Savings Plans</text>

  <ellipse cx="420" cy="395" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="399" text-anchor="middle" font-size="11" fill="#1E40AF">View Audit Logs</text>

  <ellipse cx="420" cy="450" rx="120" ry="22" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="420" y="454" text-anchor="middle" font-size="11" fill="#1E40AF">Export Excel Reports</text>

  <!-- Agent Use Cases -->
  <ellipse cx="580" cy="510" rx="120" ry="22" fill="#D1FAE5" stroke="#10B981" stroke-width="1.5"/>
  <text x="580" y="514" text-anchor="middle" font-size="11" fill="#065F46">Record EMI Collection</text>

  <ellipse cx="580" cy="565" rx="120" ry="22" fill="#D1FAE5" stroke="#10B981" stroke-width="1.5"/>
  <text x="580" y="569" text-anchor="middle" font-size="11" fill="#065F46">Record Savings Deposit</text>

  <ellipse cx="580" cy="620" rx="120" ry="22" fill="#D1FAE5" stroke="#10B981" stroke-width="1.5"/>
  <text x="580" y="624" text-anchor="middle" font-size="11" fill="#065F46">View Assigned Customers</text>

  <ellipse cx="580" cy="675" rx="120" ry="22" fill="#D1FAE5" stroke="#10B981" stroke-width="1.5"/>
  <text x="580" y="679" text-anchor="middle" font-size="11" fill="#065F46">Generate Receipt</text>

  <!-- Customer Use Cases -->
  <ellipse cx="720" cy="175" rx="120" ry="22" fill="#F3E8FF" stroke="#A855F7" stroke-width="1.5"/>
  <text x="720" y="179" text-anchor="middle" font-size="11" fill="#6B21A8">View Savings Balance</text>

  <ellipse cx="720" cy="230" rx="120" ry="22" fill="#F3E8FF" stroke="#A855F7" stroke-width="1.5"/>
  <text x="720" y="234" text-anchor="middle" font-size="11" fill="#6B21A8">Apply for Loan</text>

  <ellipse cx="720" cy="285" rx="120" ry="22" fill="#F3E8FF" stroke="#A855F7" stroke-width="1.5"/>
  <text x="720" y="289" text-anchor="middle" font-size="11" fill="#6B21A8">View EMI Schedule</text>

  <ellipse cx="720" cy="340" rx="120" ry="22" fill="#F3E8FF" stroke="#A855F7" stroke-width="1.5"/>
  <text x="720" y="344" text-anchor="middle" font-size="11" fill="#6B21A8">Download Receipts</text>

  <ellipse cx="720" cy="395" rx="120" ry="22" fill="#F3E8FF" stroke="#A855F7" stroke-width="1.5"/>
  <text x="720" y="399" text-anchor="middle" font-size="11" fill="#6B21A8">View Passbook</text>

  <!-- Common -->
  <ellipse cx="500" cy="510" rx="110" ry="22" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="500" y="514" text-anchor="middle" font-size="11" fill="#78350F">Sign In / Sign Out</text>

  <!-- Lines: Owner to Use Cases -->
  <line x1="100" y1="230" x2="300" y2="175" stroke="#3B82F6" stroke-width="1"/>
  <line x1="100" y1="240" x2="300" y2="230" stroke="#3B82F6" stroke-width="1"/>
  <line x1="100" y1="250" x2="300" y2="285" stroke="#3B82F6" stroke-width="1"/>
  <line x1="100" y1="255" x2="300" y2="340" stroke="#3B82F6" stroke-width="1"/>
  <line x1="100" y1="255" x2="300" y2="395" stroke="#3B82F6" stroke-width="1"/>
  <line x1="100" y1="260" x2="300" y2="450" stroke="#3B82F6" stroke-width="1"/>

  <!-- Lines: Agent to Use Cases -->
  <line x1="100" y1="500" x2="460" y2="510" stroke="#10B981" stroke-width="1"/>
  <line x1="100" y1="510" x2="460" y2="565" stroke="#10B981" stroke-width="1"/>
  <line x1="100" y1="520" x2="460" y2="620" stroke="#10B981" stroke-width="1"/>
  <line x1="100" y1="530" x2="460" y2="675" stroke="#10B981" stroke-width="1"/>

  <!-- Lines: Customer to Use Cases -->
  <line x1="920" y1="390" x2="840" y2="340" stroke="#A855F7" stroke-width="1"/>
  <line x1="920" y1="390" x2="840" y2="285" stroke="#A855F7" stroke-width="1"/>
  <line x1="920" y1="385" x2="840" y2="230" stroke="#A855F7" stroke-width="1"/>
  <line x1="920" y1="380" x2="840" y2="175" stroke="#A855F7" stroke-width="1"/>
  <line x1="920" y1="395" x2="840" y2="395" stroke="#A855F7" stroke-width="1"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_UseCase_Diagram.svg"), useCaseSVG);

// ── DFD Level 0 ───────────────────────────────────────────────────────────────
const dfd0SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" font-family="Arial, sans-serif">
  <rect width="800" height="500" fill="#F8FAFC" rx="12"/>
  <text x="400" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — DFD Level 0 (Context Diagram)</text>
  <!-- External Entities -->
  <rect x="30" y="200" width="130" height="50" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2" rx="4"/>
  <text x="95" y="231" text-anchor="middle" font-size="13" font-weight="bold" fill="#1E40AF">Owner/Admin</text>
  <rect x="640" y="200" width="130" height="50" fill="#D1FAE5" stroke="#10B981" stroke-width="2" rx="4"/>
  <text x="705" y="231" text-anchor="middle" font-size="13" font-weight="bold" fill="#065F46">Agent/Collector</text>
  <rect x="30" y="380" width="130" height="50" fill="#F3E8FF" stroke="#A855F7" stroke-width="2" rx="4"/>
  <text x="95" y="411" text-anchor="middle" font-size="13" font-weight="bold" fill="#6B21A8">Customer</text>
  <rect x="640" y="380" width="130" height="50" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2" rx="4"/>
  <text x="705" y="411" text-anchor="middle" font-size="13" font-weight="bold" fill="#78350F">Clerk / Firebase</text>
  <!-- Central Process -->
  <ellipse cx="400" cy="290" rx="150" ry="90" fill="#FFF" stroke="#1E293B" stroke-width="3"/>
  <text x="400" y="280" text-anchor="middle" font-size="16" font-weight="bold" fill="#1E293B">FundCircle</text>
  <text x="400" y="300" text-anchor="middle" font-size="12" fill="#475569">Pigmy Savings &amp;</text>
  <text x="400" y="316" text-anchor="middle" font-size="12" fill="#475569">Loan Platform</text>
  <!-- Arrows -->
  <line x1="160" y1="220" x2="248" y2="265" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="190" y="245" font-size="10" fill="#334155">Org/Customer/</text>
  <text x="190" y="258" font-size="10" fill="#334155">Loan Management</text>
  <line x1="248" y1="290" x2="160" y2="290" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="165" y="283" font-size="10" fill="#334155">Reports/Alerts</text>
  <line x1="640" y1="220" x2="552" y2="265" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="565" y="245" font-size="10" fill="#334155">Collections/</text>
  <text x="565" y="258" font-size="10" fill="#334155">EMI Payments</text>
  <line x1="552" y1="290" x2="640" y2="290" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="555" y="283" font-size="10" fill="#334155">Receipts</text>
  <line x1="160" y1="400" x2="248" y2="340" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="165" y="365" font-size="10" fill="#334155">Loan Application</text>
  <line x1="248" y1="350" x2="160" y2="390" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="165" y="380" font-size="10" fill="#334155">Account Info</text>
  <line x1="640" y1="400" x2="552" y2="340" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="570" y="365" font-size="10" fill="#334155">Auth/Storage</text>
  <line x1="552" y1="350" x2="640" y2="395" stroke="#334155" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="555" y="378" font-size="10" fill="#334155">Tokens/Data</text>
  <defs><marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#334155"/></marker></defs>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_DFD_Level0.svg"), dfd0SVG);

// ── DFD Level 1 ───────────────────────────────────────────────────────────────
const dfd1SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" font-family="Arial, sans-serif">
  <defs><marker id="a1" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#475569"/></marker></defs>
  <rect width="1000" height="700" fill="#F8FAFC" rx="12"/>
  <text x="500" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — DFD Level 1</text>

  <!-- Processes -->
  <ellipse cx="200" cy="150" rx="100" ry="45" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
  <text x="200" y="146" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">P1: Authentication</text>
  <text x="200" y="162" text-anchor="middle" font-size="10" fill="#3B82F6">&amp; Authorization</text>

  <ellipse cx="500" cy="150" rx="100" ry="45" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
  <text x="500" y="146" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">P2: Customer &amp;</text>
  <text x="500" y="162" text-anchor="middle" font-size="10" fill="#3B82F6">Agent Management</text>

  <ellipse cx="800" cy="150" rx="100" ry="45" fill="#EFF6FF" stroke="#3B82F6" stroke-width="2"/>
  <text x="800" y="146" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">P3: Loan</text>
  <text x="800" y="162" text-anchor="middle" font-size="10" fill="#3B82F6">Management</text>

  <ellipse cx="200" cy="400" rx="100" ry="45" fill="#D1FAE5" stroke="#10B981" stroke-width="2"/>
  <text x="200" y="396" text-anchor="middle" font-size="12" font-weight="bold" fill="#065F46">P4: Collection</text>
  <text x="200" y="412" text-anchor="middle" font-size="10" fill="#10B981">&amp; Receipts</text>

  <ellipse cx="500" cy="400" rx="100" ry="45" fill="#D1FAE5" stroke="#10B981" stroke-width="2"/>
  <text x="500" y="396" text-anchor="middle" font-size="12" font-weight="bold" fill="#065F46">P5: Savings</text>
  <text x="500" y="412" text-anchor="middle" font-size="10" fill="#10B981">Management</text>

  <ellipse cx="800" cy="400" rx="100" ry="45" fill="#D1FAE5" stroke="#10B981" stroke-width="2"/>
  <text x="800" y="396" text-anchor="middle" font-size="12" font-weight="bold" fill="#065F46">P6: Reporting &amp;</text>
  <text x="800" y="412" text-anchor="middle" font-size="10" fill="#10B981">Audit Logging</text>

  <!-- Data Stores -->
  <rect x="50" y="560" width="180" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <line x1="50" y1="570" x2="50" y2="596" stroke="#F59E0B" stroke-width="1"/>
  <text x="60" y="582" font-size="11" fill="#78350F">DS1: organizationMembers</text>

  <rect x="280" y="560" width="155" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <line x1="280" y1="570" x2="280" y2="596" stroke="#F59E0B" stroke-width="1"/>
  <text x="290" y="582" font-size="11" fill="#78350F">DS2: savings_accounts</text>

  <rect x="490" y="560" width="145" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <line x1="490" y1="570" x2="490" y2="596" stroke="#F59E0B" stroke-width="1"/>
  <text x="500" y="582" font-size="11" fill="#78350F">DS3: loans / EMI</text>

  <rect x="700" y="560" width="155" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <line x1="700" y1="570" x2="700" y2="596" stroke="#F59E0B" stroke-width="1"/>
  <text x="710" y="582" font-size="11" fill="#78350F">DS4: collections/logs</text>

  <!-- Flow lines (abbreviated) -->
  <line x1="300" y1="150" x2="398" y2="150" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <text x="340" y="143" font-size="10" fill="#475569">Verified User</text>
  <line x1="598" y1="150" x2="698" y2="150" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <text x="630" y="143" font-size="10" fill="#475569">Customer Ref</text>
  <line x1="200" y1="195" x2="200" y2="355" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <text x="207" y="275" font-size="10" fill="#475569">Auth Context</text>
  <line x1="500" y1="195" x2="500" y2="355" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <text x="507" y="275" font-size="10" fill="#475569">Member Data</text>
  <line x1="800" y1="195" x2="800" y2="355" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <text x="807" y="275" font-size="10" fill="#475569">Loan Data</text>
  <line x1="200" y1="445" x2="140" y2="560" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <line x1="300" y1="445" x2="800" y2="560" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <line x1="500" y1="445" x2="357" y2="560" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <line x1="800" y1="445" x2="562" y2="560" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
  <line x1="800" y1="445" x2="775" y2="560" stroke="#475569" stroke-width="1.5" marker-end="url(#a1)"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_DFD_Level1.svg"), dfd1SVG);

// ── DFD Level 2 ───────────────────────────────────────────────────────────────
const dfd2SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680" font-family="Arial, sans-serif">
  <defs><marker id="a2" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#475569"/></marker></defs>
  <rect width="1000" height="680" fill="#F8FAFC" rx="12"/>
  <text x="500" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#1E293B">FundCircle — DFD Level 2 (Loan Process Expansion)</text>

  <!-- Loan Application -->
  <ellipse cx="180" cy="160" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="180" y="156" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.1: Receive Loan</text>
  <text x="180" y="172" text-anchor="middle" font-size="10" fill="#EA580C">Application</text>

  <ellipse cx="430" cy="160" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="430" y="156" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.2: Validate &amp;</text>
  <text x="430" y="172" text-anchor="middle" font-size="10" fill="#EA580C">Risk Assessment</text>

  <ellipse cx="700" cy="160" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="700" y="156" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.3: Owner Review</text>
  <text x="700" y="172" text-anchor="middle" font-size="10" fill="#EA580C">&amp; Approval Decision</text>

  <ellipse cx="250" cy="380" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="250" y="376" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.4: Calculate EMI</text>
  <text x="250" y="392" text-anchor="middle" font-size="10" fill="#EA580C">&amp; Generate Schedule</text>

  <ellipse cx="550" cy="380" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="550" y="376" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.5: Disburse Loan</text>
  <text x="550" y="392" text-anchor="middle" font-size="10" fill="#EA580C">&amp; Assign Collector</text>

  <ellipse cx="830" cy="380" rx="110" ry="45" fill="#FFF7ED" stroke="#FB923C" stroke-width="2"/>
  <text x="830" y="376" text-anchor="middle" font-size="12" font-weight="bold" fill="#C2410C">P3.6: Track Repayment</text>
  <text x="830" y="392" text-anchor="middle" font-size="10" fill="#EA580C">&amp; Closure</text>

  <!-- Data stores -->
  <rect x="30" y="530" width="170" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <text x="40" y="552" font-size="11" fill="#78350F">DS: loanApplications</text>

  <rect x="250" y="530" width="160" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <text x="260" y="552" font-size="11" fill="#78350F">DS: loans (ACTIVE)</text>

  <rect x="460" y="530" width="170" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <text x="470" y="552" font-size="11" fill="#78350F">DS: loan_installments</text>

  <rect x="690" y="530" width="170" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2"/>
  <text x="700" y="552" font-size="11" fill="#78350F">DS: collections (EMI)</text>

  <!-- Arrows -->
  <line x1="290" y1="160" x2="318" y2="160" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="295" y="153" font-size="9" fill="#475569">Application Data</text>
  <line x1="540" y1="160" x2="588" y2="160" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="545" y="153" font-size="9" fill="#475569">Risk Score</text>
  <line x1="700" y1="205" x2="430" y2="335" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="545" y="270" font-size="9" fill="#10B981">Approved</text>
  <line x1="700" y1="205" x2="700" y2="380" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#a2)"/>
  <text x="710" y="295" font-size="9" fill="#EF4444">Rejected</text>
  <line x1="360" y1="380" x2="438" y2="380" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="370" y="373" font-size="9" fill="#475569">EMI Schedule</text>
  <line x1="660" y1="380" x2="718" y2="380" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <text x="665" y="373" font-size="9" fill="#475569">Payments</text>
  <line x1="180" y1="205" x2="100" y2="530" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <line x1="250" y1="425" x2="330" y2="530" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <line x1="550" y1="425" x2="545" y2="530" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <line x1="830" y1="425" x2="775" y2="530" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>

  <!-- External entities -->
  <rect x="880" y="140" width="100" height="40" fill="#D1FAE5" stroke="#10B981" stroke-width="2" rx="4"/>
  <text x="930" y="164" text-anchor="middle" font-size="11" font-weight="bold" fill="#065F46">Customer</text>
  <line x1="880" y1="160" x2="810" y2="160" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
  <rect x="880" y="358" width="100" height="40" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2" rx="4"/>
  <text x="930" y="382" text-anchor="middle" font-size="11" font-weight="bold" fill="#1D4ED8">Agent</text>
  <line x1="880" y1="378" x2="942" y2="378" stroke="#475569" stroke-width="1.5" marker-end="url(#a2)"/>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_DFD_Level2.svg"), dfd2SVG);

// ── Sequence Diagram ──────────────────────────────────────────────────────────
const seqSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680" font-family="Arial, sans-serif">
  <defs><marker id="as" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#334155"/></marker></defs>
  <rect width="1000" height="680" fill="#F8FAFC" rx="12"/>
  <text x="500" y="34" text-anchor="middle" font-size="18" font-weight="bold" fill="#1E293B">FundCircle — Loan Approval Sequence Diagram</text>

  <!-- Actors/Systems -->
  <rect x="30" y="55" width="100" height="36" fill="#DBEAFE" stroke="#3B82F6" stroke-width="2" rx="6"/>
  <text x="80" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#1E40AF">Customer</text>
  <rect x="190" y="55" width="100" height="36" fill="#FEF3C7" stroke="#F59E0B" stroke-width="2" rx="6"/>
  <text x="240" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#78350F">React UI</text>
  <rect x="350" y="55" width="100" height="36" fill="#F0FDF4" stroke="#22C55E" stroke-width="2" rx="6"/>
  <text x="400" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#14532D">RoleRouter</text>
  <rect x="510" y="55" width="110" height="36" fill="#FDF4FF" stroke="#A855F7" stroke-width="2" rx="6"/>
  <text x="565" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#7E22CE">Firestore</text>
  <rect x="680" y="55" width="100" height="36" fill="#FFF1F2" stroke="#F43F5E" stroke-width="2" rx="6"/>
  <text x="730" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#BE123C">API Server</text>
  <rect x="840" y="55" width="100" height="36" fill="#E0F2FE" stroke="#0284C7" stroke-width="2" rx="6"/>
  <text x="890" y="78" text-anchor="middle" font-size="12" font-weight="bold" fill="#075985">Clerk</text>

  <!-- Lifelines -->
  <line x1="80" y1="91" x2="80" y2="660" stroke="#3B82F6" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="240" y1="91" x2="240" y2="660" stroke="#F59E0B" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="400" y1="91" x2="400" y2="660" stroke="#22C55E" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="565" y1="91" x2="565" y2="660" stroke="#A855F7" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="730" y1="91" x2="730" y2="660" stroke="#F43F5E" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="890" y1="91" x2="890" y2="660" stroke="#0284C7" stroke-width="1" stroke-dasharray="4,3"/>

  <!-- Step 1 -->
  <line x1="80" y1="130" x2="235" y2="130" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <rect x="80" y="118" width="155" height="4" fill="#BFDBFE"/>
  <text x="155" y="122" text-anchor="middle" font-size="10" fill="#1E40AF">1. Submit loan application</text>

  <!-- Step 2 -->
  <line x1="240" y1="155" x2="395" y2="155" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="315" y="148" text-anchor="middle" font-size="10" fill="#475569">2. Validate form + auth</text>

  <!-- Step 3 -->
  <line x1="400" y1="180" x2="560" y2="180" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="480" y="173" text-anchor="middle" font-size="10" fill="#475569">3. Write loanApplications doc</text>

  <!-- Step 4 (return) -->
  <line x1="560" y1="205" x2="242" y2="205" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="400" y="198" text-anchor="middle" font-size="10" fill="#475569">4. doc ID returned</text>

  <!-- Step 5 -->
  <line x1="240" y1="230" x2="82" y2="230" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="160" y="223" text-anchor="middle" font-size="10" fill="#475569">5. "Application submitted"</text>

  <!-- Divider -->
  <line x1="30" y1="248" x2="970" y2="248" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3,3"/>
  <text x="500" y="262" text-anchor="middle" font-size="11" font-weight="bold" fill="#64748B">— Owner Reviews Application —</text>

  <!-- Step 6 -->
  <line x1="240" y1="278" x2="560" y2="278" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="400" y="271" text-anchor="middle" font-size="10" fill="#475569">6. Owner opens LoanApprovalDialog</text>

  <!-- Step 7 -->
  <line x1="560" y1="303" x2="242" y2="303" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="400" y="296" text-anchor="middle" font-size="10" fill="#475569">7. Loan + Customer data</text>

  <!-- Step 8 -->
  <line x1="240" y1="328" x2="725" y2="328" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="480" y="321" text-anchor="middle" font-size="10" fill="#475569">8. POST /api (approveLoan call)</text>

  <!-- Step 9 -->
  <line x1="730" y1="353" x2="885" y2="353" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="807" y="346" text-anchor="middle" font-size="10" fill="#475569">9. Verify Bearer token</text>

  <!-- Step 10 -->
  <line x1="890" y1="378" x2="732" y2="378" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="810" y="371" text-anchor="middle" font-size="10" fill="#475569">10. Token valid</text>

  <!-- Step 11 -->
  <line x1="730" y1="403" x2="567" y2="403" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="645" y="396" text-anchor="middle" font-size="10" fill="#475569">11. Write: loans ACTIVE + installments</text>

  <!-- Step 12 -->
  <line x1="565" y1="428" x2="732" y2="428" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="645" y="421" text-anchor="middle" font-size="10" fill="#475569">12. Firestore ack</text>

  <!-- Step 13 -->
  <line x1="730" y1="453" x2="567" y2="453" stroke="#334155" stroke-width="1.5" marker-end="url(#as)"/>
  <text x="645" y="446" text-anchor="middle" font-size="10" fill="#475569">13. Write: audit_log + notification</text>

  <!-- Step 14 -->
  <line x1="730" y1="478" x2="242" y2="478" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="480" y="471" text-anchor="middle" font-size="10" fill="#475569">14. { success, loanAccountNumber }</text>

  <!-- Step 15 -->
  <line x1="240" y1="503" x2="82" y2="503" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#as)"/>
  <text x="160" y="496" text-anchor="middle" font-size="10" fill="#10B981">15. Realtime: Loan ACTIVE in portal</text>

  <!-- Step 16 (toast) -->
  <rect x="195" y="520" width="190" height="26" fill="#D1FAE5" stroke="#10B981" stroke-width="1" rx="4"/>
  <text x="290" y="537" text-anchor="middle" font-size="10" font-weight="bold" fill="#065F46">16. fcToast.loanApproved( )</text>
</svg>`;

fs.writeFileSync(path.join(outDir, "FundCircle_Sequence_Diagram.svg"), seqSVG);

console.log("All SVG diagrams written to outputs/report/");
