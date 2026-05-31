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
      console.log("[FC Provision] Existing Clerk user found:", userId);
    } else {
      const created = await clerkClient.users.createUser({
        emailAddress: [emailKey],
        firstName: firstName.trim(),
        lastName: (lastName || "").trim(),
        skipPasswordRequirement: true,
      });
      userId = created.id;
      console.log("[FC Provision] Clerk user created:", userId);
    }
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create Clerk user";
    console.error("[FC Provision] Clerk user creation failed:", msg, err);
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
    console.log("[FC Provision] Sign-in token created for userId:", userId);
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create setup link";
    console.error("[FC Provision] Sign-in token creation failed:", msg, err);
    return res.status(500).json({ error: msg });
  }

  return res.json({ userId, setupUrl });
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
