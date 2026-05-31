import express from "express";
import cors from "cors";
import { createClerkClient } from "@clerk/backend";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50kb" }));

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const LOCAL_PORT = process.env.VITE_PORT
  ? parseInt(process.env.VITE_PORT)
  : 5000;

// ─── Legacy: provision-user (keep for SetupPasswordPage backward compat) ─────
app.post("/api/provision-user", async (req, res) => {
  const { firstName, lastName, email, organizationId, role } = req.body as {
    firstName: string;
    lastName: string;
    email: string;
    organizationId: string;
    role: string;
  };

  if (!firstName || !email || !organizationId || !role) {
    return res.status(400).json({ error: "firstName, email, organizationId and role are required." });
  }

  const emailKey = email.trim().toLowerCase();
  let userId: string;

  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });
    if (existing.data.length > 0) {
      userId = existing.data[0].id;
    } else {
      const created = await clerkClient.users.createUser({
        emailAddress: [emailKey],
        firstName: firstName.trim(),
        lastName: (lastName || "").trim(),
        skipPasswordRequirement: true,
      });
      userId = created.id;
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC Provision] Clerk user creation failed:", msg);
    return res.status(500).json({ error: msg });
  }

  let setupUrl: string;
  try {
    const token = await clerkClient.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 60 * 60 * 24 * 7,
    });
    const origin = `http://localhost:${LOCAL_PORT}`;
    setupUrl = `${origin}/auth/setup-password?token=${token.token}`;
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create setup link";
    console.error("[FC Provision] Sign-in token creation failed:", msg);
    return res.status(500).json({ error: msg });
  }

  return res.json({ userId, setupUrl });
});

// ─── Add member: existing user → direct org membership, new user → invitation ─
app.post("/api/add-member", async (req, res) => {
  const { email, organizationId, role, inviterUserId } = req.body as {
    email: string;
    organizationId: string;
    role: "AGENT" | "CUSTOMER";
    inviterUserId?: string;
  };

  if (!email || !organizationId || !role) {
    return res.status(400).json({ error: "email, organizationId and role are required." });
  }

  const emailKey = email.trim().toLowerCase();
  const clerkRole = role === "AGENT" ? "org:pigmy_collector" : "org:customer";

  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [emailKey] });

    if (existing.data.length > 0) {
      const userId = existing.data[0].id;
      console.log("[FC AddMember] Existing Clerk user found:", userId);

      // Check if already a member of this org
      let alreadyMember = false;
      try {
        const list = await clerkClient.organizations.getOrganizationMembershipList({
          organizationId,
          limit: 500,
        });
        alreadyMember = list.data.some(
          (m: any) => m.publicUserData?.userId === userId
        );
      } catch (e) {
        console.warn("[FC AddMember] Could not check existing membership:", e);
      }

      if (!alreadyMember) {
        await clerkClient.organizations.createOrganizationMembership({
          organizationId,
          userId,
          role: clerkRole,
        });
        console.log("[FC AddMember] Added existing user to Clerk org:", userId, "role:", clerkRole);
      } else {
        console.log("[FC AddMember] User already in org — skipping Clerk membership create");
      }

      return res.json({ userId, isExistingUser: true });
    }

    // New user — create Clerk org invitation (sends email automatically)
    const origin = `http://localhost:${LOCAL_PORT}`;
    const invitation = await clerkClient.organizations.createOrganizationInvitation({
      organizationId,
      emailAddress: emailKey,
      role: clerkRole,
      redirectUrl: `${origin}/accept-invitation`,
      ...(inviterUserId ? { inviterUserId } : {}),
    });
    console.log("[FC AddMember] Invitation created for new user:", emailKey, "invitationId:", invitation.id);

    return res.json({ isExistingUser: false, invitationId: invitation.id });

  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to add member";
    console.error("[FC AddMember] Error:", msg, err);
    return res.status(500).json({ error: msg });
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "fundcircle",
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.API_PORT
  ? parseInt(process.env.API_PORT)
  : 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[FC API] Server running on http://localhost:${PORT}`);
});
