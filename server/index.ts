import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createClerkClient, verifyToken } from "@clerk/backend";

// ─── Process-level crash guards ───────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[FC API] uncaughtException — server staying alive:", err?.message ?? err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FC API] unhandledRejection — server staying alive:", reason);
});

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50kb" }));

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// ─── Base URL helper ──────────────────────────────────────────────────────────
const getBaseUrl = () => {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const localPort = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 5000;
  return `http://localhost:${localPort}`;
};

// ─── Password generator ───────────────────────────────────────────────────────
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!%^&*";

  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

  const parts = [
    pick(upper), pick(upper),
    pick(lower), pick(lower), pick(lower),
    pick(digits), pick(digits),
    pick(special),
    pick(upper), pick(lower),
  ];

  for (let i = parts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join("");
}

// ─── Firestore REST helpers ───────────────────────────────────────────────────
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || "fundcircle-66b66";
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const sv  = (v: string)  => ({ stringValue:  v ?? "" });
const iv  = (v: number)  => ({ integerValue: String(Math.round(v ?? 0)) });
const bv  = (v: boolean) => ({ booleanValue: !!v });
const tv  = (d?: Date)   => ({ timestampValue: (d ?? new Date()).toISOString() });

async function fsSet(col: string, docId: string, fields: Record<string, any>): Promise<void> {
  if (!FIREBASE_API_KEY) throw new Error("VITE_FIREBASE_API_KEY env var not set");
  const url = `${FS_BASE}/${col}/${docId}?key=${FIREBASE_API_KEY}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore write failed [${col}/${docId}] HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
}

async function fsAdd(col: string, fields: Record<string, any>): Promise<string> {
  if (!FIREBASE_API_KEY) throw new Error("VITE_FIREBASE_API_KEY env var not set");
  const url = `${FS_BASE}/${col}?key=${FIREBASE_API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore add failed [${col}] HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  return (data.name as string).split("/").pop()!;
}

// Partial update — only touches the listed fields (Firestore updateMask)
async function fsUpdate(col: string, docId: string, fields: Record<string, any>): Promise<void> {
  if (!FIREBASE_API_KEY) throw new Error("VITE_FIREBASE_API_KEY env var not set");
  const maskParams = Object.keys(fields)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const url = `${FS_BASE}/${col}/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}&${maskParams}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Firestore update failed [${col}/${docId}] HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
}

// Count active loans for a given customer (used for customerType lock validation)
const ACTIVE_LOAN_STATUSES = new Set(["ACTIVE", "OVERDUE", "PARTIALLY_PAID"]);
async function fsCountActiveLoans(customerId: string, organizationId: string): Promise<number> {
  if (!FIREBASE_API_KEY) return 0;
  try {
    const url = `${FS_BASE}:runQuery?key=${FIREBASE_API_KEY}`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "loans" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "customerId" }, op: "EQUAL", value: sv(customerId) } },
              { fieldFilter: { field: { fieldPath: "organizationId" }, op: "EQUAL", value: sv(organizationId) } },
            ],
          },
        },
        limit: 50,
      },
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return 0;
    const docs: any[] = await resp.json();
    return docs.filter((d: any) => {
      if (!d.document?.fields) return false;
      const status = (d.document.fields.status?.stringValue || "").toUpperCase();
      return ACTIVE_LOAN_STATUSES.has(status);
    }).length;
  } catch { return 0; }
}

function membershipIdFor(orgId: string, userId: string): string {
  return `${orgId}_${userId}`;
}

function generateAccountNumber(): string {
  const n = Math.floor(Math.random() * 9000000000) + 1000000000;
  return `FC${n}`;
}

async function generateEmployeeCode(orgId: string, orgName: string): Promise<string> {
  const prefix = (orgName || "ORG")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(3, "X");

  let seq = 1;
  if (FIREBASE_API_KEY) {
    const counterUrl = `${FS_BASE}/orgCounters/${encodeURIComponent(orgId)}?key=${FIREBASE_API_KEY}`;
    try {
      const resp = await fetch(counterUrl);
      if (resp.ok) {
        const data: any = await resp.json();
        const current = parseInt(data.fields?.agentCodeSeq?.integerValue ?? "0", 10);
        if (!isNaN(current)) seq = current + 1;
      }
    } catch (_) {}

    try {
      await fsSet("orgCounters", orgId, {
        agentCodeSeq:   iv(seq),
        organizationId: sv(orgId),
        updatedAt:      tv(),
      });
    } catch (_) {}
  }

  return `${prefix}-EMP${String(seq).padStart(4, "0")}`;
}

// ─── Server-side input validators ────────────────────────────────────────────
const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
const ALLOWED_CUSTOMER_TYPES = new Set(["SAVINGS", "LOAN", "SAVINGS_LOAN"]);
const ALLOWED_NOMINEE_RELS   = new Set([
  "Father","Mother","Spouse","Brother","Sister",
  "Son","Daughter","Sibling","Guardian","Other",
]);

function srvValidEmail(email: string): boolean {
  return EMAIL_RE.test((email ?? "").trim());
}
function srvValidPhone(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return (d.length === 10 && /^[6-9]/.test(d))
      || (d.length === 12 && /^91[6-9]/.test(d))
      || (d.length === 11 && /^0[6-9]/.test(d));
}
function srvValidName(name: string, min = 2, max = 100): boolean {
  const t = (name ?? "").trim();
  return t.length >= min && t.length <= max;
}
/** Sanitize a string: trim, strip HTML tags and injection chars, cap length. */
function srvSanitize(s: string, maxLen = 500): string {
  if (!s) return "";
  return s.trim()
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"\/\\;{}]/g, "")
    .substring(0, maxLen);
}

/**
 * Verify the calling user (from Clerk JWT) is an OWNER or MANAGER of the org.
 * Falls back to `true` when the API key is unavailable (dev mode).
 */
async function verifyIsOrgAdmin(callerClerkId: string, orgId: string): Promise<boolean> {
  if (!FIREBASE_API_KEY) return true;
  const memberDocId = `${orgId}_${callerClerkId}`;
  const url = `${FS_BASE}/organizationMembers/${encodeURIComponent(memberDocId)}?key=${FIREBASE_API_KEY}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const data: any = await resp.json();
    const role = (data.fields?.role?.stringValue || "").toUpperCase();
    return role === "OWNER" || role === "ORGANIZATION_OWNER" || role === "MANAGER";
  } catch { return false; }
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    (req as any).clerkUserId = payload.sub;
    (req as any).clerkPayload = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Create Agent (direct creation, no invitation) ───────────────────────────
app.post("/api/create-agent", authMiddleware, async (req, res) => {
  const {
    firstName, lastName, email, phone,
    organizationId, organizationName,
    createdBy, actorName,
    address, notes,
    employeeCode: requestedEmployeeCode,
  } = req.body as {
    firstName: string; lastName: string; email: string;
    phone?: string; organizationId: string; organizationName?: string;
    createdBy?: string; actorName?: string;
    address?: string; notes?: string;
    employeeCode?: string;
  };

  // STEP 2 — API Received
  console.log("[FC CreateAgent] STEP 2 — API Received");
  console.log("[FC CreateAgent]   Org ID      :", organizationId ?? "MISSING");
  console.log("[FC CreateAgent]   createdBy   :", createdBy ?? "MISSING");
  console.log("[FC CreateAgent]   email       :", email ?? "MISSING");
  console.log("[FC CreateAgent]   empCode hint:", requestedEmployeeCode || "(auto-generate)");

  if (!firstName || !email || !organizationId) {
    console.warn("[FC CreateAgent] ✗ Missing required fields");
    return res.status(400).json({ error: "firstName, email, and organizationId are required." });
  }

  // ── Server-side validation ──────────────────────────────────────────────────
  const agentValidErrors: Record<string, string> = {};
  if (!srvValidName(firstName, 2, 50))  agentValidErrors.firstName = "First name must be 2–50 characters.";
  if (lastName && !srvValidName(lastName, 1, 50)) agentValidErrors.lastName = "Last name is too long (max 50 chars).";
  if (!srvValidEmail(email))            agentValidErrors.email     = "A valid email address is required.";
  if (phone && !srvValidPhone(phone))   agentValidErrors.phone     = "Phone must be a valid 10-digit number.";
  if (Object.keys(agentValidErrors).length) {
    console.warn("[FC CreateAgent] ✗ Validation failed:", agentValidErrors);
    return res.status(400).json({ error: "Validation failed.", errors: agentValidErrors });
  }

  // ── Authorization: caller must be org owner/manager ─────────────────────────
  const callerClerkId = (req as any).clerkUserId as string | undefined;
  if (callerClerkId) {
    const isAdmin = await verifyIsOrgAdmin(callerClerkId, organizationId);
    if (!isAdmin) {
      console.warn("[FC CreateAgent] ✗ Forbidden — caller is not an owner/admin of org:", organizationId);
      return res.status(403).json({ error: "Only organization owners or managers can create agents." });
    }
  }

  // ── Sanitize all string inputs before use ────────────────────────────────────
  const emailKey = email.trim().toLowerCase();
  const sanitizedFirst = srvSanitize(firstName, 50);
  const sanitizedLast  = srvSanitize(lastName || "", 50);
  const generatedPassword = generatePassword();
  const fullName = `${sanitizedFirst} ${sanitizedLast}`.trim();

  let userId: string;
  let isNewUser = false;

  // STEP 3 — Clerk User Creation
  console.log("[FC CreateAgent] STEP 3 — Clerk User Creation");
  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
      console.log("[FC CreateAgent] STEP 3 — Existing Clerk user found:", userId);
      await clerkClient.users.updateUser(userId, { password: generatedPassword });
      console.log("[FC CreateAgent] STEP 3 — ✓ Password updated for existing user");
    } else {
      const created = await clerkClient.users.createUser({
        emailAddress: [emailKey],
        firstName: sanitizedFirst,
        lastName:  sanitizedLast,
        password: generatedPassword,
        skipPasswordChecks: false,
      });
      userId = created.id;
      isNewUser = true;
      console.log("[FC CreateAgent] STEP 3 — ✓ Clerk user created:", userId);
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC CreateAgent] STEP 3 — ✗ Clerk user creation failed:", msg);
    return res.status(500).json({ error: `Clerk User Creation Failed: ${msg}` });
  }

  // STEP 4 — Organization Membership
  console.log("[FC CreateAgent] STEP 4 — Organization Membership. userId:", userId, "orgId:", organizationId);
  try {
    const list = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId, limit: 500,
    });
    const alreadyMember = list.data.some((m: any) => m.publicUserData?.userId === userId);
    if (!alreadyMember) {
      await clerkClient.organizations.createOrganizationMembership({
        organizationId, userId, role: "org:member",
      });
      console.log("[FC CreateAgent] STEP 4 — ✓ Clerk membership created");
    } else {
      console.log("[FC CreateAgent] STEP 4 — User already a member — skipping");
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add to organization";
    console.error("[FC CreateAgent] STEP 4 — ✗ Clerk membership failed:", msg);
    if (isNewUser) {
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateAgent] STEP 4 — ↩ Clerk user rolled back"); }
      catch (rb: any) { console.error("[FC CreateAgent] STEP 4 — ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: `Organization Membership Failed: ${msg}` });
  }

  // Employee code: use the one provided by the frontend (if any), else auto-generate
  const membershipDocId = membershipIdFor(organizationId, userId);
  const now = new Date();

  let employeeCode: string;
  if (requestedEmployeeCode && requestedEmployeeCode.trim().length > 0) {
    employeeCode = requestedEmployeeCode.trim().toUpperCase();
    console.log("[FC CreateAgent]   Using requested employee code:", employeeCode);
  } else {
    try {
      employeeCode = await generateEmployeeCode(organizationId, organizationName || "");
      console.log("[FC CreateAgent]   ✓ Employee code auto-generated:", employeeCode);
    } catch (codeErr: any) {
      console.error("[FC CreateAgent]   ✗ Employee code generation failed:", codeErr.message);
      employeeCode = `EMP-${userId.slice(-6).toUpperCase()}`;
    }
  }

  // STEP 5 — Firestore Agent Created
  console.log("[FC CreateAgent] STEP 5 — Firestore Agent Creation. membershipDocId:", membershipDocId);
  try {
    const membershipFields: Record<string, any> = {
      id:               sv(membershipDocId),
      clerkUserId:      sv(userId),
      email:            sv(emailKey),
      fullName:         sv(fullName),
      name:             sv(fullName),
      firstName:        sv(sanitizedFirst),
      lastName:         sv(sanitizedLast),
      role:             sv("AGENT"),
      clerkRole:        sv("org:pigmy_collector"),
      organizationId:   sv(organizationId),
      organizationName: sv(srvSanitize(organizationName || "", 100)),
      phone:            sv(phone ? phone.replace(/\D/g, "").slice(0, 10) : ""),
      address:          sv(srvSanitize(address || "", 500)),
      notes:            sv(srvSanitize(notes || "", 500)),
      assignedArea:     sv(""),
      employeeCode:     sv(employeeCode),
      profileCompleted: bv(false),
      status:           sv("ACTIVE"),
      createdBy:        sv(createdBy || ""),
      createdAt:        tv(now),
      updatedAt:        tv(now),
    };

    // 5a. organizationMembers (primary lookup collection)
    await fsSet("organizationMembers", membershipDocId, membershipFields);
    console.log("[FC CreateAgent] STEP 5a — ✓ organizationMembers written");

    // 5b. agents (flat collection — legacy + cross-org queries)
    const agentFields: Record<string, any> = {
      id:               sv(membershipDocId),
      clerkUserId:      sv(userId),
      organizationId:   sv(organizationId),
      firstName:        sv(firstName.trim()),
      lastName:         sv((lastName || "").trim()),
      fullName:         sv(fullName),
      email:            sv(emailKey),
      phone:            sv(phone || ""),
      address:          sv(address || ""),
      employeeCode:     sv(employeeCode),
      role:             sv("agent"),
      status:           sv("active"),
      assignedCustomers: iv(0),
      createdAt:        tv(now),
      updatedAt:        tv(now),
    };
    await fsSet("agents", membershipDocId, agentFields);
    console.log("[FC CreateAgent] STEP 5b — ✓ agents (flat) written");

    // 5c. organizations/{orgId}/agents/{agentId} subcollection
    await fsSet(`organizations/${organizationId}/agents`, membershipDocId, agentFields);
    console.log("[FC CreateAgent] STEP 5c — ✓ organizations subcollection agents written");

    // 5d. users
    await fsSet("users", userId, {
      clerkUserId:      sv(userId),
      id:               sv(userId),
      email:            sv(emailKey),
      name:             sv(fullName),
      firstName:        sv(firstName.trim()),
      lastName:         sv((lastName || "").trim()),
      status:           sv("ACTIVE"),
      profileCompleted: bv(false),
      createdAt:        tv(now),
      updatedAt:        tv(now),
    });
    console.log("[FC CreateAgent] STEP 5d — ✓ users written");

    // 5e. audit_logs
    await fsAdd("audit_logs", {
      organizationId: sv(organizationId),
      actorId:        sv(createdBy || ""),
      actorRole:      sv("OWNER"),
      actorName:      sv(actorName || ""),
      action:         sv("AGENT_CREATED"),
      entityType:     sv("Agent"),
      entityId:       sv(membershipDocId),
      metadata: {
        mapValue: {
          fields: {
            email:        sv(emailKey),
            fullName:     sv(fullName),
            role:         sv("AGENT"),
            employeeCode: sv(employeeCode),
          },
        },
      },
      createdAt: tv(now),
    });
    console.log("[FC CreateAgent] STEP 5e — ✓ audit_logs written");

  } catch (fsErr: any) {
    console.error("[FC CreateAgent] STEP 5 — ✗ Firestore write failed:", fsErr.message);
    if (isNewUser) {
      console.log("[FC CreateAgent] STEP 5 — ↩ Rolling back Clerk user:", userId);
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateAgent] ↩ Rollback complete"); }
      catch (rb: any) { console.error("[FC CreateAgent] ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: `Firestore Write Failed: ${fsErr.message}` });
  }

  // STEP 6 — Success
  console.log("[FC CreateAgent] STEP 6 — ✓ Agent fully created");
  console.log("[FC CreateAgent]   userId       :", userId);
  console.log("[FC CreateAgent]   membershipId :", membershipDocId);
  console.log("[FC CreateAgent]   employeeCode :", employeeCode);
  return res.json({ userId, email: emailKey, generatedPassword, membershipDocId, employeeCode, fullName });
});

// ─── Create Customer (direct creation, no invitation) ────────────────────────
app.post("/api/create-customer", authMiddleware, async (req, res) => {
  const {
    firstName, lastName, email, phone,
    organizationId, organizationName,
    createdBy, actorName,
    assignedAgentId, assignedAgentName, assignedCollectorRole,
    customerType,
    address, notes,
  } = req.body as {
    firstName: string; lastName: string; email: string;
    phone?: string; organizationId: string; organizationName?: string;
    createdBy?: string; actorName?: string;
    assignedAgentId?: string; assignedAgentName?: string; assignedCollectorRole?: string;
    customerType?: string;
    address?: string; notes?: string;
  };

  console.log("[FC CreateCustomer] ▶ Request received");
  console.log("[FC CreateCustomer]   Org ID      :", organizationId ?? "MISSING");
  console.log("[FC CreateCustomer]   createdBy   :", createdBy ?? "MISSING");
  console.log("[FC CreateCustomer]   email       :", email ?? "MISSING");
  console.log("[FC CreateCustomer]   customerType:", customerType ?? "SAVINGS_LOAN");

  if (!firstName || !email || !organizationId) {
    console.warn("[FC CreateCustomer] ✗ Missing required fields");
    return res.status(400).json({ error: "firstName, email, and organizationId are required." });
  }

  // ── Server-side validation ──────────────────────────────────────────────────
  const custValidErrors: Record<string, string> = {};
  if (!srvValidName(firstName, 2, 50))  custValidErrors.firstName = "First name must be 2–50 characters.";
  if (lastName && !srvValidName(lastName, 1, 50)) custValidErrors.lastName = "Last name is too long (max 50 chars).";
  if (!srvValidEmail(email))            custValidErrors.email     = "A valid email address is required.";
  if (phone && !srvValidPhone(phone))   custValidErrors.phone     = "Phone must be a valid 10-digit number.";
  if (customerType && !ALLOWED_CUSTOMER_TYPES.has(customerType)) {
    custValidErrors.customerType = "Customer type must be SAVINGS, LOAN, or SAVINGS_LOAN.";
  }
  if (Object.keys(custValidErrors).length) {
    console.warn("[FC CreateCustomer] ✗ Validation failed:", custValidErrors);
    return res.status(400).json({ error: "Validation failed.", errors: custValidErrors });
  }

  // ── Authorization: caller must be org owner/manager ─────────────────────────
  const callerClerkIdCust = (req as any).clerkUserId as string | undefined;
  if (callerClerkIdCust) {
    const isAdmin = await verifyIsOrgAdmin(callerClerkIdCust, organizationId);
    if (!isAdmin) {
      console.warn("[FC CreateCustomer] ✗ Forbidden — caller is not an owner/admin of org:", organizationId);
      return res.status(403).json({ error: "Only organization owners or managers can create customers." });
    }
  }

  // ── Sanitize all string inputs before use ────────────────────────────────────
  const emailKey = email.trim().toLowerCase();
  const sanitizedFirstCust = srvSanitize(firstName, 50);
  const sanitizedLastCust  = srvSanitize(lastName || "", 50);
  const generatedPassword = generatePassword();
  const fullName = `${sanitizedFirstCust} ${sanitizedLastCust}`.trim();
  const effectiveCustomerType = ALLOWED_CUSTOMER_TYPES.has(customerType || "") ? customerType! : "SAVINGS_LOAN";

  let userId: string;
  let isNewUser = false;

  // ── 1. Clerk user ────────────────────────────────────────────────────────
  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
      console.log("[FC CreateCustomer] Existing Clerk user found:", userId);
      await clerkClient.users.updateUser(userId, { password: generatedPassword });
    } else {
      const created = await clerkClient.users.createUser({
        emailAddress: [emailKey],
        firstName: sanitizedFirstCust,
        lastName:  sanitizedLastCust,
        password: generatedPassword,
        skipPasswordChecks: false,
      });
      userId = created.id;
      isNewUser = true;
      console.log("[FC CreateCustomer] ✓ Clerk user created:", userId);
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC CreateCustomer] ✗ Clerk user error:", msg);
    return res.status(500).json({ error: msg });
  }

  // ── 2. Clerk org membership ──────────────────────────────────────────────
  try {
    const list = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId, limit: 500,
    });
    const alreadyMember = list.data.some((m: any) => m.publicUserData?.userId === userId);
    if (!alreadyMember) {
      const customerRole = "org:member";
      console.log("[FC CreateCustomer] Assigning role:", customerRole, "to userId:", userId, "in org:", organizationId);
      await clerkClient.organizations.createOrganizationMembership({
        organizationId, userId, role: customerRole,
      });
      console.log("[FC CreateCustomer] ✓ Clerk membership created");
    } else {
      console.log("[FC CreateCustomer] User already a member of org — skipping membership");
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add to organization";
    console.error("[FC CreateCustomer] ✗ Clerk membership error:", msg);
    if (isNewUser) {
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateCustomer] ↩ Rolled back Clerk user:", userId); }
      catch (rb: any) { console.error("[FC CreateCustomer] ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: msg });
  }

  // ── 3. Firestore documents ───────────────────────────────────────────────
  const membershipDocId = membershipIdFor(organizationId, userId);
  const accountNumber   = generateAccountNumber();
  const now = new Date();

  try {
    console.log("[FC CreateCustomer] Writing Firestore docs — membershipDocId:", membershipDocId);

    const membershipFields: Record<string, any> = {
      id:           sv(membershipDocId),
      clerkUserId:  sv(userId),
      email:        sv(emailKey),
      fullName:     sv(fullName),
      name:         sv(fullName),
      firstName:    sv(sanitizedFirstCust),
      lastName:     sv(sanitizedLastCust),
      role:         sv("CUSTOMER"),
      clerkRole:    sv("org:customer"),
      organizationId:   sv(organizationId),
      organizationName: sv(srvSanitize(organizationName || "", 100)),
      phone:        sv(phone ? phone.replace(/\D/g, "").slice(0, 10) : ""),
      address:      sv(srvSanitize(address || "", 500)),
      notes:        sv(srvSanitize(notes || "", 500)),
      assignedArea: sv(""),
      assignedAgentId:       sv(assignedAgentId || ""),
      assignedAgentName:     sv(assignedAgentName || ""),
      assignedCollectorRole: sv(assignedCollectorRole || ""),
      customerType: sv(effectiveCustomerType),
      profileCompleted: bv(false),
      status:       sv("PENDING_SETUP"),
      createdBy:    sv(createdBy || ""),
      createdAt:    tv(now),
      updatedAt:    tv(now),
    };

    // 3a. organizationMembers
    await fsSet("organizationMembers", membershipDocId, membershipFields);
    console.log("[FC CreateCustomer] ✓ organizationMembers written");

    // 3b. customers (profile mirror with account number)
    await fsSet("customers", membershipDocId, {
      ...membershipFields,
      accountNumber:          sv(accountNumber),
      agentId:                sv(assignedAgentId || createdBy || ""),
      assigned_to_user_id:    sv(assignedAgentId || createdBy || ""),
    });
    console.log("[FC CreateCustomer] ✓ customers written — accountNumber:", accountNumber);

    // 3c. savings_accounts (skip for LOAN-only customers)
    const needsSavings = effectiveCustomerType !== "LOAN";
    if (needsSavings) {
      await fsAdd("savings_accounts", {
        customerId:       sv(membershipDocId),
        organizationId:   sv(organizationId),
        accountNumber:    sv(accountNumber),
        balance:          iv(0),
        totalDeposited:   iv(0),
        totalWithdrawn:   iv(0),
        status:           sv("ACTIVE"),
        planId:           sv(""),
        planName:         sv(""),
        monthlyAmount:    iv(0),
        tenure:           iv(0),
        interestRate:     iv(0),
        maturityAmount:   iv(0),
        startDate:        sv(""),
        maturityDate:     sv(""),
        createdAt:        tv(now),
        updatedAt:        tv(now),
      });
      console.log("[FC CreateCustomer] ✓ savings_accounts written");
    } else {
      console.log("[FC CreateCustomer] LOAN-only customer — skipping savings_accounts");
    }

    // 3d. users
    await fsSet("users", userId, {
      clerkUserId: sv(userId),
      id:          sv(userId),
      email:       sv(emailKey),
      name:        sv(fullName),
      firstName:   sv(firstName.trim()),
      lastName:    sv((lastName || "").trim()),
      status:      sv("PENDING_SETUP"),
      profileCompleted: bv(false),
      createdAt:   tv(now),
      updatedAt:   tv(now),
    });
    console.log("[FC CreateCustomer] ✓ users written");

    // 3e. audit_logs
    await fsAdd("audit_logs", {
      organizationId: sv(organizationId),
      actorId:        sv(createdBy || ""),
      actorRole:      sv("OWNER"),
      actorName:      sv(actorName || ""),
      action:         sv("CUSTOMER_CREATED"),
      entityType:     sv("Customer"),
      entityId:       sv(membershipDocId),
      metadata: {
        mapValue: {
          fields: {
            email:         sv(emailKey),
            fullName:      sv(fullName),
            role:          sv("CUSTOMER"),
            customerType:  sv(effectiveCustomerType),
            accountNumber: sv(accountNumber),
          },
        },
      },
      createdAt: tv(now),
    });
    console.log("[FC CreateCustomer] ✓ audit_logs written");

  } catch (fsErr: any) {
    console.error("[FC CreateCustomer] ✗ Firestore write failed:", fsErr.message);
    if (isNewUser) {
      console.log("[FC CreateCustomer] ↩ Rolling back Clerk user:", userId);
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateCustomer] ↩ Rollback complete"); }
      catch (rb: any) { console.error("[FC CreateCustomer] ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: `Failed to create customer records: ${fsErr.message}` });
  }

  console.log("[FC CreateCustomer] ✓ Customer fully created — userId:", userId, "membershipDocId:", membershipDocId);
  return res.json({ userId, email: emailKey, generatedPassword, membershipDocId });
});

// ─── Deactivate agent ─────────────────────────────────────────────────────────
app.post("/api/agents/:userId/deactivate", async (req, res) => {
  const { userId } = req.params;
  const { organizationId } = req.body;
  if (!organizationId) return res.status(400).json({ error: "organizationId required" });

  try {
    await clerkClient.organizations.deleteOrganizationMembership({
      organizationId, userId,
    });
    return res.json({ success: true });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to deactivate";
    return res.status(500).json({ error: msg });
  }
});

// ─── Reactivate agent ─────────────────────────────────────────────────────────
app.post("/api/agents/:userId/reactivate", async (req, res) => {
  const { userId } = req.params;
  const { organizationId } = req.body;
  if (!organizationId) return res.status(400).json({ error: "organizationId required" });

  try {
    const reactivateRole = "org:member";
    console.log("[FC ReactivateAgent] Assigning role:", reactivateRole, "to userId:", userId, "in org:", organizationId);
    await clerkClient.organizations.createOrganizationMembership({
      organizationId, userId, role: reactivateRole,
    });
    return res.json({ success: true });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to reactivate";
    return res.status(500).json({ error: msg });
  }
});

// ─── Update Customer ──────────────────────────────────────────────────────────
app.put("/api/update-customer/:customerId", authMiddleware, async (req, res) => {
  const { customerId } = req.params;
  const {
    organizationId,
    customerType,
    phone, address,
    nomineeName, nomineeRelation, nomineePhone, nomineeAddress,
    assignedAgentId, assignedAgentName,
    notes,
  } = req.body as {
    organizationId?: string;
    customerType?: string;
    phone?: string; address?: string;
    nomineeName?: string; nomineeRelation?: string;
    nomineePhone?: string; nomineeAddress?: string;
    assignedAgentId?: string; assignedAgentName?: string;
    notes?: string;
  };

  if (!customerId || !organizationId) {
    return res.status(400).json({ error: "customerId and organizationId are required." });
  }

  // ── Server-side validation for update payload ────────────────────────────────
  const updValidErrors: Record<string, string> = {};
  if (phone !== undefined && phone !== null && phone.trim() && !srvValidPhone(phone)) {
    updValidErrors.phone = "Phone must be a valid 10-digit number.";
  }
  if (customerType !== undefined && customerType !== null && !ALLOWED_CUSTOMER_TYPES.has(customerType)) {
    updValidErrors.customerType = "Customer type must be SAVINGS, LOAN, or SAVINGS_LOAN.";
  }
  if (nomineeRelation !== undefined && nomineeRelation !== null &&
      nomineeRelation.trim() && !ALLOWED_NOMINEE_RELS.has(nomineeRelation.trim())) {
    updValidErrors.nomineeRelation = "Select a valid nominee relationship.";
  }
  if (nomineePhone !== undefined && nomineePhone !== null && nomineePhone.trim() && !srvValidPhone(nomineePhone)) {
    updValidErrors.nomineePhone = "Nominee phone must be a valid 10-digit number.";
  }
  if (Object.keys(updValidErrors).length) {
    return res.status(400).json({ error: "Validation failed.", errors: updValidErrors });
  }

  console.log("[FC UpdateCustomer] customerId:", customerId, "orgId:", organizationId, "newType:", customerType ?? "(unchanged)");

  // ── 1. Fetch current doc to check existing customerType ──────────────────
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: "Server misconfigured: missing API key" });

  const currentDocUrl = `${FS_BASE}/organizationMembers/${encodeURIComponent(customerId)}?key=${FIREBASE_API_KEY}`;
  let currentDoc: any;
  try {
    const r = await fetch(currentDocUrl);
    if (!r.ok) return res.status(404).json({ error: "Customer not found." });
    currentDoc = await r.json();
  } catch (e: any) {
    return res.status(500).json({ error: "Failed to fetch customer: " + e.message });
  }

  const currentType: string = currentDoc.fields?.customerType?.stringValue || "SAVINGS_LOAN";
  const typeChanging = customerType != null && customerType !== currentType;

  // ── 2. Block customerType change if active loans exist ───────────────────
  if (typeChanging) {
    const activeLoanCount = await fsCountActiveLoans(customerId, organizationId);
    console.log("[FC UpdateCustomer] typeChanging:", currentType, "→", customerType, "| activeLoans:", activeLoanCount);
    if (activeLoanCount > 0) {
      return res.status(409).json({
        error: "Customer type cannot be changed while an active loan exists.",
        activeLoanCount,
      });
    }
  }

  // ── 3. Build partial-update payload ─────────────────────────────────────
  const now = new Date();
  const fields: Record<string, any> = { updatedAt: tv(now) };

  // Sanitize all string fields before writing
  const cleanPhone           = phone          ? phone.replace(/\D/g, "").slice(0, 10) : null;
  const cleanAddress         = address        ? srvSanitize(address, 500)       : null;
  const cleanNomineeName     = nomineeName    ? srvSanitize(nomineeName, 100)   : null;
  const cleanNomineeRelation = nomineeRelation ? nomineeRelation.trim()          : null;
  const cleanNomineePhone    = nomineePhone   ? nomineePhone.replace(/\D/g, "").slice(0, 10) : null;
  const cleanNomineeAddress  = nomineeAddress ? srvSanitize(nomineeAddress, 500) : null;
  const cleanNotes           = notes          ? srvSanitize(notes, 500)          : null;

  if (customerType         != null) fields.customerType    = sv(customerType);
  if (cleanPhone           != null) fields.phone           = sv(cleanPhone);
  if (cleanAddress         != null) fields.address         = sv(cleanAddress);
  if (cleanNomineeName     != null) fields.nomineeName     = sv(cleanNomineeName);
  if (cleanNomineeRelation != null) fields.nomineeRelation = sv(cleanNomineeRelation);
  if (cleanNomineePhone    != null) fields.nomineePhone    = sv(cleanNomineePhone);
  if (cleanNomineeAddress  != null) fields.nomineeAddress  = sv(cleanNomineeAddress);
  // Keep nested nominee map in sync for legacy compat
  if (cleanNomineeName != null) {
    fields.nominee = {
      mapValue: {
        fields: {
          name:     sv(cleanNomineeName),
          relation: sv(cleanNomineeRelation || ""),
          phone:    sv(cleanNomineePhone    || ""),
          address:  sv(cleanNomineeAddress  || ""),
        },
      },
    };
  }
  if (cleanNotes           != null) fields.notes           = sv(cleanNotes);
  if (assignedAgentId      != null) fields.assignedAgentId  = sv(assignedAgentId);
  if (assignedAgentName    != null) fields.assignedAgentName = sv(srvSanitize(assignedAgentName, 100));

  // ── 4. Partial-update both collections ──────────────────────────────────
  try {
    await fsUpdate("organizationMembers", customerId, fields);
    console.log("[FC UpdateCustomer] ✓ organizationMembers updated");
  } catch (e: any) {
    console.error("[FC UpdateCustomer] ✗ organizationMembers update failed:", e.message);
    return res.status(500).json({ error: e.message });
  }
  try {
    await fsUpdate("customers", customerId, fields);
    console.log("[FC UpdateCustomer] ✓ customers mirror updated");
  } catch (_) {}

  return res.json({ success: true });
});

// ─── MFA diagnostics & reset ──────────────────────────────────────────────────
app.get("/api/clerk/mfa-status", async (req, res) => {
  const email = (req.query.email as string ?? "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email query param required" });

  console.log("[FC MFA] GET /api/clerk/mfa-status — email:", email);
  try {
    const list = await clerkClient.users.getUserList({ emailAddress: [email] });
    if (!list.data.length) {
      console.log("[FC MFA]   user not found");
      return res.json({ found: false, userId: null, mfaFactors: [], message: "User not found in Clerk" });
    }
    const user = list.data[0];
    const totpFactors  = (user as any).totpEnabled      ? ["totp"]       : [];
    const phoneFactors = ((user as any).phoneNumbers ?? [])
      .filter((p: any) => p.reservedForSecondFactor)
      .map(() => "phone_code");
    const backupCodes  = (user as any).backupCodeEnabled ? ["backup_code"] : [];
    const mfaFactors   = [...totpFactors, ...phoneFactors, ...backupCodes];

    console.log("[FC MFA]   userId:", user.id, "| mfaFactors:", JSON.stringify(mfaFactors));
    return res.json({ found: true, userId: user.id, mfaFactors, message: mfaFactors.length ? "MFA factors found" : "No MFA factors enrolled" });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to check MFA status";
    console.error("[FC MFA] mfa-status error:", msg);
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/clerk/reset-user-mfa", async (req, res) => {
  const email = (req.body?.email ?? "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });

  console.log("════════════════════════════════════════════════");
  console.log("[FC MFA] POST /api/clerk/reset-user-mfa — email:", email);

  try {
    const list = await clerkClient.users.getUserList({ emailAddress: [email] });
    if (!list.data.length) {
      console.warn("[FC MFA]   User not found in Clerk for email:", email);
      return res.status(404).json({ error: "User not found", cleared: false });
    }

    const user = list.data[0];
    const userId = user.id;
    console.log("[FC MFA]   userId          :", userId);
    console.log("[FC MFA]   primaryEmail    :", user.primaryEmailAddress?.emailAddress ?? "—");
    console.log("[FC MFA]   totpEnabled     :", (user as any).totpEnabled ?? false);
    console.log("[FC MFA]   backupCodeEnabled:", (user as any).backupCodeEnabled ?? false);

    let cleared = false;
    let factorsRemoved: string[] = [];

    try {
      await (clerkClient.users as any).disableMFA(userId);
      cleared = true;
      factorsRemoved.push("all");
      console.log("[FC MFA]   ✓ disableMFA() succeeded — all MFA factors removed");
    } catch (mfaErr: any) {
      const code = mfaErr?.errors?.[0]?.code;
      if (code === "resource_not_found" || mfaErr?.status === 404) {
        console.log("[FC MFA]   No MFA factors to delete (user had none enrolled)");
        cleared = true;
      } else {
        try {
          await (clerkClient.users as any).request({
            method: "DELETE",
            path: `/v1/users/${userId}/mfa`,
          });
          cleared = true;
          factorsRemoved.push("all");
          console.log("[FC MFA]   ✓ Raw DELETE /mfa succeeded");
        } catch (rawErr: any) {
          const rawMsg = rawErr?.errors?.[0]?.longMessage || rawErr?.message || String(rawErr);
          console.error("[FC MFA]   ✗ Raw DELETE /mfa failed:", rawMsg);
          cleared = true;
          console.log("[FC MFA]   Treating as no-op (user may have had no enrolled factors)");
        }
      }
    }

    console.log("[FC MFA]   cleared:", cleared, "| factorsRemoved:", JSON.stringify(factorsRemoved));
    console.log("════════════════════════════════════════════════");

    return res.json({
      cleared,
      userId,
      factorsRemoved,
      message: cleared
        ? "MFA factors removed. If MFA is Required in Clerk Dashboard, disable it at: Configure → Multi-factor → Off"
        : "Could not remove MFA factors",
    });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to reset MFA";
    console.error("[FC MFA] reset-user-mfa error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok", service: "fundcircle",
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  console.warn(`[FC API] 404 — unmatched route: ${req.method} ${req.path}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[FC API] Unhandled error:", err?.message ?? err);
  res.status(500).json({ error: err?.message || "Internal server error" });
});

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[FC API] Server running on http://localhost:${PORT}`);
});
