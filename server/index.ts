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

function membershipIdFor(orgId: string, userId: string): string {
  return `${orgId}_${userId}`;
}

function generateAccountNumber(): string {
  const n = Math.floor(Math.random() * 9000000000) + 1000000000;
  return `FC${n}`;
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
    address, notes, employeeCode,
  } = req.body as {
    firstName: string; lastName: string; email: string;
    phone?: string; organizationId: string; organizationName?: string;
    createdBy?: string; actorName?: string;
    address?: string; notes?: string; employeeCode?: string;
  };

  console.log("[FC CreateAgent] ▶ Request received");
  console.log("[FC CreateAgent]   Org ID   :", organizationId ?? "MISSING");
  console.log("[FC CreateAgent]   createdBy:", createdBy ?? "MISSING");
  console.log("[FC CreateAgent]   email    :", email ?? "MISSING");

  if (!firstName || !email || !organizationId) {
    console.warn("[FC CreateAgent] ✗ Missing required fields");
    return res.status(400).json({ error: "firstName, email, and organizationId are required." });
  }

  const emailKey = email.trim().toLowerCase();
  const generatedPassword = generatePassword();
  const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();

  let userId: string;
  let isNewUser = false;

  // ── 1. Clerk user ────────────────────────────────────────────────────────
  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
      console.log("[FC CreateAgent] Existing Clerk user found:", userId);
      await clerkClient.users.updateUser(userId, { password: generatedPassword });
    } else {
      const created = await clerkClient.users.createUser({
        emailAddress: [emailKey],
        firstName: firstName.trim(),
        lastName: (lastName || "").trim(),
        password: generatedPassword,
        skipPasswordChecks: false,
      });
      userId = created.id;
      isNewUser = true;
      console.log("[FC CreateAgent] ✓ Clerk user created:", userId);
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC CreateAgent] ✗ Clerk user error:", msg);
    return res.status(500).json({ error: msg });
  }

  // ── 2. Clerk org membership ──────────────────────────────────────────────
  try {
    const list = await clerkClient.organizations.getOrganizationMembershipList({
      organizationId, limit: 500,
    });
    const alreadyMember = list.data.some((m: any) => m.publicUserData?.userId === userId);
    if (!alreadyMember) {
      const agentRole = "org:member";
      console.log("[FC CreateAgent] Assigning role:", agentRole, "to userId:", userId, "in org:", organizationId);
      await clerkClient.organizations.createOrganizationMembership({
        organizationId, userId, role: agentRole,
      });
      console.log("[FC CreateAgent] ✓ Clerk membership created");
    } else {
      console.log("[FC CreateAgent] User already a member of org — skipping membership");
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add to organization";
    console.error("[FC CreateAgent] ✗ Clerk membership error:", msg);
    if (isNewUser) {
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateAgent] ↩ Rolled back Clerk user:", userId); }
      catch (rb: any) { console.error("[FC CreateAgent] ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: msg });
  }

  // ── 3. Firestore documents ───────────────────────────────────────────────
  const membershipDocId = membershipIdFor(organizationId, userId);
  const now = new Date();

  try {
    console.log("[FC CreateAgent] Writing Firestore docs — membershipDocId:", membershipDocId);

    const membershipFields: Record<string, any> = {
      id:           sv(membershipDocId),
      clerkUserId:  sv(userId),
      email:        sv(emailKey),
      fullName:     sv(fullName),
      name:         sv(fullName),
      firstName:    sv(firstName.trim()),
      lastName:     sv((lastName || "").trim()),
      role:         sv("AGENT"),
      clerkRole:    sv("org:pigmy_collector"),
      organizationId:   sv(organizationId),
      organizationName: sv(organizationName || ""),
      phone:        sv(phone || ""),
      address:      sv(address || ""),
      notes:        sv(notes || ""),
      assignedArea: sv(""),
      profileCompleted: bv(false),
      status:       sv("PENDING_SETUP"),
      createdBy:    sv(createdBy || ""),
      createdAt:    tv(now),
      updatedAt:    tv(now),
    };
    if (employeeCode?.trim()) {
      membershipFields.employeeCode = sv(employeeCode.trim());
    }

    // 3a. organizationMembers
    await fsSet("organizationMembers", membershipDocId, membershipFields);
    console.log("[FC CreateAgent] ✓ organizationMembers written");

    // 3b. users
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
    console.log("[FC CreateAgent] ✓ users written");

    // 3c. audit_logs
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
            email:    sv(emailKey),
            fullName: sv(fullName),
            role:     sv("AGENT"),
          },
        },
      },
      createdAt: tv(now),
    });
    console.log("[FC CreateAgent] ✓ audit_logs written");

  } catch (fsErr: any) {
    console.error("[FC CreateAgent] ✗ Firestore write failed:", fsErr.message);
    if (isNewUser) {
      console.log("[FC CreateAgent] ↩ Rolling back Clerk user:", userId);
      try { await clerkClient.users.deleteUser(userId); console.log("[FC CreateAgent] ↩ Rollback complete"); }
      catch (rb: any) { console.error("[FC CreateAgent] ✗ Rollback failed:", rb?.message); }
    }
    return res.status(500).json({ error: `Failed to create agent records: ${fsErr.message}` });
  }

  console.log("[FC CreateAgent] ✓ Agent fully created — userId:", userId, "membershipDocId:", membershipDocId);
  return res.json({ userId, email: emailKey, generatedPassword, membershipDocId });
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

  const emailKey = email.trim().toLowerCase();
  const generatedPassword = generatePassword();
  const fullName = `${firstName.trim()} ${(lastName || "").trim()}`.trim();
  const effectiveCustomerType = customerType || "SAVINGS_LOAN";

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
        firstName: firstName.trim(),
        lastName: (lastName || "").trim(),
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
      firstName:    sv(firstName.trim()),
      lastName:     sv((lastName || "").trim()),
      role:         sv("CUSTOMER"),
      clerkRole:    sv("org:customer"),
      organizationId:   sv(organizationId),
      organizationName: sv(organizationName || ""),
      phone:        sv(phone || ""),
      address:      sv(address || ""),
      notes:        sv(notes || ""),
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
