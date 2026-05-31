import express from "express";
import cors from "cors";
import path from "path";
import { createClerkClient } from "@clerk/backend";

const app = express();
app.use(cors());
app.use(express.json());

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

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
    const origin =
      process.env.VITE_APP_ORIGIN ||
      (process.env.NODE_ENV === "production"
        ? `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`
        : "http://localhost:5000");
    setupUrl = `${origin}/auth/setup-password?token=${token.token}`;
    console.log("[FC Provision] Sign-in token created for userId:", userId);
  } catch (err: any) {
    const msg = err?.errors?.[0]?.longMessage || err?.message || "Failed to create setup link";
    console.error("[FC Provision] Sign-in token creation failed:", msg, err);
    return res.status(500).json({ error: msg });
  }

  return res.json({ userId, setupUrl });
});

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(process.cwd(), "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const PORT = process.env.PORT
  ? parseInt(process.env.PORT)
  : process.env.API_PORT
  ? parseInt(process.env.API_PORT)
  : 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[FC API] Server running on port ${PORT}`);
});
