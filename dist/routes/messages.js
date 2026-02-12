"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Message_1 = __importDefault(require("../models/Message"));
const User_1 = __importDefault(require("../models/User"));
const router = (0, express_1.Router)();
// Get messages for current user (as recipient)
router.get('/me', auth_1.requireAuth, async (req, res) => {
    const messages = await Message_1.default.find({ recipient: req.user.id })
        .populate('sender', 'name email role')
        .sort({ createdAt: -1 });
    res.json(messages);
});
// Mark message as read
router.post('/:id/read', auth_1.requireAuth, async (req, res) => {
    const msg = await Message_1.default.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { read: true } }, { new: true });
    if (!msg)
        return res.status(404).json({ message: 'Message not found' });
    res.json(msg);
});
// Admin send message to seller (alternative endpoint when needed)
router.post('/to/:userId', auth_1.requireAuth, async (req, res) => {
    const sender = await User_1.default.findById(req.user.id);
    const recipient = await User_1.default.findById(req.params.userId);
    if (!sender || sender.role !== 'admin')
        return res.status(403).json({ message: 'Forbidden' });
    if (!recipient || recipient.role !== 'seller')
        return res.status(400).json({ message: 'Recipient must be a seller' });
    const { subject, body } = req.body;
    if (!body)
        return res.status(400).json({ message: 'Message body is required' });
    const message = await Message_1.default.create({
        sender: sender.id,
        recipient: recipient.id,
        subject,
        body,
        fromAdmin: true,
    });
    res.status(201).json(message);
});
exports.default = router;
