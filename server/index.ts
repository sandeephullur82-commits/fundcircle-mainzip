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
      await clerkClient.organizations.createOrganizationMembership({
        organizationId, userId, role: "org:pigmy_collector",
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
      await clerkClient.organizations.createOrganizationMembership({
        organizationId, userId, role: "org:customer",
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
    await clerkClient.organizations.createOrganizationMembership({
      organizationId, userId, role: "org:pigmy_collector",
    });
    return res.json({ success: true });
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to reactivate";
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
