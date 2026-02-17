import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import User from "../models/User";
import { requireAuth } from "../middleware/auth";

const router = Router();

const signToken = (id: string, role: string) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d"
  });

function getTokenCookieOptions(req: Request): CookieOptions {
  const daysRaw = process.env.JWT_COOKIE_DAYS || "7";
  const days = Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : 7;
  const maxAge = Math.max(1, days) * 24 * 60 * 60 * 1000;

  const proto = String(req.headers["x-forwarded-proto"] || "");
  const isHttps = req.secure || proto.includes("https");
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? isHttps : false;

  // If the cookie is marked secure (HTTPS), allow cross-site (e.g., separate frontend domain).
  // Otherwise, keep it Lax for local/dev.
  const sameSite: CookieOptions["sameSite"] = secure ? "none" : "lax";

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge,
    path: "/",
  };
}

// Session helper (avoids 401 spam in the frontend console)
router.get("/session", async (req: Request, res: Response) => {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  if (!token) return res.json({ user: null });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id);
    return res.json({ user: user || null });
  } catch {
    return res.json({ user: null });
  }
});

router.post(
  "/register",
  [
    body("name").notEmpty(),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
    body("role").optional().isIn(["buyer", "seller"]), // prevent self-creating admin
    body("phone").optional().isString(),
    body("location").optional().isString()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role, phone, location } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already in use" });

    const user = await User.create({
      name,
      email,
      password,
      role: role || "buyer",
      phone,
      location
    });

    const token = signToken(user.id, user.role);
    res.cookie("token", token, getTokenCookieOptions(req));
    return res.status(201).json({ user });
  }
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").isString()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, getTokenCookieOptions(req));
    return res.json({ user });
  }
);

router.post("/logout", (req, res) => {
  const opts = getTokenCookieOptions(req);
  res.clearCookie("token", { path: opts.path, sameSite: opts.sameSite, secure: opts.secure });
  return res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ user });
});

// Update profile (name, bio, avatarUrl)
router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  const { name, bio, avatarUrl, phone, location } = req.body as {
    name?: string;
    bio?: string;
    avatarUrl?: string;
    phone?: string;
    location?: string;
  };
  const update: any = {};
  if (name !== undefined) update.name = name;
  if (bio !== undefined) update.bio = bio;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
  if (phone !== undefined) update.phone = phone;
  if (location !== undefined) update.location = location;
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: update }, { new: true });
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});

// Change password
router.patch("/me/password", requireAuth, async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  const user = await User.findById(req.user!.id).select("+password");
  if (!user) return res.status(404).json({ message: "User not found" });
  const ok = await user.comparePassword(oldPassword);
  if (!ok) return res.status(401).json({ message: "Incorrect current password" });
  user.password = newPassword;
  await user.save();
  res.json({ message: "Password updated" });
});

// Google Sign-In (Google Identity Services ID token flow)
router.post("/google", async (req: Request, res: Response) => {
  const { idToken, role, location } = req.body as {
    idToken?: string;
    role?: "buyer" | "seller";
    location?: string | null;
  };

  if (!idToken) return res.status(400).json({ message: "Missing idToken" });
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: "GOOGLE_CLIENT_ID is not configured" });
  }

  try {
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!verifyRes.ok) return res.status(401).json({ message: "Invalid Google token" });
    const payload = (await verifyRes.json()) as any;
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ message: "Invalid Google token audience" });
    }
    if (payload.email_verified === "false") {
      return res.status(401).json({ message: "Google email not verified" });
    }

    const email = String(payload.email || "").toLowerCase();
    const displayName = String(payload.name || payload.given_name || "User");
    const picture = payload.picture ? String(payload.picture) : undefined;

    if (!email) return res.status(400).json({ message: "Google token missing email" });

    const desiredRole: "buyer" | "seller" = role === "seller" ? "seller" : "buyer";

    let isNewUser = false;
    let user = await User.findOne({ email });
    if (!user) {
      if (desiredRole === "seller" && !location) {
        return res.status(400).json({ message: "Location is required for seller registration" });
      }
      const randomPassword = crypto.randomBytes(32).toString("hex");
      user = await User.create({
        name: displayName,
        email,
        password: randomPassword,
        role: desiredRole,
        location: location || undefined,
        avatarUrl: picture
      });
      isNewUser = true;
    } else {
      // If user is buyer but signs in as seller, allow upgrading.
      if (desiredRole === "seller" && user.role === "buyer") user.role = "seller";
      if (location && !user.location) user.location = location;
      if (picture && !user.avatarUrl) user.avatarUrl = picture;
      await user.save();
    }

    if (!user.isActive) return res.status(403).json({ message: "Account deactivated" });

    const token = signToken(user.id, user.role);
    res.cookie("token", token, getTokenCookieOptions(req));
    return res.json({ user, isNewUser });
  } catch (err) {
    console.error("Google auth error", err);
    return res.status(500).json({ message: "Google sign-in failed" });
  }
});

export default router;
