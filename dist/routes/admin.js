"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const User_1 = __importDefault(require("../models/User"));
const Product_1 = __importDefault(require("../models/Product"));
const router = (0, express_1.Router)();
const guard = [auth_1.requireAuth, (0, auth_1.requireRole)("admin")];
router.get("/dashboard", guard, async (_req, res) => {
    const [totalUsers, totalProducts, totalOrders, pendingApprovals] = await Promise.all([
        User_1.default.countDocuments({}),
        Product_1.default.countDocuments({}),
        Promise.resolve(0), // orders placeholder, to be implemented later
        Product_1.default.countDocuments({ approved: false })
    ]);
    res.json({ totalUsers, totalProducts, totalOrders, pendingApprovals });
});
// Users
router.get("/users", guard, async (req, res) => {
    const { q, role } = req.query;
    const filter = {};
    if (q)
        filter.$or = [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
    if (role)
        filter.role = role;
    const users = await User_1.default.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json(users);
});
router.patch("/users/:id", guard, async (req, res) => {
    const { name, role, isActive } = req.body;
    const user = await User_1.default.findByIdAndUpdate(req.params.id, { $set: { name, role, isActive } }, { new: true });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.json(user);
});
router.delete("/users/:id", guard, async (req, res) => {
    const user = await User_1.default.findByIdAndDelete(req.params.id);
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User deleted" });
});
// Sellers
router.post("/sellers/:id/approve", guard, async (req, res) => {
    const user = await User_1.default.findByIdAndUpdate(req.params.id, { role: "seller", isActive: true }, { new: true });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.json(user);
});
router.post("/sellers/:id/suspend", guard, async (req, res) => {
    const user = await User_1.default.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.json(user);
});
// Products
router.get("/products", guard, async (req, res) => {
    const { q, approved } = req.query;
    const filter = {};
    if (q)
        filter.title = new RegExp(q, "i");
    if (approved !== undefined)
        filter.approved = approved === "true";
    const items = await Product_1.default.find(filter).populate("seller", "name email").sort({ createdAt: -1 });
    res.json(items);
});
router.post("/products/:id/approve", guard, async (req, res) => {
    const product = await Product_1.default.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
    if (!product)
        return res.status(404).json({ message: "Not found" });
    res.json(product);
});
router.post("/products/:id/feature", guard, async (req, res) => {
    const product = await Product_1.default.findByIdAndUpdate(req.params.id, { featured: true }, { new: true });
    if (!product)
        return res.status(404).json({ message: "Not found" });
    res.json(product);
});
router.delete("/products/:id", guard, async (req, res) => {
    const product = await Product_1.default.findByIdAndDelete(req.params.id);
    if (!product)
        return res.status(404).json({ message: "Product not found" });
    res.status(200).json({ message: "Product deleted" });
});
exports.default = router;
