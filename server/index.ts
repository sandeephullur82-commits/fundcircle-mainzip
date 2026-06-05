import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createClerkClient } from "@clerk/backend";

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

// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = await clerkClient.verifyToken(token);
    (req as any).clerkUserId = payload.sub;
    (req as any).clerkPayload = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Create Agent (direct creation, no invitation) ───────────────────────────
app.post("/api/create-agent", async (req, res) => {
  const { firstName, lastName, email, phone, organizationId, createdBy } = req.body as {
    firstName: string; lastName: string; email: string;
    phone?: string; organizationId: string; createdBy?: string;
  };

  if (!firstName || !email || !organizationId) {
    return res.status(400).json({ error: "firstName, email, and organizationId are required." });
  }

  const emailKey = email.trim().toLowerCase();
  const generatedPassword = generatePassword();

  let userId: string;

  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
      // Update password for existing user so they use the new temp password
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
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC CreateAgent] Clerk user creation failed:", msg);
    return res.status(500).json({ error: msg });
  }

  // Add to org as agent
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
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add to organization";
    console.error("[FC CreateAgent] Org membership failed:", msg);
    return res.status(500).json({ error: msg });
  }

  return res.json({ userId, email: emailKey, generatedPassword });
});

// ─── Create Customer (direct creation, no invitation) ────────────────────────
app.post("/api/create-customer", async (req, res) => {
  const { firstName, lastName, email, phone, organizationId, createdBy } = req.body as {
    firstName: string; lastName: string; email: string;
    phone?: string; organizationId: string; createdBy?: string;
  };

  if (!firstName || !email || !organizationId) {
    return res.status(400).json({ error: "firstName, email, and organizationId are required." });
  }

  const emailKey = email.trim().toLowerCase();
  const generatedPassword = generatePassword();

  let userId: string;

  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      userId = existing.data[0].id;
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
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC CreateCustomer] Clerk user creation failed:", msg);
    return res.status(500).json({ error: msg });
  }

  // Add to org as customer
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
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add to organization";
    console.error("[FC CreateCustomer] Org membership failed:", msg);
    return res.status(500).json({ error: msg });
  }

  return res.json({ userId, email: emailKey, generatedPassword });
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
// GET /api/clerk/mfa-status?email=...
// Returns the user's enrolled MFA factors so the frontend knows what's blocking sign-in.
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

// POST /api/clerk/reset-user-mfa
// Body: { email: string }
// Removes ALL enrolled MFA factors from the user so they can sign in without MFA
// (effective when Clerk instance MFA is "optional"; shows Dashboard instructions if "required").
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

    // ── Delete all MFA factors via DELETE /v1/users/{userId}/mfa ──────────
    let cleared = false;
    let factorsRemoved: string[] = [];

    try {
      await (clerkClient.users as any).disableMFA(userId);
      cleared = true;
      factorsRemoved.push("all");
      console.log("[FC MFA]   ✓ disableMFA() succeeded — all MFA factors removed");
    } catch (mfaErr: any) {
      // disableMFA may not exist in this SDK version — fall back to raw request
      const code = mfaErr?.errors?.[0]?.code;
      if (code === "resource_not_found" || mfaErr?.status === 404) {
        console.log("[FC MFA]   No MFA factors to delete (user had none enrolled)");
        cleared = true;
      } else {
        // Try raw DELETE via the users.request method
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
          // Non-fatal: if user had no factors this is expected
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

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[FC API] Server running on http://localhost:${PORT}`);
});
