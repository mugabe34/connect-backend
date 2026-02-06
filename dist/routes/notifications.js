"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Notification_1 = __importDefault(require("../models/Notification"));
const router = (0, express_1.Router)();
// Get notifications for current user, newest first
router.get('/me', auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const items = await Notification_1.default.find({ user: userId }).sort({ createdAt: -1 }).limit(100);
    res.json(items);
});
router.post('/:id/read', auth_1.requireAuth, async (req, res) => {
    const notif = await Notification_1.default.findById(req.params.id);
    if (!notif)
        return res.status(404).json({ message: 'Not found' });
    if (String(notif.user) !== req.user.id)
        return res.status(403).json({ message: 'Forbidden' });
    notif.read = true;
    await notif.save();
    res.json(notif);
});
router.post('/mark-all-read', auth_1.requireAuth, async (req, res) => {
    await Notification_1.default.updateMany({ user: req.user.id, read: false }, { $set: { read: true } });
    res.json({ message: 'All marked read' });
});
exports.default = router;
