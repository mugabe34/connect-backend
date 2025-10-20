"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
const signToken = (id, role) => jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
});
router.post("/register", [
    (0, express_validator_1.body)("name").notEmpty(),
    (0, express_validator_1.body)("email").isEmail(),
    (0, express_validator_1.body)("password").isLength({ min: 6 }),
    (0, express_validator_1.body)("role").optional().isIn(["buyer", "seller"]) // prevent self-creating admin
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { name, email, password, role } = req.body;
    const exists = await User_1.default.findOne({ email });
    if (exists)
        return res.status(409).json({ message: "Email already in use" });
    const user = await User_1.default.create({ name, email, password, role: role || "buyer" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
router.post("/login", [(0, express_validator_1.body)("email").isEmail(), (0, express_validator_1.body)("password").isString()], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { email, password } = req.body;
    const user = await User_1.default.findOne({ email });
    if (!user)
        return res.status(401).json({ message: "Invalid credentials" });
    const ok = await user.comparePassword(password);
    if (!ok)
        return res.status(401).json({ message: "Invalid credentials" });
    if (!user.isActive)
        return res.status(403).json({ message: "Account deactivated" });
    const token = signToken(user.id, user.role);
    res.cookie("token", token, { httpOnly: true, sameSite: "lax" });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
router.post("/logout", (_req, res) => {
    res.clearCookie("token");
    return res.json({ message: "Logged out" });
});
exports.default = router;
