"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Notification_1 = __importDefault(require("../models/Notification"));
const router = (0, express_1.Router)();
// Get notifications for current user (as recipient)
router.get('/me', auth_1.requireAuth, async (req, res) => {
    try {
        const notifications = await Notification_1.default.find({ recipient: req.user.id })
            .populate('sender', 'name avatarUrl')
            .populate('product', 'title')
            .sort({ createdAt: -1 });
        res.json(notifications);
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});
// Mark notification as read
router.post('/:id/read', auth_1.requireAuth, async (req, res) => {
    try {
        const notification = await Notification_1.default.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { read: true } }, { new: true });
        if (!notification)
            return res.status(404).json({ message: 'Notification not found' });
        res.json(notification);
    }
    catch (err) {
        res.status(500).json({ message: 'Error updating notification' });
    }
});
// Get unread count for current user
router.get('/count/unread', auth_1.requireAuth, async (req, res) => {
    try {
        const count = await Notification_1.default.countDocuments({
            recipient: req.user.id,
            read: false
        });
        res.json({ unreadCount: count });
    }
    catch (err) {
        res.status(500).json({ message: 'Error fetching unread count' });
    }
});
// Mark all notifications as read for current user
router.post('/mark-all-read', auth_1.requireAuth, async (req, res) => {
    try {
        await Notification_1.default.updateMany({ recipient: req.user.id, read: false }, { $set: { read: true } });
        res.json({ message: 'All notifications marked as read' });
    }
    catch (err) {
        res.status(500).json({ message: 'Error updating notifications' });
    }
});
exports.default = router;
