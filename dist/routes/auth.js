"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const signToken = (id, role) => jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
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
    const user = await User_1.default.create({ name, email, password, role: role || "buyer", phone, location });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
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
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user });
});
router.post("/logout", (_req, res) => {
    res.clearCookie("token");
    return res.json({ message: "Logged out" });
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await User_1.default.findById(req.user.id);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    res.json({ user });
});
exports.default = router;
