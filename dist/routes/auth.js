"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const signToken = (id, role) => jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
});
function getTokenCookieOptions(req) {
    const daysRaw = process.env.JWT_COOKIE_DAYS || "7";
    const days = Number.isFinite(Number(daysRaw)) ? Number(daysRaw) : 7;
    const maxAge = Math.max(1, days) * 24 * 60 * 60 * 1000;
    const proto = String(req.headers["x-forwarded-proto"] || "");
    const isHttps = req.secure || proto.includes("https");
    const isProd = process.env.NODE_ENV === "production";
    const secure = isProd ? isHttps : false;
    // If the cookie is marked secure (HTTPS), allow cross-site (e.g., separate frontend domain).
    // Otherwise, keep it Lax for local/dev.
    const sameSite = secure ? "none" : "lax";
    return {
        httpOnly: true,
        secure,
        sameSite,
        maxAge,
        path: "/",
    };
}
// Session helper (avoids 401 spam in the frontend console)
router.get("/session", async (req, res) => {
    const token = req.cookies?.token ||
        (req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.split(" ")[1]
            : null);
    if (!token)
        return res.json({ user: null });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await User_1.default.findById(decoded.id);
        return res.json({ user: user || null });
    }
    catch {
        return res.json({ user: null });
    }
});
router.post("/register", [
    (0, express_validator_1.body)("name").notEmpty(),
    (0, express_validator_1.body)("email").isEmail(),
    (0, express_validator_1.body)("password").isLength({ min: 6 }),
    (0, express_validator_1.body)("role").optional().isIn(["buyer", "seller"]), // prevent self-creating admin
    (0, express_validator_1.body)("phone").optional().isString(),
    (0, express_validator_1.body)("location").optional().isString()
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role, phone, location } = req.body;
    const exists = await User_1.default.findOne({ email });
    if (exists)
        return res.status(409).json({ message: "Email already in use" });
    const user = await User_1.default.create({
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
});
router.post("/login", [(0, express_validator_1.body)("email").isEmail(), (0, express_validator_1.body)("password").isString()], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User_1.default.findOne({ email }).select("+password");
    if (!user)
        return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok)
        return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive)
        return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, getTokenCookieOptions(req));
    return res.json({ user });
});
router.post("/logout", (req, res) => {
    const opts = getTokenCookieOptions(req);
    res.clearCookie("token", { path: opts.path, sameSite: opts.sameSite, secure: opts.secure });
    return res.json({ message: "Logged out" });
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await User_1.default.findById(req.user.id);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
});
// Update profile (name, bio, avatarUrl)
router.patch("/me", auth_1.requireAuth, async (req, res) => {
    const { name, bio, avatarUrl, phone, location } = req.body;
    const update = {};
    if (name !== undefined)
        update.name = name;
    if (bio !== undefined)
        update.bio = bio;
    if (avatarUrl !== undefined)
        update.avatarUrl = avatarUrl;
    if (phone !== undefined)
        update.phone = phone;
    if (location !== undefined)
        update.location = location;
    const user = await User_1.default.findByIdAndUpdate(req.user.id, { $set: update }, { new: true });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.json({ user });
});
// Change password
router.patch("/me/password", auth_1.requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const user = await User_1.default.findById(req.user.id).select("+password");
    if (!user)
        return res.status(404).json({ message: "User not found" });
    const ok = await user.comparePassword(oldPassword);
    if (!ok)
        return res.status(401).json({ message: "Incorrect current password" });
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password updated" });
});
// Google Sign-In (Google Identity Services ID token flow)
router.post("/google", async (req, res) => {
    const { idToken, role, location } = req.body;
    if (!idToken)
        return res.status(400).json({ message: "Missing idToken" });
    if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({ message: "GOOGLE_CLIENT_ID is not configured" });
    }
    try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!verifyRes.ok)
            return res.status(401).json({ message: "Invalid Google token" });
        const payload = (await verifyRes.json());
        if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
            return res.status(401).json({ message: "Invalid Google token audience" });
        }
        if (payload.email_verified === "false") {
            return res.status(401).json({ message: "Google email not verified" });
        }
        const email = String(payload.email || "").toLowerCase();
        const displayName = String(payload.name || payload.given_name || "User");
        const picture = payload.picture ? String(payload.picture) : undefined;
        if (!email)
            return res.status(400).json({ message: "Google token missing email" });
        const desiredRole = role === "seller" ? "seller" : "buyer";
        let user = await User_1.default.findOne({ email });
        if (!user) {
            if (desiredRole === "seller" && !location) {
                return res.status(400).json({ message: "Location is required for seller registration" });
            }
            const randomPassword = crypto_1.default.randomBytes(32).toString("hex");
            user = await User_1.default.create({
                name: displayName,
                email,
                password: randomPassword,
                role: desiredRole,
                location: location || undefined,
                avatarUrl: picture
            });
        }
        else {
            // If user is buyer but signs in as seller, allow upgrading.
            if (desiredRole === "seller" && user.role === "buyer")
                user.role = "seller";
            if (location && !user.location)
                user.location = location;
            if (picture && !user.avatarUrl)
                user.avatarUrl = picture;
            await user.save();
        }
        if (!user.isActive)
            return res.status(403).json({ message: "Account deactivated" });
        const token = signToken(user.id, user.role);
        res.cookie("token", token, getTokenCookieOptions(req));
        return res.json({ user });
    }
    catch (err) {
        console.error("Google auth error", err);
        return res.status(500).json({ message: "Google sign-in failed" });
    }
});
exports.default = router;
